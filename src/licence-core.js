/**
 * PCTG System Optimizer - licence decision core.
 *
 * PURE FUNCTIONS ONLY. No fetch, no fs, no Durable Object, no process.env.
 * That constraint is the point: the same decision logic runs under the local
 * test runner and under Cloudflare Workers, so a behaviour proven here cannot
 * silently differ in production.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: fail closed.
 *
 * Every branch that is not an explicit, evidenced "yes" returns
 * { active: false }. There is no path that returns an active licence as a
 * fallback or as the result of an unrecognised tier. A licence gate that leaks
 * on error hands out paid features for free, and that is a customer promise
 * being broken - in our favour, but still broken.
 */

/** Tiers we are willing to grant. Anything outside this set is unknown. */
export const KNOWN_TIERS = Object.freeze([
  'standard',
  'pro',
  'fps',
  'security',
  'internet',
  'winfix',
  'deep',
  'repair',
]);

/**
 * Purchase tiers and prices in GBP. Source of truth for what the buyer pays.
 * Keep in step with landing/index.html - a divergence means we either
 * undercharge or overcharge a real customer.
 */
export const TIERS = Object.freeze({
  standard: { price: 30, currency: 'GBP', label: 'Standard' },
  pro: { price: 50, currency: 'GBP', label: 'PRO' },
  repair: { price: 25, currency: 'GBP', label: 'System Test & Repair' },
  fps: { price: 10, currency: 'GBP', label: 'FPS Booster module' },
  security: { price: 10, currency: 'GBP', label: 'Security module' },
  internet: { price: 10, currency: 'GBP', label: 'Internet / WiFi module' },
  winfix: { price: 10, currency: 'GBP', label: '1-Click WinFix module' },
  deep: { price: 10, currency: 'GBP', label: 'Deep Optimize module' },
});

const PURCHASE_LINK = 'https://www.paypal.me/pctechguyonline305';

function deny(message) {
  return { active: false, message };
}

function grant(tier, message) {
  return { active: true, tier, message, unlimited: true };
}

/**
 * Keys that ship in the source. Bound to nothing, redeemable once each.
 *
 * Every entry is written out in full rather than relying on `used` being
 * absent-and-therefore-falsy. A licence record whose meaning depends on an
 * undefined field is one refactor away from silently granting twice.
 */
export function initialLicences(now = 0) {
  const mk = (tier, created) => ({ tier, created, used: false, boundHwid: null, activatedAt: null });
  return {
    IHAVETHEGAMERSEDGE: mk('pro', 0),
    'PCTG-8C0C28B9-AAD3EE89-A8FB37E2': mk('standard', 1780253957261),
    'PCTG-42CE3A09-9895BEAF-9D0BC6F7': mk('standard', 1780253957263),
    'PCTG-FA42411E-56BE3A5A-C82D6FD4': mk('pro', 1780253957373),
    'PCTG-E2A7014B-DC8666D7-F83821CE': mk('pro', 1780253957375),
    'PCTG-CC98C0DC-36AA4E69-8646A227': mk('fps', 1780253957485),
    'PCTG-6C8256E0-9E3CEB40-8E0D288F': mk('fps', 1780253957487),
    'PCTG-62AA8365-5CD80BF7-CDE69998': mk('security', 1780253957594),
    'PCTG-7A3452BD-36662E24-1033EE7C': mk('security', 1780253957596),
    'PCTG-C273AFA2-5B38AFBB-5CD03C53': mk('internet', 1780253957707),
    'PCTG-B095B337-CE60DB7E-F7129ECB': mk('internet', 1780253957710),
    'PCTG-D8156D50-EBA44443-EFD49DBA': mk('winfix', 1780253957823),
    'PCTG-EE39D076-090DD8D2-91694E1E': mk('winfix', 1780253957824),
    'PCTG-35BC5049-8C0952D7-8BEBB3C6': mk('deep', 1780256251386),
    'PCTG-0F10F5C4-8B49826A-B8922DE6': mk('deep', 1780256251387),
    'PCTG-A1B2C3D4-E5F6G7H8-I9J0K1L2': mk('repair', now),
    'PCTG-M2N3O4P5-Q6R7S8T9-U0V1W2X3': mk('repair', now),
  };
}

/** Normalise caller input. Returns null when unusable, never a guess. */
export function normaliseKey(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed;
}

export function normaliseMachineId(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 256) return null;
  return trimmed;
}

/**
 * Decide whether a licence may activate, WITHOUT mutating anything.
 *
 * Returns { decision, entry, reason, tier, message }.
 *   decision: 'activate' | 'renew' | 'deny'
 *
 * The caller persists only on 'activate'. Keeping this pure is what lets the
 * Durable Object own the read-modify-write atomically while the decision itself
 * stays unit-testable.
 */
export function evaluateLicence(entry, machineId, now = 0) {
  // An absent entry is a DENY, not an empty case. This is the fail-closed gate.
  if (!entry || typeof entry !== 'object') {
    return {
      decision: 'deny',
      reason: 'unknown_key',
      message: `Invalid licence key. Purchase at ${PURCHASE_LINK}`,
    };
  }

  const tier = entry.tier;
  if (!KNOWN_TIERS.includes(tier)) {
    // An unrecognised tier is NOT "treat as standard". That would silently grant
    // the default unlock set to a key we do not understand.
    return {
      decision: 'deny',
      reason: 'unknown_tier',
      message: 'Licence key is not recognised. Please contact support@pctechguyonline.com.',
    };
  }

  if (entry.used === true) {
    if (entry.boundHwid === machineId) {
      return { decision: 'renew', entry, reason: 'same_machine', tier };
    }
    return {
      decision: 'deny',
      reason: 'bound_elsewhere',
      tier,
      message: 'This licence key is already activated on another computer.',
    };
  }

  return { decision: 'activate', entry, reason: 'fresh', tier };
}

/** Apply an 'activate' decision, returning a NEW object (no mutation). */
export function bindLicence(entry, machineId, now = 0) {
  return {
    ...entry,
    used: true,
    boundHwid: machineId,
    activatedAt: now,
  };
}

/** Turn a decision into the exact JSON body the desktop app expects. */
export function decisionToResponse(decision) {
  const { decision: verdict, tier, message } = decision;

  if (verdict === 'activate') return grant(tier, `Activated ${String(tier).toUpperCase()} tier!`);
  if (verdict === 'renew') return grant(tier, 'Licence renewed.');

  // Fail closed.
  return deny(message || 'Licence could not be verified.');
}

/** Generate a licence key in the shipped format: PCTG-XXXXXXXX-XXXXXXXX-XXXXXXXX */
export async function generateLicenceKey() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `PCTG-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}`;
}

/**
 * Validate a purchase tier request.
 *
 * Fails closed on anything unrecognised, so a crafted request cannot buy a
 * GBP 10 module and be granted 'pro'. Uses hasOwnProperty rather than a truthy
 * lookup so inherited keys like 'constructor' cannot slip through.
 */
export function resolveTier(rawTier) {
  const tier = typeof rawTier === 'string' ? rawTier.trim().toLowerCase() : '';
  if (!Object.prototype.hasOwnProperty.call(TIERS, tier)) {
    return { ok: false, error: `Unknown tier. Valid: ${Object.keys(TIERS).join(', ')}` };
  }
  return { ok: true, tier, ...TIERS[tier] };
}
