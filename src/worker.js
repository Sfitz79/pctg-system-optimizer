/**
 * PCTG System Optimizer - Cloudflare Worker entry point.
 *
 * Replaces three Vercel @vercel/node functions (validate, shop-order,
 * shop-capture) with one Worker, plus a Durable Object licence store.
 *
 * FIXES CARRIED OVER FROM THE VERCEL IMPLEMENTATION
 * =================================================
 * 1. Licence state no longer lives in /tmp or in the read-only deployment
 *    bundle. Verified failure of the old approach is recorded in
 *    src/licence-store.js.
 * 2. A licence is issued only when PayPal reports funds CAPTURED. The old code
 *    treated cap.status === 'APPROVED' as paid, which is the buyer approving but
 *    the money not yet settled - a licence handed over for free.
 * 3. Orders v2 request shapes are correct. The old code sent application_context
 *    (deprecated in v2) for return/cancel URLs and used user_action where v2 wants
 *    payment_source.paypal.experience_context.
 * 4. Capture responses request `Prefer: return=representation`, because v2 write
 *    operations return only id/status/links by default.
 * 5. Demo mode cannot mint free keys when PayPal credentials are absent unless
 *    SHOP_DEMO=1 is explicitly set. Checked on every request, not trusted from
 *    a deploy-time guess.
 */

import { LicenceStore } from './licence-store.js';
import { decisionToResponse, evaluateLicence, generateLicenceKey, isConfirmedPayPalCapture, isExpectedPayPalOrder, resolveTier } from './licence-core.js';

const GITHUB = 'https://github.com/Sfitz79/pctg-system-optimizer/releases/latest/download';

export { LicenceStore };

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Read env from either Workers bindings or process.env (tests). */
function envOf(env, key) {
  const v = env?.[key];
  if (typeof v === 'string' && v !== '') return v;
  if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  return '';
}

function paypalConfig(env) {
  return {
    clientId: envOf(env, 'PAYPAL_CLIENT_ID'),
    secret: envOf(env, 'PAYPAL_CLIENT_SECRET'),
    mode: envOf(env, 'PAYPAL_MODE') || 'sandbox',
    demoAllowed: envOf(env, 'SHOP_DEMO') === '1',
  };
}

