/* ==========================================================================
   Etherfall - Weather System (v0.0.9)
   Random, gradual weather that shapes the mood and subtly affects gameplay.
   Current weather types (data/weather.json): sunny, rain, ashfall, fog.
   Future types (storm/snow/eclipse/void_rain) are declared with weight 0 so
   they are never chosen until a later version enables them.

   Each weather carries a `modifiers` block the rest of the game reads through
   small accessor methods (getDamageMult / getAffinityGainMult / etc.), so the
   effects stay data-driven and decoupled. Visuals (rain/ash particles, fog
   overlay, lighting tint) fade in/out gradually — no sudden pop-in.

   The weather layer is screen-space (scrollFactor 0) and uses a single shared
   particle emitter per type, so it never leaks or spawns unbounded objects.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME, TEXTURE_KEYS } from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { clamp, randomRange } from "../utils/math.js";

export class WeatherSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} data  registry data (expects data.weather)
   * @param {AudioManager} audio  optional; weather ambience hooks
   */
  constructor(scene, data, audio) {
    this.scene = scene;
    this.audio = audio;

    const w = (data && data.weather) || {};
    this.defs = {};
    (w.weather || []).forEach((d) => {
      this.defs[d.id] = d;
    });
    this.interval = w.changeIntervalMs || { min: 30000, max: 45000 };
    this.transitionMs = w.transitionMs || 2600;

    // Start clear/sunny.
    this.currentId = "sunny";
    this.currentDef = this.defs.sunny || { id: "sunny", modifiers: {} };

    this.timer = randomRange(this.interval.min, this.interval.max);

    this.buildVisuals();
    this.applyVisuals(this.currentDef, 0); // snap to start (no fade on boot)
  }

  /** Build the shared, screen-space weather visual layers (alpha 0 initially). */
  buildVisuals() {
    // Rain: fast downward blue streaks.
    this.rain = this.scene.add
      .particles(0, 0, TEXTURE_KEYS.PROJECTILE, {
        x: { min: 0, max: GAME.WIDTH },
        y: -12,
        speedY: { min: 440, max: 640 },
        speedX: { min: -18, max: 18 },
        scale: { start: 0.26, end: 0.12 },
        alpha: { start: 0.5, end: 0.18 },
        lifespan: 1200,
        quantity: 4,
        frequency: 28,
        blendMode: "ADD",
        tint: 0x6fb7ff,
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(150)
      .setAlpha(0);

    // Ashfall: slow drifting orange embers.
    this.ash = this.scene.add
      .particles(0, 0, TEXTURE_KEYS.PROJECTILE, {
        x: { min: 0, max: GAME.WIDTH },
        y: -12,
        speedY: { min: 80, max: 170 },
        speedX: { min: -45, max: 45 },
        scale: { start: 0.2, end: 0.05 },
        alpha: { start: 0.6, end: 0.15 },
        lifespan: 2800,
        quantity: 2,
        frequency: 55,
        blendMode: "ADD",
        tint: 0xff8a3c,
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(150)
      .setAlpha(0);

    // Fog: a soft grey wash.
    this.fog = this.scene.add
      .rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0xb8c0cc, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(151);

    // Lighting: a tinted wash for mood (recoloured per weather).
    this.light = this.scene.add
      .rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(149);
  }

  /** Per-frame: count down to the next weather change. */
  update(deltaMs) {
    this.timer -= deltaMs;
    if (this.timer <= 0) this.pickNext();
  }

  /** Choose a new weather (different from current, non-future, weight > 0). */
  pickNext() {
    const pool = Object.values(this.defs).filter(
      (d) => !d.future && (d.weight || 0) > 0 && d.id !== this.currentId
    );
    if (pool.length === 0) {
      this.timer = randomRange(this.interval.min, this.interval.max);
      return;
    }
    const total = pool.reduce((a, d) => a + (d.weight || 0), 0);
    let r = Math.random() * total;
    let chosen = pool[pool.length - 1];
    for (const d of pool) {
      r -= d.weight || 0;
      if (r <= 0) {
        chosen = d;
        break;
      }
    }
    this.transitionTo(chosen.id);
  }

  /** Switch to a weather id with a gradual visual cross-fade. */
  transitionTo(id) {
    const def = this.defs[id];
    if (!def) return;
    this.currentId = id;
    this.currentDef = def;
    this.applyVisuals(def, this.transitionMs);
    this.timer = randomRange(this.interval.min, this.interval.max);

    if (this.audio && def.event && id === "rain") this.audio.playRainAmbience();
    this.scene.game.events.emit(EVENTS.WEATHER_CHANGED, id, def);
  }

  /** Tween every weather layer toward the targets implied by `def`. */
  applyVisuals(def, durationMs) {
    const isRain = def.id === "rain";
    const isAsh = def.id === "ashfall";
    const isFog = def.id === "fog";

    this.fadeLayer(this.rain, isRain ? 1 : 0, durationMs, isRain);
    this.fadeLayer(this.ash, isAsh ? 1 : 0, durationMs, isAsh);

    this.scene.tweens.add({
      targets: this.fog,
      alpha: isFog ? 0.22 : 0,
      duration: durationMs,
      ease: "Sine.easeInOut",
    });

    const lightColor = def.lighting
      ? Phaser.Display.Color.HexStringToColor(def.lighting).color
      : 0x000000;
    const lightAlpha = def.lightingAlpha != null ? def.lightingAlpha : 0;
    this.light.fillColor = lightColor;
    this.scene.tweens.add({
      targets: this.light,
      alpha: lightAlpha,
      duration: durationMs,
      ease: "Sine.easeInOut",
    });
  }

  /** Fade a particle layer and start/stop its emission around the fade. */
  fadeLayer(emitter, targetAlpha, durationMs, active) {
    if (active) emitter.emitting = true;
    this.scene.tweens.add({
      targets: emitter,
      alpha: targetAlpha,
      duration: durationMs,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (targetAlpha <= 0) emitter.emitting = false;
      },
    });
  }

  /** Briefly intensify rain (used by the Water Discovery event). */
  burstRain(durationMs = 3500) {
    const burst = this.scene.add
      .particles(0, 0, TEXTURE_KEYS.PROJECTILE, {
        x: { min: 0, max: GAME.WIDTH },
        y: -12,
        speedY: { min: 520, max: 760 },
        speedX: { min: -25, max: 25 },
        scale: { start: 0.3, end: 0.14 },
        alpha: { start: 0.7, end: 0.25 },
        lifespan: 1100,
        quantity: 7,
        frequency: 16,
        blendMode: "ADD",
        tint: 0x8fd0ff,
        emitting: true,
      })
      .setScrollFactor(0)
      .setDepth(150);
    this.scene.time.delayedCall(durationMs, () => {
      this.scene.tweens.add({
        targets: burst,
        alpha: 0,
        duration: 600,
        onComplete: () => burst.destroy(),
      });
    });
  }

  // --- Modifier accessors (gameplay hooks) -------------------------------

  getModifier(key) {
    const m = (this.currentDef && this.currentDef.modifiers) || {};
    return m[key] != null ? m[key] : 1;
  }

  /** Damage multiplier for an element (rain -5% fire, ashfall +5% fire, ...). */
  getDamageMult(element) {
    if (element === "fire") return this.getModifier("fireDamage");
    return 1;
  }

  /** Affinity EXP gain multiplier for an element (rain +10% water). */
  getAffinityGainMult(element) {
    if (element === "water") return this.getModifier("waterAffinityGain");
    return 1;
  }

  /** Projectile speed multiplier for an element (ashfall -5% water). */
  getProjectileSpeedMult(element) {
    if (element === "water") return this.getModifier("waterProjectileSpeed");
    return 1;
  }

  /** Enemy movement multiplier (fog reduces "vision" → slower). */
  getEnemySpeedMult() {
    return this.getModifier("enemySpeed");
  }

  /** True while it is raining (the Water Discovery trigger condition). */
  isRaining() {
    return this.currentId === "rain";
  }

  /** Current weather id + definition. */
  getCurrent() {
    return { id: this.currentId, def: this.currentDef };
  }
}
