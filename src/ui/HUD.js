/* ==========================================================================
   Etherfall - HUD (Heads-Up Display)
   Minimal, dark-fantasy overlay fixed to the camera.

      Top-left  : HP bar, EXP bar, Level
      Top-right : Run timer, Enemy count
      Top-center: owned spells (name, level, projectile count, cooldown)
      Debug (F1): FPS, player position, level, EXP, enemy count, spell build

   Reads values pushed in via update(); holds no game logic. Layout uses the
   base 1280x720 resolution so it scales with the FIT scale manager.
   ========================================================================== */

import { GAME } from "../config/constants.js";
import { clamp } from "../utils/math.js";

const MARGIN = 16;
const BAR_W = 240;

// Element -> emoji for the magic HUD badge.
const ELEMENT_EMOJI = {
  fire: "🔥",
  water: "💧",
  air: "🌬",
  earth: "⛰",
  spirit: "✨",
};

// Element -> emoji/name for the affinity (elemental progression) HUD list.
const AFFINITY_EMOJI = {
  fire: "🔥",
  water: "🌊",
  air: "🌪",
  earth: "🌍",
  spirit: "👻",
};

const AFFINITY_NAMES = {
  fire: "Fire",
  water: "Water",
  air: "Air",
  earth: "Earth",
  spirit: "Spirit",
};

export class HUD {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    // Drawn every frame (bars).
    this.gfx = scene.add.graphics();
    this.gfx.setScrollFactor(0).setDepth(1000);

    const base = {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#e6e8ef",
    };
    const right = { ...base, align: "right" };

    // Top-left texts
    this.hpText = scene.add.text(MARGIN, 4, "", base)
      .setScrollFactor(0).setDepth(1001);
    this.levelText = scene.add.text(MARGIN, 66, "", { ...base, fontSize: "16px", color: "#9d86ff" })
      .setScrollFactor(0).setDepth(1001);

    // Dash status (under the level text).
    this.dashText = scene.add.text(MARGIN, 90, "", { ...base, fontSize: "14px", color: "#7fd4ff" })
      .setScrollFactor(0).setDepth(1001);

    // Top-right texts (right-aligned to the screen edge)
    const rx = GAME.WIDTH - MARGIN;
    this.timerText = scene.add.text(rx, 8, "", right)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(1001);
    this.enemyText = scene.add.text(rx, 32, "", right)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(1001);

