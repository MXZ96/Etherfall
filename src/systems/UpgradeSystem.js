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
   * @param {MagicSystem} magicSystem  owns the spells we upgrade
   */
  constructor(scene, data, magicSystem) {
    this.scene = scene;
    this.magicSystem = magicSystem;

    const upgradeData = (data.upgrades || {});
    this.rarities = upgradeData.rarities || {};
    this.upgrades = upgradeData.upgrades || [];
    this.active = []; // applied upgrades (in acquisition order)
  }

  /** IDs of spells the player currently owns (upgrade targets). */
  getOwnedSpellIds() {
    return this.magicSystem.ownedMagics.map((m) => m.id);
  }

  /** Upgrades whose target spell is currently owned by the player. */
  availableUpgrades() {
    const owned = new Set(this.getOwnedSpellIds());
    return this.upgrades.filter((u) => owned.has(u.spell));
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
   * Apply a chosen upgrade to its target spell.
   * @param {object} upgrade  descriptor from data/upgrades.json
   * @returns {boolean} true if applied
   */
  applyUpgrade(upgrade) {
    if (!upgrade) return false;
    const magic = this.magicSystem.getMagicById(upgrade.spell);
    if (!magic) return false;
    const ok = magic.applyUpgrade(upgrade);
    if (ok) {
      this.active.push(upgrade);
      this.scene.game.events.emit(EVENTS.LEVEL_UP_CHOICE, upgrade, magic);
    }
    return ok;
  }

  /** Upgrades applied so far (for HUD/debug). */
  getActiveUpgrades() {
    return this.active;
  }

  /** Human-readable effect summary for a card, derived from type + value. */
  describe(upgrade) {
    if (!upgrade) return "";
    switch (upgrade.type) {
      case "damage":
        return `Damage +${upgrade.value}%`;
      case "projectileCount":
        return `Projectiles +${upgrade.value}`;
      case "cooldown":
        return `Cooldown -${upgrade.value}%`;
      case "size":
        return `Size +${upgrade.value}%`;
      case "burn":
        return `Burn chance +${Math.round(upgrade.value * 100)}%`;
      case "explode":
        return `Explodes on impact`;
      case "return":
        return `Returns to caster`;
      default:
        return upgrade.name || "";
    }
  }
}
