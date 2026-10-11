/**
 * REGRESSION TEST - the internal unlock must be unreachable in a PACKAGED PUBLIC build.
 *
 * THE BYPASS THIS PINS (measured 2026-10-11):
 * checkInternalUnlock() compared the typed key against process.env.PCTG_INTERNAL_UNLOCK.
 * Both sides are chosen by the person running the app, so ANY customer could
 *   set PCTG_INTERNAL_UNLOCK=abc
 *   ...and type "abc" into the licence key box
 * and be granted Pro with no server call, plus a serverVerifiedAt stamp that bought
 * them the 7-day offline grace window. The old comment claimed "it is not set in the
 * released installer, so a customer's copy ignores the password" - an environment
 * variable is not a secret; the customer sets it themselves.
 *
 * THE FIX: a packaged public build refuses the env var outright. Only an ADMIN edition
 * (baked at build time) or an unpackaged developer launch may use it.
 *
 * Run: node tests/internal-unlock.test.js
 */
const Module = require('module');
const path = require('path');

let isPackaged = false;
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') return { app: { isPackaged } };
  return origRequire.apply(this, arguments);
};

process.env.PCTG_INTERNAL_UNLOCK = 'abc';

const LIB = path.join(__dirname, '..', 'lib');
const variantPath = require.resolve(path.join(LIB, 'buildVariant.js'));

// Test 1: unpackaged dev launch -> env var works (the Boss's capture workflow).
isPackaged = false;
delete require.cache[variantPath];
let unlock = require(path.join(LIB, 'internalUnlock.js'));
let results = [];
results.push(['dev launch honours the env var', unlock.checkInternalUnlock('abc') !== null]);
results.push(['dev launch rejects a wrong password', unlock.checkInternalUnlock('xyz') === null]);

// Test 2: packaged PUBLIC build -> env var must be inert, even when set and matching.
isPackaged = true;
delete require.cache[variantPath];
delete require.cache[require.resolve(path.join(LIB, 'internalUnlock.js'))];
unlock = require(path.join(LIB, 'internalUnlock.js'));
results.push(['PACKAGED build ignores the env var entirely', unlock.internalUnlockEnabled() === false]);
results.push(['PACKAGED public build refuses the matching password', unlock.checkInternalUnlock('abc') === null]);

// Test 3: the same must hold with an admin-edition package.json, packaged, PUBLIC.
isPackaged = true;
delete require.cache[variantPath];
delete require.cache[require.resolve(path.join(LIB, 'internalUnlock.js'))];
unlock = require(path.join(LIB, 'internalUnlock.js'));
results.push(['PACKAGED build still refuses when variant reads admin (IS_ADMIN false here)', unlock.checkInternalUnlock('abc') === null]);

let failed = 0;
for (const [name, pass] of results) {
  if (!pass) failed++;
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
}
console.log(results.length - failed + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
