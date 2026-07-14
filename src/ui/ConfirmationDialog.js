/* ==========================================================================
   Etherfall - Confirmation Dialog (shared modal)
   A small, self-contained confirmation overlay used for destructive actions
   such as "Reset Progression". It dims the screen, shows a message, and offers
   Cancel / Confirm buttons. The caller supplies the callbacks — this module
   owns no game state and never touches the save or filesystem itself.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME } from "../config/constants.js";

/**
 * Show a blocking confirmation dialog.
 * @param {Phaser.Scene} scene
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} opts.message
 * @param {string} [opts.confirmLabel="Confirm"]
 * @param {string} [opts.cancelLabel="Cancel"]
 * @param {string[]} [opts.cancelKeys=["ESC"]]  keyboard keys that cancel
 * @param {() => void} [opts.onConfirm]
 * @param {() => void} [opts.onCancel]
 * @returns {{ close: () => void }}
 */
export function showConfirmation(scene, opts = {}) {
  const {
    title = "Confirm",
    message = "Are you sure?",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    cancelKeys = ["ESC"],
    onConfirm = () => {},
    onCancel = () => {},
  } = opts;

  const cx = GAME.WIDTH / 2;
  const cy = GAME.HEIGHT / 2;

  const layer = scene.add.container(0, 0).setDepth(2000);

  // Dim backdrop. Interactive so it swallows clicks behind the dialog.
  const backdrop = scene.add
    .rectangle(cx, cy, GAME.WIDTH, GAME.HEIGHT, 0x05070b, 0.72)
    .setInteractive();

  const panelW = 480;
  const panelH = 240;
  const panel = scene.add
    .rectangle(cx, cy, panelW, panelH, 0x141826, 0.98)
    .setStrokeStyle(2, 0x7a3d3d);

  const titleText = scene.add
    .text(cx, cy - 84, title, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "26px",
      color: "#ff6b6b",
      fontStyle: "bold",
    })
    .setOrigin(0.5);

  const msgText = scene.add
    .text(cx, cy - 22, message, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "17px",
      color: "#e6e8ef",
      align: "center",
      wordWrap: { width: panelW - 70 },
    })
    .setOrigin(0.5);

  // Add static parts first so the backdrop stays below the buttons.
  layer.add([backdrop, panel, titleText, msgText]);

  const makeBtn = (x, label, color, hover, onClick) => {
    const rect = scene.add
      .rectangle(x, cy + 74, 200, 48, color)
      .setInteractive({ useHandCursor: true });
    const text = scene.add
      .text(x, cy + 74, label, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "18px",
        color: "#e6e8ef",
      })
      .setOrigin(0.5);
    rect.on("pointerover", () => rect.setFillStyle(hover));
    rect.on("pointerout", () => rect.setFillStyle(color));
    rect.on("pointerdown", onClick);
    layer.add([rect, text]);
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    cancelKeys.forEach((k) => scene.input.keyboard.off(`keydown-${k}`, onCancelKey));
    layer.destroy(true);
  };

  const onCancelKey = () => {
    close();
    onCancel();
  };
  cancelKeys.forEach((k) => scene.input.keyboard.on(`keydown-${k}`, onCancelKey));

  makeBtn(cx - 112, cancelLabel, 0x2a2150, 0x3a2d63, () => {
    close();
    onCancel();
  });
  makeBtn(cx + 112, confirmLabel, 0x7a2d2d, 0x9d3d3d, () => {
    close();
    onConfirm();
  });

  return { close };
}
