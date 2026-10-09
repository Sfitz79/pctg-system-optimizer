/**
 * Proves the internal capture unlock is OFF by default and ON only when asked.
 *
 * The whole point is that this cannot become another SPECIAL_KEYS backdoor, so
 * both halves are asserted:
 *   - released build (no env var)  -> password grants NOTHING
 *   - capture build (env var set)  -> password grants Pro
 */
import { checkInternalUnlock, internalUnlockEnabled } from '../lib/internalUnlock.js';

// The password is supplied at RUN TIME, never written into this file.
// This script ships inside the packaged app, so hardcoding it here would put the
// literal in the customer-facing binary for no reason.
const PASS = process.env.CAPTURE_UNLOCK_TEST_VALUE || 'test-only-placeholder';
let fail = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};

console.log('=== 1. RELEASED BUILD (no env var set) ===\n');
delete process.env.PCTG_INTERNAL_UNLOCK;
check('unlock disabled', internalUnlockEnabled() === false);
check('the password grants nothing', checkInternalUnlock(PASS) === null);
check('any password grants nothing', checkInternalUnlock('anything') === null);
check('empty key grants nothing', checkInternalUnlock('') === null);

console.log('\n=== 2. CAPTURE BUILD (env var set) ===\n');
process.env.PCTG_INTERNAL_UNLOCK = PASS;
check('unlock enabled', internalUnlockEnabled() === true);
const ok = checkInternalUnlock(PASS);
check('correct password -> pro', ok && ok.tier === 'pro', JSON.stringify(ok));
check('wrong password -> nothing', checkInternalUnlock('wrongpassword') === null);
check('case-insensitive', checkInternalUnlock(PASS.toUpperCase()) !== null);

console.log('\n=== 3. THE ENV VALUE IS THE SECRET, NOT THE CODE ===\n');
delete process.env.PCTG_INTERNAL_UNLOCK;
check('switching the var off disables it again', checkInternalUnlock(PASS) === null);

console.log(fail === 0 ? '\n  PASS - off by default, on only for capture. Not a shipped backdoor.' : `\n  FAIL - ${fail} problem(s).`);
process.exit(fail === 0 ? 0 : 1);