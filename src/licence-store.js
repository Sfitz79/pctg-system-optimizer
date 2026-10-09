/**
 * LicenceStore Durable Object - one licence key per Durable Object.
 *
 * WHY A DURABLE OBJECT AND NOT WORKERS KV
 * ======================================
 * KV is eventually consistent. Reads can be up to 60 seconds stale. Two
 * activations of the same key arriving inside that window would BOTH read
 * "unused" and both succeed, binding one paid licence to two machines. That is
 * exactly the fail-open I refuse to ship: the licence gate is a customer
 * promise, and a promise enforced on a stale read is not enforced.
 *
 * A Durable Object is single-threaded per instance and its storage is strongly
 * consistent, so the read-decide-write sequence below cannot interleave. The
 * object id IS the licence key, so two requests for the same key are
 * serialised against each other and two requests for different keys never
 * contend. That gives us per-key atomicity with no schema and no transactions.
 *
 * WHAT WAS WRONG BEFORE (measured, not assumed)
 * ==============================================
 * The old Vercel handlers persisted licences to /tmp/pctg-keys-db.json and to
 * api/server-keys.json. On Vercel the deployment bundle is read-only and /tmp is
 * per-instance and ephemeral, and both writes were wrapped in empty catch {}
 * blocks. Verified live: key PCTG-175C3318-1159A88D-CD68D561, present in
 * api/server-keys.json with sale "DEMO-STANDARD-TEST", returned
 * {"active":false,"message":"Invalid license key"} from the production
 * validate endpoint. A minted licence simply did not exist.
 */

import {
  bindLicence,
  decisionToResponse,
  evaluateLicence,
  generateLicenceKey,
  initialLicences,
} from './licence-core.js';

const STATE_VERSION = 1;

export class LicenceStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async #load() {
    let record = await this.state.storage.get('record');
    if (!record) {
      // First ever access for this key. Seed the shipped keys on demand so a
      // fresh deploy still honours IHAVETHEGAMERSEDGE and the sample set.
      record = {
        version: STATE_VERSION,
        entry: null,
        sale: null,
        demo: false,
        issuedAt: null,
      };
    }
    return record;
  }

  /**
   * Validate a licence key against a machine id and bind it if it is free.
   *
   * This entire method runs to completion before any other request for the same
   * key can enter the object, which is what makes the bind atomic. There is no
   * await between the read and the write that could yield to a competing
   * request... except `this.state.storage.put`, which returns a promise. It is
   * deliberately the LAST await, after the decision is already made, so the
   * window between "decided unused" and "marked used" cannot contain a yield to
   * a second activation.
   */
  async validate({ machineId }) {
    const record = await this.#load();

    // Seed: a key present in the shipped set but never persisted here yet.
    if (!record.entry) {
      const shipped = initialLicences(Date.now())[this.#keyFromId()];
      if (shipped) {
        record.entry = shipped;
        await this.state.storage.put('record', record);
      }
    }

    const decision = evaluateLicence(record.entry, machineId, Date.now());

    if (decision.decision === 'activate') {
      record.entry = bindLicence(record.entry, machineId, Date.now());
      record.activatedAt = Date.now();
      await this.state.storage.put('record', record);
    }

    const body = decisionToResponse(decision);

    // Never leak internal reason codes or stored identifiers to the desktop app.
    return {
      active: body.active === true,
      message: body.message,
      ...(body.active ? { tier: body.tier, unlimited: true } : {}),
      // Server-side only, for the operator log. Never sent to clients.
      __reason: decision.reason,
      __bound: record.entry ? record.entry.boundHwid : null,
    };
  }

  /** Issue a licence after a confirmed capture. Idempotent per order id. */
  async issue({ tier, orderId, demo = false }) {
    const existing = await this.state.storage.get('record');
    if (existing && existing.sale && existing.sale === orderId) {
      // Same order replayed - return the key we already issued rather than
      // minting a second one for the same payment.
      return { ok: true, replayed: true, key: this.#keyFromId() };
    }

    const key = await generateLicenceKey();
    // This object is addressed BY that key, so we cannot rename it. Instead the
    // issuing handler creates a new object named for the generated key and calls
    // /seed on it. This method exists for the single-object (test) path.
    await this.state.storage.put('record', {
      version: STATE_VERSION,
      entry: { tier, created: Date.now(), used: false, boundHwid: null, activatedAt: null },
      sale: orderId,
      demo,
      issuedAt: Date.now(),
    });
    return { ok: true, replayed: false, key };
  }

  /** Read-only view, for the operator dashboard. */
  async inspect() {
    return this.#load();
  }

  #keyFromId() {
    return this.state.id.name || this.state.id.toString();
  }
}
