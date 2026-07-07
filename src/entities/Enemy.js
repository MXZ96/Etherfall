/* ==========================================================================
   Etherfall - Enemy Entity (basic, movement-only)
   Walk toward the player. NO attacks, NO damage, NO abilities in v0.0.1.
   Pooled via an Arcade physics group (see EnemySpawner / GameScene) to keep
   allocations low during long sessions.

   Future versions will extend this with data-driven behaviour loaded from
   data/enemy.json (speed, hp, attack patterns, affinities, etc.).
   ========================================================================== */

import { ENEMY, TEXTURE_KEYS } from "../config/constants.js";

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * NOTE: enemies are created by an Arcade physics group (see GameScene /
   * EnemySpawner). The group adds the sprite to the scene and enables its
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
  }

  /**
   * (Re)activate this pooled enemy at a position, chasing `player`.
   * @param {number} x
   * @param {number} y
   * @param {Player} player
   */
  spawnAt(x, y, player) {
    this.target = player;
    this.enableBody(true, x, y, true, true);
    this.body.setCircle(ENEMY.RADIUS);
    this.setActive(true).setVisible(true);
  }

  /** Return this enemy to the pool (no longer updated/rendered). */
  despawn() {
    this.target = null;
    this.disableBody(true, true);
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

    this.body.setVelocity((dx / len) * ENEMY.SPEED, (dy / len) * ENEMY.SPEED);

    // Gentle bob for life-like motion.
    this.setFlipX(dx < 0);
  }
}
