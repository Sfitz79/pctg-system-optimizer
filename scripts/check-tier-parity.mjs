/**
 * FAILS THE BUILD IF THE APP AND THE SHOP DISAGREE ABOUT TIERS.
 *
 * WHY THIS EXISTS
 * ---------------
 * The app knew only basic/full/pro. The website sold pro/standard/repair plus five paid
 * modules. A customer who paid GBP 30 for Standard received a licence whose tier the app
 * did not recognise: hasAccess() looked up TIERS['standard'], got undefined, and denied
 * every single phase. Seven of the eight things the shop sold were unusable.
 *
 * Nobody noticed for months because nothing cross-checks the two files. This does.
 * Prices are checked too - the app charged GBP 55 for Pro while the website charged 50.
 *
 * Usage: node scripts/check-tier-parity.mjs   (exit 1 on any drift)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const shopFile = join(appDir, '..', 'api', 'shop-order.js');

const problems = [];

/** Pull the app's TIERS literal out of main.js. */
function readAppTiers() {
  const src = readFileSync(join(appDir, 'main.js'), 'utf-8');
  const start = src.indexOf('const TIERS = {');
  if (start === -1) throw new Error('Could not find TIERS in main.js');
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const body = src.slice(start, end);
  const tiers = {};
  // Each entry: name: { label..., price: N, unlocks: [...] }
  // Entries appear in two shapes: multi-line (pro/standard/repair) and single-line
  // (the five modules). Both must be parsed, or the checker reports a false FAIL for
  // tiers that are actually present - which is worse than not checking at all, because
  // a check that cries wolf gets ignored.
  const entry = /(?:^|\n)[ \t]+([a-z-]+):\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*,?/g;
  let m;
  while ((m = entry.exec(body)) !== null) {
    const name = m[1];
    const price = /price:\s*([0-9.]+)/.exec(m[2]);
    const unlocks = /unlocks:\s*\[([^\]]*)\]/.exec(m[2]);
    tiers[name] = {
      price: price ? Number(price[1]) : null,
      unlocks: unlocks ? unlocks[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [],
    };
  }
  return tiers;
}

/** Pull the shop's TIERS literal out of shop-order.js. */
function readShopTiers() {
  const src = readFileSync(shopFile, 'utf-8');
  const start = src.indexOf('const TIERS = {');
  if (start === -1) throw new Error('Could not find TIERS in shop-order.js');
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const body = src.slice(start, end);
  const tiers = {};
  const entry = /(?:^|\n)[ \t]+([a-z-]+):\s*\{([^}]*)\}/g;
  let m;
  while ((m = entry.exec(body)) !== null) {
    const price = /price:\s*([0-9.]+)/.exec(m[2]);
    tiers[m[1]] = { price: price ? Number(price[1]) : null };
  }
  return tiers;
}

const app = readAppTiers();
const shop = readShopTiers();

console.log('=== TIER PARITY: app <-> shop ===\n');
console.log('  tier        app GBP   shop GBP   status');
for (const name of new Set([...Object.keys(app), ...Object.keys(shop)])) {
  const a = app[name], s = shop[name];
  let status;
  if (!a) status = 'MISSING IN APP  <-- customer pays and app refuses';
  else if (!s) status = 'NOT SOLD       <-- app offers a tier nobody can buy';
  else if (a.price !== s.price) status = `PRICE MISMATCH <-- app charges ${a.price}, shop charges ${s.price}`;
  else status = 'ok';
  if (status !== 'ok') problems.push(`${name}: ${status}`);
  console.log(`  ${name.padEnd(12)}${String(a ? a.price : '-').padEnd(9)}${String(s ? s.price : '-').padEnd(11)}${status}`);
}

console.log('\n  app unlocks per tier:');
for (const [name, t] of Object.entries(app)) {
  console.log(`    ${name.padEnd(10)} ${t.unlocks.length} phases`);
}

if (problems.length) {
  console.log(`\nFAIL - ${problems.length} parity problem(s):`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(1);
}
console.log('\nPASS - app and shop agree on every tier and price.');