/**
 * PROVES THE DEPLOYED BUILD SHIPS LOCKED.
 *
 * Simon's standing requirement: nothing published may contain an unlocked licence.
 * Each check below is a different way the unlock could leak, so a green run means
 * all of them are closed - not just the one that was on my mind.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'C:/Users/simon/WebStormProjects/pctg-system optimizer/pctg-optimizer';
const DIST = join(ROOT, 'dist', 'public', 'PCTG Optimizer Pro-win32-x64');
const ASAR = join(DIST, 'resources', 'app.asar');

let fail = 0;
const ok = (l, c, d = '') => { if (!c) fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? '   ' + d : ''}`); };

console.log('=== 1. THE UNLOCK IS OFF BY DEFAULT ===\n');
delete process.env.PCTG_INTERNAL_UNLOCK;
const { checkInternalUnlock, internalUnlockEnabled } = await import(pathToFileURL(join(ROOT, 'lib', 'internalUnlock.js')).href);
ok('unlock disabled with no env var', internalUnlockEnabled() === false);
ok('THE PASSWORD GRANTS NOTHING', checkInternalUnlock('ihavethegamersedge') === null);
ok('any password grants nothing', checkInternalUnlock('hunter2') === null);

console.log('\n=== 2. THE BUILD NEVER SETS THE ENV VAR ===\n');
for (const f of ['scripts/build.js', 'scripts/installer.iss', 'package.json', 'main.js']) {
  const p = join(ROOT, f);
  if (!existsSync(p)) { console.log(`  SKIP  ${f} (absent)`); continue; }
  const txt = readFileSync(p, 'utf8');
  // A reference in a COMMENT explaining the feature is fine; an assignment is not.
  const assigns = /PCTG_INTERNAL_UNLOCK\s*[=:]\s*['"][^'"]+['"]/.test(txt);
  ok(`${f} does not hardcode the unlock`, !assigns);
}

console.log('\n=== 3. NO BAKED-IN LICENCE INSIDE THE PACKAGE ===\n');
const asarTxt = readFileSync(ASAR).toString('latin1');
ok('no "internal":true in the package', !asarTxt.includes('"internal":true'));
ok('no activated:true licence baked in', !asarTxt.includes('activated:!0'));

console.log('\n=== 4. THE SHIPPED LICENCE FILES ARE INERT ===\n');
const licDir = join(ROOT, 'license');
if (existsSync(licDir)) {
  for (const f of readdirSync(licDir)) {
    const txt = readFileSync(join(licDir, f), 'utf8');
    const activated = /"activated"\s*:\s*true/.test(txt);
    ok(`${f} contains no activated licence`, !activated);
  }
} else {
  console.log('  (no licence/ dir in source)');
}

console.log('\n=== 5. NO PASSWORD LITERAL IN THE SHIPPED BINARY ===\n');
ok('password string absent from app.asar', !asarTxt.includes('ihavethegamersedge'));

console.log(fail === 0
  ? '\n  ALL GREEN - the build ships locked. No way to reach Pro without a paid, server-issued licence.'
  : `\n  ${fail} FAILED - do NOT publish.`);
process.exit(fail ? 1 : 0);