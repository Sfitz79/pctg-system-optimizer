const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const electronPkg = require('electron/package.json');
const pkg = require('../package.json');

const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, '_build_src');

/*
 * OUTPUT GOES TO A PER-EDITION FOLDER: dist/admin and dist/public.
 *
 * A single shared dist/ could not be reused reliably. The app relaunches itself
 * elevated, and an elevated process holding the packaged .exe makes the folder
 * undeletable AND unrenameable from a normal shell - both rmSync and renameSync returned
 * EPERM. That is what repeatedly blocked builds while the app was open.
 *
 * Separate folders mean a running build never touches the other's files, the two
 * editions can sit side by side for testing, and a stale locked folder can never block
 * a new build at all. The old shared dist/PCTG Optimizer Pro-win32-x64 may still be
 * locked by a running instance; it is simply left alone.
 */
const edition = process.env.PCTG_BUILD === 'admin' ? 'admin' : 'public';
const distDir = path.join(rootDir, 'dist', edition);
const electronVersion = electronPkg.version;

/*
 * BAKE THE BUILD VARIANT IN.
 *
 * PCTG_BUILD=admin produces the Admin Edition (Pro available without a licence,
 * separate product name). Anything else - including every production release - produces
 * the locked public build. The release script never passes admin, so a customer build
 * cannot become an admin build by accident.
 *
 * Declared up here, not in step 7, because the file-exclusion rules in step 2 need to
 * know the edition. It was originally declared next to the app.asar creation and reading
 * it earlier in the same function is a ReferenceError (const is block-scoped and not
 * hoisted) - the build would have failed only on the public path that strips genkey.js.
 */
const buildEdition = edition;

const filesToObfuscate = [
  'main.js', 'preload.js', 'app/renderer.js',
  'report/report.js', 'report/systemInfo.js', 'report/system-analyzer.js'
];
const dirsToCopy = ['app', 'scripts', 'license', 'report', 'assets', 'lib'];
const filesToCopy = ['main.js', 'preload.js', 'package.json', 'package-lock.json', 'app.manifest'];

