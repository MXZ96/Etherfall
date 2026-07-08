/* ==========================================================================
   Etherfall - Codex Scene
   Overlay launched from PauseScene. Hosts the CodexUI and listens for the
   CodexSystem's discovery events so it can refresh the list when something
   new is found during gameplay.
   ========================================================================== */

import * as Phaser from "phaser";
import { SCENES } from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { CodexUI } from "../ui/CodexUI.js";

export class CodexScene extends Phaser.Scene {
  constructor() {
    super(SCENES.CODEX);
  }

  create() {
    this.codex = this.registry.get("codex");
    this.ui = new CodexUI(this, this.codex, () => this.resumeGame());
    this.ui.show();

    this.input.keyboard.on("keydown-ESC", () => this.resumeGame());
    this.input.keyboard.on("keydown-C", () => this.resumeGame());

    this.input.on("wheel", (pointer, gameObjects, deltaX, deltaY) => {
      if (!this.ui.visible) return;
      this.ui.scrollY = Phaser.Math.Clamp(
        this.ui.scrollY + deltaY,
        0,
        this.ui.maxScrollY
      );
      this.ui.applyScroll();
    });

    this.onCodexUpdated = () => {
      if (this.ui.visible) this.ui.buildList();
    };
    this.game.events.on(EVENTS.CODEX_UPDATED, this.onCodexUpdated);

    this.events.once("shutdown", () => {
      this.game.events.off(EVENTS.CODEX_UPDATED, this.onCodexUpdated);
    });
  }

  resumeGame() {
    this.ui.hide();
    this.scene.resume(SCENES.PAUSE);
    this.scene.stop();
  }
}
