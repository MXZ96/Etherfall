/* ==========================================================================
   Etherfall - Player Entity
   Top-down controllable character. Movement uses smooth acceleration/decel-
   eration (eased velocity) and normalised diagonals. Stats are loaded from
   data/player.json so balancing is data-driven.

   Progression (level/exp) lives in systems/LevelSystem.js; this entity owns
   combat stats (HP, mana, affinity, speed). For v0.0.2 there is NO damage
   handling yet (per scope) — takeDamage() is a placeholder for future combat.
   ========================================================================== */

import * as Phaser from "phaser";
import { PLAYER, TEXTURE_KEYS } from "../config/constants.js";
import { approach } from "../utils/math.js";

const ACCELERATION = 1800; // px/s^2 - controls how snappy movement feels

export class Player extends Phaser.Physics.Arcade.Sprite {
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
    this.maxMana = def.mana ?? 100;
    this.mana = this.maxMana;
    this.affinity = def.affinity ?? {};

    // Physics body (circle for fair top-down collisions)
    this.body.setCircle(PLAYER.RADIUS, this.width / 2 - PLAYER.RADIUS, this.height / 2 - PLAYER.RADIUS);
    this.body.setCollideWorldBounds(true);

    this.setDepth(10);
    this.moveVector = { x: 0, y: 0 };

    // Start idle.
    this.play("player-idle");
  }

  /**
   * Feed the normalised movement vector for this frame.
   * @param {{x:number, y:number}} vec
   */
  setMoveInput(vec) {
    this.moveVector = vec;
  }

  /**
   * Per-frame update. Eases the body velocity toward the input target so the
   * player accelerates and decelerates smoothly (mobile-ready: the same
   * vector could come from a virtual joystick later).
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

  /**
   * Placeholder for the future damage pipeline. No-op for v0.0.2.
   * @param {number} amount
   */
  takeDamage(amount) {
    // TODO: implement once enemy attacks / contact damage exist.
    void amount;
  }
}
