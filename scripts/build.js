const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const electronPkg = require('electron/package.json');
const pkg = require('../package.json');

const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, '_build_src');
const distDir = path.join(rootDir, 'dist');
const electronVersion = electronPkg.version;

const filesToObfuscate = [
  'main.js', 'preload.js', 'app/renderer.js',
  'report/report.js', 'report/systemInfo.js', 'report/system-analyzer.js'
];
const dirsToCopy = ['app', 'scripts', 'license', 'report', 'assets'];
const filesToCopy = ['main.js', 'preload.js', 'package.json', 'package-lock.json', 'app.manifest', 'paypal-config.json'];

async function main() {
  console.log('1. Cleaning...');
  if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true });
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });

  console.log('2. Copying source files...');
  for (const dir of dirsToCopy) {
    fs.cpSync(path.join(rootDir, dir), path.join(buildDir, dir), { recursive: true });
  }
  for (const file of filesToCopy) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(buildDir, file));
      continue;
    }
    // Optional files (gitignored locally, absent on clean CI checkout):
    // create a safe placeholder so the packaged app always has the file.
    if (file === 'paypal-config.json') {
      fs.writeFileSync(
        path.join(buildDir, file),
        JSON.stringify({ clientId: 'YOUR_PAYPAL_CLIENT_ID', secret: 'YOUR_PAYPAL_SECRET', mode: 'sandbox', currency: 'GBP' }, null, 2)
      );
      console.log(`  created ${file} placeholder (never commit real PayPal credentials)`);
    }
  }

  // Ensure licence runtime files exist in the build (gitignored in the repo, so
  // a clean checkout may not have them). Never ship real keys from the repo.
  for (const [rel, fallback] of [
    ['license/license.json', '{"key":"","activated":false}'],
    ['license/keys.json', '{"keys":[],"used":{}}']
  ]) {
    const fp = path.join(buildDir, rel);
    if (!fs.existsSync(fp)) {
      fs.writeFileSync(fp, fallback);
      console.log(`  created ${rel} placeholder`);
    }
  }

  // Never ship the local self-update folder: downloaded installer exes are
  // runtime artifacts (the app fetches update manifests from the server).
  fs.rmSync(path.join(buildDir, 'app', 'updates'), { recursive: true, force: true });

  console.log('3. Installing production dependencies...');
  execSync('npm install --omit=dev --no-audit --no-fund', { cwd: buildDir, stdio: 'inherit' });

  console.log('4. Obfuscating JavaScript...');
  const obfuscateOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 4000,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  };

  for (const file of filesToObfuscate) {
    const fp = path.join(buildDir, file);
    console.log(`  ${file}`);
    const code = fs.readFileSync(fp, 'utf-8');
    const result = JavaScriptObfuscator.obfuscate(code, obfuscateOptions);
    fs.writeFileSync(fp, result.getObfuscatedCode());
  }

  console.log('5. Extracting Electron binary...');
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const electronZip = path.join(localAppData, 'electron', 'Cache', `electron-v${electronVersion}-win32-x64.zip`);
  const tempExtractDir = path.join(distDir, '_electron_extract');
  fs.mkdirSync(tempExtractDir, { recursive: true });

  // Prefer the download cache zip (normal local install). If it is absent
  // (e.g. clean CI checkout where electron postinstall only extracted to
  // node_modules/electron/dist), use that extracted dist directly as the base.
  if (fs.existsSync(electronZip)) {
    execSync(
      `powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${electronZip.replace(/'/g, "''")}', '${tempExtractDir.replace(/'/g, "''")}')"`,
      { stdio: 'inherit' }
    );
  } else {
    const nodeDist = path.join(rootDir, 'node_modules', 'electron', 'dist');
    if (!fs.existsSync(nodeDist)) {
      // Clean CI: if electron's install script was skipped/failed (e.g. old
      // Node), run it explicitly so the binary is available.
      console.log('  Electron dist missing - running electron install script...');
      execSync('node node_modules/electron/install.js', { cwd: rootDir, stdio: 'inherit' });
    }
    if (!fs.existsSync(nodeDist)) {
      console.error(`  Electron source not found: tried ${electronZip} and ${nodeDist}`);
      process.exit(1);
    }
    console.log(`  Cache zip not found, using extracted dist: ${nodeDist}`);
    fs.cpSync(nodeDist, tempExtractDir, { recursive: true });
  }

  console.log('6. Assembling app directory...');
  const appDir = path.join(distDir, 'PCTG Optimizer Pro-win32-x64');
  const resourcesDir = path.join(appDir, 'resources');

  fs.cpSync(tempExtractDir, appDir, { recursive: true });
  fs.rmSync(tempExtractDir, { recursive: true });

  console.log('7. Creating app.asar...');
  const asar = require('@electron/asar');
  const asarPath = path.join(resourcesDir, 'app.asar');
  await asar.createPackage(buildDir, asarPath);

  fs.writeFileSync(path.join(resourcesDir, 'app'), pkg.version);

  console.log('8. Renaming electron.exe...');
  fs.renameSync(path.join(appDir, 'electron.exe'), path.join(appDir, 'PCTG Optimizer Pro.exe'));

  console.log('9. Embedding admin manifest...');
  const exePath = path.join(appDir, 'PCTG Optimizer Pro.exe');
  const rcedit = path.join(rootDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  const manifest = path.join(buildDir, 'app.manifest');
  execSync(`"${rcedit}" "${exePath}" --application-manifest "${manifest}"`, { stdio: 'inherit' });

  console.log('11. Creating PCTG Optimizer.zip...');
  const zipPath = path.join(distDir, 'PCTG Optimizer.zip');
  const appDirPath = path.join(distDir, 'PCTG Optimizer Pro-win32-x64');
  const zipTempDir = path.join(distDir, '_zip_staging');
  fs.cpSync(appDirPath, zipTempDir, { recursive: true });
  execSync(
    `powershell -Command "if(Test-Path '${zipPath.replace(/'/g, "''")}') { Remove-Item '${zipPath.replace(/'/g, "''")}'; } Compress-Archive -Path '${zipTempDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}'"`,
    { stdio: 'inherit', timeout: 300000 }
  );
  fs.rmSync(zipTempDir, { recursive: true });

  console.log('12. Cleaning up...');
  fs.rmSync(buildDir, { recursive: true });

  const zipSize = (fs.statSync(zipPath).size / 1048576).toFixed(1);
  console.log('\nBuild complete!');
  console.log(`Portable: ${exePath}`);
  console.log(`Zip: ${zipPath} (${zipSize} MB)`);
  console.log('\nRun "npm run build:installer" to compile the Inno Setup installer.');
}

main().catch(err => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
