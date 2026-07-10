/* ==========================================================================
   Etherfall - Codex UI
   Overlay shown when the player opens the Arcane Codex. Presents categories
   (Elements, Magic, Enemies, Artifacts, Fusion, Achievements) as tabs; each
   tab renders a scrollable list of entries. Locked / undiscovered entries show
   "???" while discovered entries reveal their full details.
   ========================================================================== */

import { GAME } from "../config/constants.js";

const ENTRY_H = 120;
const ENTRY_GAP = 4;
const TAB_H = 38;

const ELEMENT_EMOJI = {
  fire: "🔥",
  water: "💧",
  air: "🌬",
  earth: "⛰",
  spirit: "👻",
};

const CATEGORY_META = {
  elements: { label: "Elements", icon: "🔥" },
  spells: { label: "Magic", icon: "✨" },
  enemies: { label: "Enemies", icon: "💀" },
  awakenings: { label: "Awakenings", icon: "✦" },
  artifacts: { label: "Artifacts", icon: "📜" },
  fusions: { label: "Fusion", icon: "🔮" },
  achievements: { label: "Achievements", icon: "🏆" },
  bosses: { label: "Bosses", icon: "👑" },
};

export class CodexUI {
  /**
   * @param {Phaser.Scene} scene
   * @param {CodexSystem} codex
   * @param {Function} [onClose]
   */
  constructor(scene, codex, onClose) {
    this.scene = scene;
    this.codex = codex;
    this.onClose = onClose || null;
    this.visible = false;
    this.activeCategory = null;

    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    this.backdrop = scene.add.rectangle(cx, cy, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(2100).setInteractive();

    this.panelBg = scene.add.rectangle(cx, cy, GAME.WIDTH - 80, GAME.HEIGHT - 80, 0x0e101a, 0.98)
      .setScrollFactor(0).setDepth(2101);

    this.title = scene.add.text(cx, 30, "ARCANE CODEX", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      color: "#9d86ff",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2102);

    this.completionText = scene.add.text(cx, 54, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "11px",
      color: "#8a8f9c",
      align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2102);

    this.closeBtn = this.makeButton(cx + (GAME.WIDTH - 80) / 2 - 26, 30, "X", () => {
      this.hide();
      if (this.onClose) this.onClose();
    });

    this.tabContainer = scene.add.container(0, 0).setDepth(2102);
    this.listContainer = scene.add.container(0, 0).setDepth(2102);

    this.entries = [];
    this.scrollY = 0;
    this.maxScrollY = 0;
    this.listTop = 104;
    this.listBottom = GAME.HEIGHT - 36;
  }

  makeButton(x, y, label, onClick) {
    const btn = this.scene.add.rectangle(x, y, 30, 30, 0x3a2d63)
      .setScrollFactor(0).setDepth(2103).setInteractive({ useHandCursor: true });
    const text = this.scene.add.text(x, y, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "12px",
      color: "#e6e8ef",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2104);

    btn.on("pointerover", () => btn.setFillStyle(0x4a3a7a));
    btn.on("pointerout", () => btn.setFillStyle(0x3a2d63));
    btn.on("pointerdown", onClick);
    return { btn, text };
  }

  show() {
    this.visible = true;
    this.backdrop.setVisible(true);

    const categories = this.codex.getAvailableCategories();
    if (!this.activeCategory || !categories.includes(this.activeCategory)) {
      this.activeCategory = categories[0] || null;
    }
    this.buildTabs(categories);
    this.buildList();
  }

  hide() {
    this.visible = false;
    this.backdrop.setVisible(false);
  }

  buildTabs(categories) {
    this.tabContainer.removeAll(true);
    const cx = GAME.WIDTH / 2;
    const tabW = 110;
    const totalW = categories.length * tabW;
    const startX = cx - totalW / 2 + tabW / 2;
    const y = 82;

    categories.forEach((cat, i) => {
      const meta = CATEGORY_META[cat] || { label: cat, icon: "?" };
      const x = startX + i * tabW;
      const active = cat === this.activeCategory;
      const bg = this.scene.add.rectangle(x, y, tabW - 8, TAB_H, active ? 0x7b5cff : 0x3a2d63, 1)
        .setScrollFactor(0).setDepth(2102).setInteractive({ useHandCursor: true });
      const text = this.scene.add.text(x, y, `${meta.icon} ${meta.label}`, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "11px",
        color: active ? "#ffffff" : "#e6e8ef",
        fontStyle: active ? "bold" : "normal",
        align: "center",
      }).setOrigin(0.5).setScrollFactor(0).setDepth(2103);

      bg.on("pointerover", () => { if (!active) bg.setFillStyle(0x4a3a7a); });
      bg.on("pointerout", () => { if (!active) bg.setFillStyle(0x3a2d63); });
      bg.on("pointerdown", () => {
        this.activeCategory = cat;
        this.scrollY = 0;
        this.buildTabs(categories);
        this.buildList();
      });

      this.tabContainer.add(bg, text);
    });
  }

