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
   */
  fire(magic, angle, color) {
    this.magic = magic;
    this.element = magic.element;
    this.damage = magic.damage;
    this.speed = magic.speed;
    this.range = magic.range;
    this.size = magic.size;
    this.lifetime = magic.lifetime ?? 1500;
    this.color = color;

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
  }

  /** Return to the pool for reuse. */
  despawn() {
    this.setActive(false).setVisible(false);
    this.disableBody(true, true);
    this.clearTint();
    this.setBlendMode(Phaser.BlendModes.NORMAL);
    this.setScale(1).setAlpha(1);
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
    }
  }

  /** Cheap fading glow puff behind the projectile. */
  spawnTrail() {
    const puff = this.scene.add.circle(this.x, this.y, this.size * 0.7, this.color, 0.5)
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: puff,
      scale: 0,
      alpha: 0,
      duration: 220,
      onComplete: () => puff.destroy(),
    });
  }
}
