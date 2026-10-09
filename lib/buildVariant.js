/**
 * BUILD VARIANT - decides which edition this is. COMMONJS on purpose.
 *
 * WHY THIS IS .cjs-STYLE CODE, NOT ESM
 * ------------------------------------
 * main.js is CommonJS (it uses require()). An earlier build failure came from adding
 * a single `import` to main.js: Node reparse the whole file as an ES module and every
 * require() on line 1 threw, so the app launched nothing at all. Requiring an ES
 * module from CommonJS can fail the same way. So anything main.js pulls in MUST be
 * CommonJS. Do not "modernise" this file to import/export.
 *
 * WHY A VARIANT AT ALL
 * --------------------
 * 1. The Boss and the dev team need a Pro build with no password and no setup, on
 *    every build.
 * 2. A customer must never end up with that build.
 * A run-time env var cannot give both. So the edition is BAKED IN at build time into
 * build-variant.json, and the release pipeline never writes the admin value.
 *
 *   public -> locked, licences come from the server only
 *   admin  -> "PCTG Optimizer Admin Edition", Pro available without a licence
 */
const fs = require('node:fs');
const path = require('node:path');

/**
 * Reads the edition from the app's OWN package.json.
 *
 * Why not a separate build-variant.json: it was tried first and did not resolve
 * inside app.asar, so the Admin Edition silently behaved as the public build - the
 * unlock never fired and the key went to the server, which replied "not
 * recognised". package.json is guaranteed to sit next to main.js at the asar root
 * and is already resolved by Node, so requiring it cannot fail on path grounds.
 *
 * There is no path guessing here at all now, deliberately.
 */
function readVariant() {
  try {
    const pkg = require('../package.json');
    const edition = pkg && pkg.pctgEdition;
    if (edition === 'admin' || edition === 'public') return { edition };
  } catch {}
  // Failing closed: anything unreadable means PUBLIC. The worst possible outcome
  // must never be a customer copy believing it is an admin build.
  return { edition: 'public' };
}

const VARIANT = readVariant();
const IS_ADMIN = VARIANT.edition === 'admin';

module.exports = {
  VARIANT,
  IS_ADMIN,
  PRODUCT_NAME: IS_ADMIN ? 'PCTG Optimizer Admin Edition' : 'PCTG Optimizer Pro',
};