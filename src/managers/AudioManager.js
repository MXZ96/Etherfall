/* ==========================================================================
   Etherfall - Audio Manager (stub)
   Owns the three volume buses (master / music / sfx) and exposes play hooks
   for future sound assets. v0.0.1 ships NO audio files, so playback is a
   no-op that still respects volumes/mute. Listens to SETTINGS_CHANGED so the
   buses stay in sync with the settings manager.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";
import { clamp } from "../utils/math.js";

export class AudioManager {
  /**
   * @param {Phaser.Game} game
   * @param {SettingsSystem} settings
   */
  constructor(game, settings) {
    this.game = game;
    this.settings = settings;

    this.masterVolume = settings.get("masterVolume");
    this.musicVolume = settings.get("musicVolume");
    this.sfxVolume = settings.get("sfxVolume");
    this.muted = false;

    // Keep buses in sync with settings changes.
    game.events.on(EVENTS.SETTINGS_CHANGED, (vals) => {
      this.masterVolume = vals.masterVolume;
      this.musicVolume = vals.musicVolume;
      this.sfxVolume = vals.sfxVolume;
    });
  }

  /** Effective volume for a bus after master + mute. */
  effectiveVolume(busVolume) {
    return this.muted ? 0 : clamp(this.masterVolume * busVolume, 0, 1);
  }

  /**
   * Play a sound effect. No-op until audio assets are added.
   * @param {string} key  future sound key from audio.json
   */
  playSfx(key) {
    // TODO: implement with this.game.sound once SFX assets exist.
    void key;
  }

  /**
   * Play / switch background music. No-op until audio assets are added.
   * @param {string} key
   */
  playMusic(key) {
    // TODO: implement with this.game.sound once music assets exist.
    void key;
  }

  setMuted(muted) {
    this.muted = muted;
  }
}