  buildList() {
    this.listContainer.removeAll(true);
    this.entries.forEach((e) => {
      if (e.bg) e.bg.destroy();
      if (e.title) e.title.destroy();
      if (e.desc) e.desc.destroy();
      if (e.detail) e.detail.destroy();
      if (e.lock) e.lock.destroy();
    });
    this.entries = [];

    if (!this.activeCategory) return;

    const entries = this.codex.getEntries(this.activeCategory);
    const cx = GAME.WIDTH / 2;
    const panelW = GAME.WIDTH - 80;
    const startY = 118;
    const discovered = this.codex.countDiscovered(this.activeCategory);
    const total = this.codex.countTotal(this.activeCategory);
    this.completionText.setText(`${this.activeCategory.toUpperCase()}  ${discovered} / ${total}`);

    const leftPad = 14;
    const textW = 280;

    entries.forEach((def, i) => {
      const y = startY + i * (ENTRY_H + ENTRY_GAP);
      const isDiscovered = this.codex.isDiscovered(this.activeCategory, this.getId(def));
      const x = cx - panelW / 2 + leftPad;

      const bg = this.scene.add.rectangle(cx, y, panelW - 16, ENTRY_H, 0x141826, 0.96)
        .setScrollFactor(0).setDepth(2102).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(1, isDiscovered ? 0x3a2d63 : 0x2a2150);

      if (isDiscovered) {
        const title = this.getTitle(def);
        const titleText = this.scene.add.text(x, y - 34, title, {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "12px",
          color: "#e6e8ef",
          fontStyle: "bold",
        }).setScrollFactor(0).setDepth(2103);
        titleText.setCrop(0, 0, textW, 18);

        const desc = this.getDescription(def);
        const descText = this.scene.add.text(x, y - 6, desc, {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "11px",
          color: "#c3c8d4",
          lineSpacing: 2,
        }).setScrollFactor(0).setDepth(2103);
        descText.setCrop(0, 0, textW, 50);

        const detail = this.getDetail(def);
        const detailText = this.scene.add.text(x, y + 32, detail, {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "10px",
          color: "#8a8f9c",
          lineSpacing: 2,
        }).setScrollFactor(0).setDepth(2103);
        detailText.setCrop(0, 0, textW, 28);

        this.entries.push({ bg, title: titleText, desc: descText, detail: detailText });
      } else {
        const locked = def.locked;
        const lock = this.scene.add.text(cx, y, locked ? "LOCKED" : "???", {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "16px",
          color: locked ? "#5a5f6e" : "#6b6f7a",
          fontStyle: "bold",
          align: "center",
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2103);
        this.entries.push({ bg, lock });
      }
    });

    this.maxScrollY = Math.max(0, entries.length * (ENTRY_H + ENTRY_GAP) - (this.listBottom - this.listTop));
    if (this.scrollY > this.maxScrollY) this.scrollY = this.maxScrollY;
    this.applyScroll();
  }

  getId(def) {
    return def.id || def.name || "";
  }

  getTitle(def) {
    const emoji = this.getEmoji(def);
    const name = def.name || def.id || "???";
    return `${emoji} ${name}`;
  }

  getDescription(def) {
    const raw = def.description || def.codexDescription || def.lore || "";
    const maxChars = 38;
    const words = raw.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (test.length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.join("\n");
  }

  getDetail(def) {
    const parts = [];
    if (def.element) parts.push(`Element: ${def.element}`);
    if (def.hp) parts.push(`HP: ${def.hp}`);
    if (def.speed) parts.push(`Speed: ${def.speed}`);
    if (def.damage) parts.push(`Damage: ${def.damage}`);
    if (def.rarity) parts.push(`Rarity: ${def.rarity}`);
    const raw = parts.join("   ");
    const maxChars = 42;
    const words = raw.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (test.length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.join("\n");
  }

  getEmoji(def) {
    if (def.element && ELEMENT_EMOJI[def.element]) return ELEMENT_EMOJI[def.element];
    if (def.type === "normal") return "💀";
    if (def.type === "boss") return "👑";
    if (this.activeCategory === "fusions") return "🔮";
    if (this.activeCategory === "achievements") return "🏆";
    if (this.activeCategory === "artifacts") return "📜";
    return "✨";
  }

  applyScroll() {
    const offset = -this.scrollY;
    this.entries.forEach((e, i) => {
      const y = this.listTop + i * (ENTRY_H + ENTRY_GAP) + offset + ENTRY_H / 2;
      const visible = y >= this.listTop - ENTRY_H && y <= this.listBottom + ENTRY_H;

      if (e.bg) {
        e.bg.setY(y);
        e.bg.setVisible(visible);
      }
      if (e.title) {
        e.title.setY(y - 34);
        e.title.setVisible(visible);
      }
      if (e.desc) {
        e.desc.setY(y - 6);
        e.desc.setVisible(visible);
      }
      if (e.detail) {
        e.detail.setY(y + 32);
        e.detail.setVisible(visible);
      }
      if (e.lock) {
        e.lock.setY(y);
        e.lock.setVisible(visible);
      }
    });
  }
}
