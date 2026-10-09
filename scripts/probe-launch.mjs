import { execFileSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = join(root, 'dist', 'PCTG Optimizer Pro-win32-x64', 'PCTG Optimizer Pro.exe');

console.log('=== direct exec attempt (reveals the true OS error) ===');
try {
  const p = spawn(exe, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((r) => setTimeout(r, 4000));
  console.log('  spawned, pid =', p.pid);
  p.kill();
} catch (e) {
  console.log('  spawn threw synchronously:');
  console.log('   ', e.code, e.message);
}

console.log('\n=== via cmd (bypasses some spawn restrictions) ===');
try {
  const p = spawn('cmd.exe', ['/c', 'start', '""', exe], { stdio: 'ignore', detached: true });
  p.unref();
  await new Promise((r) => setTimeout(r, 8000));
  let title = '(none)';
  try {
    title = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "(Get-Process -Name 'PCTG Optimizer Pro' -EA SilentlyContinue | ? { $_.MainWindowTitle -ne '' } | Select -First 1).MainWindowTitle"
    ], { encoding: 'utf8' }).trim() || '(none)';
  } catch {}
  console.log('  window title:', title);
} catch (e) {
  console.log('  cmd spawn failed:', e.code || e.message);
}

console.log('\n=== is Windows Defender / SmartScreen involved? ===');
const zone = join(root, 'dist', 'PCTG Optimizer Pro-win32-x64', 'PCTG Optimizer Pro.exe:Zone.Identifier');
try {
  execFileSync('cmd.exe', ['/c', 'type', zone], { stdio: 'pipe' });
  console.log('  Mark-of-the-Web PRESENT - Windows may block or warn on launch');
} catch {
  console.log('  no Mark-of-the-Web');
}

try { execFileSync('taskkill', ['/IM', 'PCTG Optimizer Pro.exe', '/F'], { stdio: 'ignore' }); } catch {}