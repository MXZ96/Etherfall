/* ==========================================================================
   Etherfall - Player Entity
   Top-down controllable character built on LivingEntity. Movement uses smooth
   acceleration/deceleration (eased velocity) and normalised diagonals. Stats
   come from data/player.json. The player takes contact damage from enemies
   (i-frames + knockback + blink) and deals contact damage back so swarms can
   be worn down until the real magic/projectile combat lands.

   Progression (level/exp) lives in systems/LevelSystem.js.
   ========================================================================== */

import * as Phaser from "phaser";
import { PLAYER, TEXTURE_KEYS, COMBAT } from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { approach } from "../utils/math.js";
import { LivingEntity } from "./LivingEntity.js";

const ACCELERATION = 1800; // px/s^2 - controls how snappy movement feels

export class Player extends LivingEntity {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, TEXTURE_KEYS.PLAYER, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // --- Stats from data/player.json (with constants-based fallbacks) ---
    const def = (scene.registry.get("data") || {}).player || {};
    this.maxHp = def.maxHP ?? PLAYER.MAX_HP;
    this.hp = def.currentHP ?? this.maxHp;
    this.speed = def.movementSpeed ?? PLAYER.SPEED;
    this.radius = PLAYER.RADIUS;
    this.knockbackResistance = def.knockbackResistance ?? 0;
    this.contactDamage = def.contactDamage ?? COMBAT.CONTACT_DAMAGE_FALLBACK;
    this.damageCooldown = def.damageCooldown ?? 350; // ms between contact hits dealt
    this.maxMana = def.mana ?? 100;
    this.mana = this.maxMana;
    this.affinity = def.affinity ?? {};

    // Centred circular body (sprite is 48x64, radius 16).
    this.body.setCircle(this.radius, this.width / 2 - this.radius, this.height / 2 - this.radius);
    this.body.setCollideWorldBounds(true);

    this.setDepth(10);
    this.moveVector = { x: 0, y: 0 };
    this.invincibleUntil = 0;

    // Start idle.
    this.play("player-idle");
  }

  /** Feed the normalised movement vector for this frame. */
  setMoveInput(vec) {
    this.moveVector = vec;
  }

  /** True while the player is in post-hit invincibility. */
  isInvincible() {
    return this.scene.time.now < this.invincibleUntil;
  }

  /** Begin i-frames and a blink tween (visual feedback). */
  startInvincibility(ms = COMBAT.PLAYER_IFRAME_MS) {
    this.invincibleUntil = this.scene.time.now + ms;
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.35,
      duration: 90,
      yoyo: true,
      repeat: Math.max(0, Math.floor(ms / 180) - 1),
      onComplete: () => this.setAlpha(1),
    });
  }

  /**
   * Per-frame update. Eases the body velocity toward the input target so the
   * player accelerates and decelerates smoothly (mobile-ready: the same vector
   * could come from a virtual joystick later).
   * @param {number} deltaMs
   */
  tick(deltaMs) {
    const dt = deltaMs / 1000;
    const targetVX = this.moveVector.x * this.speed;
    const targetVY = this.moveVector.y * this.speed;
    const maxStep = ACCELERATION * dt;

    this.body.velocity.x = approach(this.body.velocity.x, targetVX, maxStep);
    this.body.velocity.y = approach(this.body.velocity.y, targetVY, maxStep);

    const moving = Math.abs(this.body.velocity.x) > 1 || Math.abs(this.body.velocity.y) > 1;
    if (moving) {
      if (this.anims.currentAnim?.key !== "player-walk") this.play("player-walk");
      this.setFlipX(this.body.velocity.x < 0);
    } else if (this.anims.currentAnim?.key !== "player-idle") {
      this.play("player-idle");
    }
  }

  /** HP as 0..1 for the HUD. */
  getHpRatio() {
    return Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
  }

  /** Lifecycle hook: player has died. */
  onDeath() {
    this.scene.game.events.emit(EVENTS.PLAYER_DIED);
  }
}
