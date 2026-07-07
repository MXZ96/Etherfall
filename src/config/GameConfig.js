/* ==========================================================================
   Etherfall - Phaser Game Configuration
   Responsive scale setup. The canvas scales with FIT mode so the game keeps
   its aspect ratio on desktop, tablet and mobile browsers.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME } from "./constants.js";

export const GAME_CONFIG = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: GAME.BACKGROUND_COLOR,
  // Base resolution; Scale.FIT keeps the aspect ratio on any device.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME.WIDTH,
    height: GAME.HEIGHT,
  },
  // Arcade physics: lightweight and ideal for top-down bullet-heaven movement.
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  // Scenes are assigned in main.js after import to avoid circular refs.
  scene: [],
};
