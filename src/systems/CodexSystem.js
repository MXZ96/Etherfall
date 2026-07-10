/* ==========================================================================
   Etherfall - Codex System (Arcane Codex / Discovery tracker)
   The single authority for what the player has discovered across every
   content category: elements, spells, enemies, fusions, achievements, and
   future boss/artifact entries. Everything is driven from JSON; nothing is
   hardcoded.

   Discovery events are emitted on the global game event bus so the UI layer
   (DiscoveryEventUI / CodexUI) can react. Persistence is handled through the
   SaveSystem's "progress" section.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

const CODEX_CATEGORIES = [
  "elements",
  "spells",
  "enemies",
  "awakenings",
  "fusions",
  "achievements",
  "artifacts",
  "bosses",
];

export class CodexSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {SaveSystem} saveSystem
   * @param {object} data  registry data (expects data.elements, data.magic, etc.)
   */
  constructor(scene, saveSystem, data) {
    this.scene = scene;
    this.save = saveSystem;

    const progress = (saveSystem && saveSystem.getSection("progress")) || {};
    const discoveredRaw = progress.discovered || {};

    this.discovered = {};
    CODEX_CATEGORIES.forEach((cat) => {
      this.discovered[cat] = new Set(discoveredRaw[cat] || []);
    });

    // Build the catalogue from JSON (only categories that exist in data).
    this.catalogue = {};
    if (data.elements && data.elements.elements) {
      this.catalogue.elements = Object.values(data.elements.elements);
    }
    if (data.magic && data.magic.magic) {
      this.catalogue.spells = data.magic.magic;
    }
    if (data.enemy && data.enemy.enemies) {
      this.catalogue.enemies = data.enemy.enemies;
    }
    if (data.fusion && data.fusion.fusions) {
      this.catalogue.fusions = data.fusion.fusions;
    }
    if (data.achievement && data.achievement.achievements) {
      this.catalogue.achievements = data.achievement.achievements;
    }
    if (data.artifact && data.artifact.artifacts) {
      this.catalogue.artifacts = data.artifact.artifacts;
    }
    if (data.boss && data.boss.bosses) {
      this.catalogue.bosses = data.boss.bosses;
    }
    if (data.awakenings && data.awakenings.awakenings) {
      // Spirit is a hidden placeholder — never reveal it in the codex.
      this.catalogue.awakenings = data.awakenings.awakenings.filter(
        (a) => !a.hidden
      );
    }

    // Auto-discover starter element / spells on first run.
    this.bootstrapDiscoveries(data);
  }

  /** Mark starter content as already discovered so the codex isn't empty. */
  bootstrapDiscoveries(data) {
    if (data.elements && data.elements.elements) {
      for (const [id, def] of Object.entries(data.elements.elements)) {
        if (def.unlocked) this.discover("elements", id, false);
      }
    }
    if (data.magic && data.magic.magic) {
      data.magic.magic.forEach((s) => {
        if (s.status === "known" || s.starter) this.discover("spells", s.id, false);
      });
    }
  }

  /**
   * Attempt to discover an entry. Emits a category-specific event the first
   * time, and a generic CODEX_UPDATED event every time.
   * @param {string} category
   * @param {string} id
   * @param {boolean} [emit=true]
   * @returns {boolean} true if newly discovered
   */
  discover(category, id, emit = true) {
    if (!this.discovered[category]) return false;
    if (this.discovered[category].has(id)) return false;

    this.discovered[category].add(id);
    this.persist();

    if (emit) {
      this.scene.game.events.emit(EVENTS.CODEX_UPDATED, category, id);
      const evtMap = {
        elements: EVENTS.ELEMENT_DISCOVERED,
        spells: EVENTS.SPELL_DISCOVERED,
        enemies: EVENTS.ENEMY_DISCOVERED,
      };
      const evt = evtMap[category];
      if (evt) this.scene.game.events.emit(evt, id);
    }
    return true;
  }

  /** True if the entry has been discovered. */
  isDiscovered(category, id) {
    return !!this.discovered[category] && this.discovered[category].has(id);
  }

  /** All discovered ids in a category. */
  getDiscovered(category) {
    return Array.from(this.discovered[category] || []);
  }

  /** Count of discovered entries in a category. */
  countDiscovered(category) {
    return (this.discovered[category] || new Set()).size;
  }

  /** Total entries available in a category from JSON. */
  countTotal(category) {
    const list = this.catalogue[category];
    return list ? list.length : 0;
  }

  /** Completion ratio 0..1 for a category. */
  getCompletion(category) {
    const total = this.countTotal(category);
    if (total === 0) return 0;
    return this.countDiscovered(category) / total;
  }

  /** Overall completion across all known categories. */
  getOverallCompletion() {
    let discovered = 0;
    let total = 0;
    CODEX_CATEGORIES.forEach((cat) => {
      discovered += this.countDiscovered(cat);
      total += this.countTotal(cat);
    });
    if (total === 0) return 0;
    return discovered / total;
  }

  /** List of category names that have content. */
  getAvailableCategories() {
    return CODEX_CATEGORIES.filter((cat) => this.countTotal(cat) > 0);
  }

  /** All catalogue entries for a category (for UI rendering). */
  getEntries(category) {
    return this.catalogue[category] || [];
  }

  /** Persist discoveries to the save system. */
  persist() {
    if (!this.save) return;
    const payload = {};
    CODEX_CATEGORIES.forEach((cat) => {
      payload[cat] = Array.from(this.discovered[cat] || []);
    });
    this.save.patchSection("progress", { discovered: payload });
  }
}
