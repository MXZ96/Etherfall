/* ==========================================================================
   Etherfall - Preload Scene
   Loads all JSON data files (future content lives there) and stores them on
   the registry so every system can read from a single source of truth.
   Shows a minimal loading indicator.
   ========================================================================== */

import * as Phaser from "phaser";
import { GAME, SCENES } from "../config/constants.js";

const DATA_FILES = [
  "magic",
  "fusion",
  "enemy",
  "boss",
  "artifact",
  "achievement",
  "weather",
  "event",
  "player",
  "maps",
];

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.PRELOAD);
  }

  preload() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    this.add.text(cx, cy - 20, "ETHERFALL", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "40px",
      color: "#9d86ff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const loading = this.add.text(cx, cy + 30, "Loading...", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#8a8f9c",
    }).setOrigin(0.5);

    this.load.on("complete", () => loading.destroy());

    // Load every future-content data file (relative to repo root).
    DATA_FILES.forEach((name) => {
      this.load.json(name, `src/data/${name}.json`);
    });
  }

  create() {
    // Collect loaded data into one registry object for easy access.
    const data = {};
    DATA_FILES.forEach((name) => {
      data[name] = this.cache.json.get(name) || { version: 1, [name]: [] };
    });
    this.registry.set("data", data);

    this.scene.start(SCENES.MAIN_MENU);
  }
}
