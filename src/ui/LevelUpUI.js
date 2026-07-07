/* ==========================================================================
   Etherfall - Level Up UI
   Overlay shown when the player levels up. Per scope (v0.0.1) the three
   upgrade cards are PLACEHOLDERS that do nothing yet; a Continue button
   dismisses the overlay and resumes play. The game is paused while shown.

   This is intentionally data-driven-ready: future builds will populate the
   cards from a JSON/upgrade system and apply real effects on selection.
   ========================================================================== */

import { GAME } from "../config/constants.js";

const CARD_W = 240;
const CARD_H = 300;
const CARD_GAP = 40;

export class LevelUpUI {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.onContinue = null;
    this.selected = null;

    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    // Dim backdrop (blocks clicks to the world beneath).
    this.backdrop = scene.add.rectangle(cx, cy, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(2000).setInteractive();

    // Title
    this.title = scene.add.text(cx, cy - 230, "LEVEL UP", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "44px",
      color: "#9d86ff",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    // Three placeholder cards.
    this.cards = [];
    const startX = cx - CARD_W - CARD_GAP / 2;
    for (let i = 0; i < 3; i++) {
      const x = startX + i * (CARD_W + CARD_GAP);
      this.cards.push(this.createCard(x, cy, i));
    }

    // Continue button
    this.continueBtn = scene.add.rectangle(cx, cy + 220, 220, 56, 0x3a2d63)
      .setScrollFactor(0).setDepth(2001).setInteractive({ useHandCursor: true });
    this.continueLabel = scene.add.text(cx, cy + 220, "CONTINUE", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#e6e8ef",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    this.continueBtn.on("pointerdown", () => this.hide());
    this.continueBtn.on("pointerover", () => this.continueBtn.setFillStyle(0x4a3a7a));
    this.continueBtn.on("pointerout", () => this.continueBtn.setFillStyle(0x3a2d63));

    this.hide();
  }

  createCard(x, y, index) {
    const bg = this.scene.add.rectangle(x, y, CARD_W, CARD_H, 0x141826, 0.95)
      .setScrollFactor(0).setDepth(2001).setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(2, 0x3a2d63);

    const titleText = this.scene.add.text(x, y - 100, `UPGRADE ${index + 1}`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#e6e8ef",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    const descText = this.scene.add.text(x, y, "Coming soon", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#8a8f9c",
      align: "center",
      wordWrap: { width: CARD_W - 40 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    bg.on("pointerdown", () => this.selectCard(index));
    bg.on("pointerover", () => { if (this.selected !== index) bg.setStrokeStyle(2, 0x7b5cff); });
    bg.on("pointerout", () => { if (this.selected !== index) bg.setStrokeStyle(2, 0x3a2d63); });

    return { bg, titleText, descText };
  }

  selectCard(index) {
    // Placeholder selection only; cards have no effect yet.
    if (this.selected !== null) {
      this.cards[this.selected].bg.setStrokeStyle(2, 0x3a2d63);
    }
    this.selected = index;
    this.cards[index].bg.setStrokeStyle(3, 0x7b5cff);
  }

  /**
   * Show the overlay. `onContinue` is invoked when the player continues.
   * @param {number} level
   * @param {Function} onContinue
   */
  show(level, onContinue) {
    this.onContinue = onContinue;
    this.selected = null;
    this.title.setText(`LEVEL UP  -  LVL ${level}`);
    this.cards.forEach((c) => c.bg.setStrokeStyle(2, 0x3a2d63));
    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
    const cb = this.onContinue;
    this.onContinue = null;
    if (cb) cb();
  }

  setVisible(v) {
    this.visible = v;
    const objs = [this.backdrop, this.title, this.continueBtn, this.continueLabel];
    objs.forEach((o) => o.setVisible(v));
    this.cards.forEach((c) => {
      c.bg.setVisible(v);
      c.titleText.setVisible(v);
      c.descText.setVisible(v);
    });
  }
}
