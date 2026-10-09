# PCTG System Optimizer — checkout & licensing

## What changed and why

The previous deployment ran three Vercel `@vercel/node` functions in `api/`
(`validate.js`, `shop-order.js`, `shop-capture.js`). They earned nothing and,
if deployed, would have charged people for licences that did not work.

### Measured defects in the old implementation

| Defect | Evidence |
|---|---|
| Checkout not deployed | `POST /api/shop-order` and `/api/shop-capture` returned **404** in production; both files were untracked in git in all three optimiser repos. |
| Minted licences did not validate | Licence state was written to `/tmp/pctg-keys-db.json` and `api/server-keys.json`. On Vercel the bundle is read-only and `/tmp` is per-instance/ephemeral, and both writes sat in empty `catch {}`. Key `PCTG-175C3318-1159A88D-CD68D561` (present in `server-keys.json`, `sale: DEMO-STANDARD-TEST`) returned `{"active":false,"message":"Invalid license key"}` from the live endpoint. |
| Licence granted before payment | `shop-capture.js` treated `cap.status === 'APPROVED'` as paid. That is buyer-approved, money **not** captured. |
| Deprecated Orders v2 shapes | Sent `application_context` for return/cancel URLs and `user_action` at the top level. v2 requires `payment_source.paypal.experience_context`. |
| Minimal capture responses | No `Prefer: return=representation`, so v2 write ops return only `id`/`status`/`links` — there was no capture detail to verify. |
| Non-idempotent capture | Generated a fresh licence key on every callback, so a replayed return URL minted a second key for one payment. |
| Return URL from client headers | Built the PayPal return URL from `x-forwarded-host`/`host`. |

### What replaced it

- `src/licence-core.js` — pure, dependency-free licence decisions. No `fetch`,
  no `fs`, no env. Runs identically under the test runner and in Workers.
- `src/licence-store.js` — one `LicenceStore` Durable Object **per licence key**.
- `src/worker.js` — the three endpoints as `fetch` handlers.
- `wrangler.toml` — DO binding + migration.

## Fail-closed, explicitly

Every branch that is not an evidenced "yes" returns `active: false`. There is no
default-allow path:

- Unknown key → deny.
- **Unrecognised tier → deny.** Not "treat as standard" — that would grant the
  default unlock set to a key we do not understand.
- Unparseable request body → deny, not assume.
- Internal error → deny with a customer-readable message.
- Licence issued **only** against a `COMPLETED` capture.
- `SHOP_DEMO` is checked on every request; with no PayPal credentials and no
  explicit `SHOP_DEMO=1`, checkout returns 503 and mints nothing.

## Why Durable Objects and not KV

KV is eventually consistent — reads can be 60 seconds stale. Two activations of
one key inside that window would both read "unused" and both succeed, binding a
single paid licence to two machines. `tests/worker.test.js` asserts this
property directly:

```
REGRESSION: concurrent activation of one key binds exactly once
  → 8 simultaneous activations, exactly 1 granted, exactly 7 refused
```

A Durable Object is single-threaded and strongly consistent, so the
read-decide-write cannot interleave. Object id **is** the key, so same-key
requests serialise and different keys never contend.

## Tests

```powershell
node --test "tests/licence-core.test.js" "tests/worker.test.js"
```

33 tests. Cases marked `REGRESSION` encode a defect that was live in production.

## Deploy

```powershell
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_CLIENT_SECRET
wrangler deploy
```

Secrets are never committed. `PAYPAL_MODE` lives in `wrangler.toml`; set it to
`sandbox` until an end-to-end payment has been verified.

Do **not** set `SHOP_DEMO` in production. It lets anyone mint a free licence.
