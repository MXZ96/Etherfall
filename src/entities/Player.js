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
import { PLAYER, TEXTURE_KEYS, COMBAT, DASH } from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { approach, normalize } from "../utils/math.js";
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

    // --- Dash (v0.1.0) ---
    this.dashCooldownUntil = 0; // time.now when dash becomes available again
    this.dashing = false; // true while the burst is active
    this.dashEndsAt = 0; // time.now when the burst ends
    this.lastMoveDir = { x: 1, y: 0 }; // last heading, used when no key is held
    this.dashSpeed = DASH.SPEED;
    this.dashDuration = DASH.DURATION_MS;
    this.dashCooldown = DASH.COOLDOWN_MS;

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
   * could come from a virtual joystick later). While dashing, the burst velocity
   * is held for the short duration, then normal eased movement resumes.
   * @param {number} deltaMs
   */
  tick(deltaMs) {
    const dt = deltaMs / 1000;
    const now = this.scene.time.now;

    // Dash overrides normal movement for its (short) duration.
    if (this.dashing) {
      if (now >= this.dashEndsAt) {
        this.dashing = false; // burst finished; fall through to eased recover
      } else {
        this.setFlipX(this.body.velocity.x < 0);
        return;
      }
    }

    const targetVX = this.moveVector.x * this.speed;
    const targetVY = this.moveVector.y * this.speed;
    const maxStep = ACCELERATION * dt;

    this.body.velocity.x = approach(this.body.velocity.x, targetVX, maxStep);
    this.body.velocity.y = approach(this.body.velocity.y, targetVY, maxStep);

    const moving = Math.abs(this.body.velocity.x) > 1 || Math.abs(this.body.velocity.y) > 1;
    if (moving) {
      if (this.anims.currentAnim?.key !== "player-walk") this.play("player-walk");
      this.setFlipX(this.body.velocity.x < 0);
      // Remember the heading so a dash with no keys held goes the right way.
      if (this.moveVector.x !== 0 || this.moveVector.y !== 0) {
        this.lastMoveDir = { x: this.moveVector.x, y: this.moveVector.y };
      }
    } else if (this.anims.currentAnim?.key !== "player-idle") {
      this.play("player-idle");
    }
  }

  /** True while the burst is currently active (used by HUD / debug). */
  isDashing(now = this.scene.time.now) {
    return this.dashing && now < this.dashEndsAt;
  }

  /** Remaining dash cooldown in ms (0 when ready). */
  getDashCooldownRemaining(now = this.scene.time.now) {
    return Math.max(0, this.dashCooldownUntil - now);
  }

  /** True when the dash can be triggered right now. */
  canDash(now = this.scene.time.now) {
    return !this.dashing && now >= this.dashCooldownUntil;
  }

  /**
   * Begin a dash toward the current movement direction (or the last heading if
   * no key is held). Grants i-frames for the burst and starts the cooldown.
   * Returns true if the dash started.
   */
  startDash(now = this.scene.time.now) {
    if (!this.canDash(now)) return false;

    let dx = this.moveVector.x;
    let dy = this.moveVector.y;
    if (dx === 0 && dy === 0) {
      dx = this.lastMoveDir.x;
      dy = this.lastMoveDir.y;
    }
    const dir = normalize(dx, dy);
    this.lastMoveDir = dir;

    this.dashing = true;
    this.dashEndsAt = now + this.dashDuration;
    this.dashCooldownUntil = now + this.dashCooldown;

    if (this.body) {
      this.body.setVelocity(dir.x * this.dashSpeed, dir.y * this.dashSpeed);
    }
    this.startInvincibility(DASH.IFRAME_MS);
    this.spawnDashAfterimage(dir);
    return true;
  }

  /** Brief cyan afterimage streak so the dash reads visually. */
  spawnDashAfterimage(dir) {
    const color = 0x7fd4ff;
    for (let i = 1; i <= 3; i++) {
      const ghost = this.scene.add
        .circle(this.x - dir.x * i * 10, this.y - dir.y * i * 10, this.radius, color, 0.35)
        .setDepth(9)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: ghost,
        alpha: 0,
        scale: 0.4,
        duration: 220,
        delay: i * 18,
        onComplete: () => ghost.destroy(),
      });
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
