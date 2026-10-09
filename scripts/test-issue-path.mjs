/**
 * Exercises the ISSUE path end-to-end against the real Neon database.
 *
 * The validate path is already proven in production, but issueLicence() is the one
 * function that runs at CHECKOUT, so it must be proven too: a payment that creates no
 * row is a sale that cannot be honoured.
 *
 * Leaves NO test data behind - the generated key is deleted at the end.
 *
 * Usage:  set NEON_DATABASE_URL then: node scripts/test-issue-path.mjs
 */
import { neon } from '@neondatabase/serverless';
import { issueLicence, validateLicence, newLicenceKey } from '../lib/licence-store.js';

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error('  NEON_DATABASE_URL is not set.');
  process.exit(1);
}
const sql = neon(url);

const key = newLicenceKey();
const segmentsOk = /^PCTG-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/.test(key);
console.log('  generated key     :', key);
console.log('  key format        :', segmentsOk ? 'correct (3 x 8 hex)' : 'MALFORMED');

let fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${label.padEnd(18)}: ${String(got).padEnd(22)} ${ok ? 'OK' : 'EXPECTED ' + want}`);
};

const inserted = await issueLicence({
  key, product: 'optimizer', tier: 'pro', paymentRef: 'TEST-REF', amountGbp: 50, paypalMode: 'live',
});
check('issueLicence', inserted ? 'inserted id ' + inserted.id : 'FAILED', 'inserted id ' + (inserted?.id ?? ''));

const stored = await sql`SELECT tier, payment_ref, amount_gbp, bound_hwid FROM pctl_licences WHERE licence_key = ${key}`;
check('tier persisted', stored[0]?.tier, 'pro');
check('payment_ref saved', stored[0]?.payment_ref, 'TEST-REF');
check('amount saved', Number(stored[0]?.amount_gbp), 50);
check('starts unbound', stored[0]?.bound_hwid ?? null, null);

const unbound = await validateLicence({ key, hwid: null });
check('unbound+no hwid', `${unbound.valid}/${unbound.reason}`, 'false/hwid-required');

const first = await validateLicence({ key, hwid: 'TEST-PC' });
check('first activation', `${first.valid}/${first.reason}`, 'true/activated');
check('activations = 1', first.activations, 1);

const same = await validateLicence({ key, hwid: 'TEST-PC' });
check('same PC', `${same.valid}/${same.reason}`, 'true/ok');
check('activations = 2', same.activations, 2);

const other = await validateLicence({ key, hwid: 'OTHER-PC' });
check('other PC', `${other.valid}/${other.reason}`, 'false/hardware-mismatch');

const wrongProduct = await validateLicence({ key, hwid: 'TEST-PC', product: 'crimson-os' });
check('wrong product', `${wrongProduct.valid}/${wrongProduct.reason}`, 'false/wrong-product');

await sql`DELETE FROM pctl_licences WHERE licence_key = ${key}`;
const gone = await sql`SELECT 1 FROM pctl_licences WHERE licence_key = ${key}`;
check('test row removed', gone.length, 0);

console.log(fail === 0 ? '\nPASS - issue path proven, no test data left behind.' : `\nFAIL - ${fail} check(s) failed.`);
process.exit(fail === 0 ? 0 : 1);
