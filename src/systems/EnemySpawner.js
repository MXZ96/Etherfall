/* ==========================================================================
   Etherfall - Enemy Spawner System
   Periodically spawns basic enemies just outside the camera viewport and
   walks them toward the player. Spawn cadence tightens as the player levels
   up, providing the roguelite difficulty ramp. Only MOVEMENT exists in v0.0.1
   (no attacks / damage yet) per the project scope.
   ========================================================================== */

import { ENEMY } from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { clamp, randomRange } from "../utils/math.js";

export class EnemySpawner {
  /**
   * @param {Phaser.Scene} scene
   * @param {Player} player
   * @param {Phaser.Physics.Arcade.Group} group  target group for new enemies
   */
  constructor(scene, player, group) {
    this.scene = scene;
    this.player = player;
    this.group = group;

    this.level = 1;
    this.elapsed = 0;
    this.interval = ENEMY.BASE_SPAWN_INTERVAL;
  }

  /** Player level feeds the difficulty curve. */
  setLevel(level) {
    this.level = level;
    this.interval = clamp(
      ENEMY.BASE_SPAWN_INTERVAL - (level - 1) * ENEMY.SPAWN_INTERVAL_STEP,
      ENEMY.MIN_SPAWN_INTERVAL,
      ENEMY.BASE_SPAWN_INTERVAL
    );
  }

  /** Advance the spawn timer; spawn when due. Call from scene update(). */
  update(deltaMs) {
    this.elapsed += deltaMs;
    if (this.elapsed >= this.interval) {
      this.elapsed = 0;
      this.spawn();
    }
  }

  /**
   * Spawn one enemy at a point just beyond the current camera view, clamped
   * to the world bounds.
   */
  spawn() {
    const cam = this.scene.cameras.main;
    const view = cam.worldView; // visible world rectangle

    const side = Math.floor(randomRange(0, 4)); // 0 top,1 bottom,2 left,3 right
    let x;
    let y;

    switch (side) {
      case 0: // top
        x = randomRange(view.left, view.right);
        y = view.top - ENEMY.SPAWN_MARGIN;
        break;
      case 1: // bottom
        x = randomRange(view.left, view.right);
        y = view.bottom + ENEMY.SPAWN_MARGIN;
        break;
      case 2: // left
        x = view.left - ENEMY.SPAWN_MARGIN;
        y = randomRange(view.top, view.bottom);
        break;
      default: // right
        x = view.right + ENEMY.SPAWN_MARGIN;
        y = randomRange(view.top, view.bottom);
        break;
    }

    // Clamp inside world so enemies never spawn in the void.
    x = clamp(x, 0, this.scene.physics.world.bounds.width);
    y = clamp(y, 0, this.scene.physics.world.bounds.height);

    const enemy = this.group.get(x, y);
    if (enemy) {
      enemy.spawnAt(x, y, this.player);
      this.scene.game.events.emit(EVENTS.ENEMY_SPAWNED, enemy);
    }
  }
}
