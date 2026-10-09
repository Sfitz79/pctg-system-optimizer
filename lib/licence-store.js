/**
 * THE LICENCE STORE - Postgres, not a file in the deployment.
 *
 * WHY THIS REPLACED THE OLD STORE (measured, and it is why P2 made nothing)
 * -----------------------------------------------------------------------
 * The old store wrote each issued key to two places, both inside `catch {}`:
 *
 *   api/server-keys.json  - inside the deployment bundle. On Vercel that filesystem is
 *                           READ ONLY, so the write can never persist. It also ships
 *                           with the deployment, so the licence list is one HTTP GET
 *                           from public.
 *   /tmp/pctg-keys-db.json - ephemeral per instance, wiped constantly.
 *
 * So a customer paid GBP 50, was shown a key, and that key could never validate when
 * they typed it into the desktop app. Nothing was reported, because both failures were
 * swallowed. The store below makes a write a real write, and makes a failure loud.
 *
 * WHY @neondatabase/serverless AND NOT `pg`
 * -----------------------------------------
 * This project is deployed as a Vercel serverless function with a fixed `builds`
 * config and no build step, so there is no npm install at build time to produce a
 * node-postgres native binding. The Neon serverless driver is fetch/WebSocket based,
 * has no native build, and is the driver Neon is designed around.
 *
 * IF THE DRIVER IS MISSING, THIS FAILS LOUDLY. `requireStore` throws rather than
 * quietly falling back to the old JSON store, because a silent fallback to a store
 * that cannot persist is precisely the fault being fixed.
 */
import { neon } from '@neondatabase/serverless';

let sql = null;

function connectionString() {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!url) {
    throw new Error(
      'Licence store is not configured: set NEON_DATABASE_URL (or DATABASE_URL) on this deployment. ' +
      'Issuing a licence without a durable store would sell a key that cannot validate, which is ' +
      'the exact failure this store exists to remove.',
    );
  }
  return url;
}

export function requireStore() {
  if (!sql) sql = neon(connectionString());
  return sql;
}

/**
 * Issue a licence. Returns the stored row.
 *
 * The key format is unchanged from the old store (PCTG-XXXXXXXX-XXXXXXXX-XXXXXXXX) so
 * any customer holding a key from a previous manual grant still recognises it, and so
 * the desktop app's validation path needs no format change.
 */
export async function issueLicence({ key, product = 'optimizer', tier = 'standard', paymentRef = null, amountGbp = null, paypalMode = null, demo = false }) {
  const rows = await requireStore()`
    INSERT INTO pctl_licences (licence_key, product, tier, payment_ref, amount_gbp, paypal_mode, notes)
    VALUES (${key}, ${product}, ${tier}, ${paymentRef}, ${amountGbp}, ${paypalMode},
            ${demo ? 'DEMO - no real payment' : null})
    ON CONFLICT (licence_key) DO UPDATE
      SET payment_ref = EXCLUDED.payment_ref, tier = EXCLUDED.tier
    RETURNING id, licence_key, tier, created_at
  `;
  return rows[0] || null;
}

/**
 * Validate a key, and bind it to this machine on first successful use.
 *
 * BINDING RULES, and they are deliberate:
 *   - unknown key            -> valid:false, reason 'unknown'
 *   - revoked                -> valid:false, reason 'revoked'
 *   - unbound + HWID given   -> BOUND, and that is allowed on ANY machine. The first
 *                              activation is the claim; requiring a pre-bound key would
 *                              make it impossible to sell one.
 *   - bound + same HWID      -> valid, activation counted
 *   - bound + different HWID -> valid:false, reason 'hardware-mismatch'. A licence
 *                              copied onto a second machine does not silently work.
 *
 * Returning the REASON (rather than a bare false) is what lets the desktop app tell
 * the customer what actually went wrong instead of "invalid key".
 */
export async function validateLicence({ key, hwid = null, product = 'optimizer' }) {
  const rows = await requireStore()`
    SELECT id, licence_key, product, tier, created_at, first_activated_at,
           bound_hwid, activations, revoked_at
      FROM pctl_licences
     WHERE licence_key = ${key}
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { valid: false, reason: 'unknown', message: 'This licence key is not recognised.' };
  if (row.revoked_at) return { valid: false, reason: 'revoked', message: 'This licence has been revoked.' };
  if (row.product !== product) {
    return { valid: false, reason: 'wrong-product', message: `This key is for ${row.product}, not ${product}.` };
  }

  if (!row.bound_hwid) {
    if (!hwid) {
      return { valid: false, reason: 'hwid-required', message: 'This licence must be activated on your machine first.' };
    }
    const bound = await requireStore()`
      UPDATE pctl_licences
         SET bound_hwid = ${hwid}, first_activated_at = now(), activations = 1
       WHERE id = ${row.id} AND bound_hwid IS NULL
      RETURNING bound_hwid, activations
    `;
    if (bound.length) {
      return { valid: true, reason: 'activated', tier: row.tier, boundHwid: hwid, activations: 1, message: 'Licence activated on this machine.' };
    }
    // Lost a race with a concurrent first activation - re-read and fall through.
    const again = await requireStore()`SELECT bound_hwid, activations FROM pctl_licences WHERE id = ${row.id}`;
    const current = again[0];
    if (current && hwid && current.bound_hwid !== hwid) {
      return { valid: false, reason: 'hardware-mismatch', message: 'This licence is already active on another machine.' };
    }
    return { valid: true, reason: 'ok', tier: row.tier, boundHwid: current?.bound_hwid || hwid, activations: current?.activations || 1, message: 'Licence valid.' };
  }

  if (hwid && row.bound_hwid !== hwid) {
    return { valid: false, reason: 'hardware-mismatch', message: 'This licence is active on a different machine.' };
  }

  const updated = await requireStore()`
    UPDATE pctl_licences SET activations = activations + 1 WHERE id = ${row.id} RETURNING activations
  `;
  return {
    valid: true,
    reason: 'ok',
    tier: row.tier,
    boundHwid: row.bound_hwid,
    activations: updated[0]?.activations ?? row.activations,
    message: 'Licence valid.',
  };
}

export function newLicenceKey() {
  const seg = () => randomHex(4);
  return `PCTG-${seg()}-${seg()}-${seg()}`;
}

/**
 * 4 BYTES = 8 hex characters per segment, which is what the original generator produced
 * (`randomBytes(4).toString('hex').toUpperCase()`). This is deliberately not "more
 * entropy": the shipped desktop app parses the key into segments, and a 16-character
 * segment is a different shape from the one it was built against. The entropy of 96 bits
 * across three segments is ample for this use, and format compatibility is worth more
 * than doubling it.
 */
function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  // Web Crypto is available in the Vercel Node runtime and in Node 19+.
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
