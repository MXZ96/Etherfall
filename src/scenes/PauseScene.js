/* ==========================================================================
   Etherfall - Pause Scene
   Overlay launched on top of GameScene. Resumes play, toggles fullscreen,
   or quits to the main menu. Reads settings/audio from the registry.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME, SCENES } from "../config/constants.js";

export class PauseScene extends Phaser.Scene {
  constructor() {
    super(SCENES.PAUSE);
  }

  create() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    this.add.rectangle(cx, cy, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.6);

    this.add.text(cx, cy - 140, "PAUSED", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "44px",
      color: "#9d86ff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.settings = this.registry.get("settings");

    this.makeButton(cx, cy - 40, "RESUME", () => this.resumeGame());
    this.makeButton(cx, cy + 20, "TOGGLE FULLSCREEN", () => {
      this.settings.toggleFullscreen();
    });
    this.makeButton(cx, cy + 80, "QUIT TO MENU", () => this.quit());

    this.input.keyboard.on("keydown-ESC", () => this.resumeGame());
    this.input.keyboard.on("keydown-P", () => this.resumeGame());
  }

  makeButton(x, y, label, onClick) {
    const btn = this.add.rectangle(x, y, 280, 52, 0x3a2d63)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#e6e8ef",
    }).setOrigin(0.5);

    btn.on("pointerover", () => btn.setFillStyle(0x4a3a7a));
    btn.on("pointerout", () => btn.setFillStyle(0x3a2d63));
    btn.on("pointerdown", onClick);
    return { btn, text };
  }

  resumeGame() {
    this.scene.resume(SCENES.GAME);
    this.scene.stop();
  }

  quit() {
    this.scene.stop(SCENES.GAME);
    this.scene.start(SCENES.MAIN_MENU);
    this.scene.stop();
  }
}
