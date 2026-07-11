/* ==========================================================================
   Etherfall - Upgrade System (spell progression)
   The single authority for spell upgrades. It:
     - holds the rarity table (weights + colours) and the upgrade catalogue
       from data/upgrades.json,
     - rolls N distinct, rarity-weighted choices for the level-up screen,
     - applies a chosen upgrade to its target spell (raising the spell level),
     - tracks the active upgrades so the HUD/debug can show the current build.

   No upgrade behaviour is hardcoded here: the effect types are interpreted by
   Magic.applyUpgrade() (and the hit handlers in GameScene for explode/return/
   burn). Adding a new upgrade = one more entry in data/upgrades.json.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

const DEFAULT_RARITY = { name: "Common", weight: 1, color: "#b8bcc8" };

export class UpgradeSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} data          registry data (expects data.upgrades)
   * @param {SpellManager} magicSystem  owns the spells we upgrade
   */
  constructor(scene, data, magicSystem) {
    this.scene = scene;
    this.magicSystem = magicSystem;

    const upgradeData = (data.upgrades || {});
    this.rarities = upgradeData.rarities || {};
    this.upgrades = upgradeData.upgrades || [];
    this.diminishingRate = upgradeData.diminishingRate ?? 0.25;
    this.active = []; // applied upgrades (in acquisition order)
    this.stacks = {}; // upgrade id -> number of times taken
  }

  /** How many times an upgrade has been taken this run. */
  getStacks(id) {
    return this.stacks[id] || 0;
  }

  /** Max times an upgrade may be taken (Infinity if unspecified). */
  maxStacksOf(u) {
    return u.maxStacks != null ? u.maxStacks : Infinity;
  }

  /** IDs of spells the player currently owns (upgrade targets). */
  getOwnedSpellIds() {
    return this.magicSystem.ownedMagics.map((m) => m.id);
  }

  /**
   * Upgrades that can still be offered: target spell is owned AND the upgrade
   * has not yet reached its maxStacks.
   */
  availableUpgrades() {
    const owned = new Set(this.getOwnedSpellIds());
    return this.upgrades.filter(
      (u) => owned.has(u.spell) && this.getStacks(u.id) < this.maxStacksOf(u)
    );
  }

  /** Metadata (name/weight/color) for a rarity key. */
  rarityMeta(rarity) {
    return this.rarities[rarity] || DEFAULT_RARITY;
  }

  /**
   * Roll `count` distinct, rarity-weighted upgrade choices for the level-up
   * screen. Returns [] if no spell is owned yet.
   * @param {number} count
   * @returns {object[]} upgrade descriptors
   */
  rollChoices(count = 3) {
    const pool = this.availableUpgrades();
    if (pool.length === 0) return [];

    const picks = [];
    let guard = 0;
    while (picks.length < count && guard < 200) {
      guard++;
      const u = this.weightedPick(pool);
      if (!picks.some((p) => p.id === u.id)) picks.push(u);
      if (picks.length >= pool.length) break; // pool exhausted (offer all)
    }
    return picks;
  }

  /** Pick one upgrade from `pool` using rarity weights. */
  weightedPick(pool) {
    const weights = pool.map((u) => this.rarityMeta(u.rarity).weight || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /**
   * Apply a chosen upgrade to its target spell. The effect magnitude is run
   * through the diminishing-returns curve (based on how many times this exact
   * upgrade has already been taken) before being passed to the spell, which
   * then clamps it to its hard limits.
   * @param {object} upgrade  descriptor from data/upgrades.json
   * @returns {boolean} true if applied
   */
  applyUpgrade(upgrade) {
    if (!upgrade) return false;
    const magic = this.magicSystem.getMagicById(upgrade.spell);
    if (!magic) return false;
    if (this.getStacks(upgrade.id) >= this.maxStacksOf(upgrade)) return false;

    const effective = this.effectiveValue(upgrade);
    const ok = magic.applyUpgrade(upgrade, effective);
    if (ok) {
      this.stacks[upgrade.id] = this.getStacks(upgrade.id) + 1;
      this.active.push(upgrade);
      this.scene.game.events.emit(EVENTS.LEVEL_UP_CHOICE, upgrade, magic);
    }
    return ok;
  }

  /**
   * Diminishing-returns-adjusted effect magnitude for the NEXT stack of an
   * upgrade. value / (1 + rate * stacksAlreadyTaken), so each additional stack
   * is weaker than the last (e.g. 15 -> 12 -> 10 -> 8 for damage at rate 0.25).
   * @param {object} upgrade
   * @returns {number}
   */
  effectiveValue(upgrade) {
    const taken = this.getStacks(upgrade.id);
    const factor = 1 / (1 + this.diminishingRate * taken);
    return (upgrade.value || 0) * factor;
  }

  /** Upgrades applied so far, as "Name xN" strings (for HUD/debug). */
  getActiveUpgradeSummary() {
    const counts = {};
    this.active.forEach((u) => {
      counts[u.name] = (counts[u.name] || 0) + 1;
    });
    return Object.entries(counts).map(([name, n]) => `${name} x${n}`);
  }

  /** Upgrades applied so far (for HUD/debug). */
  getActiveUpgrades() {
    return this.active;
  }

  /**
   * Human-readable effect summary for a card. `stacksTaken` lets the card show
   * the diminished value the player will actually receive on this pick.
   */
  describe(upgrade, stacksTaken = 0) {
    if (!upgrade) return "";
    const v = (upgrade.value || 0) / (1 + this.diminishingRate * stacksTaken);
    switch (upgrade.type) {
      case "damage":
        return `Damage +${Math.round(v)}%`;
      case "projectileCount":
        return `Projectiles +${Math.round(v)}`;
      case "cooldown":
        return `Cooldown -${Math.round(v)}%`;
      case "size":
        return `Size +${Math.round(v)}%`;
      case "burn":
        return `Burn chance +${(v * 100).toFixed(0)}%`;
      case "areaRadius":
        return `Circle radius +${Math.round(v)}%`;
      case "duration":
        return `Duration +${Math.round(v)}%`;
      case "explode":
        return `Explodes on impact`;
      case "return":
        return `Returns to caster`;
      default:
        return upgrade.name || "";
    }
  }
}
