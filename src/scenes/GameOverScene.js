/* ==========================================================================
   Etherfall - Game Over Scene
   Shown when the player dies (wired to EVENTS.PLAYER_DIED for future combat).
   Displays the level reached and returns to the menu.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME, SCENES } from "../config/constants.js";

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SCENES.GAME_OVER);
  }

  init(data) {
    this.reachedLevel = (data && data.level) || 1;
  }

  create() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    this.add.text(cx, cy - 80, "GAME OVER", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "56px",
      color: "#c0392b",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(cx, cy - 10, `You reached level ${this.reachedLevel}`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#e6e8ef",
    }).setOrigin(0.5);

    const prompt = this.add.text(cx, cy + 70, "Press ENTER for Menu", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#8a8f9c",
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    const back = () => this.scene.start(SCENES.MAIN_MENU);
    this.input.keyboard.once("keydown-ENTER", back);
    this.input.once("pointerdown", back);
  }
}
