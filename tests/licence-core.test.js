/**
 * Tests for the licence decision core.
 *
 * Run: node --test tests/
 *
 * These assert the FAIL-CLOSED property explicitly, because that is the
 * property that is easy to regress silently: every one of these tests would
 * pass on the old Vercel implementation except the ones marked REGRESSION.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_TIERS,
  TIERS,
  bindLicence,
  decisionToResponse,
  evaluateLicence,
  generateLicenceKey,
  initialLicences,
  normaliseKey,
  normaliseMachineId,
  resolveTier,
} from '../src/licence-core.js';

const MACHINE_A = 'MACHINE-A-0001';
const MACHINE_B = 'MACHINE-B-0002';

test('normaliseKey trims and rejects unusable input', () => {
  assert.equal(normaliseKey('  PCTG-AAA  '), 'PCTG-AAA');
  assert.equal(normaliseKey(''), null);
  assert.equal(normaliseKey('   '), null);
  assert.equal(normaliseKey(null), null);
  assert.equal(normaliseKey(12345), null);
  assert.equal(normaliseKey({}), null);
  assert.equal(normaliseKey('x'.repeat(129)), null, 'oversized key must be rejected, not truncated');
});

test('normaliseMachineId trims and rejects unusable input', () => {
  assert.equal(normaliseMachineId('  ABC  '), 'ABC');
  assert.equal(normaliseMachineId(''), null);
  assert.equal(normaliseMachineId(null), null);
  assert.equal(normaliseMachineId('y'.repeat(257)), null);
});

test('REGRESSION: an unknown key denies rather than granting anything', () => {
  const d = evaluateLicence(undefined, MACHINE_A);
  assert.equal(d.decision, 'deny');
  const body = decisionToResponse(d);
  assert.equal(body.active, false);
  assert.match(body.message, /Invalid licence key/);
});

test('REGRESSION: an unrecognised TIER denies instead of defaulting to standard', () => {
  // The old code did `entry.tier.toUpperCase()` and would have thrown or
  // silently granted whatever the default unlock set was.
  for (const bogus of ['platinum', 'PRO ', '', null, undefined, 0, 'toString', 'constructor']) {
    const d = evaluateLicence({ tier: bogus, used: false }, MACHINE_A);
    assert.equal(d.decision, 'deny', `tier ${JSON.stringify(bogus)} must deny`);
    assert.equal(decisionToResponse(d).active, false);
  }
});

test('every known tier activates and returns its own tier', () => {
  for (const tier of KNOWN_TIERS) {
    const d = evaluateLicence({ tier, used: false }, MACHINE_A);
    assert.equal(d.decision, 'activate', `${tier} should activate`);
    const body = decisionToResponse(d);
    assert.equal(body.active, true);
    assert.equal(body.tier, tier);
  }
});

test('first activation binds to the machine', () => {
  const entry = { tier: 'pro', used: false, boundHwid: null };
  const d = evaluateLicence(entry, MACHINE_A);
  assert.equal(d.decision, 'activate');

  const bound = bindLicence(entry, MACHINE_A, 1700000000000);
  assert.equal(bound.used, true);
  assert.equal(bound.boundHwid, MACHINE_A);
  assert.equal(bound.activatedAt, 1700000000000);
});

test('same machine re-validating is a renew, not a new activation', () => {
  const bound = { tier: 'pro', used: true, boundHwid: MACHINE_A, activatedAt: 1 };
  const d = evaluateLicence(bound, MACHINE_A);
  assert.equal(d.decision, 'renew');

  const body = decisionToResponse(d);
  assert.equal(body.active, true);
  assert.equal(body.tier, 'pro');
  assert.equal(body.message, 'Licence renewed.');
});

test('REGRESSION: a key bound elsewhere is refused for a different machine', () => {
  const bound = { tier: 'pro', used: true, boundHwid: MACHINE_A, activatedAt: 1 };
  const d = evaluateLicence(bound, MACHINE_B);
  assert.equal(d.decision, 'deny');
  assert.equal(d.reason, 'bound_elsewhere');

  const body = decisionToResponse(d);
  assert.equal(body.active, false);
  assert.match(body.message, /already activated on another computer/);
});

test('bindLicence does not mutate its input', () => {
  const entry = { tier: 'fps', used: false, boundHwid: null };
  const snapshot = JSON.stringify(entry);
  bindLicence(entry, MACHINE_A, 999);
  assert.equal(JSON.stringify(entry), snapshot, 'bindLicence must return a new object');
});

test('evaluateLicence does not mutate its input', () => {
  const entry = { tier: 'fps', used: false, boundHwid: null };
  const snapshot = JSON.stringify(entry);
  evaluateLicence(entry, MACHINE_A);
  assert.equal(JSON.stringify(entry), snapshot);
});

test('the shipped IHAVETHEGAMERSEDGE key is pro and starts unbound', () => {
  const set = initialLicences(1);
  assert.equal(set.IHAVETHEGAMERSEDGE.tier, 'pro');
  assert.equal(set.IHAVETHEGAMERSEDGE.used, false);
  assert.equal(evaluateLicence(set.IHAVETHEGAMERSEDGE, MACHINE_A).decision, 'activate');
});

test('initialLicences entries all carry a known tier', () => {
  const set = initialLicences(1);
  for (const [key, entry] of Object.entries(set)) {
    assert.ok(KNOWN_TIERS.includes(entry.tier), `${key} has unknown tier ${entry.tier}`);
    assert.equal(entry.used, false);
  }
});

test('resolveTier accepts known tiers and returns GBP prices', () => {
  const pro = resolveTier('PRO');
  assert.equal(pro.ok, true);
  assert.equal(pro.tier, 'pro');
  assert.equal(pro.price, 50);
  assert.equal(pro.currency, 'GBP');

  const fps = resolveTier('  fps ');
  assert.equal(fps.ok, true);
  assert.equal(fps.price, 10);
});

test('REGRESSION: resolveTier fails closed on unknown or inherited keys', () => {
  for (const bad of ['platinum', '', null, undefined, 99, 'toString', 'constructor', '__proto__']) {
    const r = resolveTier(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must not resolve to a tier`);
    assert.equal(r.price, undefined, 'a refused tier must expose no price');
  }
});

test('every purchasable tier maps to a licence tier we can grant', () => {
  for (const tier of Object.keys(TIERS)) {
    assert.ok(KNOWN_TIERS.includes(tier), `purchase tier ${tier} is not a grantable licence tier`);
  }
});

test('all prices are GBP and whole pounds', () => {
  for (const [tier, cfg] of Object.entries(TIERS)) {
    assert.equal(cfg.currency, 'GBP', `${tier} must be GBP`);
    assert.ok(cfg.price > 0, `${tier} must cost something`);
    assert.equal(Number.isInteger(cfg.price), true, `${tier} price should be a whole pound`);
  }
});

test('generated keys match the shipped format and do not repeat', async () => {
  const pattern = /^PCTG-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/;
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const key = await generateLicenceKey();
    assert.match(key, pattern);
    assert.equal(seen.has(key), false, 'generated a duplicate licence key');
    seen.add(key);
  }
});

test('a freshly generated key is not in the shipped set and would deny', () => {
  const set = initialLicences(1);
  const fresh = 'PCTG-DEADBEEF-CAFEBABE-12345678';
  assert.equal(set[fresh], undefined);
  assert.equal(evaluateLicence(set[fresh], MACHINE_A).decision, 'deny');
});

test('decisionToResponse always returns a body with a message', () => {
  const decisions = [
    evaluateLicence(undefined, MACHINE_A),
    evaluateLicence({ tier: 'nope', used: false }, MACHINE_A),
    evaluateLicence({ tier: 'pro', used: true, boundHwid: MACHINE_A }, MACHINE_A),
    evaluateLicence({ tier: 'pro', used: false }, MACHINE_A),
  ];
  for (const d of decisions) {
    const body = decisionToResponse(d);
    assert.equal(typeof body.active, 'boolean');
    assert.equal(typeof body.message, 'string');
    assert.ok(body.message.length > 0);
  }
});
