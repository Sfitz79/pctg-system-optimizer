/**
 * Build + verify the Admin Edition without shelling out to PowerShell for file work.
 * PowerShell string-editing corrupted the compose YAML, deleted uploaded media and
 * clobbered an import line in main.js, so file changes go through node and the Edit
 * tool from here on.
 *
 * Usage: node scripts/build-and-verify-admin.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '').replace(/%20/g, ' ');
const step = (m) => console.log('\n=== ' + m + ' ===');

step('SYNTAX');
for (const f of ['main.js', 'preload.js', 'lib/buildVariant.js', 'lib/internalUnlock.js', 'app/renderer.js']) {
  try {
    execFileSync(process.execPath, ['--check', f], { cwd: ROOT, stdio: 'pipe' });
    console.log('  OK    ' + f);
  } catch (e) {
    console.log('  FAIL  ' + f + '  ' + String(e.stderr || '').split('\n')[1]);
  }
}

step('BUILD (admin)');
// The app relaunches itself elevated, so one taskkill leaves a process holding dist/
// and the build dies with EPERM. This has interrupted the build repeatedly, so it is
// handled here rather than remembered by hand.
for (const name of ['PCTG Optimizer Pro.exe', 'PCTG Optimizer Admin Edition.exe', 'electron.exe']) {
  try { execFileSync('taskkill', ['/IM', name, '/F'], { stdio: 'ignore' }); } catch {}
}
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  let alive = '';
  try {
    alive = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "@(Get-Process -EA SilentlyContinue | ? { $_.Path -like '*PCTG Optimizer*' }).Count"
    ], { encoding: 'utf8' }).trim();
  } catch {}
  if (alive === '0') break;
}
await new Promise((r) => setTimeout(r, 2000));

let built = false;
for (let attempt = 1; attempt <= 3 && !built; attempt++) {
  try {
    execFileSync(process.execPath, ['scripts/build.js'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, PCTG_BUILD: 'admin' },
    });
    built = true;
  } catch (e) {
    const msg = String(e.stderr || e.message || '');
    if (/EPERM/.test(msg) && attempt < 3) {
      console.log(`  attempt ${attempt} hit EPERM (file lock), retrying...`);
      await new Promise((r) => setTimeout(r, 4000));
    } else throw e;
  }
}
console.log('  build complete');

step('VARIANT RESOLUTION IN THE PACKAGE');
const asarPath = ROOT + 'dist/PCTG Optimizer Pro-win32-x64/resources/app.asar';
if (!existsSync(asarPath)) { console.log('  FAIL  app.asar missing'); process.exit(1); }
const asar = readFileSync(asarPath).toString('latin1');
console.log('  build-variant.json packed : ' + asar.includes('build-variant.json'));
console.log('  edition admin packed      : ' + asar.includes('"edition": "admin"'));
console.log('  admin product name packed : ' + asar.includes('PCTG Optimizer Admin Edition'));

step('MODULE RESOLUTION OUTSIDE THE ASAR');
try {
  const v = await import(new URL('../lib/buildVariant.js', import.meta.url).href);
  console.log('  IS_ADMIN (source tree)    : ' + v.IS_ADMIN + '   <- false here is CORRECT, no variant file yet');
  console.log('  variantPath              : ' + v.variantPath);
} catch (e) {
  console.log('  FAIL  ' + e.message);
}

console.log('\nBuild script finished. Launch the exe next to confirm the title reads Admin Edition.');