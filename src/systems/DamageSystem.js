/* ==========================================================================
   Etherfall - Damage System
   Central, reusable way to apply damage to any LivingEntity (and future
   non-entity targets). Stateless: it only reads/writes the target's `hp` and
   invokes the target's lifecycle hooks.

   applyDamage(target, amount, source)

   `source` is a descriptor so future systems can specialise behaviour without
   touching call sites:
     {
       type:    "physical" | "magic" | "element",
       element: "fire" | "ice" | "void" | ...,   // future affinity
       critical: boolean,                         // future crit
       status:  "burn" | "slow" | ...,            // future status effects
       source:  <entity that dealt it>
     }

   Resistance / affinity / crit multipliers are applied here later; the hook
   points already exist so callers never change.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

export class DamageSystem {
  /**
   * @param {Phaser.Game} game
   */
  constructor(game) {
    this.game = game;
  }

  /**
   * Apply `amount` damage to `target`.
   * @param {LivingEntity} target  must expose hp / onDamaged / onDeath
   * @param {number|object} amount  number, or a damage descriptor
   *        { amount, type, element, critical, status, source }
   * @param {object} [source]  descriptor (type/element/critical/status/source)
   * @returns {boolean} true if this hit killed the target
   */
  applyDamage(target, amount, source = {}) {
    if (!target || target.dead) return false;

    // Allow callers to pass the whole descriptor as the first arg.
    if (typeof amount === "object" && amount !== null) {
      source = amount;
      amount = source.amount ?? 0;
    }

    // Future: multiply by affinity/resistance/crit here. For elemental damage
    // (type: "element") the `element` field drives future affinity modifiers.
    const dealt = Math.max(0, Math.round(amount));
    if (dealt <= 0) return false;

    target.hp -= dealt;
    if (target.onDamaged) target.onDamaged(dealt, source);

    this.game.events.emit(EVENTS.DAMAGE_DEALT, target, dealt, source);

    if (target.hp <= 0) {
      target.hp = 0;
      target.dead = true;
      if (target.onDeath) target.onDeath(source);
      this.game.events.emit(EVENTS.ENTITY_DIED, target, source);
      return true;
    }
    return false;
  }
}
