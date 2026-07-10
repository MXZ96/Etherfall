/* ==========================================================================
   Etherfall - Save System
   Persists player progress + settings to localStorage. Designed to be
   forward-compatible: data is stored as versioned sections, so future
   systems (artifacts, weather, multiplayer) can add their own section
   without breaking older saves.
   ========================================================================== */

import { STORAGE_KEYS } from "../config/constants.js";

/**
 * Default save document. New sections should be appended here so a fresh
 * save always has a complete shape.
 */
function defaultSave() {
  return {
    version: 1,
    player: {
      level: 1,
    },
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.6,
      sfxVolume: 0.8,
      fullscreen: false,
      language: "en",
    },
    // Reserved for future systems. Shape prepared now (v0.0.5.1) so later
    // versions can populate it without a save migration; not yet written.
    progress: {
      highestLevel: 1,
      unlockedElements: [],
      discoveredSpells: [],
      achievements: [],
    },
    // Elemental Awakening (v0.0.8): prepared section. Holds which elements have
    // permanently awakened, their levels, and an unlock history (with timestamps
    // for future "date unlocked" codex support). Not a full save system — just
    // the shape needed so awakening state survives reloads without migration.
    awakenings: {
      awakened: {},
      levels: {},
      history: [],
    },
  };
}

export class SaveSystem {
  constructor(storageKey = STORAGE_KEYS.SAVE) {
    this.storageKey = storageKey;
    this.data = this.load();
  }

  /**
   * Load and merge stored data over the defaults so missing sections are
   * back-filled. Falls back to defaults if storage is unavailable/corrupt.
   */
  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      return this.mergeDefaults(parsed);
    } catch (err) {
      console.warn("[SaveSystem] Failed to load save, using defaults.", err);
      return defaultSave();
    }
  }

  /**
   * Deep-ish merge: top-level known sections are merged with defaults so a
   * save written by an older build still loads.
   */
  mergeDefaults(parsed) {
    const base = defaultSave();
    return {
      ...base,
      ...parsed,
      player: { ...base.player, ...(parsed.player || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
      progress: { ...base.progress, ...(parsed.progress || {}) },
      awakenings: { ...base.awakenings, ...(parsed.awakenings || {}) },
    };
  }

  /**
   * Persist the whole document. Wrapped in try/catch because private-mode
   * browsers can throw on localStorage writes.
   */
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      return true;
    } catch (err) {
      console.warn("[SaveSystem] Failed to write save.", err);
      return false;
    }
  }

  /**
   * True only when a real save document exists in storage. Used by the main
   * menu to decide whether the "Continue" button should appear.
   */
  hasSave() {
    try {
      return !!localStorage.getItem(this.storageKey);
    } catch (err) {
      return false;
    }
  }

  /** Read a top-level section. */
  getSection(key) {
    return this.data[key];
  }

  /** Replace a top-level section and persist. */
  setSection(key, value) {
    this.data[key] = value;
    return this.save();
  }

  /** Patch a top-level section (shallow merge) and persist. */
  patchSection(key, patch) {
    this.data[key] = { ...(this.data[key] || {}), ...patch };
    return this.save();
  }

  /** Wipe all data (used by a future "New Game" / reset option). */
  reset() {
    this.data = defaultSave();
    return this.save();
  }
}
