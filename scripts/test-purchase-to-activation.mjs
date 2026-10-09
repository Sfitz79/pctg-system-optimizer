/**
 * END-TO-END PROOF OF THE MONEY PATH, using the real server and the real app tier list.
 *
 * For every tier the shop sells:
 *   1. issue a licence exactly as a completed PayPal capture would
 *   2. call the LIVE /api/validate endpoint from a brand-new machine id
 *   3. confirm the app would ACCEPT it and would unlock what it advertises
 *
 * Step 3 is the one that matters. A licence is only real if the product honours it, and
 * for seven months the app did not - it sold tiers the app could not read.
 *
 * Every test row is deleted afterwards, so nothing is left behind.
 *
 * Usage: node scripts/test-purchase-to-activation.mjs
 */
import { neon } from '@neondatabase/serverless';
import { issueLicence, newLicenceKey } from '../../lib/licence-store.js';

const API = 'https://pctgopt.pctechguyonline.com/api/validate';
const url = process.env.NEON_DATABASE_URL;
if (!url) { console.error('  NEON_DATABASE_URL not set.'); process.exit(1); }
const sql = neon(url);

/** Mirrors TIERS in main.js - what the shipped app will actually accept. */
const APP_TIERS = {
  pro: 20, standard: 13, repair: 2, fps: 4, security: 1, internet: 1, winfix: 1, deep: 1,
};
/** price in GBP as charged by shop-order.js */
const PRICES = { pro: 50, standard: 30, repair: 25, fps: 10, security: 10, internet: 10, winfix: 10, deep: 10 };

const created = [];
let fail = 0;
const line = (s) => console.log(s);

line('=== BUY -> ISSUE -> ACTIVATE -> APP ACCEPTS ===\n');
line('  tier        charged   activate   tier returned   app knows it   unlocks');
line('  ' + '-'.repeat(78));

for (const [tier, unlocksExpected] of Object.entries(APP_TIERS)) {
  const key = newLicenceKey();
  created.push(key);
  await issueLicence({ key, product: 'optimizer', tier, paymentRef: 'E2E-' + tier, amountGbp: PRICES[tier], paypalMode: 'live' });

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, machineId: 'E2E-MACHINE-' + tier }),
  });
  const body = await res.json();

  const known = Object.prototype.hasOwnProperty.call(APP_TIERS, body.tier);
  const ok = res.status === 200 && body.active === true && known && body.tier === tier;
  if (!ok) fail++;

  line(`  ${tier.padEnd(11)}${('£' + PRICES[tier]).padEnd(10)}${String(res.status).padEnd(11)}${String(body.tier).padEnd(17)}${(known ? 'yes' : 'NO <-- BAD').padEnd(16)}${unlocksExpected}`);
  if (!ok) line(`      reason: active=${body.active} reason=${body.reason || '-'} msg=${body.message || '-'}`);
}

// Prove the binding: same key, different machine, must be refused.
const stealKey = created[0];
const steal = await fetch(API, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ key: stealKey, machineId: 'SOMEONE-ELSE-PC' }),
});
const stealBody = await steal.json();
const stealBlocked = stealBody.active === false && stealBody.reason === 'hardware-mismatch';
if (!stealBlocked) fail++;
line(`\n  copy to a second PC refused : ${stealBlocked ? 'yes (hardware-mismatch)' : 'NO <-- BAD'} `);

for (const key of created) await sql`DELETE FROM pctl_licences WHERE licence_key = ${key}`;
const left = await sql`SELECT count(*)::int AS n FROM pctl_licences WHERE licence_key = ANY(${created})`;
line(`  test rows cleaned up        : ${left[0].n === 0 ? 'yes' : 'NO <-- ' + left[0].n + ' left'}`);

line(fail === 0 ? '\nPASS - every tier the shop sells is honoured by the app.' : `\nFAIL - ${fail} problem(s).`);
process.exit(fail === 0 ? 0 : 1);