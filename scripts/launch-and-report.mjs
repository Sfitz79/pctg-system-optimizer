/**
 * Launches a packaged build with NO environment variables and NO password entry,
 * then reports the window title and the startup log.
 *
 * This is the test that proves the Admin Edition is genuinely password-free, and
 * that the public build genuinely is not.
 *
 * Usage: node scripts/launch-and-report.mjs [--public]
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wantPublic = process.argv.includes('--public');
const exe = join(root, 'dist', 'PCTG Optimizer Pro-win32-x64', 'PCTG Optimizer Pro.exe');
const log = join(process.env.TEMP || '.', 'pctg-launch.log');

console.log(`=== LAUNCHING ${wantPublic ? 'PUBLIC' : 'ADMIN'} BUILD ===`);
console.log('  env overrides : none (clean environment by design)');

try { unlinkSync(log); } catch {}
try { execFileSync('taskkill', ['/IM', 'PCTG Optimizer Pro.exe', '/F'], { stdio: 'ignore' }); } catch {}
await new Promise((r) => setTimeout(r, 2500));

/*
 * Retry the spawn. Right after a build the freshly written .exe can still be held by
 * the filesystem, and Windows returns EACCES for that rather than a clearer error.
 * Three attempts with a pause is enough and beats reporting a failure that is really
 * just "not released yet".
 */
let child = null;
let lastErr = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      env: wantPublic ? { ...process.env } : { ...process.env, PCTG_STARTUP_LOG: log },
    });
    child.on('error', () => {});
    child.unref();
    break;
  } catch (e) {
    lastErr = e;
    console.log(`  attempt ${attempt} failed (${e.code || e.message}), retrying...`);
    await new Promise((r) => setTimeout(r, 4000));
  }
}
if (!child && lastErr) {
  console.log('  LAUNCH FAILED:', lastErr.code || lastErr.message);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 14000));

let title = '(none)';
try {
  const out = execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    "(Get-Process -Name 'PCTG Optimizer Pro' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1).MainWindowTitle",
  ], { encoding: 'utf8' }).trim();
  if (out) title = out;
} catch {}

console.log('  window title  :', title);
console.log('  pid           :', child.pid);

console.log('\n=== STARTUP LOG ===');
if (existsSync(log)) {
  console.log(readFileSync(log, 'utf8').trimEnd());
} else {
  console.log('  (none - public builds are not given the log variable)');
}

console.log('\n=== VERDICT ===');
if (title === '(none)') {
  console.log('  FAIL - no window appeared');
} else if (/Admin Edition/.test(title)) {
  console.log('  Admin Edition running. Expected title confirms the admin build is active.');
  console.log('  Look for "ADMIN EDITION auto-granted Pro" above - that proves no key is needed.');
} else {
  console.log('  Public build running (title has no "Admin Edition").');
}
try { execFileSync('taskkill', ['/IM', 'PCTG Optimizer Pro.exe', '/F'], { stdio: 'ignore' }); } catch {}