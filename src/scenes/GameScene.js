/* ==========================================================================
   Etherfall - Game Scene
   The playable core. Owns the world, player, enemies, camera, HUD and the
   level-up flow. Enemies only MOVE in v0.0.1 (no attacks/damage yet).

   Systems used:
     - InputManager      : movement + pause input
     - LevelSystem       : EXP / level progression
     - EnemySpawner      : periodic enemy spawning
     - HUD / LevelUpUI   : presentation
   Persistent managers (save/settings/audio) come from the registry.
   ========================================================================== */

import Phaser from "phaser";
import {
  CAMERA,
  GAME,
  SCENES,
  WORLD,
  TEXTURE_KEYS,
} from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { Player } from "../entities/Player.js";
import { Enemy } from "../entities/Enemy.js";
import { InputManager } from "../managers/InputManager.js";
import { LevelSystem } from "../systems/LevelSystem.js";
import { EnemySpawner } from "../systems/EnemySpawner.js";
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

    // --- World ---
    this.physics.world.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.add
      .tileSprite(0, 0, WORLD.WIDTH, WORLD.HEIGHT, TEXTURE_KEYS.GRASS)
      .setOrigin(0)
      .setDepth(-10);

    // --- Player (spawned at world centre) ---
    this.player = new Player(this, WORLD.WIDTH / 2, WORLD.HEIGHT / 2);

    // --- Camera (follows player, keeps them centred) ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    cam.startFollow(this.player, true, CAMERA.LERP, CAMERA.LERP);
    cam.setZoom(CAMERA.ZOOM);

    // --- Input ---
    this.inputMgr = new InputManager(this);

    // --- Progression ---
    const startLevel = (this.save.getSection("player").level) || 1;
    this.levelSystem = new LevelSystem(this.game, startLevel);

    // --- Enemies (physics group = pooling + overlap target) ---
    this.enemies = this.physics.add.group({
      classType: Enemy,
      runChildUpdate: false,
      maxSize: 300,
    });
    this.spawner = new EnemySpawner(this, this.player, this.enemies);
    this.spawner.setLevel(this.levelSystem.getLevel());

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

    // --- Debug key: grant EXP to test the level-up flow (no kills yet). ---
    this.debugExpKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.E
    );

    // --- State flags ---
    this.leveling = false; // a level-up overlay is open
    this.gamePaused = false;

    // --- Event wiring ---
    this.game.events.on(EVENTS.LEVEL_UP, this.onLevelUp, this);
    this.game.events.on(EVENTS.PLAYER_DIED, this.onPlayerDied, this);
    this.events.once("shutdown", this.onShutdown, this);
  }

  update(time, delta) {
    // HUD always reflects current state.
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      level: this.levelSystem.getLevel(),
      expProgress: this.levelSystem.getProgress(),
      fps: Math.round(this.game.loop.actualFps),
    });

    // While a level-up overlay is open the world is frozen.
    if (this.leveling) return;

    // Pause toggle.
    if (this.inputMgr.isPauseJustDown()) {
      this.openPause();
      return;
    }

    // Debug: simulate EXP gain (future: EXP from enemy kills).
    if (Phaser.Input.Keyboard.JustDown(this.debugExpKey)) {
      this.levelSystem.gainExp(60);
    }

    // Player movement.
    const v = this.inputMgr.getMoveVector();
    this.player.setMoveInput(v);
    this.player.tick();

    // Enemy spawning + movement.
    this.spawner.update(delta);
    const children = this.enemies.getChildren();
    for (let i = 0; i < children.length; i++) {
      if (children[i].active) children[i].tick();
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
    this.spawner.setLevel(this.levelSystem.getLevel());
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

  /** Placeholder collision handler. No damage in v0.0.1. */
  onPlayerEnemyOverlap() {
    // TODO: future combat / contact damage pipeline.
  }

  /** Clean up global listeners so restarts don't double-bind. */
  onShutdown() {
    this.game.events.off(EVENTS.LEVEL_UP, this.onLevelUp, this);
    this.game.events.off(EVENTS.PLAYER_DIED, this.onPlayerDied, this);
  }
}
