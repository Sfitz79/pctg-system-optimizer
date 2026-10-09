// PCTG System Optimizer Pro — Shop: create PayPal order.
// On payment confirmation the buyer is sent to /api/shop-capture where a
// licence key is generated and installer download links are shown.
//
// Modes:
//  - LIVE/SANDBOX: requires PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET + PAYPAL_MODE env vars.
//  - DEMO: requires SHOP_DEMO=1 (and NO PayPal creds). Issues a key without a real
//    payment so the full flow can be tested end-to-end. Never enable SHOP_DEMO on the
//    customer-facing domain with zero creds, or anyone could mint free keys.
export default async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let body = {};
  try {
    // Vercel's Node runtime hands the body over ALREADY PARSED for
    // content-type: application/json, so `JSON.parse(req.body)` receives an object,
    // throws, and the catch below silently discards the whole order - which surfaced
    // as a 400 "Unknown tier" for a perfectly valid tier. Local dev and some other
    // runtimes still hand over a raw string, so both shapes are handled.
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    body = {};
  }
  const tier = String(body.tier || '').toLowerCase();

  // Customer-facing prices (match landing page — the source of truth).
  const TIERS = {
    pro: { price: 50, currency: 'GBP', label: 'PRO' },
    standard: { price: 30, currency: 'GBP', label: 'Standard' },
    repair: { price: 25, currency: 'GBP', label: 'System Test & Repair' },
    fps: { price: 10, currency: 'GBP', label: 'FPS Booster module' },
    security: { price: 10, currency: 'GBP', label: 'Security module' },
    internet: { price: 10, currency: 'GBP', label: 'Internet / WiFi module' },
    winfix: { price: 10, currency: 'GBP', label: '1-Click WinFix module' },
    deep: { price: 10, currency: 'GBP', label: 'Deep Optimize module' }
  };

  if (!TIERS[tier]) {
    return res.status(400).json({ error: 'Unknown tier. Valid: ' + Object.keys(TIERS).join(', ') });
  }

  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const secret = process.env.PAYPAL_CLIENT_SECRET || '';
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  const allowDemo = process.env.SHOP_DEMO === '1';

  if (!clientId || !secret) {
    if (!allowDemo) {
      return res.status(503).json({
        error: 'Checkout not configured on this deployment. Please contact support@pctechguyonline.com.'
      });
    }
    // Demo mode — full flow works offline, key issued without payment.
    const token = 'DEMO-' + tier.toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    return res.json({
      demo: true,
      orderId: token,
      tier,
      amount: TIERS[tier].price,
      currency: TIERS[tier].currency,
      approveUrl: '/api/shop-capture?orderId=' + token + '&tier=' + tier + '&demo=1'
    });
  }

  const host = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  const returnUrl = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host) + '/api/shop-capture';

  try {
    const auth = Buffer.from(clientId + ':' + secret).toString('base64');

    const tokenRes = await fetch(host + '/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(502).json({ error: 'PayPal auth failed: ' + (tokenData.error_description || tokenData.error || 'unknown') });
    }

    const orderRes = await fetch(host + '/v2/checkout/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tokenData.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'PCTG-' + tier.toUpperCase(),
          description: 'PCTG System Optimizer Pro — ' + TIERS[tier].label + ' licence',
          amount: {
            currency_code: TIERS[tier].currency,
            value: TIERS[tier].price.toFixed(2)
          }
        }],
        application_context: {
          brand_name: 'PcTechGuyOnline',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: returnUrl
        }
      })
    });
    const orderData = await orderRes.json();

    const approveLink = (orderData.links || []).find((l) => l.rel === 'approve');
    if (!approveLink) {
      return res.status(502).json({ error: 'PayPal order create failed: ' + JSON.stringify(orderData).slice(0, 500) });
    }

    return res.json({
      demo: false,
      mode,
      orderId: orderData.id,
      tier,
      amount: TIERS[tier].price,
      currency: TIERS[tier].currency,
      approveUrl: approveLink.href
    });
  } catch (e) {
    return res.status(500).json({ error: 'Shop error: ' + e.message });
  }
};