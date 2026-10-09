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
 * `PCTG_INTERNAL_UNLOCK` is set in the environment at RUN TIME. That variable is NOT
 * set in the released installer, so a customer's copy behaves exactly as it did:
 * every tier comes from the server and the password does nothing.
 *
 * This is a switch that is off by default, not a key that is always in the binary.
 * The alternative - telling the Boss to paste a password into a shipping app - is the
 * thing we just removed.
 *
 * Usage (for screenshot/video capture only):
 *   set PCTG_INTERNAL_UNLOCK=the old capture password
 *   npm start
 */

const INTERNAL_UNLOCK_ENV = 'PCTG_INTERNAL_UNLOCK';

/** Is internal capture mode switched on for THIS process? */
export function internalUnlockEnabled() {
  const v = process.env[INTERNAL_UNLOCK_ENV];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Returns an internal tier when capture mode is on and the password matches.
 * Returns null in every other case - including when the password is correct but the
 * switch is off, which is the case that matters.
 */
export function checkInternalUnlock(key) {
  if (!internalUnlockEnabled()) return null;
  const expected = String(process.env[INTERNAL_UNLOCK_ENV] || '').trim().toLowerCase();
  const given = String(key || '').trim().toLowerCase();
  if (!expected || given !== expected) return null;
  console.log('[capture] internal unlock accepted - INTERNAL BUILD, do not distribute');
  return { tier: 'pro', internal: true };
}