/* ==========================================================================
   Etherfall - Game Scene
   The playable core. Owns the world ("The Forgotten Meadow"), player, enemies,
   camera, HUD and the level-up flow. This is v0.0.4: the player AUTO-CASTS
   magic (Fireball) at the nearest enemy; projectiles deal elemental damage,
   enemies separate like a swarm, deal contact damage, and die (HP -> EXP).

   Systems used:
     - InputManager   : movement + pause input
     - LevelSystem    : EXP / level progression
     - EnemyManager   : data-driven spawning + lifecycle
     - DamageSystem   : unified applyDamage() for player + enemies
     - HUD / LevelUpUI: presentation
   Persistent managers (save/settings/audio) come from the registry. World +
   enemy definitions come from data/*.json via the registry.
   ========================================================================== */

import * as Phaser from "phaser";
import {
  CAMERA,
  SCENES,
  WORLD,
  TEXTURE_KEYS,
  COMBAT,
  PROJECTILE_POOL,
} from "../config/constants.js";
import { EVENTS } from "../utils/events.js";
import { Player } from "../entities/Player.js";
import { Enemy } from "../entities/Enemy.js";
import { Projectile } from "../entities/Projectile.js";
import { EnemyManager } from "../entities/EnemyManager.js";
import { InputManager } from "../managers/InputManager.js";
import { LevelSystem } from "../systems/LevelSystem.js";
import { DamageSystem } from "../systems/DamageSystem.js";
import { MagicSystem } from "../systems/MagicSystem.js";
import { UpgradeSystem } from "../systems/UpgradeSystem.js";
import { AffinitySystem } from "../systems/AffinitySystem.js";
import { SpellPoolSystem } from "../systems/SpellPoolSystem.js";
import { CodexSystem } from "../systems/CodexSystem.js";
import { DiscoveryEventUI } from "../ui/DiscoveryEventUI.js";
import { HUD } from "../ui/HUD.js";
import { LevelUpUI } from "../ui/LevelUpUI.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super(SCENES.GAME);
  }

  create() {
    // --- Shared managers ---
    this.save = this.registry.get("save");
    this.settings = this.registry.get("settings");
    this.audio = this.registry.get("audio");

    // --- Content from data/*.json ---
    const data = this.registry.get("data") || {};
    const mapDef =
      (data.maps && data.maps.maps && data.maps.maps[0]) ||
      { width: WORLD.WIDTH, height: WORLD.HEIGHT, background: TEXTURE_KEYS.GRASS };
    const playerDef = data.player || {};
    this.enemyDefs = {};
    (data.enemy?.enemies || []).forEach((d) => {
      this.enemyDefs[d.name] = d;
    });

    // Element -> tint colour lookup (from data/elements.json).
    this.elementColors = {};
    const elementData = (data.elements && data.elements.elements) || {};
    for (const key in elementData) {
      const c = Phaser.Display.Color.HexStringToColor(elementData[key].color);
      this.elementColors[key] = c.color;
    }

    // Status-effect lookup (id -> definition) from data/status_effect.json.
    // Used by the burn-on-hit upgrade (Fireball's "Burn Chance").
    this.statusEffects = {};
    (data.status_effect?.statusEffects || []).forEach((s) => {
      this.statusEffects[s.id] = s;
    });

    // --- World (large bounded arena) ---
    const worldW = mapDef.width || WORLD.WIDTH;
    const worldH = mapDef.height || WORLD.HEIGHT;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.add
      .tileSprite(0, 0, worldW, worldH, mapDef.background || TEXTURE_KEYS.GRASS)
      .setOrigin(0)
      .setDepth(-10);

    // --- Player (spawned at world centre) ---
    this.player = new Player(this, worldW / 2, worldH / 2);

    // --- Camera (follows player, keeps them centred; zoom-ready) ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.player, true, CAMERA.LERP, CAMERA.LERP);
    cam.setZoom(CAMERA.ZOOM);

    // --- Input ---
    this.inputMgr = new InputManager(this);

    // --- Progression (start from player.json) ---
    this.levelSystem = new LevelSystem(
      this.game,
      playerDef.level || 1,
      playerDef.experience || 0
    );

    // --- Enemies (physics group = pooling + overlap target) ---
    this.enemies = this.physics.add.group({
      classType: Enemy,
      runChildUpdate: false,
      maxSize: 300,
    });
    this.enemyManager = new EnemyManager(this, this.player, this.enemies, this.enemyDefs);
    this.enemyManager.setLevel(this.levelSystem.getLevel());

    // --- Combat ---
    this.damageSystem = new DamageSystem(this.game);

    // Enemy-vs-enemy separation: a physics collider (broadphase-backed, so it
    // scales to hundreds of entities) stops them stacking into one blob and
    // makes them flow around each other like a swarm.
    this.physics.add.collider(this.enemies, this.enemies);

    // Player vs enemies overlap (contact damage both ways).
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.onPlayerEnemyOverlap,
      null,
      this
    );

    // --- Projectiles (pooled magic shots) + auto-attack ---
    this.projectiles = this.physics.add.group({
      classType: Projectile,
      runChildUpdate: false,
      maxSize: PROJECTILE_POOL,
    });
    this.magicSystem = new MagicSystem(
      this,
      this.player,
      this.projectiles,
      this.enemies,
      this.damageSystem,
      this.elementColors
    );
    // Projectile vs enemy overlap: damage + hit effect, then despawn shot.
    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      this.onProjectileHitEnemy,
      null,
      this
    );

    // --- Spell progression (level-up upgrades) ---
    this.upgradeSystem = new UpgradeSystem(this, data, this.magicSystem);

    // --- Spell pool (known / hidden / locked) ---
    this.spellPool = new SpellPoolSystem(this, data, this.magicSystem);
    this.syncSpellPool();

    // --- Elemental progression (affinity) ---
    this.affinitySystem = new AffinitySystem(this, data);

    // --- Codex (discovery tracker) ---
    this.codex = new CodexSystem(this, this.save, data);
    this.registry.set("codex", this.codex);

    // --- Discovery toasts ---
    this.discoveryUI = new DiscoveryEventUI(this);

    // --- UI ---
    this.hud = new HUD(this);
    this.levelUpUI = new LevelUpUI(this);

    // --- Debug: F1 toggles the debug overlay; E grants EXP (testing) ---
    this.debug = false;
    this.debugKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
    this.debugExpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // --- State flags ---
    this.leveling = false; // a level-up overlay is open
    this.runTime = 0; // ms of active play
    this.damageEvents = 0; // debug counter

    // --- Event wiring ---
    this.game.events.on(EVENTS.LEVEL_UP, this.onLevelUp, this);
    this.game.events.on(EVENTS.PLAYER_DIED, this.onPlayerDied, this);
    this.game.events.on(EVENTS.ENTITY_DIED, this.onEntityDied, this);
    this.game.events.on(EVENTS.DAMAGE_DEALT, this.onDamageDealt, this);
    this.game.events.on(EVENTS.AFFINITY_LEVELED, this.onAffinityLeveled, this);
    this.game.events.on(EVENTS.AFFINITY_UNLOCKED, this.onAffinityUnlocked, this);
    this.game.events.on(EVENTS.MAGIC_CASTED, this.onMagicCasted, this);
    this.game.events.on(EVENTS.SPELL_UNLOCKED, this.onSpellUnlocked, this);
    this.game.events.on(EVENTS.SPELL_DISCOVERED, this.onSpellDiscovered, this);
    this.game.events.on(EVENTS.ELEMENT_DISCOVERED, this.onElementDiscovered, this);
    this.game.events.on(EVENTS.ENEMY_DISCOVERED, this.onEnemyDiscovered, this);
    this.events.once("shutdown", this.onShutdown, this);
  }

  update(time, delta) {
    // Advance the run timer only while actively playing.
    if (!this.leveling) this.runTime += delta;

    // HUD always reflects current state.
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      level: this.levelSystem.getLevel(),
      exp: this.levelSystem.getExp(),
      expRequired: this.levelSystem.getThreshold(),
      expProgress: this.levelSystem.getProgress(),
      fps: Math.round(this.game.loop.actualFps),
      timeMs: this.runTime,
      enemyCount: this.enemyManager.getActiveCount(),
      entityCount: this.enemyManager.getActiveCount() + 1,
      playerHp: this.player.hp,
      playerX: this.player.x,
      playerY: this.player.y,
      velX: Math.round(this.player.body.velocity.x),
      velY: Math.round(this.player.body.velocity.y),
      colliding: this.player.isInvincible(),
      // Magic / projectiles (HUD + debug)
      magicName: this.magicSystem.activeName,
      magicElement: this.magicSystem.active ? this.magicSystem.active.element : "",
      magicReady: this.magicSystem.isReady,
      magicCdMs: this.magicSystem.cooldownRemaining,
      projectiles: this.projectiles.countActive(true),
      damageEvents: this.damageEvents,
      debug: this.debug,
      // Owned spells (multi-slot ready) for the HUD spell list
      spells: this.magicSystem.ownedMagics.map((m) => ({
        id: m.id,
        name: m.name,
        element: m.element,
        level: m.level,
        projectileCount: m.projectileCount,
        active: m === this.magicSystem.active,
        ready: m === this.magicSystem.active ? this.magicSystem.isReady : true,
        cdMs: m === this.magicSystem.active ? this.magicSystem.cooldownRemaining : 0,
      })),
      // Debug-only build info
      activeUpgrades: this.upgradeSystem.getActiveUpgrades().map((u) => u.name),
      upgradeStacks: this.upgradeSystem.getActiveUpgradeSummary(),
      enemyScale: this.enemyManager.getScale(),
      spellMults: this.magicSystem.ownedMagics.map((m) => ({
        name: m.name,
        dmgMult: m.damageMult,
        cdMult: m.cooldownMult,
        sizeMult: m.sizeMult,
      })),
      // Elemental progression (affinity) for the HUD list + debug
      affinities: this.affinitySystem.list().map((e) => ({
        id: e.id,
        level: e.level,
        maxLevel: e.maxLevel,
        unlocked: e.unlocked,
        locked: e.locked,
        hidden: e.hidden,
      })),
      // Codex completion for debug
      codexOverall: this.codex ? this.codex.getOverallCompletion() : 0,
      codexCategories: this.codex
        ? this.codex.getAvailableCategories().map((cat) => ({
            cat,
            discovered: this.codex.countDiscovered(cat),
            total: this.codex.countTotal(cat),
            pct: this.codex.getCompletion(cat),
          }))
        : [],
      codexKnownSpells: this.spellPool
        ? this.spellPool.getKnownSpellIds().map((id) => this.spellPool.get(id)?.name || id)
        : [],
      codexLockedSpells: this.spellPool
        ? this.spellPool.list().filter((e) => e.status === "locked").map((e) => e.name)
        : [],
      codexDiscoveredEnemies: this.codex ? this.codex.getDiscovered("enemies") : [],
    });

    // While a level-up overlay is open the world is frozen.
    if (this.leveling) return;

    // Pause toggle.
    if (this.inputMgr.isPauseJustDown()) {
      this.openPause();
      return;
    }

    // Debug toggles.
    if (Phaser.Input.Keyboard.JustDown(this.debugKey)) this.debug = !this.debug;
    if (Phaser.Input.Keyboard.JustDown(this.debugExpKey)) this.levelSystem.gainExp(60);

    // Player movement (eased).
    const v = this.inputMgr.getMoveVector();
    this.player.setMoveInput(v);
    this.player.tick(delta);

    // Enemy spawning + movement.
    this.enemyManager.update(delta);
    const children = this.enemies.getChildren();
    const now = this.time.now;
    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      if (!e.active) continue;
      e.tick();
      // Burn status (Damage-over-Time) ticking.
      if (e.burn && now < e.burn.until) {
        if (now >= e.burn.nextTick) {
          e.burn.nextTick = now + 500;
          this.damageSystem.applyDamage(e, e.burn.tickDamage, {
            type: "status",
            element: e.burn.element,
            source: null,
          });
        }
      } else if (e.burn) {
        e.burn = null;
      }
    }

    // Auto-attack magic + projectile movement.
    this.magicSystem.update(delta);
    const pchildren = this.projectiles.getChildren();
    for (let i = 0; i < pchildren.length; i++) {
      if (pchildren[i].active) pchildren[i].tick(delta);
    }
  }

  // ------------------------------------------------------------------------
  // Combat (v0.0.3 foundation)
  // ------------------------------------------------------------------------
  /**
   * Player <-> enemy contact. Both directions use the unified DamageSystem:
   *  - The enemy deals contact damage to the player (gated by i-frames, plus a
   *    small screen shake and knockback away from the enemy).
   *  - The player deals throttled contact damage back, so swarms can be worn
   *    down until the real magic/projectile combat system arrives.
   */
  onPlayerEnemyOverlap(player, enemy) {
    if (!enemy.active || this.leveling) return;
    const now = this.time.now;

    // Enemy -> Player (i-frames gate the hit).
    if (enemy.damage > 0 && !player.isInvincible()) {
      this.damageSystem.applyDamage(player, enemy.damage, {
        type: "physical",
        source: enemy,
      });
      player.startInvincibility(COMBAT.PLAYER_IFRAME_MS);
      player.applyKnockback(enemy.x, enemy.y, COMBAT.KNOCKBACK_FORCE);
      this.cameras.main.shake(80, 0.004); // small screen feedback
      this.game.events.emit(EVENTS.PLAYER_DAMAGED, player);
    }

    // Player -> Enemy (throttled per enemy via damageCooldown). Kept as a
    // fallback melee so swarms still hurt even with no spell equipped.
    if (now - enemy.lastContact >= player.damageCooldown) {
      enemy.lastContact = now;
      this.damageSystem.applyDamage(enemy, player.contactDamage, {
        type: "physical",
        source: player,
      });
    }
  }

  /**
   * Projectile hit an enemy: apply elemental damage via the unified
   * DamageSystem, then resolve any upgrade behaviours (burn / explode /
   * return) before returning the projectile to the pool.
   */
  onProjectileHitEnemy(projectile, enemy) {
    if (!projectile.active || !enemy.active) return;
    if (projectile.hasHit(enemy)) return; // returning shots strike each enemy once
    projectile.markHit(enemy);

    // Affinity bonus: Fire Lv10+ adds a damage multiplier to that element.
    const affMult = this.affinitySystem.getDamageMultiplier(projectile.element);
    const dmg = Math.max(1, Math.round(projectile.damage * affMult));

    const color = this.elementColors[projectile.element] ?? 0xffffff;
    this.damageSystem.applyDamage(enemy, dmg, {
      type: "element",
      element: projectile.element,
      source: projectile,
    });
    this.spawnHitEffect(enemy.x, enemy.y, color);

    // Burn: from the Burn Chance upgrade OR the Fire Lv20 affinity milestone.
    const burnChance = Math.max(
      projectile.burnChance,
      this.affinitySystem.getBurnChance(projectile.element)
    );
    if (burnChance > 0 && Math.random() < burnChance) {
      this.applyBurn(enemy, projectile.element);
    }

    // Inferno Shot upgrade: detonate, damaging everything nearby.
    if (projectile.explode) {
      this.explodeAt(enemy.x, enemy.y, projectile, affMult);
      projectile.despawn();
      return;
    }

    // Phoenix Core upgrade: boomerang back to the caster (one return trip).
    if (projectile.returning) {
      if (projectile.returnToCaster()) {
        return; // still flying (on the way back)
      }
      projectile.despawn();
      return;
    }

    projectile.despawn();
  }

  /** Apply a burn status effect to an enemy (driven by data/status_effect.json). */
  applyBurn(enemy, element) {
    const def = this.statusEffects.burn;
    if (!def || !enemy.active) return;
    enemy.burn = {
      until: this.time.now + (def.duration || 3000),
      nextTick: this.time.now + 500,
      tickDamage: def.tickDamage || 2,
      element,
    };
  }

  /** AoE detonation for the Inferno Shot upgrade. */
  explodeAt(x, y, projectile, affMult = 1) {
    const radius = 90;
    const color = this.elementColors[projectile.element] ?? 0xffffff;
    const splash = Math.max(1, Math.round(projectile.damage * 0.6 * affMult));
    const children = this.enemies.getChildren();
    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      if (!e.active || e === projectile) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= radius * radius) {
        this.damageSystem.applyDamage(e, splash, {
          type: "element",
          element: projectile.element,
          source: projectile,
        });
      }
    }
    const burst = this.add.circle(x, y, radius, color, 0.5)
      .setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: burst,
      scale: 1.4,
      alpha: 0,
      duration: 260,
      onComplete: () => burst.destroy(),
    });
  }

  /** Damage feedback: count events + float a coloured "-N" number. */
  onDamageDealt(target, dealt, source) {
    this.damageEvents++;
    const color = (source && source.element && this.elementColors[source.element]) || 0xffffff;
    this.spawnDamageNumber(target.x, target.y - (target.radius || 16) - 6, dealt, color);
  }

  /** Floating damage number that rises and fades. */
  spawnDamageNumber(x, y, amount, color) {
    const t = this.add
      .text(x, y, `-${amount}`, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setTint(color);
    this.tweens.add({
      targets: t,
      y: y - 28,
      alpha: 0,
      duration: 600,
      onComplete: () => t.destroy(),
    });
  }

  /** Small additive burst where a projectile connects. */
  spawnHitEffect(x, y, color) {
    const burst = this.add
      .circle(x, y, 12, color, 0.8)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: burst,
      scale: 0,
      alpha: 0,
      duration: 200,
      onComplete: () => burst.destroy(),
    });
  }

  /**
   * Any entity died (emitted by DamageSystem). The player's death is handled
   * separately via PLAYER_DIED; here we award EXP + spawn a death effect for
   * enemies. Elemental kills also grant AFFINITY EXP to that element (a fraction
   * of the enemy's EXP reward) — separate from character progression.
   */
  onEntityDied(entity, source) {
    if (entity === this.player) return; // player death -> GameOver
    const reward = entity.experienceReward || 0;
    this.levelSystem.gainExp(reward);
    // Affinity EXP: half the enemy's EXP, attributed to the killing element.
    if (source && source.element && this.affinitySystem.elements[source.element]) {
      this.affinitySystem.grantExp(source.element, Math.ceil(reward / 2));
    }
    // Codex: discover enemy on first kill.
    if (this.codex && entity.def && entity.def.name) {
      this.codex.discover("enemies", entity.def.name);
    }
    this.spawnDeathEffect(entity.x, entity.y);
  }

  /** Lightweight death effect: a quick fading, shrinking burst. */
  spawnDeathEffect(x, y) {
    const burst = this.add.circle(x, y, 14, 0xb8344a, 0.85).setDepth(4);
    this.tweens.add({
      targets: burst,
      scale: 0,
      alpha: 0,
      duration: 240,
      onComplete: () => burst.destroy(),
    });
  }

  // ------------------------------------------------------------------------
  // Level-up flow
  // ------------------------------------------------------------------------
  onLevelUp(level) {
    this.leveling = true;
    this.physics.world.pause(); // freeze all bodies
    this.save.patchSection("player", { level });

    // Roll level-up choices. Categories are prepared (see below) but only the
    // spell-upgrade category is active this version; the structure already
    // supports future "unlock element" / "increase affinity" choices.
    const choices = this.rollLevelUpChoices();

    this.levelUpUI.show(level, choices, (choice) => {
      this.applyLevelUpChoice(choice);
      this.onLevelUpContinue();
    });
  }

  /**
   * Build the level-up choice list. Each choice carries a `category` so the UI
   * and apply logic can branch later. Currently only `spell` choices exist.
   *
   * Future (prepared, not implemented):
   *   - category "affinity": raise an element's affinity level
   *   - category "unlock":   unlock a locked element via unlockElement()
   */
  rollLevelUpChoices() {
    const spellChoices = this.upgradeSystem.rollChoices(3).map((u) => ({
      category: "spell",
      upgrade: u,
      name: u.name,
      rarity: u.rarity,
      rarityName: this.upgradeSystem.rarityMeta(u.rarity).name,
      rarityColor: this.upgradeSystem.rarityMeta(u.rarity).color,
      spell: u.spell,
      element: this.magicSystem.getMagicById(u.spell)?.element || "fire",
      spellName: this.magicSystem.getMagicById(u.spell)?.name || u.spell,
      desc: this.upgradeSystem.describe(u, this.upgradeSystem.getStacks(u.id)),
    }));

    // Placeholder hooks for future categories (return [] until implemented).
    const affinityChoices = this.rollAffinityChoices(); // [] for now
    const unlockChoices = this.rollUnlockChoices(); // [] for now

    return [...spellChoices, ...affinityChoices, ...unlockChoices];
  }

  /** Future: choices that raise an element's affinity. Returns [] for now. */
  rollAffinityChoices() {
    return [];
  }

  /** Future: choices that unlock a locked element. Returns [] for now. */
  rollUnlockChoices() {
    return [];
  }

  /** Apply a chosen level-up card. Branches on its category. */
  applyLevelUpChoice(choice) {
    if (!choice) return;
    if (choice.category === "spell" && choice.upgrade) {
      this.upgradeSystem.applyUpgrade(choice.upgrade);
    }
    // affinity / unlock categories handled here in a future version.
  }

  onLevelUpContinue() {
    this.leveling = false;
    this.physics.world.resume();
    this.enemyManager.setLevel(this.levelSystem.getLevel());
  }

  // ------------------------------------------------------------------------
  // Pause / death
  // ------------------------------------------------------------------------
  openPause() {
    if (this.leveling) return;
    this.scene.launch(SCENES.PAUSE);
    this.scene.pause();
  }

  onPlayerDied() {
    this.scene.start(SCENES.GAME_OVER, { level: this.levelSystem.getLevel() });
  }

  /** Brief on-screen notice when an element affinity levels up. */
  onAffinityLeveled(id, level) {
    const name = id.charAt(0).toUpperCase() + id.slice(1);
    const label = `${name} Affinity Lv${level}`;
    const t = this.add
      .text(this.scale.width / 2, 120, label, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "20px",
        color: "#ffb347",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1500);
    this.tweens.add({
      targets: t,
      y: 96,
      alpha: 0,
      duration: 1400,
      onComplete: () => t.destroy(),
    });
  }

  // ------------------------------------------------------------------------
  // Spell Pool
  // ------------------------------------------------------------------------
  syncSpellPool() {
    const known = this.spellPool.getKnownSpellIds();
    this.magicSystem.magics.forEach((m) => {
      m.owned = known.includes(m.id) && !m.locked;
    });
    this.magicSystem.ownedMagics = this.magicSystem.magics.filter((m) => m.owned);
    if (this.magicSystem.ownedMagics.length === 0 && this.magicSystem.magics.length > 0) {
      this.magicSystem.activeIndex = 0;
      this.magicSystem.active = this.magicSystem.magics[0];
    }
  }

  // ------------------------------------------------------------------------
  // Auto-discovery hooks
  // ------------------------------------------------------------------------
  onMagicCasted(magic) {
    if (magic && this.codex) {
      this.codex.discover("spells", magic.id);
    }
  }

  onSpellUnlocked(spellId) {
    this.syncSpellPool();
    if (this.codex) {
      this.codex.discover("spells", spellId);
    }
  }

  onSpellDiscovered(spellId) {
    const entry = this.spellPool.get(spellId);
    const name = entry ? entry.name : spellId;
    this.discoveryUI.show("NEW SPELL DISCOVERED", name);
  }

  onAffinityUnlocked(elementId) {
    if (this.codex) {
      this.codex.discover("elements", elementId);
    }
  }

  onElementDiscovered(elementId) {
    const name = elementId.charAt(0).toUpperCase() + elementId.slice(1);
    this.discoveryUI.show("NEW ELEMENT DISCOVERED", name);
  }

  onEnemyDiscovered(enemyName) {
    this.discoveryUI.show("NEW ENEMY DISCOVERED", enemyName);
  }

  /** Clean up global listeners so restarts don't double-bind. */
  onShutdown() {
    this.game.events.off(EVENTS.LEVEL_UP, this.onLevelUp, this);
    this.game.events.off(EVENTS.PLAYER_DIED, this.onPlayerDied, this);
    this.game.events.off(EVENTS.ENTITY_DIED, this.onEntityDied, this);
    this.game.events.off(EVENTS.DAMAGE_DEALT, this.onDamageDealt, this);
    this.game.events.off(EVENTS.AFFINITY_LEVELED, this.onAffinityLeveled, this);
    this.game.events.off(EVENTS.AFFINITY_UNLOCKED, this.onAffinityUnlocked, this);
    this.game.events.off(EVENTS.MAGIC_CASTED, this.onMagicCasted, this);
    this.game.events.off(EVENTS.SPELL_UNLOCKED, this.onSpellUnlocked, this);
    this.game.events.off(EVENTS.SPELL_DISCOVERED, this.onSpellDiscovered, this);
    this.game.events.off(EVENTS.ELEMENT_DISCOVERED, this.onElementDiscovered, this);
    this.game.events.off(EVENTS.ENEMY_DISCOVERED, this.onEnemyDiscovered, this);
  }
}
