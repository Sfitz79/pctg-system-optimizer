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

function readVariant() {
  try {
    const p = path.join(__dirname, '..', 'build-variant.json');
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    return v && typeof v === 'object' ? v : { edition: 'public' };
  } catch {
    return { edition: 'public' };
  }
}

const VARIANT = readVariant();
const IS_ADMIN = VARIANT.edition === 'admin';

module.exports = {
  VARIANT,
  IS_ADMIN,
  PRODUCT_NAME: IS_ADMIN ? 'PCTG Optimizer Admin Edition' : 'PCTG Optimizer Pro',
};