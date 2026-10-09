/**
 * Integration tests for the Worker + Durable Object licence store.
 *
 * These target the two properties that were BROKEN in production before:
 *   1. concurrent activation of one key must bind exactly once;
 *   2. an unconfirmed payment must never produce a licence.
 *
 * Uses node:test with an in-memory Durable Object stub. No wrangler needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/worker.js';
import { LicenceStore } from '../src/licence-store.js';

/** Minimal in-memory Durable Object + namespace, faithful on the one point
 *  that matters here: a single object serialises its own requests. */
function makeEnv(initial = {}, opts = {}) {
  const stores = new Map();

  // Per-object serialisation queue. A real Durable Object processes one request
  // at a time per instance; reproducing that here is the whole point of the
  // concurrency test, because it is the property KV cannot provide.
  const queues = new Map();
  function enqueue(id, fn) {
    const prev = queues.get(id) || Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(id, next.catch(() => {}));
    return next;
  }

  function makeStub(name) {
    const map = new Map();
    const state = {
      id: { name, toString: () => name },
      storage: {
        async get(k) { return map.get(k); },
        async put(k, v) { map.set(k, v); },
      },
    };
    // Instantiate the REAL class so its private fields work and the test
    // exercises production logic rather than a copy of it.
    const instance = new LicenceStore(state, initial);

    return {
      async fetch(input, init) {
        const r = input instanceof Request ? input : new Request(input, init);
        const url = new URL(r.url);
        const body = r.method === 'POST' ? await r.clone().json() : {};
        let out;
        if (url.pathname === '/validate') {
          out = await enqueue(name, () => instance.validate(body));
        } else if (url.pathname === '/issue') {
          out = await enqueue(name, () => instance.issue(body));
        } else if (url.pathname === '/inspect') {
          out = await enqueue(name, () => instance.inspect());
        } else {
          out = { error: 'no route' };
        }
        return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
      },
    };
  }

  return {
    LICENCES: {
      idFromName: (name) => ({ name, toString: () => name }),
      get(id) {
        const key = id.name || String(id);
        if (!stores.has(key)) stores.set(key, makeStub(key));
        return stores.get(key);
      },
    },
    _env: initial,
    _opts: opts,
  };
}

function req(path, init = {}) {
  return new Request(`https://pctgoptimizer.pctechguy.app${path}`, init);
}

async function postJson(path, obj) {
  return worker.fetch(req(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  }), makeEnv());
}

// ------------------------------------------------------------- validate ---

