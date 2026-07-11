# Etherfall

A browser **Bullet-Heaven Roguelite** (top-down action RPG) built with **Phaser 3**
and **vanilla ES Modules**. This repository is **version 0.0.9** — The Endless Tide. The player AUTO-CASTS Fireball at
the nearest enemy; on level-up the game pauses and offers three rarity-weighted
spell upgrades. Separately from character EXP, killing enemies with an element's
magic grants **Affinity EXP** to that element (Fire starts unlocked; Water/Air/
Earth/Spirit are locked and prepared for future discovery). Fire affinity already
pays off: **Lv10 +10% Fire damage**, **Lv20 base Burn chance**, with Lv30/40/50
milestones reserved for future effects. Progression is bounded by per-spell
`limits`, per-upgrade `maxStacks`, diminishing returns, and an intentionally
slow affinity curve (Lv50 is a long-term achievement).
Spirit stays hidden. Affinity and fusion are still future.

## Running locally

ES Modules and JSON loading require an HTTP server (opening `index.html` via
`file://` will not work). From the project root:

```bash
# Python
python -m http.server 8080

# or Node
npx serve .
```

Then open `http://localhost:8080`.

## Deploying to GitHub Pages

The project is fully static. Push the repository and enable **GitHub Pages**
(pointing at the branch root). No build step is required — Phaser is loaded via
an [import map](index.html) from a CDN.

## Controls

| Action | Keys |
| ------ | ---- |
| Move   | `W A S D` or Arrow Keys |
| Pause  | `Esc` or `P` |
| Debug: gain EXP (test level-up) | `E` |

## Project layout

```
etherfall/
├── index.html            # Entry, import map, canvas container
├── style.css             # Page + responsive layout
├── main.js               # Boots Phaser with all scenes
├── assets/               # Future binary art/audio (currently procedural)
├── docs/                 # Architecture & design notes
└── src/
    ├── config/           # constants.js, GameConfig.js
    ├── scenes/           # Boot, Preload, MainMenu, Game, Pause, GameOver
    ├── entities/         # LivingEntity, Player, Enemy, Projectile, Magic, EnemyManager
    ├── systems/          # Save, Settings, Level, Damage, Magic, Upgrade
    ├── managers/         # Input, Audio, Texture
    ├── ui/               # HUD, LevelUpUI
    ├── utils/            # math, events, leveling
    └── data/             # JSON content (player, enemy, maps, magic, elements, upgrades, ...)
```

## How it works (v0.0.5.1)

1. **BootScene** creates persistent managers (Save / Settings / Audio) on the
   global registry, then generates **all art procedurally** via `TextureManager`
   so the game ships with zero binary assets.
2. **PreloadScene** loads every `src/data/*.json` file (player, enemy, maps,
   magic, fusion, boss, artifact, achievement, weather, event) and stores them
   on the registry as the single source of truth for content.
3. **MainMenuScene** -> **GameScene** starts a run in **The Forgotten Meadow**:
   a large bounded arena, a WASD/arrow-controlled player with eased movement,
   a camera that follows and centres the player, and an **EnemyManager** that
   spawns Voidlings just outside the view; they chase the player. The player
   AUTO-CASTS Fireball (a pooled projectile from `data/magic.json`) at the
   nearest enemy, dealing elemental damage with glow/trail/hit effects.
