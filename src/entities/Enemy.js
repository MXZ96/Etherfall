/* ==========================================================================
   Etherfall - Enemy Entity (data-driven, living)
   Built on LivingEntity so it shares the combat/knockback contract with the
   player and future bosses/summons. A single Enemy instance is pooled and
   (re)configured from data/enemy.json via spawnAt().

   For v0.0.3 it walks toward the player and deals contact damage; it can also
   be defeated (HP reaches 0) which awards EXP and a death effect.
   ========================================================================== */

import * as Phaser from "phaser";
import { ENEMY, TEXTURE_KEYS } from "../config/constants.js";
import { LivingEntity } from "./LivingEntity.js";

export class Enemy extends LivingEntity {
  /**
   * NOTE: enemies are created by an Arcade physics group (see EnemyManager /
   * GameScene). The group adds the sprite to the scene and enables its physics
   * body AFTER the constructor runs, so body setup happens in spawnAt().
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, TEXTURE_KEYS.ENEMY, 0);
    this.setDepth(5);
    this.target = null;
    this.def = null;
    this.lastContact = 0; // throttle for player-dealt contact damage
  }

  /**
   * (Re)activate this pooled enemy at a position, chasing `player`, configured
   * from a data/enemy.json definition.
   * @param {number} x
   * @param {number} y
   * @param {Player} player
   * @param {object} def  enemy definition (hp, speed, damage, ...)
   */
  spawnAt(x, y, player, def) {
    this.def = def;
    this.maxHp = def.hp ?? 20;
    this.hp = this.maxHp;
    this.dead = false;
    this.speed = def.speed ?? ENEMY.SPEED;
    this.experienceReward = def.experienceReward ?? ENEMY.EXP_REWARD;
    this.damage = def.damage ?? 0;
    this.attackCooldown = def.attackCooldown ?? 1000;
    this.knockbackResistance = def.knockbackResistance ?? 0;
    this.radius = def.radius ?? ENEMY.RADIUS;

    this.target = player;
    this.enableBody(true, x, y, true, true);
    this.body.setCircle(this.radius, 3, 3); // centred on the 34x34 sprite
    this.clearTint();
    this.setActive(true).setVisible(true);
  }

  /** Return this enemy to the pool (no longer updated/rendered). */
  despawn() {
    this.target = null;
    this.disableBody(true, true);
  }

  /** Hit feedback: white flash. */
  onDamaged() {
    this.flashHit(70);
  }

  /** Death cleanup: return to pool (visual effect is spawned by GameScene). */
  onDeath() {
    this.despawn();
  }

  /**
   * Per-frame movement. Walks straight toward the player target.
   */
  tick() {
    if (!this.active || !this.target) return;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;

    this.body.setVelocity((dx / len) * this.speed, (dy / len) * this.speed);
    this.setFlipX(dx < 0);
  }
}
