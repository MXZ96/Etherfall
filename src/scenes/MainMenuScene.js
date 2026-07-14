/* ==========================================================================
   Etherfall - Main Menu Scene
   Title screen. Offers START RUN (begin a fresh run) and SETTINGS (in-menu
   options). A CONTINUE button appears only when a valid save file exists
   (see SaveSystem.hasSave()), preparing for the future save/progression flow.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME, SCENES } from "../config/constants.js";
import { showConfirmation } from "../ui/ConfirmationDialog.js";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.MAIN_MENU);
  }

  create() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    this.add.text(cx, cy - 150, "ETHERFALL", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "72px",
      color: "#e6e8ef",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(cx, cy - 100, "a bullet-heaven roguelite", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#9d86ff",
    }).setOrigin(0.5);

    this.save = this.registry.get("save");
    this.settings = this.registry.get("settings");

    // Vertical button column. START RUN is always shown; CONTINUE only when a
    // save exists. RESET PROGRESSION is always available.
    const hasSave = !!(this.save && this.save.hasSave());
    const actions = [{ label: "START RUN", cb: () => this.startRun() }];
    if (hasSave) actions.push({ label: "CONTINUE", cb: () => this.startRun() });
    actions.push({ label: "SETTINGS", cb: () => this.toggleSettings() });
    actions.push({ label: "RESET PROGRESSION", cb: () => this.confirmReset() });

    let by = cy - 50;
    actions.forEach((a) => {
      this.makeButton(cx, by, a.label, a.cb);
      by += 56;
    });

    this.add.text(cx, cy + 172,
      "Move: WASD / Arrow Keys     Pause: ESC or P     Debug: F1",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#8a8f9c",
      }).setOrigin(0.5);

    // --- In-menu settings panel (hidden until SETTINGS is pressed) ---
    this.settingsPanel = this.add.container(cx, cy).setDepth(10).setVisible(false);
    const panelBg = this.add.rectangle(0, 0, 360, 260, 0x141826, 0.98)
      .setStrokeStyle(2, 0x3a2d63);
    const panelTitle = this.add.text(0, -100, "SETTINGS", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "26px",
      color: "#9d86ff",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.settingsPanel.add([panelBg, panelTitle]);
    this.makePanelButton(0, -40, "TOGGLE FULLSCREEN", () => this.settings?.toggleFullscreen());
    this.makePanelButton(0, 20, "BACK", () => this.toggleSettings());
  }

  makeButton(x, y, label, onClick) {
    const btn = this.add.rectangle(x, y, 280, 52, 0x3a2d63)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#e6e8ef",
    }).setOrigin(0.5);

    btn.on("pointerover", () => btn.setFillStyle(0x4a3a7a));
    btn.on("pointerout", () => btn.setFillStyle(0x3a2d63));
    btn.on("pointerdown", onClick);
    return { btn, text };
  }

  /** A button placed inside the settings container (local coords). */
  makePanelButton(x, y, label, onClick) {
    const btn = this.add.rectangle(x, y, 280, 48, 0x2a2150)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#e6e8ef",
    }).setOrigin(0.5);

    btn.on("pointerover", () => btn.setFillStyle(0x3a2d63));
    btn.on("pointerout", () => btn.setFillStyle(0x2a2150));
    btn.on("pointerdown", onClick);
    this.settingsPanel.add([btn, text]);
  }

  toggleSettings() {
    this.settingsPanel.setVisible(!this.settingsPanel.visible);
  }

  /** Ask for confirmation, then wipe progression (settings preserved). */
  confirmReset() {
    showConfirmation(this, {
      title: "Reset Progression",
      message: "Reset all Etherfall progression?\nThis cannot be undone.",
      confirmLabel: "Reset",
      cancelLabel: "Cancel",
      cancelKeys: ["ESC"],
      onConfirm: () => this.resetProgression(),
    });
  }

  /**
   * Recreate a completely fresh save. Only the game's own save data is
   * overwritten; current user settings (resolution / volume / bindings) are
   * carried over. Stays on the menu — a following New Game starts like a
   * first-time player.
   */
  resetProgression() {
    const currentSettings = this.settings ? { ...this.settings.values } : undefined;
    this.save.resetProgression(currentSettings);
  }

  startRun() {
    this.scene.start(SCENES.GAME);
  }
}
