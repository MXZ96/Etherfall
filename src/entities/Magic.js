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
import { AreaSpell } from "./AreaSpell.js";

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
      pierce: def.pierce || 0,
      type: def.type || "projectile",
      areaRadius: def.areaRadius || 90,
      duration: def.duration || 3000,
      tickInterval: def.tickInterval || 400,
    };

    // --- Multipliers / additive bonuses driven by upgrades ---
    this.damageMult = 1;
    this.cooldownMult = 1;
    this.sizeMult = 1;
    this.durationMult = 1;
    this.areaRadiusMult = 1;

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

    // Effective area/lifecycle stats. These MUST be initialised here so the
    // spell lifecycle works before any upgrade recompute() runs (recompute()
    // is only invoked from applyUpgrade()).
    this.areaRadius = this.base.areaRadius;
    this.duration = this.base.duration;
    this.tickInterval = this.base.tickInterval;

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
    this.pierce = this.base.pierce;
    this.areaRadius = Math.max(10, this.base.areaRadius || 90);
    this.duration = Math.max(500, Math.round((this.base.duration || 3000) * this.durationMult));
    this.tickInterval = this.base.tickInterval;
  }

  /**
   * Spawn area spell effects around the caster.
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {number} color
   * @param {object} [followTarget] optional entity for the area to follow
   * @returns {AreaSpell[]}
   */
  createAreaSpells(scene, x, y, color, followTarget) {
    const out = [];
    const n = Math.max(1, this.projectileCount);
    for (let i = 0; i < n; i++) {
      out.push(new AreaSpell(scene, this, x, y, color, followTarget));
    }
    return out;
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
      case "areaRadius":
        this.areaRadiusMult = (this.areaRadiusMult || 1) + v / 100;
        this.base.areaRadius = Math.min(
          Math.round(this.base.areaRadius * this.areaRadiusMult),
          this.limits.maxAreaRadius || 200
        );
        break;
      case "duration":
        this.durationMult = this.durationMult + v / 100;
        break;
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
  createProjectiles(scene, group, x, y, tx, ty, color, caster, speedMult = 1) {
    const baseAngle = Math.atan2(ty - y, tx - x);
    const n = Math.max(1, this.projectileCount);
    const spread = Phaser.Math.DegToRad(12); // angular gap between shots
    const out = [];

    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2) * spread;
      const angle = baseAngle + offset;
      const p = group.get(x, y);
      if (p) {
        p.fire(this, angle, color, speedMult);
        p.homeX = caster ? caster.x : x;
        p.homeY = caster ? caster.y : y;
        out.push(p);
      }
    }
    return out;
  }
}

