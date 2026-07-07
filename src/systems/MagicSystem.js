/* ==========================================================================
   Etherfall - Magic System (auto-attack controller)
   Drives the player's automatic casting. On each spell cooldown it finds the
   nearest living enemy, aims at it, and launches a Projectile via the active
   Magic. If no enemy exists, it does NOT cast (no wasted projectiles).

   Supports multiple magic types: every entry in data/magic.json becomes a
   Magic; `setActive(index)` switches the equipped spell (future UI will let
   the player pick; v0.0.4 equips the first, Fireball).
   ========================================================================== */

import { EVENTS } from "../utils/events.js";
import { Magic } from "../entities/Magic.js";

export class MagicSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {Player} player
   * @param {Phaser.Physics.Arcade.Group} projectiles  pooled projectile group
   * @param {Phaser.Physics.Arcade.Group} enemies       target group
   * @param {DamageSystem} damageSystem
   * @param {Object<string,number>} elementColors  element name -> tint number
   */
  constructor(scene, player, projectiles, enemies, damageSystem, elementColors) {
    this.scene = scene;
    this.player = player;
    this.projectiles = projectiles;
    this.enemies = enemies;
    this.damageSystem = damageSystem;
    this.elementColors = elementColors;

    const magicData = (scene.registry.get("data") || {}).magic?.magic || [];
    this.magics = magicData.map((d) => new Magic(d));
    this.activeIndex = 0;
    this.active = this.magics[0] || null;
    this.timer = 0; // counts up to the active cooldown
  }

  /** Name of the equipped spell (for the HUD). */
  get activeName() {
    return this.active ? this.active.name : "—";
  }

  /** Remaining cooldown in ms (for the HUD). */
  get cooldownRemaining() {
    return this.active ? Math.max(0, this.active.cooldown - this.timer) : 0;
  }

  /** True when the spell is off cooldown and ready to cast. */
  get isReady() {
    return !!this.active && this.timer >= this.active.cooldown;
  }

  /** Equip a spell by index (future: player-selectable magic slots). */
  setActive(index) {
    if (index >= 0 && index < this.magics.length) {
      this.activeIndex = index;
      this.active = this.magics[index];
      this.timer = 0;
    }
  }

  /** Advance the cast timer; fire when ready. Call each frame from GameScene. */
  update(delta) {
    if (!this.active) return;
    this.timer += delta;
    if (this.timer >= this.active.cooldown) {
      this.timer = 0;
      this.cast();
    }
  }

  /** Fire the active spell at the nearest enemy, if any. */
  cast() {
    if (!this.active || !this.player.active) return;
    const target = this.findNearestEnemy();
    if (!target) return; // no enemy -> do not cast

    const color = this.elementColors[this.active.element] ?? 0xffffff;
    this.active.createProjectile(
      this.scene,
      this.projectiles,
      this.player.x,
      this.player.y,
      target.x,
      target.y,
      color
    );
    this.scene.game.events.emit(EVENTS.MAGIC_CASTED, this.active);
  }

  /** @returns {Enemy|null} nearest active enemy to the player. */
  findNearestEnemy() {
    let best = null;
    let bestDist = Infinity;
    const children = this.enemies.getChildren();
    const px = this.player.x;
    const py = this.player.y;

    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      if (!e.active) continue;
      const d = (e.x - px) * (e.x - px) + (e.y - py) * (e.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }
}