    // Top-center: owned spells list (multi-slot ready).
    const cx = GAME.WIDTH / 2;
    this.spellsText = scene.add.text(cx, 6, "", {
      ...base,
      fontSize: "15px",
      color: "#ffd9a0",
      align: "center",
      lineSpacing: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1001);

    // Bottom-left: elemental affinity progression (one row per element).
    this.affinityText = scene.add.text(MARGIN, GAME.HEIGHT - 196, "", {
      ...base,
      fontSize: "14px",
      color: "#c3c8d4",
      lineSpacing: 4,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(1001);

    // Bottom-left: weather status.
    this.weatherText = scene.add.text(MARGIN, GAME.HEIGHT - 64, "", {
      ...base,
      fontSize: "12px",
      color: "#8a8f9c",
      lineSpacing: 2,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(1001);

    // Debug block (hidden until F1 toggles debug mode)
    this.debugText = scene.add.text(MARGIN, 100, "", {
      ...base,
      fontSize: "13px",
      color: "#8a8f9c",
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(1001).setVisible(false);
  }

  /**
   * Push current values to the HUD.
   * @param {object} s {
   *   hp, maxHp, level, exp, expRequired, expProgress(0..1),
   *   fps, timeMs, enemyCount, playerX, playerY, debug,
   *   spells: [{name, element, level, projectileCount, active, ready, cdMs}],
   *   activeUpgrades: string[]
   * }
   */
  update(s) {
    const g = this.gfx;
    g.clear();

    const hpY = 22;
    const expY = 50;

    // --- HP bar ---
    const hpRatio = clamp(s.hp / s.maxHp, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(MARGIN, hpY, BAR_W, 16, 4);
    g.fillStyle(0xc0392b, 1);
    g.fillRoundedRect(MARGIN, hpY, BAR_W * hpRatio, 16, 4);
    g.lineStyle(1, 0x7b5cff, 0.6);
    g.strokeRoundedRect(MARGIN, hpY, BAR_W, 16, 4);

    // --- EXP bar ---
    const expRatio = clamp(s.expProgress, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(MARGIN, expY, BAR_W, 8, 3);
    g.fillStyle(0x4aa3ff, 1);
    g.fillRoundedRect(MARGIN, expY, BAR_W * expRatio, 8, 3);

    // --- Top-left text ---
    this.hpText.setText(`HP ${Math.ceil(s.hp)} / ${s.maxHp}`);
    this.levelText.setText(`LVL ${s.level}`);
    this.dashText.setText(this.formatDash(s));

    // --- Top-right text ---
    this.timerText.setText(`TIME ${this.formatTime(s.timeMs)}`);
    this.enemyText.setText(`ENEMIES ${s.enemyCount}`);

    // --- Top-center: owned spells ---
    this.spellsText.setText(this.formatSpells(s.spells));

    // --- Bottom-left: elemental affinity ---
    this.affinityText.setText(this.formatAffinities(s.affinities));

    // --- Bottom-left: weather ---
    this.weatherText.setText(this.formatWeather(s.weatherId));

    // --- Debug block (F1) ---
    this.debugText.setVisible(!!s.debug);
    if (s.debug) {
      this.debugText.setText(this.formatDebug(s));
    }
  }

  /** Render the dash status (SPACE): ready, on cooldown, or dashing. */
  formatDash(s) {
    if (!s) return "";
    if (s.dashActive) return "DASH ►";
    if (s.dashReady) return "DASH READY";
    const secs = ((s.dashCdMs || 0) / 1000).toFixed(1);
    return `DASH ${secs}s`;
  }

  /** Render the owned-spell list (name, state, cooldown/duration). */
  formatSpells(spells) {
    if (!spells || spells.length === 0) return "—";
    return spells
      .map((sp) => {
        const emoji = ELEMENT_EMOJI[sp.element] || "✨";
        const mark = sp.awakened ? " ✦" : "";
        const base = `${emoji} ${sp.name} Lv${sp.level}${mark}`;

        let status = "";
        if (sp.state === "ACTIVE") {
          status = "ACTIVE";
        } else if (sp.state === "COOLDOWN") {
          status = (sp.remainingMs / 1000).toFixed(1) + "s";
        } else {
          status = "Ready";
        }

        return `${base}  (${status})`;
      })
      .join("\n");
  }

  /** Render the elemental affinity list (e.g. 🔥 Fire Lv12 ✦ / 🌊 Water Lv4). */
  formatAffinities(affinities) {
    if (!affinities || affinities.length === 0) return "";
    const visible = affinities.filter((a) => !a.hidden);
    if (visible.length === 0) return "";
    return visible
      .map((a) => {
        const emoji = AFFINITY_EMOJI[a.id] || "✨";
        const name = AFFINITY_NAMES[a.id] || a.id;
        const status = a.unlocked ? `Lv${a.level}` : "Locked";
        const mark = a.awakened ? " ✦" : "";
        return `${emoji} ${name} ${status}${mark}`;
      })
      .join("\n");
  }

  /** Render the F1 debug block including the current spell build. */
  formatDebug(s) {
    const mults = (s.spellMults || [])
      .map((m) => `  ${m.name}: dmg x${m.dmgMult.toFixed(2)} cd x${m.cdMult.toFixed(2)} size x${m.sizeMult.toFixed(2)}`)
      .join("\n");
    const upgrades = (s.activeUpgrades && s.activeUpgrades.length)
      ? s.activeUpgrades.join(", ")
      : "none";
    const enemyScale = s.enemyScale != null ? s.enemyScale.toFixed(2) : "1.00";
    const aff = (s.affinities || [])
      .map((a) => {
        const name = AFFINITY_NAMES[a.id] || a.id;
        if (a.id === "spirit") return `  ${name}: ${a.locked ? "LOCKED" : a.unlocked ? `Lv${a.level}` : "hidden"}`;
        return `  ${name}: Lv${a.level}`;
      })
      .join("\n");
    const codex = (s.codexCategories || [])
      .map((c) => `  ${c.cat}: ${c.discovered}/${c.total} (${Math.round(c.pct * 100)}%)`)
      .join("\n");
    const overall = s.codexOverall != null ? `${Math.round(s.codexOverall * 100)}%` : "0%";

    const spellStates = (s.spells || [])
      .map((sp) => {
        const state = sp.state || "READY";
        const remaining = sp.remainingMs != null ? `${Math.round(sp.remainingMs)}ms` : "—";
        return `  ${sp.name} [${sp.element}]: ${state}  Remaining: ${remaining}`;
      })
      .join("\n") || "  none";

    const cooldowns = (s.spells || [])
      .map((sp) => `  ${sp.name}: ${sp.state === "COOLDOWN" ? `${(sp.remainingMs / 1000).toFixed(1)}s` : sp.state === "ACTIVE" ? "Active" : "Ready"}`)
      .join("\n") || "  none";

    const awakened = (s.awakenedElements && s.awakenedElements.length)
      ? s.awakenedElements.join(", ")
      : "none";
    const burn = s.burnActive != null ? s.burnActive : 0;
    const ready = s.awakeningReady ? "YES" : "no";
    const projBehaviors = (s.projectiles > 0) ? "Standard" : "None";
    const areaStatus = (s.areaSpellStatus || []).join("\n") || "  none";
    const wc = s.waterCircleDebug || { state: "READY", durationTimer: 0, cooldownTimer: 0, exists: false };
    return (
      `FPS ${s.fps}\n` +
      `ENTITY ${s.entityCount}\n` +
      `ENEMIES ${s.enemyCount}\n` +
      `PROJECTILES ${s.projectiles}  (${projBehaviors})\n` +
      `AREA SPELLS\n${areaStatus}\n` +
      `WATER CIRCLE (water_circle)\n` +
      `  State: ${wc.state}\n` +
      `  Duration Timer: ${Math.round(wc.durationTimer)}ms\n` +
      `  Cooldown Timer: ${Math.round(wc.cooldownTimer)}ms\n` +
      `  Water Circle Exists: ${wc.exists ? "True" : "False"}\n` +
      `SPELL STATES\n${spellStates}\n` +
      `SPELL COOLDOWNS\n${cooldowns}\n` +
      `CHAR LVL ${s.level}\n` +
      `EXP ${s.exp} / ${s.expRequired}\n` +
      `POS ${Math.round(s.playerX)}, ${Math.round(s.playerY)}\n` +
      `VEL ${s.velX}, ${s.velY}\n` +
      `COLLISION ${s.colliding ? "INVULN" : "clear"}\n` +
      `AWAKENED ${awakened}\n` +
      `BURN ACTIVE ${burn}\n` +
      `AWAKEN READY ${ready}\n` +
      `SPELL MULTS\n${mults}\n` +
      `UPGRADE STACKS ${upgrades}\n` +
      `CODEX\n${codex}\n` +
      `OVERALL ${overall}`
    );
  }

  /** Format milliseconds as mm:ss. */
  formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  /** Format current weather for the HUD. */
  formatWeather(weatherId) {
    if (!weatherId) return "";
    const name = weatherId.charAt(0).toUpperCase() + weatherId.slice(1).replace(/_/g, " ");
    return `Weather: ${name}`;
  }
}
