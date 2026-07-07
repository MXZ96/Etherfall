/* ==========================================================================
   Etherfall - Level / Progression System
   Authority for the player's level and EXP. Uses the scalable formula in
   utils/leveling.js. Emits EXP_GAINED and LEVEL_UP on the game event bus so
   the HUD and Level-Up UI can react. Does NOT own UI; it only models state.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";
import { expToNext } from "../utils/leveling.js";
import { clamp } from "../utils/math.js";

export class LevelSystem {
  /**
   * @param {Phaser.Game} game
   * @param {number} startLevel
   */
  constructor(game, startLevel = 1, startExp = 0) {
    this.game = game;
    this.level = startLevel;
    this.exp = startExp; // EXP accumulated toward the next level
    this.threshold = expToNext(this.level);
  }

  /** Current level. */
  getLevel() {
    return this.level;
  }

  /** EXP accumulated toward the next level. */
  getExp() {
    return this.exp;
  }

  /** EXP needed to reach the next level. */
  getThreshold() {
    return this.threshold;
  }

  /** Progress toward next level in 0..1 (for the EXP bar). */
  getProgress() {
    if (this.threshold <= 0) return 1;
    return clamp(this.exp / this.threshold, 0, 1);
  }

  /**
   * Add EXP. Handles multi-level gains in a single call. Returns the number
   * of levels gained (used by the UI to decide how many cards to show).
   * @param {number} amount
   * @returns {number} levels gained
   */
  gainExp(amount) {
    if (amount <= 0) return 0;
    this.exp += amount;
    this.game.events.emit(EVENTS.EXP_GAINED, this.exp, this.threshold);

    let gained = 0;
    while (this.exp >= this.threshold) {
      this.exp -= this.threshold;
      this.level += 1;
      this.threshold = expToNext(this.level);
      gained += 1;
      this.game.events.emit(EVENTS.LEVEL_UP, this.level);
    }
    return gained;
  }
}
