/* ==========================================================================
   Etherfall - Spell Manager (multi-element auto-attack controller)
   Drives the player's automatic casting for ALL owned spells simultaneously.
   Each spell follows an explicit lifecycle state machine:

     READY → CAST → ACTIVE → (expires) → COOLDOWN → READY

   Projectile spells (Fireball) transition READY → COOLDOWN almost instantly.
   Area spells (Water Circle) stay ACTIVE for their full duration, then move
   to COOLDOWN only after they expire. Cooldown NEVER runs while a spell is
   active.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";
import { Magic } from "../entities/Magic.js";

const STATE_READY = "READY";
const STATE_ACTIVE = "ACTIVE";
const STATE_COOLDOWN = "COOLDOWN";

export class SpellManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {Player} player
   * @param {Phaser.Physics.Arcade.Group} projectiles  pooled projectile group
   * @param {Phaser.Physics.Arcade.Group} enemies       target group
   * @param {DamageSystem} damageSystem
   * @param {Object<string,number>} elementColors  element name -> tint number
   */
  constructor(scene, player, projectiles, enemies, damageSystem, elementColors) {
    this.scene = scene;
    this.player = player;
    this.projectiles = projectiles;
    this.enemies = enemies;
    this.damageSystem = damageSystem;
    this.elementColors = elementColors;

    const magicData = (scene.registry.get("data") || {}).magic?.magic || [];
    this.magics = magicData.map((d) => new Magic(d));

    this.magics.forEach((m) => {
      if ((m.def.starter || m.id === "fireball") && !m.locked) m.owned = true;
    });
    this.ownedMagics = this.magics.filter((m) => m.owned);

    this.spellStates = {}; // spellId -> { state, timer }
    this.cooldowns = {}; // spellId -> remaining ms (HUD/debug surface)

    this.areaActiveSpells = {}; // spellId -> true while an AreaSpell instance exists
  }

  /**
   * Handle an area spell expiring. Called via the global game bus so the
   * listener can be owned/cleaned by the RuntimeSystem (avoids leaking a
   * persistent listener across runs).
   * @param {string} spellId
   */
  handleSpellExpired(spellId) {
    delete this.areaActiveSpells[spellId];
  }

  /** Find a registered spell by id. */
  getMagicById(id) {
    return this.magics.find((m) => m.id === id) || null;
  }

  /** Current state string for a spell: READY | ACTIVE | COOLDOWN */
  getState(spellId) {
    const s = this.spellStates[spellId];
    if (!s) return STATE_READY;
    return s.state;
  }

  /** Remaining time in ms for the current state (duration if ACTIVE, cooldown if COOLDOWN). */
  getRemaining(spellId) {
    const s = this.spellStates[spellId];
    if (!s) return 0;
    if (s.state === STATE_READY) return 0;
    return Math.max(0, Math.round(s.timer));
  }

  /**
   * Debug snapshot for a spell's lifecycle (used by the F1 overlay).
   * @returns {{state:string, durationTimer:number, cooldownTimer:number, exists:boolean}}
   */
  getDebugInfo(spellId) {
    const s = this.spellStates[spellId];
    const state = s ? s.state : STATE_READY;
    const isArea = this.getMagicById(spellId)?.base.type === "area";
    return {
      state,
      durationTimer: state === STATE_ACTIVE ? Math.max(0, s.timer) : 0,
      cooldownTimer: Math.max(0, this.cooldowns[spellId] || 0),
      exists: isArea ? !!this.areaActiveSpells[spellId] : false,
    };
  }

  /** Advance every owned spell through its lifecycle; cast any that reach READY. */
  update(delta) {
    if (!this.player || !this.player.active) return;

    for (const spell of this.ownedMagics) {
      const id = spell.id;
      let s = this.spellStates[id];
      if (!s) {
        s = { state: STATE_READY, timer: 0 };
        this.spellStates[id] = s;
      }

      switch (s.state) {
        case STATE_READY: {
          const canCast = spell.base.type === "area"
            ? !this.areaActiveSpells[id]
            : true;
          if (canCast) {
            const success = this.tryCast(spell);
            if (success) {
              if (spell.base.type === "area") {
                this.areaActiveSpells[id] = true;
                s.state = STATE_ACTIVE;
                s.timer = spell.duration;
                this.cooldowns[id] = 0;
              } else {
                s.state = STATE_COOLDOWN;
                s.timer = spell.cooldown;
                this.cooldowns[id] = spell.cooldown;
              }
            }
          }
          break;
        }

        case STATE_ACTIVE: {
          s.timer -= delta;
          if (s.timer <= 0) {
            delete this.areaActiveSpells[id];
            s.state = STATE_COOLDOWN;
            s.timer = spell.cooldown;
            this.cooldowns[id] = spell.cooldown;
          } else {
            this.cooldowns[id] = 0;
          }
          break;
        }

        case STATE_COOLDOWN: {
          const remaining = (this.cooldowns[id] || 0) - delta;
          this.cooldowns[id] = Math.max(0, remaining);
          s.timer = this.cooldowns[id];

          if (this.cooldowns[id] <= 0) {
            s.state = STATE_READY;
            s.timer = 0;
          }
          break;
        }
      }
    }
  }

  /**
   * Attempt to cast one spell. Projectile spells require a valid target;
   * area spells always activate around the player.
   * @returns {boolean} true if the spell successfully activated
   */
  tryCast(spell) {
    if (!spell || !this.player.active) return false;

    const color = this.elementColors[spell.element] ?? 0xffffff;
    const speedMult = this.scene.weatherSystem
      ? this.scene.weatherSystem.getProjectileSpeedMult(spell.element)
      : 1;

    if (spell.base.type === "area") {
      const out = spell.createAreaSpells(
        this.scene,
        this.player.x,
        this.player.y,
        color,
        this.player
      );
      if (out.length) {
        this.scene.areaSpells = this.scene.areaSpells || [];
        if (this.scene.audio) this.scene.audio.playWaterCircleActivate();
      }
      out.forEach((a) => this.scene.areaSpells.push(a));
    } else {
      const target = this.findNearestEnemy();
      if (!target) return false;
      spell.createProjectiles(
        this.scene,
        this.projectiles,
        this.player.x,
        this.player.y,
        target.x,
        target.y,
        color,
        this.player,
        speedMult
      );
    }
    this.scene.game.events.emit(EVENTS.MAGIC_CASTED, spell);
    return true;
  }

  /** @returns {Enemy|null} nearest active enemy to the player. */
  findNearestEnemy() {
    let best = null;
    let bestDist = Infinity;
    const children = this.enemies.getChildren();
    const px = this.player.x;
    const py = this.player.y;

    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      if (!e.active) continue;
      const d = (e.x - px) * (e.x - px) + (e.y - py) * (e.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }
}