test('first activation grants, second machine is refused', async () => {
  const env = makeEnv();
  const key = 'PCTG-TESTKEY1-AAAAAAAA-BBBBBBBB';

  const seed = env.LICENCES.get(env.LICENCES.idFromName(key));
  await seed.fetch('https://do/issue', {
    method: 'POST',
    body: JSON.stringify({ tier: 'standard', orderId: 'ORDER-1' }),
  });

  const first = await worker.fetch(
    req('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, machineId: 'M1' }) }), env);
  const a = await first.json();
  assert.equal(a.active, true);
  assert.equal(a.tier, 'standard');

  const second = await worker.fetch(
    req('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, machineId: 'M2' }) }), env);
  const b = await second.json();
  assert.equal(b.active, false);
  assert.match(b.message, /already activated on another computer/);
});

test('same machine revalidating stays active', async () => {
  const env = makeEnv();
  const key = 'PCTG-TESTKEY2-CCCCCCCC-DDDDDDDD';
  const seed = env.LICENCES.get(env.LICENCES.idFromName(key));
  await seed.fetch('https://do/issue', {
    method: 'POST',
    body: JSON.stringify({ tier: 'standard', orderId: 'ORDER-2' }),
  });

  const call = (mid) => worker.fetch(req('/api/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, machineId: mid }) }), env).then((r) => r.json());

  const a = await call('M1');
  assert.equal(a.active, true);
  const b = await call('M1');
  assert.equal(b.active, true);
  assert.equal(b.message, 'Licence renewed.');
});

test('REGRESSION: concurrent activation of one key binds exactly once', async () => {
  const env = makeEnv();
  const key = 'PCTG-RACEKEY1-EEEEEEEE-FFFFFFFF';

  // A key that was never issued must deny, so issue it first - the same way
  // shop-capture does after a completed capture.
  const stub = env.LICENCES.get(env.LICENCES.idFromName(key));
  await stub.fetch('https://do/issue', {
    method: 'POST',
    body: JSON.stringify({ tier: 'standard', orderId: 'ORDER-RACE' }),
  });

  const machines = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Fire them all at once - this is the case KV could not survive.
  const results = await Promise.all(machines.map((mid) =>
    worker.fetch(req('/api/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, machineId: mid }) }), env).then((r) => r.json())));

  const granted = results.filter((r) => r.active === true);
  assert.equal(granted.length, 1, `exactly one machine must win, got ${granted.length}`);
  assert.equal(
    results.filter((r) => /already activated/.test(r.message || '')).length, 7,
    'the other seven must be refused',
  );
});

test('a licence issued at checkout validates immediately', async () => {
  const env = makeEnv();
  const key = 'PCTG-FRESHKEY-NEWKEY000-VALID000';
  // Seed the DO the way shop-capture does.
  const stub = env.LICENCES.get(env.LICENCES.idFromName(key));
  await stub.fetch('https://do/issue', {
    method: 'POST',
    body: JSON.stringify({ tier: 'pro', orderId: 'ORDER-1', demo: false }),
  });

  const res = await worker.fetch(req('/api/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, machineId: 'NEWPC' }) }), env);
  const body = await res.json();
  assert.equal(body.active, true);
  assert.equal(body.tier, 'pro', 'the paid tier must survive the round trip');
});

test('issuing the same order twice replays rather than minting again', async () => {
  const env = makeEnv();
  const key = 'PCTG-REPLAYKEY-11111111-22222222';
  const stub = env.LICENCES.get(env.LICENCES.idFromName(key));

  const a = await stub.fetch('https://do/issue', {
    method: 'POST', body: JSON.stringify({ tier: 'pro', orderId: 'ORDER-X' }) }).then((r) => r.json());
  const b = await stub.fetch('https://do/issue', {
    method: 'POST', body: JSON.stringify({ tier: 'pro', orderId: 'ORDER-X' }) }).then((r) => r.json());

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.replayed, true);
});

test('unknown key, unknown tier and malformed bodies all deny', async () => {
  const env = makeEnv();
  const post = (obj) => worker.fetch(req('/api/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj) }), env);

  assert.equal((await (await post({ key: 'NOPE', machineId: 'M' })).json()).active, false);
  assert.equal((await (await post({ machineId: 'M' })).json()).active, false);
  assert.equal((await (await post({ key: 'K' })).json()).active, false);

  const bad = await worker.fetch(req('/api/validate', { method: 'POST', body: 'not json' }), env);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).active, false);
});

test('GET /api/validate is refused', async () => {
  const res = await worker.fetch(req('/api/validate', { method: 'GET' }), makeEnv());
  assert.equal(res.status, 405);
});

// ------------------------------------------------------------ shop order ---

test('shop-order with no credentials and no SHOP_DEMO returns 503 and mints nothing', async () => {
  const res = await postJson('/api/shop-order', { tier: 'pro' });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.approveUrl, undefined, 'a refused deployment must not return an approval URL');
});

test('shop-order honours SHOP_DEMO=1 for offline testing', async () => {
  const env = makeEnv();
  // Wire SHOP_DEMO through the process.env fallback the Worker reads.
  process.env.SHOP_DEMO = '1';
  try {
    const res = await worker.fetch(req('/api/shop-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'pro' }) }), env);
    const body = await res.json();
    assert.equal(body.demo, true);
    assert.equal(body.amount, 50);
    assert.equal(body.currency, 'GBP');
    assert.match(body.approveUrl, /^\/api\/shop-capture\?/);
  } finally {
    delete process.env.SHOP_DEMO;
  }
});

test('shop-order refuses an unknown tier and never leaks a price', async () => {
  const res = await postJson('/api/shop-order', { tier: 'platinum' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.price, undefined);
  assert.match(body.error, /Unknown tier/);
});

test('REGRESSION: demo capture cannot mint when SHOP_DEMO is off', async () => {
  const res = await worker.fetch(
    req('/api/shop-capture?orderId=DEMO-PRO-ABC123&tier=pro&demo=1'), makeEnv());
  assert.equal(res.status, 403, 'demo keys must be impossible without explicit opt-in');
  const html = await res.text();
  assert.equal(/PCTG-[0-9A-F]{8}-/.test(html), false, 'no licence key may appear in the response');
});

test('capture with no credentials and no demo cannot issue a licence', async () => {
  const res = await worker.fetch(req('/api/shop-capture?orderId=REAL123&tier=pro'), makeEnv());
  assert.equal(res.status, 503);
  const html = await res.text();
  assert.equal(/PCTG-[0-9A-F]{8}-/.test(html), false);
});

test('an unparseable orderId never issues a licence', async () => {
  const res = await worker.fetch(req('/api/shop-capture?orderId=&tier=pro'), makeEnv());
  assert.equal(res.status, 400);
  assert.equal(/PCTG-[0-9A-F]{8}-/.test(await res.text()), false);
});

test('unknown routes 404 rather than falling through to something permissive', async () => {
  const res = await worker.fetch(req('/api/anything-else'), makeEnv());
  assert.equal(res.status, 404);
});
