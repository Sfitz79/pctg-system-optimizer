/**
 * Confirms the demo renders from /demo: assets resolve, no relative-path 404s,
 * and the shop is untouched.
 */
const base = 'https://pctgopt.pctechguyonline.com';

const check = async (path, expectType) => {
  const r = await fetch(base + path, { redirect: 'follow' });
  const ct = (r.headers.get('content-type') || '').split(';')[0];
  const ok = r.status === 200 && (!expectType || ct === expectType);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${path.padEnd(24)} ${r.status}  ${ct}`);
  return ok;
};

let fail = 0;

console.log('=== DEMO FROM /demo ===\n');
const demo = await fetch(base + '/demo', { redirect: 'follow' });
const html = await demo.text();
console.log(`  ${demo.status === 200 ? 'PASS' : 'FAIL'}  /demo  ${demo.status}`);
if (demo.status !== 200) fail++;

// The bug: page asked for /styles.css and /app.js. Confirm both forms now behave.
if (!/href="\/demo\/styles\.css"/.test(html)) { console.log('  FAIL  index.html does not reference /demo/styles.css'); fail++; }
if (!/src="\/demo\/app\.js"/.test(html)) { console.log('  FAIL  index.html does not reference /demo/app.js'); fail++; }
if (!/href="\/demo\/styles\.css"/.test(html)) {} else console.log('  PASS  index.html -> /demo/styles.css');
if (!/src="\/demo\/app\.js"/.test(html)) {} else console.log('  PASS  index.html -> /demo/app.js');

console.log('\n=== ASSETS THE BROWSER WILL REQUEST ===\n');
if (!(await check('/demo/styles.css', 'text/css'))) fail++;
if (!(await check('/demo/app.js', 'application/javascript'))) fail++;

console.log('\n=== THE OLD RELATIVE PATHS MUST NOW BE GONE ===\n');
for (const p of ['/styles.css', '/app.js']) {
  const r = await fetch(base + p, { redirect: 'follow' });
  const dead = r.status === 404;
  console.log(`  ${dead ? 'PASS' : 'FAIL'}  ${p} -> ${r.status} (should 404; nothing depends on it now)`);
  if (!dead) fail++;
}

console.log('\n=== DEMO MUST NOT GIVE AWAY THE PAID PRODUCT ===\n');
const givesAway = /releases\/latest\/download\/(PCTG-Optimizer-Setup|pctg-optimizer-portable)/.test(html);
console.log(`  ${givesAway ? 'FAIL' : 'PASS'}  no direct paid-binary links in the demo`);
if (givesAway) fail++;

console.log('\n=== SHOP UNTOUCHED ===\n');
const ord = await fetch(base + '/api/shop-order', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tier: 'pro' }),
});
const j = await ord.json().catch(() => ({}));
const shopOk = ord.status === 200 && j.mode === 'live';
console.log(`  ${shopOk ? 'PASS' : 'FAIL'}  checkout still live (${j.mode})`);
if (!shopOk) fail++;

console.log(fail === 0 ? '\n  ALL GREEN' : `\n  ${fail} PROBLEM(S)`);
process.exit(fail ? 1 : 0);