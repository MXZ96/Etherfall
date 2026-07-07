/* ==========================================================================
   Etherfall - Enemy Manager (spawn + lifecycle system)
   Owns enemy spawning and bookkeeping. Spawns just outside the camera view,
   ramps spawn rate with player level, and enforces a max-enemy cap. Driven by
   data/enemy.json definitions so new enemy types need no code changes.

   Designed to grow:
     - spawnElite()   : for tougher, modified enemies
     - spawnBoss()    : for boss encounters
     - triggerEvent() : for weather/event-driven waves
   The hooks exist now; the behaviour is filled in by later versions.
   ========================================================================== */

import * as Phaser from "phaser";
import { SPAWN } from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { clamp, randomRange } from "../utils/math.js";

export class EnemyManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {Player} player
   * @param {Phaser.Physics.Arcade.Group} group  pooled enemy group
   * @param {Object<string,object>} enemyDefs  name -> enemy definition
   */
  constructor(scene, player, group, enemyDefs) {
    this.scene = scene;
    this.player = player;
    this.group = group;
    this.enemyDefs = enemyDefs;

    // Default spawn pool = every normal enemy definition.
    this.spawnPool = Object.values(enemyDefs).filter(
      (d) => (d.type || "normal") === "normal"
    );

    this.level = 1;
    this.elapsed = 0;
    this.interval = SPAWN.BASE_INTERVAL;
  }

  /** Player level feeds the difficulty curve (faster spawns). */
  setLevel(level) {
    this.level = level;
    this.interval = clamp(
      SPAWN.BASE_INTERVAL - (level - 1) * SPAWN.INTERVAL_DECAY,
      SPAWN.MIN_INTERVAL,
      SPAWN.BASE_INTERVAL
    );
  }

  /** Number of currently active enemies (for the HUD). */
  getActiveCount() {
    return this.group.countActive(true);
  }

  /**
   * Dynamic difficulty multiplier from survival time + player level. Smooth
   * (sub-exponential) so enemies keep pace as the run goes long without ever
   * exploding: ~1.0 at the start, scaling up gradually. Capped to avoid absurd
   * late-game spikes.
   */
  getScale() {
    const minutes = (this.scene.runTime || 0) / 60000;
    const timeScale = 1 + Math.pow(minutes, 1.15) * 0.3;
    const levelScale = 1 + (this.level - 1) * 0.03;
    return Math.min(40, timeScale * levelScale);
  }

  /** Advance the spawn timer; spawn when due and under the cap. */
  update(deltaMs) {
    this.elapsed += deltaMs;
    if (this.elapsed < this.interval) return;
    this.elapsed = 0;
    if (this.getActiveCount() < SPAWN.MAX_ENEMIES) this.spawn();
  }

  /**
   * Spawn one enemy of `name` (random normal enemy if omitted) at a point just
   * beyond the camera view, clamped to the world bounds.
   * @param {string} [name]
   */
  spawn(name) {
    const def = name
      ? this.enemyDefs[name]
      : this.spawnPool[Math.floor(randomRange(0, this.spawnPool.length))];
    if (!def) return; // no definitions available

    const pos = this.getSpawnPosition();
    const enemy = this.group.get(pos.x, pos.y);
    if (enemy) {
      enemy.spawnAt(pos.x, pos.y, this.player, this.scaledDef(def));
      this.scene.game.events.emit(EVENTS.ENEMY_SPAWNED, enemy);
    }
  }

  /**
   * Return a shallow copy of an enemy definition scaled by the current
   * difficulty multiplier. HP scales fully; damage and EXP scale more gently so
   * the player is challenged but not one-shot.
   * @param {object} def
   */
  scaledDef(def) {
    const scale = this.getScale();
    const half = 1 + (scale - 1) * 0.5; // damage grows at half the HP rate
    const third = 1 + (scale - 1) * 0.3; // EXP grows at a third
    return {
      ...def,
      hp: Math.round((def.hp ?? 20) * scale),
      damage: Math.round((def.damage ?? 0) * half),
      experienceReward: Math.round((def.experienceReward ?? 10) * third),
    };
  }

  /** Compute a spawn point just outside the current camera viewport. */
  getSpawnPosition() {
    const view = this.scene.cameras.main.worldView;
    const bounds = this.scene.physics.world.bounds;
    const side = Math.floor(randomRange(0, 4)); // 0 top,1 bottom,2 left,3 right
    let x;
    let y;

    switch (side) {
      case 0: // top
        x = randomRange(view.left, view.right);
        y = view.top - SPAWN.MARGIN;
        break;
      case 1: // bottom
        x = randomRange(view.left, view.right);
        y = view.bottom + SPAWN.MARGIN;
        break;
      case 2: // left
        x = view.left - SPAWN.MARGIN;
        y = randomRange(view.top, view.bottom);
        break;
      default: // right
        x = view.right + SPAWN.MARGIN;
        y = randomRange(view.top, view.bottom);
        break;
    }

    return {
      x: clamp(x, 0, bounds.width),
      y: clamp(y, 0, bounds.height),
    };
  }

  // --- Future hooks (not wired into gameplay yet) -------------------------
  spawnElite() {
    // TODO: spawn a modified/upgraded enemy.
  }

  spawnBoss() {
    // TODO: spawn a boss-type enemy from data/boss.json.
  }

  triggerEvent(waveName) {
    // TODO: spawn a wave driven by data/event.json / weather.json.
    void waveName;
  }
}
