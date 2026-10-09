import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

console.log('=== dist/ contents ===');
if (!existsSync(dist)) {
  console.log('  dist/ does not exist - the build did not produce output');
  process.exit(1);
}
for (const d of readdirSync(dist)) {
  const p = join(dist, d);
  let size = 0;
  try { size = statSync(p).isDirectory() ? readdirSync(p).length : statSync(p).size; } catch {}
  console.log(`  ${d}  ${statSync(p).isDirectory() ? '(dir, ' + size + ' entries)' : size + ' bytes'}`);
}

console.log('\n=== .exe files (recursive, 2 levels) ===');
let found = 0;
for (const d of readdirSync(dist)) {
  const dirPath = join(dist, d);
  try {
    if (!statSync(dirPath).isDirectory()) continue;
    for (const f of readdirSync(dirPath)) {
      if (f.toLowerCase().endsWith('.exe')) {
        const full = join(dirPath, f);
        console.log(`  ${d}\\${f}  ${statSync(full).size} bytes`);
        found++;
      }
    }
  } catch {}
}
if (!found) console.log('  (none found)');

console.log('\n=== expected launch target ===');
const expected = join(dist, 'PCTG Optimizer Pro-win32-x64', 'PCTG Optimizer Pro.exe');
console.log('  ' + expected);
console.log('  exists:', existsSync(expected));