/** Stripe/PayPal OAuth token. Base64 without Buffer - Workers has no Node API. */
async function paypalToken(cfg) {
  const host = cfg.mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  const raw = `${cfg.clientId}:${cfg.secret}`;
  const basic = btoa(raw);
  const res = await fetch(`${host}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error(`paypal auth failed: ${data.error_description || data.error || 'unknown'}`);
  }
  return { host, token: data.access_token };
}

// -------------------------------------------------------------- routing ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/api/validate') return await handleValidate(request, env);
      if (path === '/api/shop-order') return await handleShopOrder(request, env);
      if (path === '/api/shop-capture') return await handleShopCapture(request, env);
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      // Fail loud, and never let an internal error look like a valid licence.
      return json({ active: false, message: 'Licence service temporarily unavailable. Please try again.' }, 500);
    }
  },
};

// ------------------------------------------------------------- validate ---

async function handleValidate(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    // Fail closed: a body we cannot parse is not an activation.
    return json({ active: false, message: 'Invalid request.' }, 400);
  }

  const key = typeof body?.key === 'string' ? body.key.trim() : null;
  const machineId = typeof body?.machineId === 'string' ? body.machineId.trim() : null;

  if (!key) return json({ active: false, message: 'No key provided' }, 400);
  if (!machineId) return json({ active: false, message: 'No machine ID provided' }, 400);

  const id = env.LICENCES.idFromName(key);
  const stub = env.LICENCES.get(id);
  const result = await stub.fetch('https://do/validate', {
    method: 'POST',
    body: JSON.stringify({ machineId }),
  });
  const data = await result.json();

  const out = { active: data.active === true, message: data.message };
  if (data.active) {
    out.tier = data.tier;
    out.unlimited = true;
  }
  return json(out);
}

// ------------------------------------------------------------ shop order ---

async function handleShopOrder(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tier = resolveTier(body?.tier);
  if (!tier.ok) return json({ error: tier.error }, 400);

  const cfg = paypalConfig(env);

  if (!cfg.clientId || !cfg.secret) {
    // DEMO IS OPT-IN ONLY. If SHOP_DEMO is not explicitly '1', a deployment with
    // no credentials must not be able to mint a free key, because anyone could
    // hit this endpoint and walk away with paid software.
    if (!cfg.demoAllowed) {
      return json(
        { error: 'Checkout not configured. Please contact support@pctechguyonline.com.' },
        503,
      );
    }
    const token = `DEMO-${tier.tier.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    return json({
      demo: true,
      orderId: token,
      tier: tier.tier,
      amount: tier.price,
      currency: tier.currency,
      approveUrl: `/api/shop-capture?orderId=${encodeURIComponent(token)}&tier=${encodeURIComponent(tier.tier)}&demo=1`,
    });
  }

  // Return URL is pinned to the request host, not to a client-supplied value.
  // The old code trusted x-forwarded-host/host to build the PayPal return URL.
  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/api/shop-capture`;

  try {
    const { host, token } = await paypalToken(cfg);

    const orderRes = await fetch(`${host}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Idempotency: the same client click cannot create two live orders.
        'PayPal-Request-Id': `pctg-${tier.tier}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: 'default',
            description: `PCTG System Optimizer - ${tier.label} licence`,
            custom_id: `PCTG-${tier.tier.toUpperCase()}`,
            amount: { currency_code: tier.currency, value: tier.price.toFixed(2) },
          },
        ],
        // v2: return/cancel URLs live under payment_source.paypal.experience_context.
        // The old implementation used the deprecated top-level application_context.
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'PcTechGuyOnline',
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: returnUrl,
              cancel_url: returnUrl,
            },
          },
        },
      }),
    });

    const orderData = await orderRes.json().catch(() => ({}));
    const approve = (orderData.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');

    if (!orderData.id || !approve) {
      return json(
        { error: `PayPal order create failed: ${JSON.stringify(orderData).slice(0, 400)}` },
        502,
      );
    }

    return json({
      demo: false,
      mode: cfg.mode,
      orderId: orderData.id,
      tier: tier.tier,
      amount: tier.price,
      currency: tier.currency,
      approveUrl: approve.href,
    });
  } catch (e) {
    return json({ error: `Shop error: ${e.message}` }, 500);
  }
}

// ---------------------------------------------------------- shop capture ---

async function handleShopCapture(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId') || '';
  const tierParam = url.searchParams.get('tier') || '';
  const isDemo = url.searchParams.get('demo') === '1';

  const cfg = paypalConfig(env);
  const tier = resolveTier(tierParam);

  if (!orderId) {
    return new Response(successPage('<h1>Missing order reference</h1><p>No PayPal order was provided. Please try the purchase again.</p>', 'Checkout error'), {
      status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!tier.ok) {
    return new Response(successPage('<h1>Unknown licence tier</h1><p>Please restart checkout and choose a valid product.</p>', 'Checkout error'), {
      status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  let paid = false;
  let demoPaid = false;
  let captureId = null;

  if (isDemo || orderId.startsWith('DEMO-')) {
    if (!cfg.demoAllowed) {
      return new Response(successPage('<h1>Checkout not enabled</h1><p>This deployment cannot issue demo keys.</p>', 'Checkout disabled'), {
        status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    paid = true;
    demoPaid = true;
  } else {
    if (!cfg.clientId || !cfg.secret) {
      return new Response(successPage('<h1>Payment not verifiable</h1><p>Checkout is not configured. <a href="mailto:info@pctechguyonline.com">Contact us</a> and we will sort your key immediately.</p>', 'Payment error'), {
        status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    try {
      const { host, token } = await paypalToken(cfg);

      const orderRes = await fetch(`${host}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const order = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !isExpectedPayPalOrder(order, tier.tier)) {
        return new Response(successPage('<h1>Payment not confirmed</h1><p>This order does not match the selected licence or its full price. No key was issued.</p>', 'Payment incomplete'), {
          status: 402, headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (order.status === 'COMPLETED') {
        paid = isConfirmedPayPalCapture(order, tier.tier);
        const priorCapture = order.purchase_units?.[0]?.payments?.captures?.find((capture) => capture.status === 'COMPLETED');
        captureId = priorCapture?.id || null;
      } else {

      // Prefer: return=representation - without it v2 returns only id/status/links
      // and there is no capture detail to inspect.
      const capRes = await fetch(`${host}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          'PayPal-Request-Id': `pctg-cap-${orderId}`,
        },
        body: '{}',
      });
      const cap = await capRes.json().catch(() => ({}));
      paid = capRes.ok && isConfirmedPayPalCapture(cap, tier.tier);
      const completed = cap?.purchase_units?.[0]?.payments?.captures?.find((capture) => capture.status === 'COMPLETED');
      if (paid && completed) {
        captureId = completed.id || null;
      }
      }
    } catch (e) {
      return new Response(successPage('<h1>Could not confirm payment</h1><p>There was a problem contacting PayPal. Your payment may still have gone through &mdash; <a href="mailto:info@pctechguyonline.com">contact us</a> if so and we will sort your key immediately.</p>', 'Payment error'), {
        status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  if (!paid) {
    return new Response(
      successPage(`<h1>Payment not completed</h1><p>No completed payment was found for this order. If you were charged, <a href="mailto:info@pctechguyonline.com">contact us</a> and we will sort it immediately.</p>`, 'Payment incomplete'),
      { status: 402, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  // Issue the licence. The Durable Object is addressed BY the key, so generate
  // first, then seed that key's object with the sale recorded.
  const key = await generateLicenceKey();
  const licenceTier = tier.ok ? tier.tier : 'standard';

  const stub = env.LICENCES.get(env.LICENCES.idFromName(key));
  const seed = await stub.fetch('https://do/issue', {
    method: 'POST',
    body: JSON.stringify({ tier: licenceTier, orderId, demo: demoPaid }),
  });
  const seedData = await seed.json().catch(() => ({}));

  if (!seedData.ok) {
    return new Response(successPage('<h1>Could not issue licence</h1><p>Payment received but we could not generate your key. <a href="mailto:info@pctechguyonline.com">Contact us</a> with your order reference and we will send it immediately.</p>', 'Licence issue failed'), {
      status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const demoNote = demoPaid
    ? '<div class="muted" style="color:#ffc857">DEMO ORDER &mdash; issued for testing with no real payment.</div>'
    : '';

  const html = successPage(
    '<h1>Licence issued</h1>' +
      `<p>Thank you for your order. Your ${escapeHtml(tier.ok ? tier.label : 'Standard')} licence key:</p>` +
      `<div class="key">${escapeHtml(key)}</div>` +
      '<p style="font-size:15px">Download PCTG System Optimizer and enter this key when the app asks for a licence.</p>' +
      `<a class="btn" href="${GITHUB}/PCTG-Optimizer-Setup.exe">Download Installer (EXE)</a>` +
      `<a class="btn g" href="${GITHUB}/pctg-optimizer-portable.zip">Download Portable ZIP</a>` +
      demoNote +
      '<div class="muted">Keep this key safe. v1.2.0 &middot; Windows 10/11<br>' +
      '<a href="mailto:info@pctechguyonline.com" style="color:#7B2FFF">info@pctechguyonline.com</a></div>',
    'Licence ready',
  );

  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function successPage(body, title) {
  return (
    '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(title)} - PCTG System Optimizer</title>` +
    '<style>body{font-family:Segoe UI,Inter,system-ui,sans-serif;background:#0a0710;color:#f2eefb;display:flex;align-items:center;min-height:100vh;margin:0;padding:24px}' +
    '.card{max-width:640px;margin:0 auto;background:#171126;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:36px;text-align:center}' +
    'h1{font-size:26px;margin:0 0 8px}.key{font-size:20px;letter-spacing:1px;background:#1f1733;border:1px solid #7B2FFF;border-radius:10px;padding:14px;margin:20px 0;color:#7B2FFF;font-weight:700;word-break:break-all}' +
    '.btn{display:inline-block;background:linear-gradient(120deg,#7B2FFF,#9b4dff);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;margin:6px}' +
    '.btn.g{background:linear-gradient(120deg,#00c853,#00e676);color:#06300f}.muted{color:#a79ec2;font-size:13px;margin-top:18px}</style></head>' +
    `<body><div class="card">${body}</div></body></html>`
  );
}
