/* ==========================================================================
   Etherfall - Game Scene
   The playable core. Owns the world ("The Forgotten Meadow"), player, enemies,
   camera, HUD and the level-up flow. This is v0.0.2: enemies MOVE and are
   DEFEATED on contact (granting EXP) but deal NO damage yet.

   Systems used:
     - InputManager   : movement + pause input
     - LevelSystem    : EXP / level progression
     - EnemyManager   : data-driven spawning + lifecycle
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
} from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { Player } from "../entities/Player.js";
import { Enemy } from "../entities/Enemy.js";
import { EnemyManager } from "../entities/EnemyManager.js";
import { InputManager } from "../managers/InputManager.js";
import { LevelSystem } from "../systems/LevelSystem.js";
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

    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.onPlayerEnemyOverlap,
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

    // --- Event wiring ---
    this.game.events.on(EVENTS.LEVEL_UP, this.onLevelUp, this);
    this.game.events.on(EVENTS.PLAYER_DIED, this.onPlayerDied, this);
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
      playerX: this.player.x,
      playerY: this.player.y,
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
  }

  // ------------------------------------------------------------------------
  // Combat (placeholder pipeline for v0.0.2)
  // ------------------------------------------------------------------------
  /**
   * Contact with an enemy "defeats" it and awards its EXP. No player damage
   * yet (per scope) — this stand-in lets the level-up loop work until the
   * real magic/combat system lands.
   */
  onPlayerEnemyOverlap(player, enemy) {
    if (!enemy.active) return;
    const reward = enemy.defeat();
    if (reward > 0) {
      this.levelSystem.gainExp(reward);
      this.game.events.emit(EVENTS.ENEMY_KILLED, enemy);
    }
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
  }
}
