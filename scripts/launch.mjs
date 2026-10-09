/**
 * Launches a given edition build and reports the window title plus the startup log.
 *
 * The startup log path is NOT an env var - main.js writes it to its own userData
 * folder, because relying on PCTG_STARTUP_LOG reaching the process through PowerShell
 * and cmd was unreliable and silently produced empty logs.
 *
 *   node scripts/launch.mjs admin
 *   node scripts/launch.mjs public
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const edition = (process.argv[2] || 'admin').toLowerCase();
const exe = join(root, 'dist', edition, 'PCTG Optimizer Pro-win32-x64', 'PCTG Optimizer Pro.exe');

// Admin build's userData is named from its productName; public uses the package name.
const APPDATA = process.env.APPDATA || '';
const logCandidates = edition === 'admin'
  ? [join(APPDATA, 'PCTG Optimizer Admin Edition', 'startup.log')]
  : [join(APPDATA, 'pctg-optimizer', 'startup.log'), join(APPDATA, 'PCTG Optimizer Pro', 'startup.log')];

console.log(`=== LAUNCH ${edition.toUpperCase()} EDITION ===`);
console.log('  exe :', exe);
if (!existsSync(exe)) {
  console.log('  BUILD FIRST: node scripts/build-and-verify-admin.mjs  (or build-and-test-public.mjs)');
  process.exit(1);
}

for (const name of ['PCTG Optimizer Pro.exe', 'electron.exe']) {
  try { execFileSync('taskkill', ['/IM', name, '/F'], { stdio: 'ignore' }); } catch {}
}
await new Promise((r) => setTimeout(r, 3000));
for (const l of logCandidates) { try { execFileSync('cmd.exe', ['/c', 'del', '/q', l], { stdio: 'ignore' }); } catch {} }

// PowerShell Start-Process, not node spawn: spawning this 226MB unsigned binary
// directly from node returns EACCES on this machine even though it launches fine.
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Start-Process -FilePath "${exe}" -WorkingDirectory "${join(root, 'dist', edition, 'PCTG Optimizer Pro-win32-x64')}"`
], { stdio: 'ignore' });

console.log('  launched, waiting 18s for the intro reveal to finish...');
await new Promise((r) => setTimeout(r, 18000));

let title = '(none)';
try {
  title = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "(Get-Process -Name 'PCTG Optimizer Pro' -EA SilentlyContinue | ? { $_.MainWindowTitle -ne '' } | Select -First 1).MainWindowTitle"
  ], { encoding: 'utf8' }).trim() || '(none)';
} catch {}

console.log('\n  WINDOW TITLE :', title);

console.log('\n=== STARTUP LOG ===');
let found = false;
for (const l of logCandidates) {
  if (existsSync(l)) {
    found = true;
    console.log('  (' + l + ')');
    for (const line of readFileSync(l, 'utf8').trimEnd().split('\n')) console.log('    ' + line);
    break;
  }
}
if (!found) console.log('  (not found at ' + logCandidates.join(' or ') + ')');

console.log('\n=== EXPECTATION ===');
if (edition === 'admin') {
  console.log('  title contains "ADMIN BUILD" :', /ADMIN BUILD/i.test(title));
  console.log('  log shows auto-granted Pro   : (see above)');
} else {
  console.log('  title contains "ADMIN"      :', /ADMIN/i.test(title), '(must be false)');
  console.log('  log must NOT auto-grant      :', 'see above');
}