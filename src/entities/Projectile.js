/* ==========================================================================
   Etherfall - Projectile Entity (magic shot)
   A pooled, data-driven projectile launched by the MagicSystem. Extends
   LivingEntity so future combat code can treat it uniformly. It flies in a
   fixed direction at a set speed, leaves a glowing trail, and is despawned
   (returned to the pool) when it expires or hits something.

   Collision/damage is resolved by GameScene's projectile↔enemy overlap, which
   keeps the projectile class free of gameplay rules.
   ========================================================================== */

import * as Phaser from "phaser";
import { TEXTURE_KEYS } from "../config/constants.js";
import { LivingEntity } from "./LivingEntity.js";

export class Projectile extends LivingEntity {
  /**
   * NOTE: created by an Arcade physics group (see GameScene). The group enables
   * the body after the constructor, so body setup happens in fire().
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, TEXTURE_KEYS.PROJECTILE, 0);
    this.setDepth(6);
    this.magic = null;
  }

  /**
    * Configure and launch this projectile.
    * @param {Magic} magic      spell definition wrapper
    * @param {number} angle     travel direction (radians)
    * @param {number} color     tint (element colour, numeric)
    * @param {number} [speedMult=1]  weather-driven projectile speed multiplier
    */
  fire(magic, angle, color, speedMult = 1) {
    this.magic = magic;
    this.element = magic.element;
    this.damage = magic.damage;
    this.speed = magic.speed * speedMult;
    this.range = magic.range;
    this.size = magic.size;
    this.lifetime = magic.lifetime ?? 1500;
    this.color = color;

    // --- Upgrade-driven behaviours (set on the spell) ---
    this.explode = !!magic.explode; // detonate on impact (AoE)
    this.returning = !!magic.returning; // boomerang back to caster
    this.burnChance = magic.burnChance || 0; // chance to apply burn on hit
    this.pierce = magic.pierce || 0; // enemies to pierce through (0 = none)
    this.pierceCount = 0; // current pierce count
    this.bouncesRemaining = this.returning ? 1 : 0; // remaining return trips
    this.startBounces = this.bouncesRemaining;
    this.recentHits = new Set(); // enemies already struck this flight
    this.homeX = this.x;
    this.homeY = this.y;

    this.traveled = 0;
    this.age = 0;
    this.trailTimer = 0;

    this.enableBody(true, this.x, this.y, true, true);
    this.body.setCircle(this.size, 14 - this.size, 14 - this.size); // centred on 28px texture
    this.body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);

    this.setRotation(angle);
    this.setTint(color);
    this.setBlendMode(Phaser.BlendModes.ADD); // glow
    this.setActive(true).setVisible(true);

    // Subtle visual upgrade once Fire has Awakened (brighter, slightly larger).
    this.awakened = !!(this.scene.awakenedFire && this.element === "fire");
    if (this.awakened) this.setScale(1.18);
  }

  /**
   * Reverse the projectile back toward the caster (Phoenix Core). Returns true
   * if a return trip is still available.
   */
  returnToCaster() {
    if (this.bouncesRemaining <= 0) return false;
    this.bouncesRemaining -= 1;
    const angle = Math.atan2(this.homeY - this.y, this.homeX - this.x);
    this.body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
    this.setRotation(angle);
    return true;
  }

  /** Mark an enemy as already hit so a returning shot won't strike it twice. */
  hasHit(enemy) {
    return this.recentHits.has(enemy);
  }

  /** Record an enemy as struck this flight. */
  markHit(enemy) {
    this.recentHits.add(enemy);
    if (this.pierce > 0) {
      this.pierceCount++;
    }
  }

  /** Return to the pool for reuse. */
  despawn() {
    this.setActive(false).setVisible(false);
    this.disableBody(true, true);
    this.clearTint();
    this.setBlendMode(Phaser.BlendModes.NORMAL);
    this.setScale(1).setAlpha(1);
    this.pierceCount = 0;
    this.recentHits.clear();
  }

  /** Per-frame update: track distance/age and emit a trail puff. */
  tick(delta) {
    if (!this.active) return;

    this.age += delta;
    this.traveled += (this.speed * delta) / 1000;

    this.trailTimer += delta;
    if (this.trailTimer >= 55) {
      this.trailTimer = 0;
      this.spawnTrail();
    }

    if (this.traveled >= this.range || this.age >= this.lifetime) {
      this.despawn();
      return;
    }

    // A returning (Phoenix Core) shot despawns once it gets back to the caster.
    if (this.returning && this.startBounces > 0 && this.bouncesRemaining < this.startBounces) {
      const dx = this.homeX - this.x;
      const dy = this.homeY - this.y;
      if (dx * dx + dy * dy < 50 * 50) this.despawn();
    }
  }

  /** Cheap fading glow puff behind the projectile (brighter once Fire Awakens). */
  spawnTrail() {
    const isWater = this.element === "water";
    const isFireAwakened = this.scene.awakenedFire && this.element === "fire";
    const size = isFireAwakened ? this.size * 0.95 : isWater ? this.size * 0.8 : this.size * 0.7;
    const alpha = isFireAwakened ? 0.85 : isWater ? 0.6 : 0.5;
    const puff = this.scene.add.circle(this.x, this.y, size, this.color, alpha)
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: puff,
      scale: isWater ? 1.6 : 0,
      alpha: 0,
      duration: isWater ? 350 : 220,
      onComplete: () => puff.destroy(),
    });
  }
}
