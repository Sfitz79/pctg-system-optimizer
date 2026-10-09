// PCTG System Optimizer Pro — licence validation endpoint (called by the desktop app).
//
// THE STORE IS POSTGRES NOW, and this file used to be the reason the product could not
// take money. It validated against two files that cannot persist on Vercel:
//
//   /tmp/pctg-keys-db.json    - ephemeral per instance, wiped constantly
//   api/server-keys.json      - inside the read-only deployment bundle
//
// so a key issued at checkout would not validate here, i.e. the customer pays, gets a
// key, types it into the desktop app, and is told it is invalid. Every read/write of
// those files was also inside `catch {}`, so nothing was ever reported.
//
// The response shape below (`active`, `tier`, `message`, `unlimited`) is UNCHANGED,
// because the shipped desktop app parses it. Only the source of truth changed.
import { validateLicence } from '../lib/licence-store.js';

/**
 * Read the request body.
 *
 * Both shapes are handled deliberately. When this runs as a Vercel serverless function
 * with `content-type: application/json`, the body is ALREADY PARSED onto `req.body`
 * and the stream has been consumed - so listening for stream events returns nothing and
 * every request would fail as "No key provided". Elsewhere (local dev, a proxy that
 * passes the stream through) it is a raw string. Guessing wrong here means the desktop
 * app can never activate, so both are supported and the parsed object wins.
 */
function readBody(req) {
  const existing = req && req.body;
  if (existing && typeof existing === 'object') {
    return Promise.resolve(existing);
  }
  if (typeof existing === 'string' && existing.trim()) {
    try { return Promise.resolve(JSON.parse(existing)); } catch { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = '';
    const done = (v) => resolve(v || {});
    req.on('data', (c) => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => {
      try { done(raw ? JSON.parse(raw) : {}); } catch { done({}); }
    });
    req.on('error', () => done({}));
  });
}

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ active: false, message: 'Method not allowed' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    body = {};
  }

  const key = body && body.key;
  const machineId = body && (body.machineId || body.hwid);

  if (!key || typeof key !== 'string' || !key.trim()) {
    return res.status(400).json({ active: false, message: 'No key provided' });
  }
  if (!machineId || typeof machineId !== 'string' || !machineId.trim()) {
    return res.status(400).json({ active: false, message: 'No machine ID provided' });
  }

  let result;
  try {
    result = await validateLicence({
      key: key.trim(),
      hwid: machineId.trim(),
      product: 'optimizer',
    });
  } catch (err) {
    // A store outage must NOT be reported to the customer as "invalid licence" - that
    // would tell a paying customer their key is fake when it is our database that is
    // down, and would push them to re-purchase. 503 with an explicit reason instead.
    console.error('[validate] licence store unavailable:', err?.message || err);
    return res.status(503).json({
      active: false,
      temporary: true,
      message: 'Licence check is temporarily unavailable. Please try again in a minute.',
    });
  }

  if (!result.valid) {
    return res.status(200).json({ active: false, message: result.message, reason: result.reason });
  }

  return res.status(200).json({
    active: true,
    tier: result.tier,
    message: result.reason === 'activated'
      ? `Activated ${String(result.tier).toUpperCase()} tier!`
      : 'License renewed.',
    unlimited: true,
  });
};
