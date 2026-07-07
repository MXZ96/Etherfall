/* ==========================================================================
   Etherfall - HUD (Heads-Up Display)
   Minimal, dark-fantasy overlay fixed to the camera.

     Top-left  : HP bar, EXP bar, Level
     Top-right : Run timer, Enemy count
     Debug (F1): FPS, player position, level, EXP, enemy count

   Reads values pushed in via update(); holds no game logic. Layout uses the
   base 1280x720 resolution so it scales with the FIT scale manager.
   ========================================================================== */

import { GAME } from "../config/constants.js";
import { clamp } from "../utils/math.js";

const MARGIN = 16;
const BAR_W = 240;

export class HUD {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    // Drawn every frame (bars).
    this.gfx = scene.add.graphics();
    this.gfx.setScrollFactor(0).setDepth(1000);

    const base = {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#e6e8ef",
    };
    const right = { ...base, align: "right" };

    // Top-left texts
    this.hpText = scene.add.text(MARGIN, 4, "", base)
      .setScrollFactor(0).setDepth(1001);
    this.levelText = scene.add.text(MARGIN, 66, "", { ...base, fontSize: "16px", color: "#9d86ff" })
      .setScrollFactor(0).setDepth(1001);

    // Top-right texts (right-aligned to the screen edge)
    const rx = GAME.WIDTH - MARGIN;
    this.timerText = scene.add.text(rx, 8, "", right)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(1001);
    this.enemyText = scene.add.text(rx, 32, "", right)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(1001);

    // Debug block (hidden until F1 toggles debug mode)
    this.debugText = scene.add.text(MARGIN, 100, "", {
      ...base,
      fontSize: "13px",
      color: "#8a8f9c",
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(1001).setVisible(false);
  }

  /**
   * Push current values to the HUD.
   * @param {object} s {
   *   hp, maxHp, level, exp, expRequired, expProgress(0..1),
   *   fps, timeMs, enemyCount, playerX, playerY, debug
   * }
   */
  update(s) {
    const g = this.gfx;
    g.clear();

    const hpY = 22;
    const expY = 50;

    // --- HP bar ---
    const hpRatio = clamp(s.hp / s.maxHp, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(MARGIN, hpY, BAR_W, 16, 4);
    g.fillStyle(0xc0392b, 1);
    g.fillRoundedRect(MARGIN, hpY, BAR_W * hpRatio, 16, 4);
    g.lineStyle(1, 0x7b5cff, 0.6);
    g.strokeRoundedRect(MARGIN, hpY, BAR_W, 16, 4);

    // --- EXP bar ---
    const expRatio = clamp(s.expProgress, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(MARGIN, expY, BAR_W, 8, 3);
    g.fillStyle(0x4aa3ff, 1);
    g.fillRoundedRect(MARGIN, expY, BAR_W * expRatio, 8, 3);

    // --- Top-left text ---
    this.hpText.setText(`HP ${Math.ceil(s.hp)} / ${s.maxHp}`);
    this.levelText.setText(`LVL ${s.level}`);

    // --- Top-right text ---
    this.timerText.setText(`TIME ${this.formatTime(s.timeMs)}`);
    this.enemyText.setText(`ENEMIES ${s.enemyCount}`);

    // --- Debug block (F1) ---
    this.debugText.setVisible(!!s.debug);
    if (s.debug) {
      this.debugText.setText(
        `FPS ${s.fps}\n` +
        `POS ${Math.round(s.playerX)}, ${Math.round(s.playerY)}\n` +
        `LVL ${s.level}\n` +
        `EXP ${s.exp} / ${s.expRequired}\n` +
        `ENEMIES ${s.enemyCount}`
      );
    }
  }

  /** Format milliseconds as mm:ss. */
  formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
}
