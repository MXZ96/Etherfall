/* ==========================================================================
   Etherfall - Event Channels
   Central registry of event names emitted on the global game EventEmitter
   (game.events). Using string constants avoids typos and documents the
   cross-system contract.
   ========================================================================== */

export const EVENTS = {
  // Player lifecycle
  PLAYER_HP_CHANGED: "player:hp-changed",
  PLAYER_DIED: "player:died",

  // Progression
  EXP_GAINED: "level:exp-gained",
  LEVEL_UP: "level:level-up",
  LEVEL_UP_CHOICE: "level:choice-made",

  // World
  ENEMY_SPAWNED: "enemy:spawned",
  ENEMY_KILLED: "enemy:killed",

  // UI / Flow
  GAME_PAUSED: "flow:paused",
  GAME_RESUMED: "flow:resumed",
  GAME_OVER: "flow:game-over",

  // Settings
  SETTINGS_CHANGED: "settings:changed",
};
