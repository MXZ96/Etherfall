/* ==========================================================================
   Etherfall - Magic (spell framework)
   A lightweight, data-driven wrapper around a single magic.json entry. It
   tracks the spell's OWNED state and its level, holds both the BASE stats
   (from data) and the EFFECTIVE (upgraded) stats, and knows how to launch one
   or more projectiles toward a target.

   Adding a new spell = adding an entry in data/magic.json (no code changes).
   Upgrading a spell  = feeding it an upgrade descriptor via applyUpgrade()
   (no per-upgrade code; the effect types live in UpgradeSystem).

   Spell level: starts at 1 and increments by 1 every time an upgrade is
   applied to this spell. The HUD/debug surface it so builds feel like they
   are "leveling up" their spells.
   ========================================================================== */

import * as Phaser from "phaser";
import { Projectile } from "./Projectile.js";

export class Magic {
  /**
   * @param {object} def  one entry from data/magic.json
   */
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.element = def.element;
    this.owned = false; // does the player currently have this spell slotted?
    this.locked = !!def.locked; // element/spell not yet available

    // --- Base stats (immutable source of truth from data) ---
    this.base = {
      damage: def.damage,
      cooldown: def.cooldown,
      size: def.size,
      speed: def.speed,
      range: def.range,
      lifetime: def.lifetime ?? 1500,
      projectileCount: def.projectileCount ?? 1,
    };

    // --- Multipliers / additive bonuses driven by upgrades ---
    this.damageMult = 1; // additive (each +10% upgrade adds 0.10)
    this.cooldownMult = 1; // multiplicative (each -10% multiplies by 0.90)
    this.sizeMult = 1; // additive (each +50% adds 0.50)

    // --- Special behaviours unlocked by upgrades ---
    this.burnChance = 0; // 0..1 chance to apply burn on hit
    this.explode = false; // detonate on impact (AoE)
    this.returning = false; // boomerang back to the caster

    // --- Hard caps so builds can't scale infinitely (data/magic.json) ---
    this.limits = def.limits || {
      maxProjectile: 8,
      maxDamageMultiplier: 5,
      maxSizeMultiplier: 3,
      maxCooldownReduction: 50,
    };

    // --- Effective (live) stats, recomputed in recompute() ---
    this.damage = this.base.damage;
    this.cooldown = this.base.cooldown;
    this.size = this.base.size;
    this.speed = this.base.speed;
    this.range = this.base.range;
    this.lifetime = this.base.lifetime;
    this.projectileCount = this.base.projectileCount;

    this.level = 1;
  }

  /** Recompute the effective stats from base + upgrade modifiers. */
  recompute() {
    this.damage = Math.max(1, Math.round(this.base.damage * this.damageMult));
    this.cooldown = Math.max(100, Math.round(this.base.cooldown * this.cooldownMult));
    this.size = Math.max(2, Math.round(this.base.size * this.sizeMult));
    this.speed = this.base.speed;
    this.range = this.base.range;
    this.lifetime = this.base.lifetime;
    this.projectileCount = this.base.projectileCount;
  }

  /**
   * Apply an upgrade descriptor to this spell (JSON-driven, no hardcoded logic).
   * `valueOverride` lets the UpgradeSystem pass a diminishing-returns-adjusted
   * amount; if omitted the upgrade's own `value` is used. Every numeric effect
   * is clamped to this spell's `limits` so a build can never scale infinitely.
   * @param {object} u  { type, value }
   * @param {number} [valueOverride]  pre-scaled effect magnitude
   * @returns {boolean} true if the upgrade changed something
   */
  applyUpgrade(u, valueOverride) {
    if (!u) return false;
    const v = valueOverride ?? u.value ?? 0;

    switch (u.type) {
      case "damage": {
        const next = this.damageMult + v / 100;
        this.damageMult = Math.min(next, this.limits.maxDamageMultiplier);
        break;
      }
      case "projectileCount": {
        const next = this.base.projectileCount + v;
        this.base.projectileCount = Math.min(Math.round(next), this.limits.maxProjectile);
        break;
      }
      case "cooldown": {
        const floor = 1 - this.limits.maxCooldownReduction / 100;
        const next = this.cooldownMult * (1 - v / 100);
        this.cooldownMult = Math.max(next, floor); // never hits 0 / negative
        break;
      }
      case "size": {
        const next = this.sizeMult + v / 100;
        this.sizeMult = Math.min(next, this.limits.maxSizeMultiplier);
        break;
      }
      case "burn":
        this.burnChance = Math.min(1, this.burnChance + v);
        break;
      case "explode":
        this.explode = true;
        break;
      case "return":
        this.returning = true;
        break;
      default:
        return false;
    }
    this.recompute();
    this.level += 1; // every upgrade raises the spell's level by 1
    return true;
  }

  /**
   * Spawn this spell's projectiles from (x,y) toward (tx,ty).
   * Handles the multi-projectile fan spread and records the caster's position
   * so a returning (Phoenix Core) projectile knows where to boomerang back to.
   * @returns {Projectile[]} spawned projectiles
   */
  createProjectiles(scene, group, x, y, tx, ty, color, caster) {
    const baseAngle = Math.atan2(ty - y, tx - x);
    const n = Math.max(1, this.projectileCount);
    const spread = Phaser.Math.DegToRad(12); // angular gap between shots
    const out = [];

    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2) * spread;
      const angle = baseAngle + offset;
      const p = group.get(x, y);
      if (p) {
        p.fire(this, angle, color);
        p.homeX = caster ? caster.x : x;
        p.homeY = caster ? caster.y : y;
        out.push(p);
      }
    }
    return out;
  }
}
