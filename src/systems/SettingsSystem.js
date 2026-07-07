/* ==========================================================================
   Etherfall - Settings System (Settings Manager)
   Owns user-facing settings and keeps them persisted via SaveSystem.
   Volumes are 0..1. Language is a BCP-47-ish code used by future i18n.
   Emits SETTINGS_CHANGED on the game event bus so listeners (audio, UI)
   can react without polling.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

export const SETTING_KEYS = {
  MASTER_VOLUME: "masterVolume",
  MUSIC_VOLUME: "musicVolume",
  SFX_VOLUME: "sfxVolume",
  FULLSCREEN: "fullscreen",
  LANGUAGE: "language",
};

export class SettingsSystem {
  /**
   * @param {SaveSystem} saveSystem
   * @param {Phaser.Game} game
   */
  constructor(saveSystem, game) {
    this.save = saveSystem;
    this.game = game;
    this.values = { ...this.save.getSection("settings") };
  }

  /** Read a single setting. */
  get(key) {
    return this.values[key];
  }

  /**
   * Update one or more settings, persist, and broadcast the change.
   * @param {object} patch  e.g. { masterVolume: 0.5 }
   */
  set(patch) {
    this.values = { ...this.values, ...patch };
    this.save.patchSection("settings", patch);
    this.game.events.emit(EVENTS.SETTINGS_CHANGED, this.values);
  }

  /**
   * Apply persisted settings to the running game (audio + fullscreen).
   * Called once after boot.
   */
  apply() {
    // Fullscreen is handled by the scene/scale manager when toggled.
    // Audio volumes are applied by AudioManager listening to SETTINGS_CHANGED.
  }

  /** Toggle fullscreen via the Phaser Scale manager. */
  toggleFullscreen() {
    const scale = this.game.scale;
    if (scale.isFullscreen) {
      scale.stopFullscreen();
      this.set({ fullscreen: false });
    } else {
      scale.startFullscreen();
      this.set({ fullscreen: true });
    }
  }
}
