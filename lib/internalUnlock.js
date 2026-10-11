/**
 * INTERNAL CAPTURE UNLOCK - not a licence bypass.
 *
 * WHY THIS IS NOT THE OLD SPECIAL_KEYS BACKDOOR
 * ----------------------------------------------
 * the old capture password used to be a hardcoded SPECIAL_KEY that granted Pro in every
 * shipped copy, without contacting the server. That was removed on 2026-10-09 because
 * it was a free Pro licence compiled into a product customers download.
 *
 * Capture still needs the Pro UI, so the unlock exists - but it only activates when
 * the build is the Admin Edition, or when `PCTG_INTERNAL_UNLOCK` is set AND the app
 * is running UNPACKED (a developer launch).
 *
 * The packaged guard is a security fix, not tidiness. An environment variable is not
 * a secret: before 2026-10-11 a customer could set PCTG_INTERNAL_UNLOCK themselves
 * and type the same value into the licence box to be granted Pro with no server call.
 * A shipped build now refuses the env var outright, whatever the environment says.
 * See internalUnlockEnabled() and tests/internal-unlock.test.js.
 *
 * This is a switch that is off in every customer build, not a key that is always in
 * the binary. The alternative - telling the Boss to paste a password into a shipping
 * app - is the thing we just removed.
 *
 * Usage (for screenshot/video capture only):
 *   set PCTG_INTERNAL_UNLOCK=the old capture password
 *   npm start                        (unpacked dev launch; a packaged build ignores it)
 */

const INTERNAL_UNLOCK_ENV = 'PCTG_INTERNAL_UNLOCK';

/** Is internal capture mode switched on for THIS process? */
function internalUnlockEnabled() {
  // Either the env var is set (a developer launch), or this is the baked-in Admin
  // Edition, which is unlocked by design so nobody has to type anything.
  if (safeIsAdmin()) return true;

  /*
   * A PACKAGED build ignores the env var. Fail closed, and this is the security fix.
   *
   * MEASURED 2026-10-11: checkInternalUnlock() compares the typed key against
   * process.env.PCTG_INTERNAL_UNLOCK. Both sides are chosen by whoever runs the app,
   * so an environment variable is not a secret - a customer can set it themselves:
   *
   *   set PCTG_INTERNAL_UNLOCK=abc   (their own machine, their own shell)
   *   ...then type "abc" in the licence box
   *
   * and receive Pro with no server call, plus a serverVerifiedAt stamp that also
   * bought the 7-day offline grace window. The comment that used to sit here said
   * "it is not set in the released installer, so a customer's copy ignores the
   * password" - true only for a customer who never thought to look. That is not a
   * licence mechanism, it is a default setting.
   *
   * The capture workflow does not need it: the Admin Edition already grants Pro with
   * no password and no setup (see buildVariant.js), and an unpacked `npm start` is
   * still a developer launch. So the env var is honoured ONLY when the app is not
   * packaged. In a shipped build the Admin Edition is the only way in.
   */
  let packaged = false;
  try {
    packaged = require('electron').app.isPackaged === true;
  } catch (e) {
    // If we cannot even read Electron, assume packaged and stay locked.
    packaged = true;
  }
  if (packaged) return false;

  const v = process.env[INTERNAL_UNLOCK_ENV];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Why the Admin Edition reported the public edition.
 *
 * Requiring './buildVariant.js' resolves relative to THIS file (lib/), which is
 * right. The fault was the single hard-coded path inside buildVariant.js, fixed
 * there. This wrapper stays deliberately defensive: if anything at all goes wrong
 * reading the variant, it returns false, which LOCKS the build. Failing closed is
 * the correct direction - the worst outcome must never be a customer copy that
 * thinks it is an admin build.
 */
function safeIsAdmin() {
  try {
    return require('./buildVariant.js').IS_ADMIN === true;
  } catch (e) {
    return false;
  }
}

/**
 * Returns an internal tier when capture mode is on and the password matches.
 * Returns null in every other case - including when the password is correct but the
 * switch is off, which is the case that matters.
 */
function checkInternalUnlock(key) {
  if (!internalUnlockEnabled()) return null;
  const expected = String(process.env[INTERNAL_UNLOCK_ENV] || '').trim().toLowerCase();
  const given = String(key || '').trim().toLowerCase();
  if (!expected || given !== expected) return null;
  console.log('[capture] internal unlock accepted - INTERNAL BUILD, do not distribute');
  return { tier: 'pro', internal: true };
}
module.exports = { internalUnlockEnabled, checkInternalUnlock };
