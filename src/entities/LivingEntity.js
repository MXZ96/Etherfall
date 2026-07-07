/* ==========================================================================
   Etherfall - Living Entity (shared physics/combat base)
   Reusable base for every creature/projectile that participates in combat and
   physics: Player, Enemy, and future Boss / Summon / Projectile.

   Provides the common "living" contract so systems (DamageSystem, knockback,
   separation) can treat all entities uniformly:
     - hp / maxHp
     - speed, radius, knockbackResistance
     - circular collision body
     - knockback impulse (scaled by resistance)
     - hit flash

   Subclasses add their own construction (data loading, animation) and
   override onDamaged() / onDeath() for visuals.
   ========================================================================== */

import * as Phaser from "phaser";
import { clamp } from "../utils/math.js";

export class LivingEntity extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture, frame) {
    super(scene, x, y, texture, frame);

    // --- Common living stats (subclasses override from data) ---
    this.maxHp = 1;
    this.hp = 1;
    this.speed = 0;
    this.radius = 16;
    this.knockbackResistance = 0; // 0 = full knockback, 1 = immune
    this.dead = false;
  }

  /**
   * Configure a centred circular collision body. Call from the subclass once
   * the physics body exists (after add.existing / group activation).
   * @param {number} radius
   */
  configureBody(radius) {
    this.radius = radius;
    this.body.setCircle(radius);
    return this;
  }

  /**
   * Apply a knockback impulse pushing this entity AWAY from (fromX, fromY).
   * Magnitude is scaled by (1 - knockbackResistance) so resistant entities
   * barely move. Used for contact hits, explosions, boss slams, etc.
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} force  impulse in px/s
   */
  applyKnockback(fromX, fromY, force) {
    if (!this.body) return;
    const angle = Math.atan2(this.y - fromY, this.x - fromX);
    const mag = force * (1 - clamp(this.knockbackResistance, 0, 1));
    this.body.velocity.x += Math.cos(angle) * mag;
    this.body.velocity.y += Math.sin(angle) * mag;
  }

  /** Brief white flash to signal a hit. Safe to call when inactive. */
  flashHit(duration = 90) {
    if (!this.active) return;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(duration, () => {
      if (this.active) this.clearTint();
    });
  }

  /**
   * Called by DamageSystem after HP is reduced (but before death).
   * Override for entity-specific feedback.
   */
  onDamaged(/* amount, source */) {}

  /**
   * Called by DamageSystem when HP reaches zero. Override to drive death
   * visuals / cleanup. The entity is already flagged `dead`.
   */
  onDeath(/* source */) {}
}
