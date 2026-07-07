/* ==========================================================================
   Etherfall - Player Entity
   Top-down controllable character. Owns its movement + core stats (HP, level,
   EXP via the LevelSystem). Animation is driven by movement state.

   Progression (level/exp) lives in systems/LevelSystem.js and is surfaced to
   the HUD/Level-Up UI; this entity stays focused on movement + stats. For
   v0.0.1 there is NO damage handling yet (per scope).
   ========================================================================== */

import { PLAYER, TEXTURE_KEYS } from "../config/constants.js";

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

    // Stats
    this.maxHp = PLAYER.MAX_HP;
    this.hp = this.maxHp;
    this.speed = PLAYER.SPEED;

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

  /** Called each frame by the scene. Applies velocity + animation. */
  tick() {
    const v = this.moveVector;
    const moving = v.x !== 0 || v.y !== 0;

    if (moving) {
      this.body.setVelocity(v.x * this.speed, v.y * this.speed);
      if (this.anims.currentAnim?.key !== "player-walk") {
        this.play("player-walk");
      }
      // Face left/right based on horizontal motion.
      this.setFlipX(v.x < 0);
    } else {
      this.body.setVelocity(0, 0);
      if (this.anims.currentAnim?.key !== "player-idle") {
        this.play("player-idle");
      }
    }
  }

  /** HP as 0..1 for the HUD. */
  getHpRatio() {
    return Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
  }

  /**
   * Placeholder for the future damage pipeline. No-op for v0.0.1.
   * @param {number} amount
   */
  takeDamage(amount) {
    // TODO: implement once enemy attacks exist.
    void amount;
  }
}
