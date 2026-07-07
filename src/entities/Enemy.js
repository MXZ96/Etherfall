/* ==========================================================================
   Etherfall - Enemy Entity (data-driven, movement-only)
   A single Enemy instance is pooled and (re)configured from an entry in
   data/enemy.json via spawnAt(). For v0.0.2 it only WALKS toward the player
   (no attacks / no damage yet).

   Future versions will drive behaviour (attacks, affinities, abilities) from
   the same enemy definition, keeping this class generic.
   ========================================================================== */

import * as Phaser from "phaser";
import { ENEMY, TEXTURE_KEYS } from "../config/constants.js";

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * NOTE: enemies are created by an Arcade physics group (see EnemyManager /
   * GameScene). The group adds the sprite to the scene and enables its
   * physics body AFTER the constructor runs, so body setup happens in
   * spawnAt() instead of here.
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, TEXTURE_KEYS.ENEMY, 0);
    this.setDepth(5);
    this.target = null;
    this.def = null;
  }

  /**
   * (Re)activate this pooled enemy at a position, chasing `player`, configured
   * from a data/enemy.json definition.
   * @param {number} x
   * @param {number} y
   * @param {Player} player
   * @param {object} def  enemy definition (hp, speed, experienceReward, ...)
   */
  spawnAt(x, y, player, def) {
    this.def = def;
    this.maxHp = def.hp ?? 20;
    this.hp = this.maxHp;
    this.speed = def.speed ?? ENEMY.SPEED;
    this.experienceReward = def.experienceReward ?? ENEMY.EXP_REWARD;
    this.damage = def.damage ?? 0;
    this.radius = def.radius ?? ENEMY.RADIUS;

    this.target = player;
    this.enableBody(true, x, y, true, true);
    this.body.setCircle(this.radius, 3, 3); // centred on the 34x34 sprite
    this.setActive(true).setVisible(true);
  }

  /** Return this enemy to the pool (no longer updated/rendered). */
  despawn() {
    this.target = null;
    this.disableBody(true, true);
  }

  /**
   * Defeat this enemy: remove it from play and return the EXP it awards.
   * Called by the combat/overlap pipeline. No-op if already inactive.
   * @returns {number} EXP awarded (0 if already dead)
   */
  defeat() {
    if (!this.active) return 0;
    const reward = this.experienceReward;
    this.despawn();
    return reward;
  }

  /**
   * Per-frame movement. Walks straight toward the player target.
   * (No attack logic yet.)
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
