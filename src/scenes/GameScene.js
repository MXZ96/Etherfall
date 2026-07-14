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
  GAME,
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
import { SpellManager } from "../systems/SpellManager.js";
import { UpgradeSystem } from "../systems/UpgradeSystem.js";
import { AffinitySystem } from "../systems/AffinitySystem.js";
import { SpellPoolSystem } from "../systems/SpellPoolSystem.js";
import { CodexSystem } from "../systems/CodexSystem.js";
import { AwakeningSystem } from "../systems/AwakeningSystem.js";
import { WeatherSystem } from "../systems/WeatherSystem.js";
import { WorldTreeSystem } from "../systems/WorldTreeSystem.js";
import { RuntimeSystem } from "../systems/RuntimeSystem.js";
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

    // --- Runtime lifecycle (v0.1.0) ---
    // Owns ONLY temporary run data. The permanent SaveSystem is passed in as a
    // read-only anchor so the two systems never mix. Everything created below
    // is registered with it and torn down on shutdown (see cleanupRun()).
    this.runtime = new RuntimeSystem(this, this.save);

    // Guarantee every run begins in an identical runtime state.
    this.resetRuntimeState();
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
    this.enemies = this.runtime.trackGroup(this.physics.add.group({
      classType: Enemy,
      runChildUpdate: false,
      maxSize: 300,
    }));
    this.enemyManager = new EnemyManager(this, this.player, this.enemies, this.enemyDefs);
    this.enemyManager.setLevel(this.levelSystem.getLevel());

    // --- Combat ---
    this.damageSystem = new DamageSystem(this.game);

    // Enemy-vs-enemy separation: a physics collider (broadphase-backed, so it
    // scales to hundreds of entities) stops them stacking into one blob and
    // makes them flow around each other like a swarm.
    this.enemyCollider = this.runtime.trackCollider(
      this.physics.add.collider(this.enemies, this.enemies)
    );

    // Player vs enemies overlap (contact damage both ways).
    this.playerEnemyOverlap = this.runtime.trackCollider(
      this.physics.add.overlap(this.player, this.enemies, this.onPlayerEnemyOverlap, null, this)
    );

    // --- Projectiles (pooled magic shots) + auto-attack ---
    this.projectiles = this.runtime.trackGroup(this.physics.add.group({
      classType: Projectile,
      runChildUpdate: false,
      maxSize: PROJECTILE_POOL,
    }));

    // --- Area spells (Water Circle, future AoE effects) ---
    this.areaSpells = this.runtime.trackArray([], (a) => { if (a && a.despawn) a.despawn(); });

    this.magicSystem = new SpellManager(
      this,
      this.player,
      this.projectiles,
      this.enemies,
      this.damageSystem,
      this.elementColors
    );

    // Area-spell expiry is a temporary, run-scoped event. Route it through the
    // RuntimeSystem so the listener is created and removed with the run (no
    // cross-run leak on the global game bus).
    this.runtime.trackListener(this.game.events, EVENTS.SPELL_EXPIRED, (spellId) => {
      this.magicSystem.handleSpellExpired(spellId);
    });

    // Reset transient runtime state (cooldowns / flags) when the run ends.
    this.runtime.trackStateReset(() => { this.spellCooldowns = {}; });

    // Projectile vs enemy overlap: damage + hit effect, then despawn shot.
    this.projectileEnemyOverlap = this.runtime.trackCollider(
      this.physics.add.overlap(this.projectiles, this.enemies, this.onProjectileHitEnemy, null, this)
    );

    // --- Spell progression (level-up upgrades) ---
    this.upgradeSystem = new UpgradeSystem(this, data, this.magicSystem);

    // --- Spell pool (known / hidden / locked) ---
    this.spellPool = new SpellPoolSystem(this, data, this.magicSystem);
    this.syncSpellPool();

    // --- Elemental progression (affinity) ---
    this.affinitySystem = new AffinitySystem(this, data);

    // --- Elemental Awakening (v0.0.8) ---
    this.awakeningSystem = new AwakeningSystem(
      this,
      data,
      this.save,
      this.affinitySystem,
      this.levelSystem
    );
    // Reflect any previously-awakened Fire from a prior session (save support).
    this.awakenedFire = this.awakeningSystem.isAwakened("fire");
    if (this.awakenedFire) {
      const fb = this.magicSystem.getMagicById("fireball");
      if (fb) fb.awakened = true;
    }

    // --- Codex (discovery tracker) ---
    this.codex = new CodexSystem(this, this.save, data);
    this.registry.set("codex", this.codex);

    // --- World Tree (Ancient Forces recognition) ---
    this.worldTree = new WorldTreeSystem(this, data, this.save);
    this.registry.set("worldTree", this.worldTree);

    // --- Weather System (v0.0.9) ---
    this.weatherSystem = new WeatherSystem(this, data, this.audio);
    this.waterDiscoveryTriggered = false;

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
    this.awakening = false; // an awakening cinematic is playing
    this.runTime = 0; // ms of active play
    this.damageEvents = 0; // debug counter
    this.spellCooldowns = {}; // spellId -> remaining cooldown ms (for HUD)

    // --- Burn particle emitter (shared, self-cleaning) ---
    // Small upward flame puffs emitted on burning enemies. Created once and
    // reused; registered with the runtime so it is destroyed on run end.
    this.burnEmitter = this.runtime.trackEmitter(
      this.add.particles(0, 0, TEXTURE_KEYS.PROJECTILE, {
        speed: { min: 12, max: 38 },
        angle: { min: 250, max: 290 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.85, end: 0 },
        lifespan: 480,
        blendMode: "ADD",
        tint: this.elementColors.fire ?? 0xff5a2c,
        emitting: false,
      })
      .setDepth(7)
    );

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
    this.game.events.on(EVENTS.AWAKENING_STARTED, this.onAwakeningStarted, this);
    this.game.events.on(EVENTS.WEATHER_CHANGED, this.onWeatherChanged, this);
    this.game.events.on(EVENTS.FORCE_DISCOVERED, this.onForceDiscovered, this);
    this.game.events.on(EVENTS.FORCE_ACKNOWLEDGED, this.onForceAcknowledged, this);
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
      // Dash (v0.1.0) — readiness for the HUD/debug.
      dashReady: this.player.canDash(this.time.now),
      dashActive: this.player.isDashing(this.time.now),
      dashCdMs: this.player.getDashCooldownRemaining(this.time.now),
      // Magic / projectiles (HUD + debug)
      magicName: this.magicSystem.ownedMagics[0]?.name || "—",
      magicElement: this.magicSystem.ownedMagics[0]?.element || "",
      magicReady: this.magicSystem.ownedMagics.some((m) => (this.magicSystem.cooldowns[m.id] || 0) <= 0),
      magicCdMs: this.magicSystem.cooldowns[this.magicSystem.ownedMagics[0]?.id] || 0,
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
        state: this.magicSystem.getState(m.id),
        remainingMs: this.magicSystem.getRemaining(m.id),
        type: m.base.type || "projectile",
        awakened: this.awakeningSystem.isAwakened(m.element),
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
        awakened: this.awakeningSystem.isAwakened(e.id),
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
      // Elemental Awakening (v0.0.8) — HUD badges + debug
       awakenedElements: this.awakeningSystem.getAwakenedElements(),
      awakeningReady: this.awakeningSystem.canTrigger("fire"),
      burnActive: this.countBurningEnemies(),
      // Weather (v0.0.9)
      weatherId: this.weatherSystem ? this.weatherSystem.getCurrent().id : "sunny",
      // World Tree (v0.0.9)
      worldTreeForces: this.worldTree
        ? this.worldTree.getForces().map((f) => ({
            id: f.id,
            name: f.loreName || f.name,
            state: this.worldTree.forceState(f.id),
          }))
        : [],
      // Area spells (Water Circle status for HUD/debug)
      areaSpellStatus: this.areaSpells.map((a) => {
        const remaining = Math.max(0, a.duration - a.age);
        return `${a.magic.name}: Active ${remaining}ms`;
      }),
      // Water Circle lifecycle debug (F1) — verifies the READY→ACTIVE→COOLDOWN loop
      waterCircleDebug: this.magicSystem.getDebugInfo("water_circle"),
    });

    // While a level-up overlay or awakening cinematic is open, the world freezes.
    if (this.leveling || this.awakening) return;

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

    // Dash (SPACE): an immediate, responsive burst with i-frames. Triggered here
    // (after the move input is set so the dash uses the current heading) and
    // before tick() so the burst velocity takes hold this frame.
    if (this.inputMgr.isDashJustDown() && !this.leveling && !this.awakening) {
      this.player.startDash(this.time.now);
    }

    this.player.tick(delta);

    // Enemy spawning + movement.
    this.enemyManager.update(delta);
    const children = this.enemies.getChildren();
    const now = this.time.now;
    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      if (!e.active) continue;
      e.tick();
      // Burn status (Damage-over-Time) ticking. Emits a small flame puff each
      // tick for unique, readable burn feedback.
      if (e.burn && now < e.burn.until) {
        if (now >= e.burn.nextTick) {
          e.burn.nextTick = now + 500;
          this.damageSystem.applyDamage(e, e.burn.tickDamage, {
            type: "status",
            element: e.burn.element,
            source: null,
          });
          if (this.burnEmitter) this.burnEmitter.emitParticleAt(e.x, e.y, 2);
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

    // Area spells (Water Circle) tick + cleanup.
    const ec = this.enemies.getChildren();
    for (let i = this.areaSpells.length - 1; i >= 0; i--) {
      const a = this.areaSpells[i];
      if (!a.active) {
        this.areaSpells.splice(i, 1);
        continue;
      }
      a.tick(delta, ec, (enemy, dmg, element) => {
        this.damageSystem.applyDamage(enemy, dmg, {
          type: "element",
          element,
          source: a,
        });
      });
    }

    // Weather System update.
    if (this.weatherSystem) this.weatherSystem.update(delta);

    // Water Discovery Event check.
    this.checkWaterDiscovery();
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
    const weatherMult = this.weatherSystem ? this.weatherSystem.getDamageMult(projectile.element) : 1;
    const dmg = Math.max(1, Math.round(projectile.damage * affMult * weatherMult));

    const color = this.elementColors[projectile.element] ?? 0xffffff;
    this.damageSystem.applyDamage(enemy, dmg, {
      type: "element",
      element: projectile.element,
      source: projectile,
    });
    const isWater = projectile.element === "water";
    this.spawnHitEffect(enemy.x, enemy.y, color, this.isFireAwakened(projectile), isWater);

    // Burn: unlocked by the Fire Awakening (plus a bonus from the Burn Chance
    // upgrade and the Fire Lv20 affinity milestone). Gated on awakening so Burn
    // is a meaningful reward rather than an early passive.
    let burnChance = projectile.burnChance;
    if (this.awakeningSystem.isAwakened("fire") && projectile.element === "fire") {
      burnChance = Math.max(burnChance, this.awakeningSystem.getBaseBurnChance("fire"));
      burnChance = Math.max(burnChance, this.affinitySystem.getBurnChance("fire"));
    }
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

    // Pierce: default projectiles stop after the first enemy; pierced ones
    // continue until they exceed their pierce count (pierce N = N+1 hits).
    if (projectile.pierce === 0 || projectile.pierceCount > projectile.pierce) {
      projectile.despawn();
    }
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

  /** Small additive burst where a projectile connects. `boost` = awakened Fire. */
  spawnHitEffect(x, y, color, boost = false, isWater = false) {
    if (isWater) {
      // Water splash: ripple ring.
      const ring = this.add.circle(x, y, 6, color, 0.7)
        .setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ring,
        scale: 2.5,
        alpha: 0,
        duration: 350,
        onComplete: () => ring.destroy(),
      });
      const splash = this.add.circle(x, y, 10, color, 0.4)
        .setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: splash,
        scale: 3,
        alpha: 0,
        duration: 400,
        onComplete: () => splash.destroy(),
      });
    } else {
      const r = boost ? 17 : 12;
      const burst = this.add
        .circle(x, y, r, color, boost ? 1 : 0.8)
        .setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: burst,
        scale: 0,
        alpha: 0,
        duration: boost ? 260 : 200,
        onComplete: () => burst.destroy(),
      });
    }
  }

  /** True when a fire projectile is enhanced by the Fire Awakening. */
  isFireAwakened(projectile) {
    return !!projectile && projectile.element === "fire" && this.awakenedFire;
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
      const baseAffinityExp = Math.ceil(reward / 2);
      const weatherMult = this.weatherSystem ? this.weatherSystem.getAffinityGainMult(source.element) : 1;
      this.affinitySystem.grantExp(source.element, Math.ceil(baseAffinityExp * weatherMult));
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
    this.maybeTriggerAwakening();
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

    this.maybeTriggerAwakening();
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

  // ------------------------------------------------------------------------
  // Elemental Awakening (v0.0.8)
  // ------------------------------------------------------------------------

  /**
   * If an awakening is ready (and gameplay isn't already frozen), trigger it.
   * Idempotent: the AwakeningSystem only allows each element to awaken once.
   */
  maybeTriggerAwakening() {
    if (this.leveling || this.awakening) return;
    const id = this.awakeningSystem.firstReady();
    if (id) this.awakeningSystem.awaken(id);
  }

  /**
   * Handler for EVENTS.AWAKENING_STARTED. Plays the short cinematic (~3.5s):
   * freeze, fade music, desaturate, magic circle, embers, zoom, shake, sound,
   * cinematic text — then smoothly returns to gameplay and applies rewards.
   * @param {string} id
   * @param {object} def  awakening definition from data/awakenings.json
   */
  onAwakeningStarted(id, def) {
    if (this.awakening) return;
    this.awakening = true;
    this.physics.world.pause(); // freeze gameplay for the sequence

    const cam = this.cameras.main;
    const color = Phaser.Display.Color.HexStringToColor(def.color || "#ffffff").color;

    // Slowly fade game music (prepared channel; no-op until audio assets).
    this.audio.fadeMusicTo(0.15, 1000);

    // Reduce world saturation slightly with a subtle desaturating overlay.
    this.awakenOverlay = this.add
      .rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x0c0f14, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1800);
    this.tweens.add({ targets: this.awakenOverlay, alpha: 0.18, duration: 1200 });

    // Slight camera zoom + small shake.
    cam.zoomTo(1.12, 1200, "Sine.easeInOut");
    cam.shake(420, 0.0035);

    // Glowing magic circle under the player + ember particles.
    this.spawnMagicCircle(this.player.x, this.player.y, color);
    this.spawnAwakenEmbers(this.player.x, this.player.y, color);

    // Play the awakening sound on its dedicated channel.
    this.audio.playAwakening(id);

    // Cinematic text appears ~1s in (after the brief freeze).
    this.time.delayedCall(1000, () => this.showAwakeningText(def));

    // Return to gameplay after ~3.5s.
    this.time.delayedCall(3500, () => this.finishAwakening(id, def));
  }

  /** Apply the permanent, mostly-visual awakening rewards. */
  applyAwakeningRewards(id, def) {
    if (id === "fire") {
      this.awakenedFire = true;
      const fb = this.magicSystem.getMagicById("fireball");
      if (fb) fb.awakened = true;
    }
    // Unlock the codex entry for this awakening (e.g. "Fire Awakening").
    if (def.reward && def.reward.codexEntry && this.codex) {
      this.codex.discover("awakenings", id);
    }
    // Unlock notification toast.
    const name = def.name || id.charAt(0).toUpperCase() + id.slice(1);
    this.discoveryUI.show("ELEMENT AWAKENED", def.text ? def.text.line2 : name);
  }

  /** Smoothly restore gameplay after the cinematic. */
  finishAwakening(id, def) {
    if (this.awakenOverlay) {
      this.tweens.add({
        targets: this.awakenOverlay,
        alpha: 0,
        duration: 600,
        onComplete: () => {
          this.awakenOverlay.destroy();
          this.awakenOverlay = null;
        },
      });
    }
    this.cameras.main.zoomTo(1, 700, "Sine.easeInOut");
    this.audio.fadeMusicTo(0.6, 1000); // restore music volume

    this.applyAwakeningRewards(id, def);

    // Resume the world just after the zoom settles back in.
    this.time.delayedCall(800, () => {
      if (!this.leveling) this.physics.world.resume();
      this.awakening = false;
    });
  }

  /** Glowing magic circle that scales in beneath the player. */
  spawnMagicCircle(x, y, color) {
    const ring = this.add
      .circle(x, y, 8, 0x000000, 0)
      .setStrokeStyle(4, color)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD);
    const ring2 = this.add
      .circle(x, y, 5, 0x000000, 0)
      .setStrokeStyle(2, color)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD);
    const fill = this.add
      .circle(x, y, 4, color, 0.22)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({ targets: [ring, ring2], scale: 8, duration: 1400, ease: "Sine.easeOut" });
    this.tweens.add({ targets: fill, scale: 9, alpha: 0.5, duration: 1400 });
    this.tweens.add({ targets: ring2, angle: 360, duration: 3200, repeat: -1 });

    // Self-cleaning: remove the circle shortly after the cinematic ends.
    this.time.delayedCall(4200, () => {
      ring.destroy();
      ring2.destroy();
      fill.destroy();
    });
  }

  /** Embers rising around the player for the duration of the cinematic. */
  spawnAwakenEmbers(x, y, color) {
    if (!this.emberEmitter) {
      this.emberEmitter = this.add
        .particles(0, 0, TEXTURE_KEYS.PROJECTILE, {
          speed: { min: 20, max: 70 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.5, end: 0 },
          alpha: { start: 0.9, end: 0 },
          lifespan: 900,
          blendMode: "ADD",
          tint: color,
          emitting: false,
        })
        .setDepth(9);
    }
    this.emberTimer = this.time.addEvent({
      delay: 55,
      repeat: 50,
      callback: () => {
        this.emberEmitter.emitParticleAt(
          x + Phaser.Math.Between(-22, 22),
          y + Phaser.Math.Between(-22, 22)
        );
      },
    });
    this.time.delayedCall(3600, () => {
      if (this.emberTimer) {
        this.emberTimer.remove(false);
        this.emberTimer = null;
      }
      this.emberEmitter.stop();
      this.emberEmitter.destroy();
      this.emberEmitter = null;
    });
  }

  /** Centered cinematic text: line1 (flavor) + line2 (element awakening). */
  showAwakeningText(def) {
    const text = def.text || { line1: "", line2: "" };
    const l1 = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 26, text.line1, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "20px",
        color: "#e6e8ef",
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 760 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1900)
      .setAlpha(0);
    const l2 = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 14, text.line2, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "30px",
        color: def.color || "#ff5a2c",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1900)
      .setAlpha(0);

    this.tweens.add({ targets: [l1, l2], alpha: 1, duration: 500, ease: "Power2" });
    this.tweens.add({
      targets: [l1, l2],
      alpha: 0,
      delay: 2200,
      duration: 600,
      onComplete: () => {
        l1.destroy();
        l2.destroy();
      },
    });
  }

  /** Count of enemies currently burning (for the debug overlay). */
  countBurningEnemies() {
    let n = 0;
    const children = this.enemies.getChildren();
    for (let i = 0; i < children.length; i++) {
      const e = children[i];
      if (e.active && e.burn && this.time.now < e.burn.until) n += 1;
    }
    return n;
  }

  // ------------------------------------------------------------------------
  // Water Discovery Event (v0.0.9)
  // ------------------------------------------------------------------------

  /**
   * Check if the Water Discovery Event should trigger.
   * Requirements:
   *  - Character Level >= 10
   *  - Fire Affinity >= 10
    *  - Fire Awakening completed
   *  - Currently raining
   *  - Not yet triggered
   */
  checkWaterDiscovery() {
    if (this.waterDiscoveryTriggered) return;
    if (this.leveling || this.awakening) return;

    const charLevel = this.levelSystem.getLevel();
    const fireAffinity = this.affinitySystem.getLevel("fire");
    const fireAwakened = this.awakeningSystem.isAwakened("fire");
    const isRaining = this.weatherSystem && this.weatherSystem.isRaining();

    if (charLevel >= 10 && fireAffinity >= 10 && fireAwakened && isRaining) {
      this.triggerWaterDiscovery();
    }
  }

  /** Trigger the Water Discovery Event. */
  triggerWaterDiscovery() {
    this.waterDiscoveryTriggered = true;
    this.awakening = true;
    this.physics.world.pause();

    // Intensify rain.
    if (this.weatherSystem) this.weatherSystem.burstRain(5000);

    // Soft blue lighting.
    const blueLight = this.add
      .rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x1a3a5c, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1800);
    this.tweens.add({ targets: blueLight, alpha: 0.25, duration: 2000 });

    // Water particles circle the player.
    this.spawnWaterCircle(this.player.x, this.player.y);

    // Play discovery sound.
    this.audio.playWaterDiscovery();

    // Show discovery text after a brief pause.
    this.time.delayedCall(1500, () => {
      this.showDiscoveryText({
        line1: "The Endless Tide accepts your reflection.",
        line2: "Water Discovered",
        color: "#3aa0ff",
      });
    });

    // Complete discovery after cinematic.
    this.time.delayedCall(4500, () => {
      this.finishWaterDiscovery(blueLight);
    });
  }

  /** Spawn circling water particles around the player. */
  spawnWaterCircle(x, y) {
    const waterColor = Phaser.Display.Color.HexStringToColor("#3aa0ff").color;
    const particles = [];
    const count = 24;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px = x + Math.cos(angle) * 50;
      const py = y + Math.sin(angle) * 50;
      const p = this.add.circle(px, py, 4, waterColor, 0.8)
        .setDepth(9)
        .setBlendMode(Phaser.BlendModes.ADD);
      particles.push({ obj: p, angle, radius: 50 });
    }

    // Animate particles orbiting.
    this.waterCircleTimer = this.time.addEvent({
      delay: 16,
      repeat: 280,
      callback: () => {
        particles.forEach((p) => {
          p.angle += 0.04;
          p.obj.x = x + Math.cos(p.angle) * p.radius;
          p.obj.y = y + Math.sin(p.angle) * p.radius;
          p.obj.setAlpha(0.6 + Math.sin(p.angle * 3) * 0.3);
        });
      },
    });

    this.time.delayedCall(4500, () => {
      if (this.waterCircleTimer) {
        this.waterCircleTimer.remove(false);
        this.waterCircleTimer = null;
      }
      particles.forEach((p) => {
        this.tweens.add({
          targets: p.obj,
          alpha: 0,
          scale: 0,
          duration: 600,
          onComplete: () => p.obj.destroy(),
        });
      });
    });
  }

  /** Show cinematic text for the discovery. */
  showDiscoveryText(def) {
    const l1 = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 26, def.line1, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "20px",
        color: "#e6e8ef",
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 760 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1900)
      .setAlpha(0);
    const l2 = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 14, def.line2, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "30px",
        color: def.color || "#3aa0ff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1900)
      .setAlpha(0);

    this.tweens.add({ targets: [l1, l2], alpha: 1, duration: 500, ease: "Power2" });
    this.tweens.add({
      targets: [l1, l2],
      alpha: 0,
      delay: 2200,
      duration: 600,
      onComplete: () => {
        l1.destroy();
        l2.destroy();
      },
    });
  }

  /** Complete the water discovery: unlock systems and resume. */
  finishWaterDiscovery(lightOverlay) {
    // Unlock Water element.
    this.affinitySystem.unlockElement("water");

    // Unlock Water Bolt spell.
    this.spellPool.unlock("water_circle");
    this.syncSpellPool();

    // Do NOT switch away from Fireball. Water Circle is simply added.

    // Discover Water in World Tree.
    this.worldTree.discoverForce("water");

    // Discover codex entries.
    if (this.codex) {
      this.codex.discover("elements", "water");
      this.codex.discover("spells", "water_circle");
      this.codex.discover("forces", "water");
    }

    // Discovery toast.
    this.discoveryUI.show("WATER DISCOVERED", "The Endless Tide");

    // Clean up lighting.
    if (lightOverlay) {
      this.tweens.add({
        targets: lightOverlay,
        alpha: 0,
        duration: 800,
        onComplete: () => lightOverlay.destroy(),
      });
    }

    // Resume after a moment.
    this.time.delayedCall(1000, () => {
      if (!this.leveling) this.physics.world.resume();
      this.awakening = false;
    });
  }

  // ------------------------------------------------------------------------
  // Weather / World Tree event handlers
  // ------------------------------------------------------------------------

  onWeatherChanged(weatherId, def) {
    // Future: change music based on weather.
    // if (def && def.event) this.audio.playWeatherAmbience(weatherId);
  }

  onForceDiscovered(forceId, def) {
    if (this.codex) {
      this.codex.discover("forces", forceId);
    }
    const name = def ? def.loreName || def.name : forceId;
    this.discoveryUI.show("ANCIENT FORCE DISCOVERED", name);
  }

  onForceAcknowledged(forceId, def) {
    if (this.codex && def && def.reward && def.reward.codexEntry) {
      this.codex.discover("awakenings", forceId);
    }
    const name = def ? def.name : forceId;
    this.discoveryUI.show("FORCE ACKNOWLEDGED", name);
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
    this.game.events.off(EVENTS.AWAKENING_STARTED, this.onAwakeningStarted, this);
    this.game.events.off(EVENTS.WEATHER_CHANGED, this.onWeatherChanged, this);
    this.game.events.off(EVENTS.FORCE_DISCOVERED, this.onForceDiscovered, this);
    this.game.events.off(EVENTS.FORCE_ACKNOWLEDGED, this.onForceAcknowledged, this);

    // Destroy every temporary runtime object before the scene restarts. This is
    // the single point where the run lifecycle ends (Feature 4: Game Over
    // Cleanup). The RuntimeSystem owns the actual teardown.
    this.cleanupRun();
  }

  // ------------------------------------------------------------------------
  // Run lifecycle (v0.1.0) — Runtime / Save separation
  // ------------------------------------------------------------------------

  /**
   * Zero all transient run state so a fresh run always begins identically.
   * Called at the top of create(); the run-specific fields are (re)assigned
   * again below, so this guarantees a clean, deterministic starting point.
   */
  resetRuntimeState() {
    this.leveling = false;
    this.awakening = false;
    this.runTime = 0;
    this.damageEvents = 0;
    this.spellCooldowns = {};
    this.waterDiscoveryTriggered = false;
    if (this.player) {
      this.player.dashing = false;
      this.player.dashCooldownUntil = 0;
    }
  }

  /**
   * Tear down everything temporary to the current run (Feature 2 & 4). The
   * RuntimeSystem destroys tracked objects in order: physics colliders/overlaps,
   * pooled groups (projectiles + enemies), area spells, particle emitters,
   * temporary listeners, and finally state resets. Permanent progression (save,
   * affinity, world tree, codex) is never touched here.
   */
  cleanupRun() {
    if (this.runtime) this.runtime.reset();
    this.runtime = null;
  }
}
