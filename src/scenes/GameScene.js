/* ==========================================================================
   Etherfall - Game Scene
   The playable core. Owns the world ("The Forgotten Meadow"), player, enemies,
   camera, HUD and the level-up flow. This is v0.0.4: the player AUTO-CASTS
   magic (Fireball) at the nearest enemy; projectiles deal elemental damage,
   enemies separate like a swarm, deal contact damage, and die (HP -> EXP).

   Systems used:
     - InputManager   : movement + pause input
     - LevelSystem    : EXP / level progression
     - EnemyManager   : data-driven spawning + lifecycle
     - DamageSystem   : unified applyDamage() for player + enemies
     - HUD / LevelUpUI: presentation
   Persistent managers (save/settings/audio) come from the registry. World +
   enemy definitions come from data/*.json via the registry.
   ========================================================================== */

import * as Phaser from "phaser";
import {
  CAMERA,
  SCENES,
  WORLD,
  TEXTURE_KEYS,
  COMBAT,
  PROJECTILE_POOL,
} from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { Player } from "../entities/Player.js";
import { Enemy } from "../entities/Enemy.js";
import { Projectile } from "../entities/Projectile.js";
import { EnemyManager } from "../entities/EnemyManager.js";
import { InputManager } from "../managers/InputManager.js";
import { LevelSystem } from "../systems/LevelSystem.js";
import { DamageSystem } from "../systems/DamageSystem.js";
import { MagicSystem } from "../systems/MagicSystem.js";
import { HUD } from "../ui/HUD.js";
import { LevelUpUI } from "../ui/LevelUpUI.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super(SCENES.GAME);
  }

  create() {
    // --- Shared managers ---
    this.save = this.registry.get("save");
    this.settings = this.registry.get("settings");
    this.audio = this.registry.get("audio");

    // --- Content from data/*.json ---
    const data = this.registry.get("data") || {};
    const mapDef =
      (data.maps && data.maps.maps && data.maps.maps[0]) ||
      { width: WORLD.WIDTH, height: WORLD.HEIGHT, background: TEXTURE_KEYS.GRASS };
    const playerDef = data.player || {};
    this.enemyDefs = {};
    (data.enemy?.enemies || []).forEach((d) => {
      this.enemyDefs[d.name] = d;
    });

    // Element -> tint colour lookup (from data/elements.json).
    this.elementColors = {};
    const elementData = (data.elements && data.elements.elements) || {};
    for (const key in elementData) {
      const c = Phaser.Display.Color.HexStringToColor(elementData[key].color);
      this.elementColors[key] = c.color;
    }

    // --- World (large bounded arena) ---
    const worldW = mapDef.width || WORLD.WIDTH;
    const worldH = mapDef.height || WORLD.HEIGHT;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.add
      .tileSprite(0, 0, worldW, worldH, mapDef.background || TEXTURE_KEYS.GRASS)
      .setOrigin(0)
      .setDepth(-10);

    // --- Player (spawned at world centre) ---
    this.player = new Player(this, worldW / 2, worldH / 2);

    // --- Camera (follows player, keeps them centred; zoom-ready) ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.player, true, CAMERA.LERP, CAMERA.LERP);
    cam.setZoom(CAMERA.ZOOM);

    // --- Input ---
    this.inputMgr = new InputManager(this);

    // --- Progression (start from player.json) ---
    this.levelSystem = new LevelSystem(
      this.game,
      playerDef.level || 1,
      playerDef.experience || 0
    );

    // --- Enemies (physics group = pooling + overlap target) ---
    this.enemies = this.physics.add.group({
      classType: Enemy,
      runChildUpdate: false,
      maxSize: 300,
    });
    this.enemyManager = new EnemyManager(this, this.player, this.enemies, this.enemyDefs);
    this.enemyManager.setLevel(this.levelSystem.getLevel());

    // --- Combat ---
    this.damageSystem = new DamageSystem(this.game);

    // Enemy-vs-enemy separation: a physics collider (broadphase-backed, so it
    // scales to hundreds of entities) stops them stacking into one blob and
    // makes them flow around each other like a swarm.
    this.physics.add.collider(this.enemies, this.enemies);

    // Player vs enemies overlap (contact damage both ways).
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.onPlayerEnemyOverlap,
      null,
      this
    );

    // --- Projectiles (pooled magic shots) + auto-attack ---
    this.projectiles = this.physics.add.group({
      classType: Projectile,
      runChildUpdate: false,
      maxSize: PROJECTILE_POOL,
    });
    this.magicSystem = new MagicSystem(
      this,
      this.player,
      this.projectiles,
      this.enemies,
      this.damageSystem,
      this.elementColors
    );
    // Projectile vs enemy overlap: damage + hit effect, then despawn shot.
    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      this.onProjectileHitEnemy,
      null,
      this
    );

    // --- UI ---
    this.hud = new HUD(this);
    this.levelUpUI = new LevelUpUI(this);

    // --- Debug: F1 toggles the debug overlay; E grants EXP (testing) ---
    this.debug = false;
    this.debugKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
    this.debugExpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // --- State flags ---
    this.leveling = false; // a level-up overlay is open
    this.runTime = 0; // ms of active play
    this.damageEvents = 0; // debug counter

    // --- Event wiring ---
    this.game.events.on(EVENTS.LEVEL_UP, this.onLevelUp, this);
    this.game.events.on(EVENTS.PLAYER_DIED, this.onPlayerDied, this);
    this.game.events.on(EVENTS.ENTITY_DIED, this.onEntityDied, this);
    this.game.events.on(EVENTS.DAMAGE_DEALT, this.onDamageDealt, this);
    this.events.once("shutdown", this.onShutdown, this);
  }

  update(time, delta) {
    // Advance the run timer only while actively playing.
    if (!this.leveling) this.runTime += delta;

    // HUD always reflects current state.
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      level: this.levelSystem.getLevel(),
      exp: this.levelSystem.getExp(),
      expRequired: this.levelSystem.getThreshold(),
      expProgress: this.levelSystem.getProgress(),
      fps: Math.round(this.game.loop.actualFps),
      timeMs: this.runTime,
      enemyCount: this.enemyManager.getActiveCount(),
      entityCount: this.enemyManager.getActiveCount() + 1,
      playerHp: this.player.hp,
      playerX: this.player.x,
      playerY: this.player.y,
      velX: Math.round(this.player.body.velocity.x),
      velY: Math.round(this.player.body.velocity.y),
      colliding: this.player.isInvincible(),
      // Magic / projectiles (HUD + debug)
      magicName: this.magicSystem.activeName,
      magicElement: this.magicSystem.active ? this.magicSystem.active.element : "",
      magicReady: this.magicSystem.isReady,
      magicCdMs: this.magicSystem.cooldownRemaining,
      projectiles: this.projectiles.countActive(true),
      damageEvents: this.damageEvents,
      debug: this.debug,
    });

    // While a level-up overlay is open the world is frozen.
    if (this.leveling) return;

    // Pause toggle.
    if (this.inputMgr.isPauseJustDown()) {
      this.openPause();
      return;
    }

    // Debug toggles.
    if (Phaser.Input.Keyboard.JustDown(this.debugKey)) this.debug = !this.debug;
    if (Phaser.Input.Keyboard.JustDown(this.debugExpKey)) this.levelSystem.gainExp(60);

    // Player movement (eased).
    const v = this.inputMgr.getMoveVector();
    this.player.setMoveInput(v);
    this.player.tick(delta);

    // Enemy spawning + movement.
    this.enemyManager.update(delta);
    const children = this.enemies.getChildren();
    for (let i = 0; i < children.length; i++) {
      if (children[i].active) children[i].tick();
    }

    // Auto-attack magic + projectile movement.
    this.magicSystem.update(delta);
    const pchildren = this.projectiles.getChildren();
    for (let i = 0; i < pchildren.length; i++) {
      if (pchildren[i].active) pchildren[i].tick(delta);
    }
  }

  // ------------------------------------------------------------------------
  // Combat (v0.0.3 foundation)
  // ------------------------------------------------------------------------
  /**
   * Player <-> enemy contact. Both directions use the unified DamageSystem:
   *  - The enemy deals contact damage to the player (gated by i-frames, plus a
   *    small screen shake and knockback away from the enemy).
   *  - The player deals throttled contact damage back, so swarms can be worn
   *    down until the real magic/projectile combat system arrives.
   */
  onPlayerEnemyOverlap(player, enemy) {
    if (!enemy.active || this.leveling) return;
    const now = this.time.now;

    // Enemy -> Player (i-frames gate the hit).
    if (enemy.damage > 0 && !player.isInvincible()) {
      this.damageSystem.applyDamage(player, enemy.damage, {
        type: "physical",
        source: enemy,
      });
      player.startInvincibility(COMBAT.PLAYER_IFRAME_MS);
      player.applyKnockback(enemy.x, enemy.y, COMBAT.KNOCKBACK_FORCE);
      this.cameras.main.shake(80, 0.004); // small screen feedback
      this.game.events.emit(EVENTS.PLAYER_DAMAGED, player);
    }

    // Player -> Enemy (throttled per enemy via damageCooldown). Kept as a
    // fallback melee so swarms still hurt even with no spell equipped.
    if (now - enemy.lastContact >= player.damageCooldown) {
      enemy.lastContact = now;
      this.damageSystem.applyDamage(enemy, player.contactDamage, {
        type: "physical",
        source: player,
      });
    }
  }

  /**
   * Projectile hit an enemy: apply elemental damage via the unified
   * DamageSystem, spawn a hit effect, then return the projectile to the pool.
   */
  onProjectileHitEnemy(projectile, enemy) {
    if (!projectile.active || !enemy.active) return;
    const color = this.elementColors[projectile.element] ?? 0xffffff;
    this.damageSystem.applyDamage(enemy, projectile.damage, {
      type: "element",
      element: projectile.element,
      source: projectile,
    });
    this.spawnHitEffect(enemy.x, enemy.y, color);
    projectile.despawn();
  }

  /** Damage feedback: count events + float a coloured "-N" number. */
  onDamageDealt(target, dealt, source) {
    this.damageEvents++;
    const color = (source && source.element && this.elementColors[source.element]) || 0xffffff;
    this.spawnDamageNumber(target.x, target.y - (target.radius || 16) - 6, dealt, color);
  }

  /** Floating damage number that rises and fades. */
  spawnDamageNumber(x, y, amount, color) {
    const t = this.add
      .text(x, y, `-${amount}`, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setTint(color);
    this.tweens.add({
      targets: t,
      y: y - 28,
      alpha: 0,
      duration: 600,
      onComplete: () => t.destroy(),
    });
  }

  /** Small additive burst where a projectile connects. */
  spawnHitEffect(x, y, color) {
    const burst = this.add
      .circle(x, y, 12, color, 0.8)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: burst,
      scale: 0,
      alpha: 0,
      duration: 200,
      onComplete: () => burst.destroy(),
    });
  }

  /**
   * Any entity died (emitted by DamageSystem). The player's death is handled
   * separately via PLAYER_DIED; here we award EXP + spawn a death effect for
   * enemies.
   */
  onEntityDied(entity) {
    if (entity === this.player) return; // player death -> GameOver
    this.levelSystem.gainExp(entity.experienceReward || 0);
    this.spawnDeathEffect(entity.x, entity.y);
  }

  /** Lightweight death effect: a quick fading, shrinking burst. */
  spawnDeathEffect(x, y) {
    const burst = this.add.circle(x, y, 14, 0xb8344a, 0.85).setDepth(4);
    this.tweens.add({
      targets: burst,
      scale: 0,
      alpha: 0,
      duration: 240,
      onComplete: () => burst.destroy(),
    });
  }

  // ------------------------------------------------------------------------
  // Level-up flow
  // ------------------------------------------------------------------------
  onLevelUp(level) {
    this.leveling = true;
    this.physics.world.pause(); // freeze all bodies
    this.save.patchSection("player", { level });
    this.levelUpUI.show(level, () => this.onLevelUpContinue());
  }

  onLevelUpContinue() {
    this.leveling = false;
    this.physics.world.resume();
    this.enemyManager.setLevel(this.levelSystem.getLevel());
  }

  // ------------------------------------------------------------------------
  // Pause / death
  // ------------------------------------------------------------------------
  openPause() {
    if (this.leveling) return;
    this.scene.launch(SCENES.PAUSE);
    this.scene.pause();
  }

  onPlayerDied() {
    this.scene.start(SCENES.GAME_OVER, { level: this.levelSystem.getLevel() });
  }

  /** Clean up global listeners so restarts don't double-bind. */
  onShutdown() {
    this.game.events.off(EVENTS.LEVEL_UP, this.onLevelUp, this);
    this.game.events.off(EVENTS.PLAYER_DIED, this.onPlayerDied, this);
    this.game.events.off(EVENTS.ENTITY_DIED, this.onEntityDied, this);
    this.game.events.off(EVENTS.DAMAGE_DEALT, this.onDamageDealt, this);
  }
}
