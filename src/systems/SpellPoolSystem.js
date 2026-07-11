/* ==========================================================================
   Etherfall - Spell Pool System
   The single authority for which spells the player can use. Every spell in
   data/magic.json carries a `status` field (known | hidden | locked | fusion |
   secret). Only spells with status "known" are eligible for level-up upgrades.
   Unlocking a spell (via affinity milestones, fusion, secrets, etc.) calls
   unlock() which flips the status to "known" and emits SPELL_UNLOCKED.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

const VALID_STATUSES = new Set(["known", "hidden", "locked", "fusion", "secret"]);

export class SpellPoolSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} data  registry data (expects data.magic)
   * @param {SpellManager} magicSystem  owns the spell instances
   */
  constructor(scene, data, magicSystem) {
    this.scene = scene;
    this.magicSystem = magicSystem;

    const spells = (data.magic && data.magic.magic) || [];
    this.pool = {};
    spells.forEach((def) => {
      const rawStatus = def.status || (def.starter ? "known" : def.locked ? "locked" : "hidden");
      const status = VALID_STATUSES.has(rawStatus) ? rawStatus : "hidden";
      this.pool[def.id] = {
        id: def.id,
        name: def.name,
        element: def.element,
        status,
        locked: !!def.locked,
      };
    });
  }

  /** Unlock a spell so it becomes "known" in the pool and eligible for play. */
  unlock(spellId) {
    const entry = this.pool[spellId];
    if (!entry || entry.status === "known") return false;
    entry.status = "known";
    entry.locked = false;
    this.scene.game.events.emit(EVENTS.SPELL_UNLOCKED, spellId);
    return true;
  }

  /** IDs of spells the player can currently use in level-up / combat. */
  getKnownSpellIds() {
    return Object.values(this.pool)
      .filter((e) => e.status === "known")
      .map((e) => e.id);
  }

  /** All spell entries in the pool. */
  list() {
    return Object.values(this.pool);
  }

  /** Single spell entry by id. */
  get(spellId) {
    return this.pool[spellId] || null;
  }

  /** True when the spell is usable (known). */
  isKnown(spellId) {
    const e = this.pool[spellId];
    return !!e && e.status === "known";
  }

  /** True when the spell is locked and cannot be used. */
  isLocked(spellId) {
    const e = this.pool[spellId];
    return !!e && e.status === "locked";
  }
}
