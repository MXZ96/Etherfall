/* ==========================================================================
   Etherfall - Application Entry Point
   Boots the Phaser game using the project's scenes and configuration.
   ES Modules only; no global state.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME_CONFIG } from "./src/config/GameConfig.js";

import { BootScene } from "./src/scenes/BootScene.js";
import { PreloadScene } from "./src/scenes/PreloadScene.js";
import { MainMenuScene } from "./src/scenes/MainMenuScene.js";
import { GameScene } from "./src/scenes/GameScene.js";
import { PauseScene } from "./src/scenes/PauseScene.js";
import { GameOverScene } from "./src/scenes/GameOverScene.js";

// Register every scene. Order here is not load order; scenes are started
// explicitly from one another.
GAME_CONFIG.scene = [
  BootScene,
  PreloadScene,
  MainMenuScene,
  GameScene,
  PauseScene,
  GameOverScene,
];

/**
 * Create and start the game. We keep the instance reference so it can be
 * inspected/debugged from the console if needed (`window.__etherfall`).
 */
const game = new Phaser.Game(GAME_CONFIG);

// Expose for debugging only; never relied upon by game logic.
window.__etherfall = game;

export default game;
