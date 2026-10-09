import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asarPath = join(root, 'dist', 'PCTG Optimizer Pro-win32-x64', 'resources', 'app.asar');

console.log('=== app.asar file listing (filtered) ===');
const files = asar.listPackage(asarPath);
for (const f of files) {
  if (/package\.json|buildVariant|internalUnlock|main\.js|build-variant/.test(f)) console.log('  ' + f);
}

console.log('\n=== package.json INSIDE the asar ===');
try {
  const pkg = asar.extractFile(asarPath, 'package.json').toString('utf8');
  const p = JSON.parse(pkg);
  console.log('  name        :', p.name);
  console.log('  productName :', p.productName);
  console.log('  version     :', p.version);
  console.log('  pctgEdition :', p.pctgEdition, p.pctgEdition === 'admin' ? '<-- ADMIN' : '<-- NOT ADMIN');
} catch (e) {
  console.log('  could not extract:', e.message);
}

console.log('\n=== build-variant.json INSIDE the asar ===');
try {
  console.log('  ' + asar.extractFile(asarPath, 'build-variant.json').toString('utf8').trim());
} catch (e) {
  console.log('  absent:', e.message);
}

console.log('\n=== does the packaged main.js contain the startup instrumentation? ===');
const main = asar.extractFile(asarPath, 'main.js').toString('utf8');
for (const needle of ['startupLog', 'PCTG_STARTUP_LOG', 'IS_ADMIN', 'ADMIN EDITION auto-granted', 'pctgEdition']) {
  console.log(`  ${needle.padEnd(28)} ${main.includes(needle) ? 'present' : 'ABSENT'}`);
}

console.log('\n=== packaged lib/buildVariant.js: how does it resolve? ===');
const bv = asar.extractFile(asarPath, 'lib/buildVariant.js').toString('utf8');
const m = bv.match(/require\([^)]*package\.json[^)]*\)/);
console.log('  reads:', m ? m[0] : 'NOT FOUND');