async function main() {
  // Validate every recursive build-cleanup root before touching its contents.
  for (const target of [buildDir, distDir]) {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(rootDir) + path.sep)) throw new Error('Build cleanup target is outside the project');
  }
  console.log('1. Cleaning...');
  if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true });
  /*
   * Removing dist/ used to be a plain rmSync and it failed with EPERM over and over.
   *
   * Cause: main.js relaunches the app ELEVATED (-Verb RunAs) because the optimiser
   * needs administrator rights to run its tweaks. Those elevated child processes cannot
   * be killed by a normal shell - Stop-Process returns "Access is denied" - so they sit
   * holding a handle on the packaged exe and the build cannot delete it.
   *
   * A build must not be blocked by the app still running, so if deletion fails the old
   * directory is renamed out of the way instead. Renaming a directory that is in use is
   * permitted on Windows where deleting it is not, so the build proceeds and the stale
   * folder is simply left behind for the Boss to clear from Task Manager.
   */
  if (fs.existsSync(distDir)) {
    try {
      fs.rmSync(distDir, { recursive: true });
      console.log('   removed previous dist/');
    } catch (e) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const parked = path.join(rootDir, `dist_locked_${stamp}`);
      try {
        fs.renameSync(distDir, parked);
        console.log(`   COULD NOT DELETE dist/ (${e.code || e.message}).`);
        console.log(`   The app is probably still running ELEVATED - close it in Task Manager.`);
        console.log(`   Moved the old folder to ${path.basename(parked)} and continuing.`);
      } catch (e2) {
        console.error(`   FATAL: cannot clear dist/ (${e2.code || e2.message}).`);
        console.error('   Close every PCTG Optimizer window, then run the build again.');
        process.exit(1);
      }
    }
  }

  console.log('2. Copying source files...');
  for (const dir of dirsToCopy) {
    fs.cpSync(path.join(rootDir, dir), path.join(buildDir, dir), { recursive: true });
  }

  /*
   * scripts/ ships ONLY the PowerShell modules the app runs.
   *
   * main.js ensureScriptsExtracted() copies *.ps1 out to userData and runs those; it never
   * touches the .mjs/.js/.iss build and verification tooling. Before this filter the whole
   * scripts/ dir was packed into app.asar, which put the internal-unlock password literal
   * (referenced by the test scripts) and the strings SPECIAL_KEYS / "internal":true inside
   * the customer binary. They were inert, but shipping the password string at all is a leak
   * a curious customer can grep for, and it made every whole-asar secret scan red with
   * false positives - which trains whoever reads the output to ignore it.
   */
  const scriptsOut = path.join(buildDir, 'scripts');
  if (fs.existsSync(scriptsOut)) {
    for (const f of fs.readdirSync(scriptsOut)) {
      const fp = path.join(scriptsOut, f);
      if (fs.statSync(fp).isFile() && !f.toLowerCase().endsWith('.ps1')) fs.rmSync(fp);
    }
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

  fs.writeFileSync(path.join(buildDir, 'paypal-config.json'), JSON.stringify({clientId:'',secret:'',mode:'sandbox',currency:'GBP'}));

  // Ensure licence runtime files exist in the build (gitignored in the repo, so
  // a clean checkout may not have them). Never ship real keys from the repo.
  for (const [rel, fallback] of [
    ['license/license.json', '{"key":"","activated":false}'],
    ['license/keys.json', '{"keys":[],"used":{}}']
  ]) {
    const fp = path.join(buildDir, rel);
    {
      fs.writeFileSync(fp, fallback);
      console.log(`  created ${rel} placeholder`);
    }
  }

  // Never ship the local self-update folder: downloaded installer exes are
  // runtime artifacts (the app fetches update manifests from the server).
  fs.rmSync(path.join(buildDir, 'app', 'updates'), { recursive: true, force: true });

  /*
   * THE PUBLIC BUILD DOES NOT SHIP license/genkey.js.
   *
   * genkey.js is the INTERNAL key-minting tool. It writes to keys.json AND to
   * ../../api/server-keys.json, and it carries the full tier/price table and the key
   * format. Nothing in the runtime path ever requires it - main.js reads only
   * license/keys.json and license/license.json, both of which are empty seed files
   * ({"keys":[],"used":{}} and {"key":"","activated":false}), so it stayed plaintext in
   * the asar while main.js and renderer.js were obfuscated.
   *
   * It is not a licence BYPASS on its own: api/validate.js is the only authority and it
   * reads Postgres, so a customer running this locally mints keys the server rejects. But
   * shipping the minting tool, unobfuscated, with the price list, to a customer is not a
   * thing to do deliberately. It is also exactly what a whole-asar secret scan should
   * flag, and a scan that cries wolf gets ignored.
   *
   * Kept in the ADMIN build, which is never published and is the tool the Boss uses.
   */
  if (buildEdition !== 'admin') {
    for (const f of ['genkey.js']) {
      const fp = path.join(buildDir, 'license', f);
      if (fs.existsSync(fp)) {
        fs.rmSync(fp);
        console.log(`  removed license/${f} from the public build`);
      }
    }
  }

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

/*
 * BAKE THE BUILD VARIANT IN.
 *
 * (buildEdition is declared at the top of this file - see the note there.)
 */
const variantFile = path.join(buildDir, 'build-variant.json');
fs.writeFileSync(variantFile, JSON.stringify({
  edition: buildEdition,
  builtAt: new Date().toISOString(),
}, null, 2));

// The app.asar must contain build-variant.json, which is written at the build root,
// so it needs to exist inside buildDir before packing. It does - this is buildDir.
if (buildEdition === 'admin') {
  const pkgPath = path.join(buildDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = 'pctg-optimizer-admin';
  pkg.productName = 'PCTG Optimizer Admin Edition';
  pkg.pctgEdition = 'admin';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`   ADMIN EDITION - Pro unlocked, separate app id (${pkg.name})`);
} else {
  const pkgPath = path.join(buildDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  // Only the edition changes here. name/productName are left exactly as they are,
  // because this is a copy of the real public package.json and the public build must
  // keep its normal identity and app id.
  pkg.pctgEdition = 'public';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('   public edition - locked, licences come from the server only');
}

await asar.createPackage(buildDir, asarPath);

  fs.writeFileSync(path.join(resourcesDir, 'app'), pkg.version);

  console.log('8. Renaming electron.exe...');
  fs.renameSync(path.join(appDir, 'electron.exe'), path.join(appDir, 'PCTG Optimizer Pro.exe'));

  console.log('9. Embedding admin manifest...');
  const exePath = path.join(appDir, 'PCTG Optimizer Pro.exe');
  const rcedit = path.join(rootDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  const manifest = path.join(buildDir, 'app.manifest');
  execSync(`"${rcedit}" "${exePath}" --application-manifest "${manifest}" --set-file-version "${pkg.version}" --set-product-version "${pkg.version}" --set-version-string ProductName "PCTG Optimizer Pro" --set-version-string CompanyName "PcTechGuyOnline" --set-version-string FileDescription "PCTG Optimizer Pro"`, { stdio: 'inherit' });

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
