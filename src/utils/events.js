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

  // Elemental Awakening (v0.0.8)
  AWAKENING_STARTED: "awakening:started",

  // World Tree / Ancient Forces (v0.0.9)
  FORCE_DISCOVERED: "force:discovered",
  FORCE_ACKNOWLEDGED: "force:acknowledged",

  // Weather + Water Discovery (v0.0.9)
  WEATHER_CHANGED: "weather:changed",
  DISCOVERY_STARTED: "discovery:started",

  // UI / Flow
  GAME_PAUSED: "flow:paused",
  GAME_RESUMED: "flow:resumed",
  GAME_OVER: "flow:game-over",

  // Settings
  SETTINGS_CHANGED: "settings:changed",

  // Spell Pool
  SPELL_UNLOCKED: "spell:unlocked",

  // Spell lifecycle (v0.0.9.3a)
  SPELL_EXPIRED: "spell:expired",

  // Codex / Discovery
  CODEX_UPDATED: "codex:updated",
  SPELL_DISCOVERED: "codex:spell-discovered",
  ELEMENT_DISCOVERED: "codex:element-discovered",
  ENEMY_DISCOVERED: "codex:enemy-discovered",
};
