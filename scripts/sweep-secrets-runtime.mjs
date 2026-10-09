/**
 * Scopes the secret/bypass sweep to the files that actually run.
 *
 * The first version of this check scanned the whole app.asar and reported five
 * failures, every one of them a false positive: scripts/ is copied into the package,
 * so build.js contains the string pctgEdition = 'admin' and the test file contains the
 * unlock wording. node_modules is bundled too and matches anything. Neither is
 * reachable at runtime.
 *
 * A security check that cries wolf gets ignored, and worse, it hides a real hit. So
 * this walks the asar file list and inspects ONLY the runtime files.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asarPath = join(root, 'dist', 'PCTG Optimizer Pro-win32-x64', 'resources', 'app.asar');

const pkg = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));

// Runtime files only: main process, preload, renderer, libs, HTML.
//
// asar.listPackage() returns BACKSLASH separators on Windows ("\main.js"). The first
// version of this check stripped only a forward slash, matched zero files, and printed
// an all-PASS result - a false green. The count is printed below precisely so an
// empty sweep cannot masquerade as a clean one.
const norm = (f) => f.replace(/^[\\/]+/, '').split('\\').join('/');
const RUNTIME = /^(main\.js|preload\.js|app\/.*|lib\/.*|license\/.*)$/;

const files = asar.listPackage(asarPath).map(norm).filter((f) => RUNTIME.test(f));

console.log('=== RUNTIME-ONLY SECRET SWEEP ===\n');
console.log('  files inspected:', files.length);
if (files.length < 5) {
  console.log('  ABORT - a sweep that inspected almost nothing cannot prove anything.');
  process.exit(1);
}
for (const f of files) console.log('    ' + f);

const checks = [
  ['capture password literal', 'ihavethegamersedge'],
  ['hardcoded SPECIAL_KEYS map', 'SPECIAL_KEYS'],
  ['licence forger handler', 'pctg:generate-key'],
  ['baked internal licence flag', '"internal":true'],
  ['admin bypass string', "activeTier === 'admin'"],
];

let bad = 0;
console.log('\n  results:');
for (const [label, needle] of checks) {
  const hits = [];
  /**
 * Strips comments so the sweep judges CODE, not prose.
 *
 * Without this, lib/internalUnlock.js "failed" purely because its header comment says
 * "WHY THIS IS NOT THE OLD SPECIAL_KEYS BACKDOOR". That is documentation, not a
 * backdoor. A check that flags its own comments is noise, and once it is noisy its
 * result stops being trusted - which is how a real finding gets waved through.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (not inside URLs)
    .replace(/^\s*\*.*$/gm, ' ');      // remaining asterisk-prefixed doc lines
}

for (const f of files) {
    let txt;
    try { txt = stripComments(asar.extractFile(asarPath, f).toString('utf8')); } catch { continue; }
    if (txt.includes(needle)) hits.push(f);
  }
  const present = hits.length > 0;
  if (present) bad++;
  console.log(`    ${present ? 'FAIL' : 'PASS'}  ${label}${present ? '  ->  ' + hits.join(', ') : ''}`);
}

console.log('\n=== EDITION MARKER ===');
const adminMarked = pkg.pctgEdition === 'admin';
if (adminMarked) bad++;
console.log(`  ${adminMarked ? 'FAIL' : 'PASS'}  package pctgEdition = ${pkg.pctgEdition}`);
console.log(`  ${pkg.name === 'pctg-optimizer' ? 'PASS' : 'FAIL'}  package name = ${pkg.name} (must not be the admin id)`);

console.log(bad === 0
  ? '\n  RESULT: no secrets or bypasses in the runtime files.'
  : `\n  RESULT: ${bad} problem(s) in runtime files.`);
process.exit(bad === 0 ? 0 : 1);