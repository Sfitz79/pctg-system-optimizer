/**
 * Finds relative asset references in the demo that would break when the page is
 * served from /demo instead of the domain root.
 *
 * The demo worked at the root of pctg-optimizer-demo.vercel.app, where
 * "styles.css" resolved correctly. Moving it to /demo changed the base URL, so any
 * relative reference now resolves one level up, hits the landing catch-all and 404s.
 * That is what rendered the public demo as unstyled default HTML.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo');
const files = ['index.html', 'app.js', 'styles.css'];

let problems = 0;

for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8');
  const found = [];

  // src="x" / href="x"
  for (const m of src.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(u)) continue;
    if (u.startsWith('/')) continue; // absolute is fine
    found.push(`relative src/href -> "${u}"`);
  }
  // fetch('x')
  for (const m of src.matchAll(/fetch\(\s*['"`]([^'"`]+)['"`]/g)) {
    const u = m[1];
    if (/^(https?:|data:|\/)/.test(u)) continue;
    found.push(`relative fetch() -> "${u}"`);
  }
  // url(...)
  for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
    const u = m[1];
    if (/^(https?:|data:|\/)/.test(u)) continue;
    found.push(`relative url() -> "${u}"`);
  }

  console.log(`\n=== ${f} ===`);
  if (!found.length) {
    console.log('  OK - no relative references');
  } else {
    problems += found.length;
    for (const p of [...new Set(found)]) console.log('  BREAKS AT /demo:  ' + p);
  }
}

console.log(`\n${problems ? 'FAIL - ' + problems + ' reference(s) would 404 when served from /demo'
                        : 'PASS - demo is safe to serve from /demo'}`);
process.exit(problems ? 1 : 0);