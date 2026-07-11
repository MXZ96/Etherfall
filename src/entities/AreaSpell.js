/* ==========================================================================
   Etherfall - AreaSpell Entity (Water Circle)
   A lightweight, non-physics area effect that orbits the caster and deals
   damage-over-time to enemies inside its radius. It is NOT a projectile.

   Adding a new area spell = adding an entry in data/magic.json with
   type: "area", then ensuring Magic.createAreaSpells() can spawn it.
   ========================================================================== */

import * as Phaser from "phaser";
import { TEXTURE_KEYS } from "../config/constants.js";
import { EVENTS } from "../utils/events.js";

export class AreaSpell {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} magic   Magic spell definition wrapper
   * @param {number} x       caster x
   * @param {number} y       caster y
   * @param {number} color   element tint (numeric)
   * @param {object} [followTarget] optional entity to follow
   */
  constructor(scene, magic, x, y, color, followTarget) {
    this.scene = scene;
    this.magic = magic;
    this.element = magic.element;
    this.damage = magic.damage;
    this.cooldown = magic.cooldown;
    this.areaRadius = magic.areaRadius || 90;
    this.duration = magic.duration || 3000;
    this.tickInterval = magic.tickInterval || 400;
    this.color = color;
    this.followTarget = followTarget || null;

    this.age = 0;
    this.tickTimer = 0;
    this.active = true;
    this.recentHits = new Set();

    // Chill/slow tracking: enemies currently inside the circle.
    this.chilled = new Set();
    this.originalSpeed = new Map();

    // Visual container.
    this.container = scene.add.container(x, y).setDepth(7);
    this.buildVisuals();
  }

  buildVisuals() {
    const ring = this.scene.add.circle(0, 0, this.areaRadius, this.color, 0.10)
      .setStrokeStyle(2, this.color, 0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(ring);

    this.orbitGraphics = this.scene.add.graphics();
    this.orbitGraphics.lineStyle(2, this.color, 0.40);
    this.orbitGraphics.strokeCircle(0, 0, this.areaRadius - 6);
    this.container.add(this.orbitGraphics);

    this.innerGlow = this.scene.add.circle(0, 0, this.areaRadius * 0.55, this.color, 0.06)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(this.innerGlow);

    this.particleTimer = 0;
    this.rippleTimer = 0;
  }

  tick(delta, enemies, onDamage) {
    if (!this.active) return;
    this.age += delta;

    if (this.age >= this.duration) {
      this.restoreAllChilled();
      this.despawn();
      return;
    }

    if (this.followTarget) {
      this.container.setPosition(this.followTarget.x, this.followTarget.y);
    }

    this.tickTimer += delta;
    if (this.tickTimer >= this.tickInterval) {
      this.tickTimer = 0;
      this.recentHits.clear();
      this.applyEffects(enemies, onDamage);
    }

    this.rippleTimer += delta;
    if (this.rippleTimer >= 700) {
      this.rippleTimer = 0;
      this.spawnRipple();
    }

    this.particleTimer += delta;
    if (this.particleTimer >= 120) {
      this.particleTimer = 0;
      this.spawnParticle();
    }

    this.container.rotation += delta * 0.0012;
  }

  applyEffects(enemies, onDamage) {
    const insideNow = new Set();
    const r2 = this.areaRadius * this.areaRadius;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) continue;

      const dx = e.x - this.container.x;
      const dy = e.y - this.container.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 <= r2) {
        insideNow.add(e);

        if (!this.recentHits.has(e)) {
          this.recentHits.add(e);
          if (onDamage) onDamage(e, this.damage, this.element);
        }

        if (!this.chilled.has(e) && e.body && e.speed != null) {
          this.chilled.add(e);
          this.originalSpeed.set(e, e.speed);
          e.speed = e.speed * 0.90;
        }
      }
    }

    // Restore speed for enemies that left the circle.
    for (const e of this.chilled) {
      if (!insideNow.has(e)) {
        this.restoreChilled(e);
      }
    }
  }

  restoreChilled(enemy) {
    this.chilled.delete(enemy);
    const original = this.originalSpeed.get(enemy);
    if (original != null && enemy.speed != null) {
      enemy.speed = original;
    }
    this.originalSpeed.delete(enemy);
  }

  restoreAllChilled() {
    for (const e of this.chilled) {
      this.restoreChilled(e);
    }
    this.chilled.clear();
  }

  spawnRipple() {
    const ripple = this.scene.add.circle(0, 0, 4, this.color, 0.45)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(ripple);
    this.scene.tweens.add({
      targets: ripple,
      scale: this.areaRadius / 4,
      alpha: 0,
      duration: 700,
      onComplete: () => ripple.destroy(),
    });
  }

  spawnParticle() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * this.areaRadius * 0.8;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const size = 2 + Math.random() * 2;
    const p = this.scene.add.circle(px, py, size, this.color, 0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(p);
    this.scene.tweens.add({
      targets: p,
      y: py - 14 - Math.random() * 10,
      alpha: 0,
      scale: 0.2,
      duration: 600 + Math.random() * 400,
      onComplete: () => p.destroy(),
    });
  }

  setPosition(x, y) {
    this.container.setPosition(x, y);
  }

  despawn() {
    this.active = false;
    this.restoreAllChilled();
    if (this.scene.audio) {
      this.scene.audio.playWaterCircleExpire();
    }
    if (this.scene.game && this.scene.game.events) {
      this.scene.game.events.emit(EVENTS.SPELL_EXPIRED, this.magic.id);
    }
    this.container.destroy();
  }
}
