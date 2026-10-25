// PCTG System Optimizer Pro — Shop: capture PayPal order + issue licence key.
// Renders a success page showing the generated licence key and the installer
// download links. Called via PayPal return_url (orderId passed by PayPal) or
// directly in demo mode.
import { newLicenceKey, issueLicence } from '../lib/licence-store.js';
import { isConfirmedPayPalCapture, isExpectedPayPalOrder } from '../src/licence-core.js';

export default async (req, res) => {
  const orderId = decodeURIComponent((req.query && req.query.orderId) || '');
  const tier = String((req.query && req.query.tier) || '').toLowerCase();
  const demo = (req.query && req.query.demo) === '1';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = proto + '://' + host;

  const TIERS = {
    pro: { label: 'PRO', unlock: ['cleanup', 'performance', 'final', 'pro', 'fps', 'security', 'internet', 'winfix', 'master', 'restore', 'registry', 'disk', 'deep', 'gpu-nvidia', 'gpu-amd', 'gpu-intel', 'repair'] },
    standard: { label: 'Standard', unlock: ['cleanup', 'performance', 'final', 'restore', 'registry', 'disk', 'fps', 'security', 'gpu-nvidia', 'gpu-amd', 'gpu-intel', 'repair'] },
    repair: { label: 'System Test & Repair', unlock: ['repair', 'restore'] },
    fps: { label: 'FPS Booster module', unlock: ['fps', 'gpu-nvidia', 'gpu-amd', 'gpu-intel'] },
    security: { label: 'Security module', unlock: ['security'] },
    internet: { label: 'Internet / WiFi module', unlock: ['internet'] },
    winfix: { label: '1-Click WinFix module', unlock: ['winfix'] },
    deep: { label: 'Deep Optimize module', unlock: ['deep'] }
  };

  const page = (title, v) =>
    '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + ' — PCTG System Optimizer Pro</title>' +
    '<style>body{font-family:Segoe UI,Inter,system-ui,sans-serif;background:#0a0710;color:#f2eefb;display:flex;align-items:center;min-height:100vh;margin:0;padding:24px}.card{max-width:640px;margin:0 auto;background:#171126;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:36px;text-align:center}h1{font-size:26px;margin:0 0 8px}.key{font-size:20px;letter-spacing:1px;background:#1f1733;border:1px solid #7B2FFF;border-radius:10px;padding:14px;margin:20px 0;color:#7B2FFF;font-weight:700;word-break:break-all}.btn{display:inline-block;background:linear-gradient(120deg,#7B2FFF,#9b4dff);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;margin:6px}.btn.g{background:linear-gradient(120deg,#00c853,#00e676);color:#06300f}.muted{color:#a79ec2;font-size:13px;margin-top:18px}</style></head>' +
    '<body><div class="card">' + v + '</div></body></html>';

  if (!TIERS[tier]) {
    return res.status(400).send(page('Checkout error', '<h1>Unknown licence tier</h1><p>Please restart checkout and choose a valid product.</p>'));
  }

  if (!orderId) return res.status(400).send(page('Checkout error', '<h1>Missing order reference</h1><p>No PayPal order was provided. Please try the purchase again.</p>'));

  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const secret = process.env.PAYPAL_CLIENT_SECRET || '';
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  const allowDemo = process.env.SHOP_DEMO === '1';

  let paid = false;
  let demoPaid = false;

  if (demo || orderId.indexOf('DEMO-') === 0) {
    if (!allowDemo) {
      return res.status(403).send(page('Checkout disabled', '<h1>Checkout not enabled</h1><p>This deployment cannot issue demo keys.</p>'));
    }
    demoPaid = true;
    paid = true;
  } else {
    try {
      const hostApi = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
      const auth = Buffer.from(clientId + ':' + secret).toString('base64');

      const t = await (await fetch(hostApi + '/v1/oauth2/token', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
      })).json();

      if (!t.access_token) throw new Error('PayPal authentication did not return an access token.');

      const orderRes = await fetch(hostApi + '/v2/checkout/orders/' + encodeURIComponent(orderId), {
        headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json' }
      });
      const order = await orderRes.json();
      if (!orderRes.ok || !isExpectedPayPalOrder(order, tier)) {
        return res.status(402).send(page('Payment incomplete', '<h1>Payment not confirmed</h1><p>This order does not match the selected licence or its full price. No key was issued.</p>'));
      }

      if (order.status === 'COMPLETED') {
        paid = isConfirmedPayPalCapture(order, tier);
      } else {
        const capRes = await fetch(hostApi + '/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + t.access_token,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            'PayPal-Request-Id': 'pctg-cap-' + orderId
          },
          body: '{}'
        });
        const capture = await capRes.json();
        paid = capRes.ok && isConfirmedPayPalCapture(capture, tier);
      }
    } catch (e) {
      return res.status(502).send(page('Payment error', '<h1>Could not confirm payment</h1><p>There was a problem contacting PayPal. Your payment may still have gone through — <a href="mailto:info@pctechguyonline.com">contact us</a> if so and we will sort your key immediately.</p>'));
    }
  }

  if (!paid) {
    return res.status(402).send(page('Payment incomplete', '<h1>Payment was not completed</h1><p>No payment was confirmed for this order. <a href="' + base + '/#pricing">Back to pricing</a></p>'));
  }

  // Generate a licence key (same format as genkey.js).
  const key = newLicenceKey();

  /*
   * PERSIST IT, OR DO NOT SHOW IT.
   *
   * This previously wrote to /tmp/pctg-keys-db.json and to api/server-keys.json, each
   * inside its own `catch {}`. Both writes CANNOT persist on Vercel - /tmp is wiped per
   * instance and the deployment filesystem is read-only - so every paid customer was
   * shown a licence key that could never validate, and no error was ever raised. That
   * is why this product took no money: the checkout worked and the delivery did not.
   *
   * Now the key goes to Postgres, and a storage failure returns a 503 INSTEAD of a
   * page containing a key we cannot honour. A customer must never be handed a licence
   * that does not work, and the failure must be loud rather than swallowed.
   */
  try {
    await issueLicence({
      key,
      product: 'optimizer',
      tier: TIERS[tier] ? tier : 'standard',
      paymentRef: orderId,
      amountGbp: TIERS[tier] ? TIERS[tier].price : null,
      paypalMode: mode,
      demo: demoPaid,
    });
  } catch (err) {
    console.error('[shop-capture] licence store write FAILED:', err?.message || err);
    return res.status(503).send(page('Licence issue failed',
      '<h1>We could not issue your licence</h1>' +
      '<p>Your payment was taken but our licence store did not accept the key. Nothing has been lost — ' +
      'email support@pctechguyonline.com with your PayPal order reference <b>' +
      String(orderId).replace(/[<>&]/g, '') +
      '</b> and we will issue it manually.</p>' +
      '<p class="muted">No licence key is shown here on purpose: we will not hand you one we cannot verify.</p>'));
  }

  const dlSetup = 'https://github.com/Sfitz79/pctg-system-optimizer/releases/latest/download/PCTG-Optimizer-Setup.exe';
  const dlZip = 'https://github.com/Sfitz79/pctg-system-optimizer/releases/latest/download/pctg-optimizer-portable.zip';
  const demoNote = demoPaid ? '<div class="muted" style="color:#ffc857">DEMO ORDER — issued for testing with no real payment. This key is not from a live sale.</div>' : '';

  /*
   * The version here is read from the release manifest, not hardcoded.
   *
   * This line said "v1.2.0" while the build being shipped was v1.3.0. A customer is told
   * which version they bought, and a page that names the wrong one either sends them to
   * support to ask "is mine current?" or - worse - makes a genuinely old install look
   * supported. web/updates/latest.json is the manifest the desktop app itself checks for
   * updates, so it cannot drift from the app the way a literal in this file did.
   */
  let version = '1.5.0';
  try {
    const mf = await fetch(new URL('/updates/latest.json', base).href, { redirect: 'follow' });
    if (mf.ok) {
      const j = await mf.json();
      if (j && typeof j.version === 'string' && /^\d+\.\d+\.\d+$/.test(j.version.trim())) {
        version = j.version.trim();
      } else {
        console.warn('[shop-capture] update manifest has no usable version field');
      }
    } else {
      console.warn(`[shop-capture] update manifest returned HTTP ${mf.status}`);
    }
  } catch (e) {
    console.warn('[shop-capture] could not read the update manifest:', e?.message || e);
  }

  res.send(page('Licence ready', '<h1>Licence issued 🎉</h1>' +
    '<p>Thank you for your order. Your ' + (TIERS[tier] ? TIERS[tier].label : 'Standard') + ' licence key:</p>' +
    '<div class="key">' + key + '</div>' +
    '<p style="font-size:15px">Download PCTG System Optimizer Pro and enter this key when the app asks for a licence.</p>' +
    '<a class="btn" href="' + dlSetup + '">Download Installer (EXE)</a>' +
    '<a class="btn g" href="' + dlZip + '">Download Portable ZIP</a>' +
    demoNote +
    '<div class="muted">Keep this key safe. You can re-download the app any time from this page. v' + version + ' · Windows 10/11' +
    '<br><a href="mailto:info@pctechguyonline.com" style="color:#7B2FFF">info@pctechguyonline.com</a></div>'));
};
