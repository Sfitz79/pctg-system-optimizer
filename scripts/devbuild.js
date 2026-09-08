const {execSync} = require('child_process');
const path = require('path');
const fs = require('fs');
const r = path.resolve(__dirname, '..');
const eV = require('electron/package.json').version;
const bd = path.join(r, '_build_src');
const dd = path.join(r, 'dist');
const zip = process.env.LOCALAPPDATA + '\\electron\\Cache\\electron-v' + eV + '-win32-x64.zip';

if (fs.existsSync(bd)) fs.rmSync(bd, {recursive: true});
['app','scripts','license','report','assets'].forEach(d => fs.cpSync(path.join(r,d), path.join(bd,d), {recursive: true}));
['main.js','preload.js','package.json','paypal-config.json'].forEach(f => fs.cpSync(path.join(r,f), path.join(bd,f)));
execSync('npm install --omit=dev --no-audit --no-fund', {cwd: bd, stdio: 'inherit'});

const te = path.join(dd, '_e');
fs.mkdirSync(te, {recursive: true});
const psCmd = `powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zip}', '${te}')"`;
execSync(psCmd, {stdio: 'inherit'});

const ad = path.join(dd, 'PCTG Optimizer Pro-win32-x64');
fs.cpSync(te, ad, {recursive: true});
fs.rmSync(te, {recursive: true});

const rd = path.join(ad, 'resources', 'app');
fs.cpSync(bd, rd, {recursive: true});

const asar = require('@electron/asar');
asar.createPackage(rd, path.join(ad, 'resources', 'app.asar')).then(() => {
  fs.rmSync(rd, {recursive: true});
  fs.rmSync(bd, {recursive: true});
  console.log('Done. Exe:', path.join(ad, 'electron.exe'));
});
