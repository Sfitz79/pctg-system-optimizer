import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = join(root, 'dist', 'PCTG Optimizer Pro-win32-x64', 'PCTG Optimizer Pro.exe');

console.log('=== EACCES WORKAROUND ===');

// Kill anything still holding the build output.
try { execFileSync('taskkill', ['/IM', 'PCTG Optimizer Pro.exe', '/F'], { stdio: 'ignore' }); } catch {}
console.log('  1. no running instances');

// Give Defender time to release the freshly written binary. A 226MB exe written
// seconds ago is routinely locked while scanned, and Windows reports that as EACCES.
console.log('  2. settling 25s for antivirus to release the file...');
await new Promise((r) => setTimeout(r, 25000));

// Copy out of dist/ so the file being launched is not the one still being scanned.
const tmpExe = join(tmpdir(), 'PCTG-Probe.exe');
copyFileSync(exe, tmpExe);
console.log('  3. copied to', tmpExe);

const log = join(tmpdir(), 'pctg-probe.log');
try { execFileSync('cmd.exe', ['/c', 'del', log], { stdio: 'ignore' }); } catch {}

console.log('  4. launching...');
const child = spawn(tmpExe, [], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, PCTG_STARTUP_LOG: log },
});
child.on('error', (e) => { console.log('  spawn error:', e.code); });
child.unref();

await new Promise((r) => setTimeout(r, 16000));

let title = '(none)';
try {
  title = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "(Get-Process -Name 'PCTG-Probe' -EA SilentlyContinue | ? { $_.MainWindowTitle -ne '' } | Select -First 1).MainWindowTitle"
  ], { encoding: 'utf8' }).trim() || '(none)';
} catch {}

console.log('  5. window title:', title);

console.log('\n=== STARTUP LOG ===');
if (existsSync(log)) {
  console.log((await import('node:fs')).readFileSync(log, 'utf8').trimEnd());
} else {
  console.log('  (no log)');
}

try { execFileSync('taskkill', ['/IM', 'PCTG-Probe.exe', '/F'], { stdio: 'ignore' }); } catch {}