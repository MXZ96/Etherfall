/* ==========================================================================
   Etherfall - Discovery Event UI
   Floating toast notifications shown when the player discovers a new spell,
   element, or enemy. Designed to be lightweight and non-blocking so it never
   interrupts gameplay.
   ========================================================================== */

import { GAME } from "../config/constants.js";

const TOAST_DURATION = 2200;
const TOAST_FADE = 300;

export class DiscoveryEventUI {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.toasts = [];
  }

  /** Show a discovery toast. */
  show(title, subtitle) {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT - 120;

    const bg = this.scene.add.rectangle(cx, cy, 420, 64, 0x141826, 0.95)
      .setScrollFactor(0).setDepth(2500)
      .setStrokeStyle(1, 0x7b5cff);

    const titleText = this.scene.add.text(cx, cy - 14, title, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "13px",
      color: "#9d86ff",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2501);

    const subText = this.scene.add.text(cx, cy + 14, subtitle, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#e6e8ef",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2501);

    bg.setAlpha(0);
    titleText.setAlpha(0);
    subText.setAlpha(0);

    this.scene.tweens.add({
      targets: [bg, titleText, subText],
      alpha: 1,
      duration: TOAST_FADE,
      ease: "Power2",
    });

    const toast = { bg, titleText, subText };
    this.toasts.push(toast);

    this.scene.time.delayedCall(TOAST_DURATION, () => {
      this.dismiss(toast);
    });
  }

  dismiss(toast) {
    this.scene.tweens.add({
      targets: [toast.bg, toast.titleText, toast.subText],
      alpha: 0,
      y: "+=16",
      duration: TOAST_FADE,
      ease: "Power2",
      onComplete: () => {
        toast.bg.destroy();
        toast.titleText.destroy();
        toast.subText.destroy();
      },
    });
    this.toasts = this.toasts.filter((t) => t !== toast);
  }

  /** Dismiss all active toasts immediately. */
  dismissAll() {
    this.toasts.forEach((t) => this.dismiss(t));
  }
}
