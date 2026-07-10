/* ==========================================================================
   Etherfall - Awakening System (Elemental Awakening, v0.0.8)
   Models an element's permanent "Awakening" — a one-time, milestone moment
   where the world recognises the player's growth with the element. Each
   element owns:
     - awakening state (awakened bool, permanent)
     - awakening level (currently 1 once awakened)
     - requirements (affinity levels + character level)
     - rewards (e.g. unlock Burn, visual upgrade, codex entry)
     - a single unlock animation / notification (driven by the consumer)

   The system is purely authoritative STATE + RULES. It does NOT render, play
   audio, or pause the world — it only decides *when* an awakening can fire and
   records it. GameScene subscribes to AWAKENING_STARTED (emitted by awaken())
   to play the cinematic VFX. This keeps the effects modular and the data
   (data/awakenings.json) as the single source of truth.

   Only one awakening triggers at a time, and only once per element. Spirit is a
   hidden placeholder (released:false, hidden:true) — never triggered, never
   revealed.

   Future status effects (freeze / shock / poison / curse) are declared in the
   data file and surfaced here as prepared slots so later versions can light
   them up without re-architecting.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

// Elements considered for triggering this version (Spirit excluded — hidden).
const TRIGGER_ORDER = ["fire", "water", "air", "earth"];

export class AwakeningSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} data  registry data (expects data.awakenings)
   * @param {SaveSystem} saveSystem  optional; enables awakening persistence
   * @param {AffinitySystem} affinitySystem  element level queries
   * @param {LevelSystem} levelSystem  character level queries
   */
  constructor(scene, data, saveSystem, affinitySystem, levelSystem) {
    this.scene = scene;
    this.save = saveSystem;
    this.affinity = affinitySystem;
    this.level = levelSystem;

    const aw = (data && data.awakenings) || {};
    this.raw = aw;

    // Definitions keyed by element id. Spirit (hidden) is kept in the map for
    // completeness but is never surfaced to the player.
    this.defs = {};
    (aw.awakenings || []).forEach((d) => {
      this.defs[d.id] = d;
    });

    // Prepared future status effects (freeze/shock/poison/curse), read-only.
    this.preparedStatusEffects = aw.statusEffects || {};

    // --- Persistent state (loaded from save if present) ---
    const blank = { awakened: {}, levels: {}, history: [] };
    const stored = (saveSystem && saveSystem.getSection("awakenings")) || {};
    this.state = {
      awakened: { ...blank.awakened, ...(stored.awakened || {}) },
      levels: { ...blank.levels, ...(stored.levels || {}) },
      history: Array.isArray(stored.history) ? stored.history.slice() : [],
    };
  }

  // --- Queries -----------------------------------------------------------

  /** True once an element has been awakened (permanent). */
  isAwakened(id) {
    return !!this.state.awakened[id];
  }

  /** Awakening level for an element (0 = not awakened, 1 = awakened). */
  getLevel(id) {
    return this.state.levels[id] || (this.isAwakened(id) ? 1 : 0);
  }

  /** List of awakened element ids. */
  getAwakenedElements() {
    return Object.keys(this.state.awakened).filter((id) => this.state.awakened[id]);
  }

  /** History records (element + timestamp) for the save/codex. */
  getHistory() {
    return this.state.history.slice();
  }

  /** Definition for an element (or null). Safe to call for hidden elements. */
  getDef(id) {
    return this.defs[id] || null;
  }

  /** Prepared (not-yet-active) status-effect descriptors from data. */
  getPreparedStatusEffects() {
    return this.preparedStatusEffects;
  }

  /** Base burn chance granted by the Fire Awakening reward (0 if n/a). */
  getBaseBurnChance(id) {
    const def = this.defs[id];
    if (!def || !def.reward || !def.reward.burn) return 0;
    return def.reward.baseBurnChance || 0;
  }

  // --- Trigger logic -----------------------------------------------------

  /** Do the stored requirements for an element's def currently hold? */
  requirementsMet(def) {
    if (!def) return false;
    const req = def.requirements || {};

    if (req.level && this.level && this.level.getLevel() < req.level) return false;

    if (req.affinity && this.affinity) {
      for (const [elem, lvl] of Object.entries(req.affinity)) {
        if (this.affinity.getLevel(elem) < lvl) return false;
      }
    }
    return true;
  }

  /**
   * Can this element awaken right now?
   *  - must be released (future/spirit are not)
   *  - must not already be awakened (one-time only)
   *  - requirements must be satisfied
   * @param {string} id
   * @returns {boolean}
   */
  canTrigger(id) {
    const def = this.defs[id];
    if (!def || def.released === false) return false;
    if (this.isAwakened(id)) return false;
    return this.requirementsMet(def);
  }

  /** First element (in TRIGGER_ORDER) that can currently awaken, or null. */
  firstReady() {
    for (const id of TRIGGER_ORDER) {
      if (this.canTrigger(id)) return id;
    }
    return null;
  }

  // --- Mutation ----------------------------------------------------------

  /**
   * Perform the awakening for an element. Records permanent state, pushes a
   * history entry (with timestamp for future save/codex display), persists, and
   * emits EVENTS.AWAKENING_STARTED so the consumer can play the cinematic.
   * Returns false if it cannot/should not trigger (idempotent + safe).
   * @param {string} id
   * @returns {boolean} whether the awakening was applied
   */
  awaken(id) {
    if (!this.canTrigger(id)) return false;
    const def = this.defs[id];

    this.state.awakened[id] = true;
    this.state.levels[id] = 1;
    this.state.history.push({
      element: id,
      name: def.name,
      time: Date.now(), // future codex "date unlocked" support
    });

    this.persist();
    this.scene.game.events.emit(EVENTS.AWAKENING_STARTED, id, def);
    return true;
  }

  /** Persist awakening state into the save system (no-op if no save). */
  persist() {
    if (!this.save) return;
    this.save.patchSection("awakenings", {
      awakened: this.state.awakened,
      levels: this.state.levels,
      history: this.state.history,
    });
  }

  /** Snapshot for save/debug consumers. */
  serialize() {
    return {
      awakened: { ...this.state.awakened },
      levels: { ...this.state.levels },
      history: this.state.history.slice(),
    };
  }
}
