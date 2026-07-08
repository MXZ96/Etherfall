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

  // Combat
  DAMAGE_DEALT: "combat:damage-dealt",
  ENTITY_DIED: "combat:entity-died",
  PLAYER_DAMAGED: "player:damaged",

  // Magic
  MAGIC_CASTED: "magic:casted",

  // Affinity / elemental progression
  AFFINITY_LEVELED: "affinity:leveled",
  AFFINITY_UNLOCKED: "affinity:unlocked",

  // UI / Flow
  GAME_PAUSED: "flow:paused",
  GAME_RESUMED: "flow:resumed",
  GAME_OVER: "flow:game-over",

  // Settings
  SETTINGS_CHANGED: "settings:changed",

  // Spell Pool
  SPELL_UNLOCKED: "spell:unlocked",

  // Codex / Discovery
  CODEX_UPDATED: "codex:updated",
  SPELL_DISCOVERED: "codex:spell-discovered",
  ELEMENT_DISCOVERED: "codex:element-discovered",
  ENEMY_DISCOVERED: "codex:enemy-discovered",
};