4. A physics **collider** keeps enemies separated into a natural swarm. On
   contact, both sides use the unified **DamageSystem**: the Voidling deals
   contact damage (player gets 500ms i-frames, blink, knockback, screen shake)
   and the player wears it down for EXP. Death spawns a fade effect.
 5. The **LevelSystem** tracks EXP with a scalable curve (slowed in v0.0.5.1 so
    early levels feel deliberate); on level-up the game pauses and the
    **LevelUpUI** overlay shows three **rarity-weighted spell upgrades** rolled
    by the **UpgradeSystem**. Picking a card applies it immediately (raising that
    spell's **level** and its effective stats) and resumes play. Every upgrade is
    bounded by `maxStacks`, a **diminishing-returns** curve (`diminishingRate` in
    `data/upgrades.json`), and the spell's `limits` in `data/magic.json`
    (maxProjectile 8, maxDamageMultiplier 500%, maxSizeMultiplier 3x,
    maxCooldownReduction 50%). Fireball upgrades range from Common (+15% damage,
    +1 projectile) through Legendary (Phoenix Core boomerang, maxStacks 1).
    Multi-projectile fan-spread, burn-on-hit, Inferno explosion and Phoenix
    return are all driven by `data/upgrades.json` + the element/status-effect data.
  6. **EnemyManager** applies smooth, sub-exponential **enemy scaling** from
     survival time + player level, so Voidlings grow tougher (HP/damage) the
     longer the run lasts — keeping the player challenged without runaway spikes.
  7. **AffinitySystem** (v0.0.6) tracks the player's relationship with each
     element independently of character level. Killing an enemy with an element's
     magic grants that element **Affinity EXP** (half the enemy's EXP reward,
     separate from character EXP). Fire starts unlocked; Water/Air/Earth are
     registered but locked (future `unlockElement()`), and Spirit is hidden+locked.
     Implemented, safe Fire bonuses: **Lv10 +10% Fire damage**, **Lv20 base Burn
     chance**; Lv30/40/50 milestones are framework-only placeholders.
  8. **MainMenuScene** shows **START RUN** + **SETTINGS**; a **CONTINUE** button
     appears only when a valid save exists (`SaveSystem.hasSave()`). The save
     document already reserves `progress` (highestLevel, unlockedElements,
     discoveredSpells, achievements) for a future full save system.
   9. **PauseScene** (Esc/P) overlays resume / fullscreen / quit options.
      Press **F1** for the debug overlay (character level, per-element affinity
      levels + Spirit status, entities, enemies, HP, velocity, collision, owned
      spells + levels, per-spell multipliers, upgrade stacks, enemy scale,
      element, projectile count, **awakened elements, active burn count, and
      whether a Fire Awakening is ready to trigger**). The bottom-left HUD shows
      the live affinity list (e.g. 🔥 Fire Lv12 ✦ / 💧 Water Locked), where ✦
      marks an Awakened element.
    10. **AwakeningSystem** (v0.0.8) is a one-time, permanent milestone per element.
        When **Fire Affinity ≥ 10** AND **Character Level ≥ 10**, gameplay briefly
        freezes for a cinematic (fading music, slight desaturation, a glowing magic
        circle + embers under the player, slight zoom, small shake, awakening
        sound, and the line *"The Flame has acknowledged your existence." / 🔥 Fire
        Awakening*). The reward is deliberately visual, not a stat spike: **Burn is
        unlocked** (small DoT + unique flame particles), the **Fireball trail
        brightens**, its **sprite gets a subtle upgrade**, and the **UI icon gains
        an awakened ✦ mark**. Awakening state persists via the `awakenings` save
        section; Water/Air/Earth are declared (future), and **Spirit is a hidden
        placeholder that never triggers or reveals anything**. A new **AWAKENINGS**
        Codex page tracks each element's unlocked/locked state.
    11. **WeatherSystem** (v0.0.9) drives a living world. Rain, ashfall, and fog
        fade in/out gradually (no sudden pop-in) and carry gameplay modifiers:
        rain boosts Water affinity gain and weakens Fire, ashfall boosts Fire and
        slows Water projectiles, fog slows enemy movement. The WeatherSystem emits
        events the scene listens to for future music/VFX hooks.
    12. **WorldTreeSystem** (v0.0.9) tracks the Ancient Forces' recognition of the
        Vessel. Fire starts acknowledged; Water is discovered through the **Water
        Discovery Event**; Air/Earth await future triggers; Spirit remains hidden.
        The Codex's World Tree tab renders animated growing branches and glowing
        nodes for discovered forces, with an "ACKNOWLEDGED" badge for those the
        Vessel has truly bonded with.
    13. **Water Discovery Event** (v0.0.9) fires once the Vessel has proven
        themselves: Character Level ≥ 10, Fire Affinity ≥ 10, Fire Awakening
        complete, and the world is raining. The rain intensifies, soft blue light
        washes the screen, water particles orbit the player, and the text *"The
        Endless Tide accepts your reflection." / Water Discovered* appears. This
        unlocks the **Water element**, **Water Affinity** (separate progression,
        max 50), **Water Bolt** (higher speed, pierces one enemy, blue ripple
        trail and splash impact), the **World Tree branch**, and the Codex entry.
        Until this event triggers, Water Bolt NEVER appears in level-up choices.

## Future systems (architecture is ready)

The data files and folder layout already anticipate:

- **Elements / Status** — `data/elements.json` (unlocked/hidden/locked + affinity unlock reqs), `data/status_effect.json` (Spirit hidden+locked)
- **Upgrades / Rarity** — `data/upgrades.json` (Common→Legendary weights + colours)
- **Affinity** — `data/affinity.json` (per-element level/exp/maxLevel/locked) + `src/systems/AffinitySystem.js`
- **Fusion** — `data/fusion.json` (`fusions[]` with element pairs + affinity requirements; not yet implemented)
- **Magic** — `data/magic.json` (multi-slot ready; Water Bolt / Wind Blade / Rock Spike registered, Fireball active)
- **Enemies / Bosses** — `data/enemy.json`, `data/boss.json` (Enemy is data-driven ready)
- **Artifacts / Achievements** — `data/artifact.json`, `data/achievement.json`
- **Weather / Events** — `data/weather.json`, `data/event.json`
- **Spell Evolution / All-Rounder / Element Unlock**, **Multiplayer** — manager/registry seams are in place
- **Audio** — `AudioManager` buses (master/music/sfx) wired to settings

Saving (localStorage) is versioned and sectioned so new systems can extend the
save blob without breaking older saves.
