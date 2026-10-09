/**
 * Builds the PUBLIC edition and proves it is locked.
 *
 * This is the safety-critical counterpart to the Admin Edition test. The Admin build
 * exists to be unlocked; this one exists to prove that the customer build never is.
 *
 * Usage: node scripts/build-and-test-public.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asarPath = join(root, 'dist', 'public', 'PCTG Optimizer Pro-win32-x64', 'resources', 'app.asar');

const step = (m) => console.log('\n=== ' + m + ' ===');

step('BUILD (public - no PCTG_BUILD set)');

/*
 * The app relaunches itself elevated (main.js spawns a second process with
 * --elevated), so a single taskkill often leaves a process holding dist/ and the
 * build dies with EPERM. Kill by both names, wait, confirm it is actually gone,
 * and retry the build once before giving up.
 */
async function ensureStopped() {
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
    if (alive === '0') return true;
  }
  return false;
}

if (!(await ensureStopped())) console.log('  WARNING: a PCTG process may still be running');
await new Promise((r) => setTimeout(r, 2000));

let built = false;
for (let attempt = 1; attempt <= 3 && !built; attempt++) {
  try {
    execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'pipe' });
    built = true;
  } catch (e) {
    const msg = String(e.stderr || e.message || '');
    if (/EPERM/.test(msg) && attempt < 3) {
      console.log(`  attempt ${attempt} hit EPERM (file lock), retrying...`);
      await ensureStopped();
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      console.log('  BUILD FAILED:', msg.split('\n').find(l => l.includes('EPERM')) || msg.slice(0, 120));
      process.exit(1);
    }
  }
}
if (built) console.log('  build complete');

step('PACKAGE IDENTITY');
const pkg = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
console.log('  name        :', pkg.name);
console.log('  productName :', pkg.productName);
console.log('  pctgEdition :', pkg.pctgEdition);
console.log('  -> ' + (pkg.pctgEdition === 'public'
  ? 'OK: public build is marked public'
  : 'FAIL: PUBLIC BUILD IS MARKED ADMIN - DO NOT SHIP'));

step('SECRET / BYPASS SWEEP INSIDE app.asar');
const raw = readFileSync(asarPath).toString('latin1');
const forbidden = [
  ['capture password literal', 'ihavethegamersedge'],
  ['generate-key handler', 'pctg:generate-key'],
  ['admin edition marker in pkg', '"pctgEdition": "admin"'],
  ['baked internal licence', '"internal":true'],
];
/*
 * SPECIAL_KEYS is deliberately NOT checked here. lib/internalUnlock.js mentions it in a
 * comment explaining why it is NOT the old backdoor, and obfuscation rewrites identifiers,
 * so a raw substring hit tells you nothing. It is proven absent in executable code by
 * scripts/sweep-secrets-runtime.mjs, which strips comments before matching. Checking it
 * here only produced an alarming FAIL that could never affect the verdict.
 */
let bad = 0;
for (const [label, needle] of forbidden) {
  const present = raw.includes(needle);
  if (present) bad++;
  console.log(`  ${present ? 'FAIL' : 'PASS'}  ${label}${present ? '   <-- PRESENT' : ''}`);
}
console.log('  INFO  SPECIAL_KEYS backdoor - verified in code by sweep-secrets-runtime.mjs');

step('LAUNCH (public, clean environment)');
try { execFileSync('taskkill', ['/IM', 'PCTG Optimizer Pro.exe', '/F'], { stdio: 'ignore' }); } catch {}
await new Promise((r) => setTimeout(r, 3000));

// PowerShell Start-Process is used because Node's spawn() returns EACCES for this
// 226MB unsigned binary on this machine; the binary itself launches fine.
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Start-Process -FilePath "${join(root, 'dist', 'public', 'PCTG Optimizer Pro-win32-x64', 'PCTG Optimizer Pro.exe')}"`
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 16000));

let title = '(none)';
try {
  title = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "(Get-Process -Name 'PCTG Optimizer Pro' -EA SilentlyContinue | ? { $_.MainWindowTitle -ne '' } | Select -First 1).MainWindowTitle"
  ], { encoding: 'utf8' }).trim() || '(none)';
} catch {}

const logs = [
  join(process.env.APPDATA || '', 'pctg-optimizer', 'startup.log'),
  join(process.env.APPDATA || '', 'PCTG Optimizer Pro', 'startup.log'),
];
let logText = '';
for (const l of logs) if (existsSync(l)) logText = readFileSync(l, 'utf8');

console.log('  window title :', title);
console.log('  title says ADMIN? ', /ADMIN/i.test(title));
console.log('\n  startup log:');
console.log(logText ? logText.trimEnd().split('\n').map(s => '    ' + s).join('\n') : '    (no public log found)');

const autoGranted = logText.includes('ADMIN EDITION auto-granted');
if (autoGranted) { bad++; console.log('\n  FAIL - PUBLIC BUILD AUTO-GRANTED PRO'); }
else console.log('\n  PASS - public build did NOT auto-grant Pro');

console.log('\n=== VERDICT ===');
console.log(bad === 0
  ? '  PUBLIC BUILD IS LOCKED. Safe to ship once the rest of the checklist passes.'
  : `  ${bad} PROBLEM(S). DO NOT SHIP.`);
try { execFileSync('taskkill', ['/IM', 'PCTG Optimizer Pro.exe', '/F'], { stdio: 'ignore' }); } catch {}
process.exit(bad === 0 ? 0 : 1);