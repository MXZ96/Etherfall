/* ==========================================================================
   Etherfall - Main Menu Scene
   Title screen. Press ENTER or click/tap to begin. (Settings live in the
   pause menu during play.)
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME, SCENES } from "../config/constants.js";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.MAIN_MENU);
  }

  create() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    this.add.text(cx, cy - 120, "ETHERFALL", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "72px",
      color: "#e6e8ef",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(cx, cy - 60, "a bullet-heaven roguelite", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#9d86ff",
    }).setOrigin(0.5);

    const prompt = this.add.text(cx, cy + 40, "Press ENTER or Click to Play", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      color: "#e6e8ef",
    }).setOrigin(0.5);

    // Gentle pulse on the prompt.
    this.tweens.add({
      targets: prompt,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    this.add.text(cx, cy + 120,
      "Move: WASD / Arrow Keys     Pause: ESC or P",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#8a8f9c",
      }).setOrigin(0.5);

    const start = () => this.scene.start(SCENES.GAME);
    this.input.keyboard.once("keydown-ENTER", start);
    this.input.once("pointerdown", start);
  }
}
