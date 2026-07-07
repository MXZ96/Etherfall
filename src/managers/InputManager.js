/* ==========================================================================
   Etherfall - Input Manager
   Centralises keyboard input so scenes/entities never read raw key state
   directly. Supports WASD + Arrow keys for movement and normalises diagonals.
   Future: gamepad / touch joystick can feed the same getMoveVector() shape.
   ========================================================================== */

import * as Phaser from "phaser";
import { normalize } from "../utils/math.js";

export class InputManager {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const kb = scene.input.keyboard;

    // WASD
    this.keys = kb.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Arrow keys
    this.cursors = kb.createCursorKeys();

    // Pause keys (ESC / P). Scenes listen via isPauseJustDown().
    this.pauseKeys = kb.addKeys({
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      p: Phaser.Input.Keyboard.KeyCodes.P,
    });
  }

  /**
   * Normalised movement vector from current key state.
   * @returns {{x:number, y:number}}
   */
  getMoveVector() {
    let x = 0;
    let y = 0;

    if (this.keys.left.isDown || this.cursors.left.isDown) x -= 1;
    if (this.keys.right.isDown || this.cursors.right.isDown) x += 1;
    if (this.keys.up.isDown || this.cursors.up.isDown) y -= 1;
    if (this.keys.down.isDown || this.cursors.down.isDown) y += 1;

    return normalize(x, y);
  }

  /** True once when ESC or P is pressed (edge-triggered). */
  isPauseJustDown() {
    return (
      Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc) ||
      Phaser.Input.Keyboard.JustDown(this.pauseKeys.p)
    );
  }
}
