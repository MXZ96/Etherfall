/* ==========================================================================
   Etherfall - HUD (Heads-Up Display)
   Minimal, dark-fantasy overlay fixed to the camera. Top-left cluster:
     - HP bar + numeric
     - EXP bar (progress to next level)
     - Level text
     - FPS counter (debug)
   Reads values pushed in via update(); holds no game logic.
   ========================================================================== */

import { clamp } from "../utils/math.js";

const MARGIN = 16;
const BAR_W = 240;

export class HUD {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    // Drawn every frame.
    this.gfx = scene.add.graphics();
    this.gfx.setScrollFactor(0).setDepth(1000);

    const textStyle = {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#e6e8ef",
    };

    this.hpText = scene.add.text(MARGIN, MARGIN - 2, "", textStyle)
      .setScrollFactor(0).setDepth(1001);

    this.levelText = scene.add.text(MARGIN, MARGIN + 42, "", {
      ...textStyle,
      fontSize: "16px",
      color: "#9d86ff",
    }).setScrollFactor(0).setDepth(1001);

    this.fpsText = scene.add.text(MARGIN, MARGIN + 66, "", {
      ...textStyle,
      fontSize: "12px",
      color: "#8a8f9c",
    }).setScrollFactor(0).setDepth(1001);
  }

  /**
   * Push current values to the HUD.
   * @param {object} s { hp, maxHp, level, expProgress(0..1), fps }
   */
  update(s) {
    const g = this.gfx;
    g.clear();

    const hpY = MARGIN + 16;
    const expY = MARGIN + 36;

    // --- HP bar ---
    const hpRatio = clamp(s.hp / s.maxHp, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(MARGIN, hpY, BAR_W, 14, 4);
    g.fillStyle(0xc0392b, 1);
    g.fillRoundedRect(MARGIN, hpY, BAR_W * hpRatio, 14, 4);
    g.lineStyle(1, 0x7b5cff, 0.6);
    g.strokeRoundedRect(MARGIN, hpY, BAR_W, 14, 4);

    // --- EXP bar ---
    const expRatio = clamp(s.expProgress, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(MARGIN, expY, BAR_W, 8, 3);
    g.fillStyle(0x4aa3ff, 1);
    g.fillRoundedRect(MARGIN, expY, BAR_W * expRatio, 8, 3);

    // --- Text ---
    this.hpText.setText(`HP ${Math.ceil(s.hp)} / ${s.maxHp}`);
    this.levelText.setText(`LVL ${s.level}`);
    this.fpsText.setText(`FPS ${s.fps}`);
  }
}
