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

  /**
   * Fade the music bus toward a target volume over `duration` ms. No-op until
   * music assets exist, but the internal value is tracked so a real music
   * implementation can honour it (used by the Fire Awakening cinematic to
   * "slowly fade game music" then restore it).
   * @param {number} target  volume 0..1
   * @param {number} [duration=1000]  fade time in ms
   */
  fadeMusicTo(target, duration = 1000) {
    this._musicFadeTarget = this.musicVolume;
    this.musicVolume = this.muted ? 0 : clamp(target, 0, 1);
    // TODO: drive this.game.sound.getMusicVolume() tween once music assets exist.
    void duration;
  }

  /**
   * Play an element's awakening fanfare on a dedicated "awakening" channel.
   * No-op until audio assets are added; the per-element sound key is prepared
   * so Fire/Water/Air/Earth/Spirit each get their own cue later.
   * @param {string} elementId  fire | water | air | earth | spirit
   */
  playAwakening(elementId) {
    // TODO: implement with a dedicated awakening bus once SFX assets exist.
    void elementId;
  }

  /**
   * Weather ambience channel (v0.0.9). No-op until audio assets exist; the
   * hook is prepared so Rain / Ashfall / Fog each get their own bed later.
   * @param {string} [weatherId]
   */
  playRainAmbience(weatherId) {
    // TODO: implement with a weather bus once audio assets exist.
    void weatherId;
  }

  /**
   * Water Discovery fanfare (v0.0.9). No-op until audio assets exist.
   */
  playWaterDiscovery() {
    // TODO: implement with a dedicated discovery bus once SFX assets exist.
  }

  /**
   * Water Bolt cast sound (v0.0.9). No-op until audio assets exist.
   */
  playWaterBolt() {
    // TODO: implement with a dedicated SFX bus once SFX assets exist.
  }

  /**
   * Water Circle activation surge (v0.0.9.3). No-op until audio assets exist.
   */
  playWaterCircleActivate() {
    // TODO: implement with a dedicated SFX bus once SFX assets exist.
  }

  /**
   * Water Circle expiration splash (v0.0.9.3). No-op until audio assets exist.
   */
  playWaterCircleExpire() {
    // TODO: implement with a dedicated SFX bus once SFX assets exist.
  }
}
