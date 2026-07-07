/* ==========================================================================
   Etherfall - Boot Scene
   First scene. Sets up the persistent systems (save / settings / audio),
   generates all procedural textures, registers player animations, then
   hands off to the PreloadScene.
   ========================================================================== */

import Phaser from "phaser";
import { SCENES, TEXTURE_KEYS } from "../config/constants.js";
import { SaveSystem } from "../systems/SaveSystem.js";
import { SettingsSystem } from "../systems/SettingsSystem.js";
import { AudioManager } from "../managers/AudioManager.js";
import { TextureManager } from "../managers/TextureManager.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  create() {
    // --- Persistent systems (shared via the global registry) ---
    const save = new SaveSystem();
    const settings = new SettingsSystem(save, this.game);
    const audio = new AudioManager(this.game, settings);

    this.registry.set("save", save);
    this.registry.set("settings", settings);
    this.registry.set("audio", audio);

    settings.apply();

    // --- Procedural art (no binary assets needed) ---
    const textures = new TextureManager(this);
    textures.generateAll();

    this.createPlayerAnimations();

    this.scene.start(SCENES.PRELOAD);
  }

  /** Define idle + walk animations from the generated player spritesheet. */
  createPlayerAnimations() {
    if (!this.anims.exists("player-idle")) {
      this.anims.create({
        key: "player-idle",
        frames: [{ key: TEXTURE_KEYS.PLAYER, frame: 0 }],
        frameRate: 1,
        repeat: -1,
      });
    }
    if (!this.anims.exists("player-walk")) {
      this.anims.create({
        key: "player-walk",
        frames: [1, 2, 3, 4].map((f) => ({ key: TEXTURE_KEYS.PLAYER, frame: f })),
        frameRate: 10,
        repeat: -1,
      });
    }
  }
}
