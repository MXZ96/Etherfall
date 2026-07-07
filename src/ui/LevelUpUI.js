/* ==========================================================================
   Etherfall - Level Up UI
   Overlay shown when the player levels up. It pauses the game and presents
   three rarity-weighted upgrade choices (rolled by UpgradeSystem). Selecting a
   card applies that upgrade immediately (raising the spell's level) and resumes
   play.

   Fully data-driven: the cards are built from the `choices` array passed to
   show(); no upgrade logic lives here. The only way to dismiss the overlay is
   by picking one of the upgrade cards, so there is no separate "Continue"
   button cluttering the screen.
   ========================================================================== */

import { GAME } from "../config/constants.js";

const CARD_W = 240;
const CARD_H = 320;
const CARD_GAP = 40;

// Element -> emoji badge for the card header.
const ELEMENT_EMOJI = {
  fire: "🔥",
  water: "💧",
  air: "🌬",
  earth: "⛰",
  spirit: "✨",
};

export class LevelUpUI {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.onSelect = null;
    this.selected = null;

    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    // Dim backdrop (blocks clicks to the world beneath).
    this.backdrop = scene.add.rectangle(cx, cy, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(2000).setInteractive();

    // Title
    this.title = scene.add.text(cx, cy - 250, "LEVEL UP", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "44px",
      color: "#9d86ff",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    // Cards are created lazily per show() (count/contents vary).
    this.cards = [];

    this.hide();
  }

  /** Build (or rebuild) the choice cards for the current set of options. */
  buildCards(choices) {
    // Tear down any previous cards.
    this.cards.forEach((c) => {
      c.bg.destroy();
      c.emojiText.destroy();
      c.titleText.destroy();
      c.rarityText.destroy();
      c.descText.destroy();
    });
    this.cards = [];

    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;
    // `x` below is each card's CENTER (rectangles default to origin 0.5), so the
    // first card's center must sit half a card-width in from the row's left edge.
    const totalWidth = CARD_W * choices.length + CARD_GAP * (choices.length - 1);
    const startX = cx - totalWidth / 2 + CARD_W / 2;

    choices.forEach((choice, i) => {
      const x = startX + i * (CARD_W + CARD_GAP);
      this.cards.push(this.createCard(x, cy, choice, i));
    });
  }

  createCard(x, y, choice, index) {
    const bg = this.scene.add.rectangle(x, y, CARD_W, CARD_H, 0x141826, 0.96)
      .setScrollFactor(0).setDepth(2001).setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(2, 0x3a2d63);

    const emoji = ELEMENT_EMOJI[choice.element] || "✨";

    const emojiText = this.scene.add.text(x, y - 118, emoji, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "40px",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    const titleText = this.scene.add.text(x, y - 64, choice.name, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#e6e8ef",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: CARD_W - 24 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    const rarityText = this.scene.add.text(x, y - 8, choice.rarityName.toUpperCase(), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: choice.rarityColor,
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    const spellText = this.scene.add.text(x, y + 18, choice.spellName, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "13px",
      color: "#8a8f9c",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    const descText = this.scene.add.text(x, y + 56, choice.desc, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#c3c8d4",
      align: "center",
      wordWrap: { width: CARD_W - 32 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    bg.on("pointerdown", () => this.selectCard(index));
    bg.on("pointerover", () => { if (this.selected !== index) bg.setStrokeStyle(2, 0x7b5cff); });
    bg.on("pointerout", () => { if (this.selected !== index) bg.setStrokeStyle(2, 0x3a2d63); });

    return { bg, emojiText, titleText, rarityText, spellText, descText };
  }

  selectCard(index) {
    if (this.selected !== null) {
      this.cards[this.selected].bg.setStrokeStyle(2, 0x3a2d63);
    }
    this.selected = index;
    this.cards[index].bg.setStrokeStyle(3, 0x7b5cff);

    // Apply immediately: the run resumes via hide() -> onSelect.
    const cb = this.onSelect;
    const choice = this.cards[index].choice;
    this.onSelect = null;
    this.setVisible(false);
    if (cb) cb(choice);
  }

  /**
   * Show the overlay. The overlay is dismissed only by picking a card, so the
   * caller MUST always provide at least one choice (the player always owns at
   * least Fireball). If somehow no choices exist, we resume immediately.
   * @param {number} level
   * @param {object[]} choices  upgrade choices (see GameScene.onLevelUp)
   * @param {Function} onSelect invoked with the chosen card when a card is picked
   */
  show(level, choices, onSelect) {
    this.onSelect = onSelect;
    this.selected = null;
    this.title.setText(`LEVEL UP  -  LVL ${level}`);

    const safeChoices = choices && choices.length > 0 ? choices : [];
    this.buildCards(safeChoices);
    safeChoices.forEach((c, i) => { this.cards[i].choice = c; });

    if (safeChoices.length === 0) {
      // No upgrades to offer (shouldn't happen): just resume the run.
      this.setVisible(false);
      const cb = this.onSelect;
      this.onSelect = null;
      if (cb) cb(null);
      return;
    }

    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
    const cb = this.onSelect;
    this.onSelect = null;
    if (cb) cb(null);
  }

  setVisible(v) {
    this.visible = v;
    this.backdrop.setVisible(v);
    this.title.setVisible(v);

    this.cards.forEach((c) => {
      c.bg.setVisible(v);
      c.emojiText.setVisible(v);
      c.titleText.setVisible(v);
      c.rarityText.setVisible(v);
      c.spellText.setVisible(v);
      c.descText.setVisible(v);
    });
  }
}
