/* ==========================================================================
   Etherfall - Affinity System (elemental progression)
   Tracks the player's relationship with each element independently of the
   character level / spell upgrades. Every element has its own level, experience
   and a hard max level (50). Killing enemies with an element's magic grants that
   element affinity EXP (separate from character EXP).

   Milestones (Lv10/20/30/40/50) are recorded but only Fire has implemented,
   SAFE bonuses so far:
     - Fire Lv10 : +10% Fire damage
     - Fire Lv20 : base Burn chance on Fire hits
     - Lv30/40/50: prepared for future effects (no behaviour yet)

   Spirit exists but stays locked/hidden until a later version. Elements other
   than Fire are registered (locked) and ready for an unlockElement() flow.

   No balance is exponential: affinity EXP per level grows linearly and the per-
   kill gain is a fraction of the enemy's EXP, so reaching Lv50 is a long-term
   achievement, not something done in ten minutes.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

const ELEMENT_IDS = ["fire", "water", "air", "earth", "spirit"];

/**
 * Affinity EXP required to advance FROM `level` to `level + 1`.
 * Arithmetic (slower than character EXP) so the curve feels deliberate.
 */
function affinityExpToNext(level) {
  return 20 + 10 * level;
}

// Milestone tiers (purely descriptive for now; effects are keyed separately).
export const AFFINITY_MILESTONES = {
  10: "Minor Elemental Awakening",
  20: "Major Elemental Mastery",
  30: "Advanced Mastery",
  40: "Expert Mastery",
  50: "Elemental Ascension",
};

// Implemented, safe per-element bonuses. Only Fire is active.
const BONUSES = {
  fire: {
    damageAt10: 0.10, // +10% fire damage at affinity Lv10
    burnAt20: 0.15, // base burn chance once affinity Lv20 is reached
  },
};

export class AffinitySystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} data  registry data (expects data.affinity)
   */
  constructor(scene, data) {
    this.scene = scene;
    const aff = (data && data.affinity) || {};

    this.elements = {};
    ELEMENT_IDS.forEach((id) => {
      const d = aff[id] || {
        level: 0,
        experience: 0,
        maxLevel: 50,
        unlocked: false,
        locked: id === "spirit",
      };
      this.elements[id] = {
        id,
        level: d.level || 0,
        experience: d.experience || 0,
        maxLevel: d.maxLevel || 50,
        unlocked: !!d.unlocked,
        locked: !!d.locked,
        hidden: !!d.hidden,
      };
    });
  }

  // --- Queries ---
  getLevel(id) {
    return this.elements[id]?.level || 0;
  }
  getExp(id) {
    return this.elements[id]?.experience || 0;
  }
  getMaxLevel(id) {
    return this.elements[id]?.maxLevel || 50;
  }
  isUnlocked(id) {
    const e = this.elements[id];
    return !!e && e.unlocked && !e.locked;
  }
  isLocked(id) {
    return !!this.elements[id]?.locked;
  }
  isHidden(id) {
    return !!this.elements[id]?.hidden;
  }

  /** EXP needed for the next affinity level (0 if maxed). */
  expToNext(id) {
    const e = this.elements[id];
    if (!e || e.level >= e.maxLevel) return 0;
    return affinityExpToNext(e.level);
  }

  // --- Progression ---
  /**
   * Grant affinity EXP to an element. Handles multi-level gains and emits
   * AFFINITY_LEVELED per level. Returns levels gained.
   * @param {string} id
   * @param {number} amount
   * @returns {number}
   */
  grantExp(id, amount) {
    const e = this.elements[id];
    if (!e || !amount || amount <= 0) return 0;
    if (e.level >= e.maxLevel) return 0;

    e.experience += amount;
    let gained = 0;
    while (e.level < e.maxLevel && e.experience >= this.expToNext(id)) {
      e.experience -= this.expToNext(id);
      e.level += 1;
      gained += 1;
      this.scene.game.events.emit(EVENTS.AFFINITY_LEVELED, id, e.level);
    }
    if (e.level >= e.maxLevel) e.experience = 0; // bank any overflow at cap
    return gained;
  }

  /**
   * Future: unlock an element for the player (no auto-unlock yet — Water/Air/
   * Earth stay locked until an explicit unlock choice/flow grants them).
   * @param {string} id
   * @returns {boolean}
   */
  unlockElement(id) {
    const e = this.elements[id];
    if (!e) return false;
    e.unlocked = true;
    e.locked = false;
    this.scene.game.events.emit(EVENTS.AFFINITY_UNLOCKED, id);
    return true;
  }

  // --- Implemented benefits (Fire only, safe) ---

  /** Damage multiplier from affinity for an element (1 = no bonus). */
  getDamageMultiplier(id) {
    const e = this.elements[id];
    if (!e || e.level < 10) return 1;
    const b = BONUSES[id];
    return b && b.damageAt10 ? 1 + b.damageAt10 : 1;
  }

  /** Base burn chance granted by affinity (0 until the Lv20 milestone). */
  getBurnChance(id) {
    const e = this.elements[id];
    if (!e || e.level < 20) return 0;
    const b = BONUSES[id];
    return b && b.burnAt20 ? b.burnAt20 : 0;
  }

  /** True once the Lv20 "burn effect" milestone is reached. */
  hasBurn(id) {
    return this.getBurnChance(id) > 0;
  }

  /** Per-element snapshot (id/level/maxLevel/unlocked/locked/hidden). */
  list() {
    return Object.values(this.elements).map((e) => ({
      id: e.id,
      level: e.level,
      maxLevel: e.maxLevel,
      unlocked: e.unlocked,
      locked: e.locked,
      hidden: e.hidden,
    }));
  }
}
