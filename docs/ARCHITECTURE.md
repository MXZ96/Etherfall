# Architecture

Etherfall is structured for long-term growth. This document explains the core
decisions so future contributors (and future systems) fit the existing seams.

## Module strategy

- **No bundler required.** All game code is plain ES Modules. `index.html` uses an
  [import map](../../index.html) to resolve `import Phaser from "phaser"` to the
  Phaser ESM CDN build, so the project runs from any static host.
- **No globals.** Shared state lives on the Phaser **registry**
  (`this.registry`) or the global **event bus** (`this.game.events`). Scenes
  never reach into each other directly.

## Lifecycle

```
BootScene → PreloadScene → MainMenuScene → GameScene
                                    ↑            │
                                    └── PauseScene (overlay)
                                    └── GameOverScene (on death)
```

- **BootScene** builds persistent managers once and stores them on the registry.
- **PreloadScene** loads JSON content into `registry.data`.
- **GameScene** is the only long-running gameplay scene; it pauses (not stops)
  when the pause/level-up overlays are shown.

## Cross-system communication

All events are declared as string constants in `src/utils/events.js` and emitted
on `game.events`. Examples:

- `level:exp-gained`, `level:level-up`
- `enemy:spawned`, `enemy:killed`
- `flow:paused`, `flow:game-over`
- `settings:changed`

Systems subscribe once and clean up on `shutdown` to avoid duplicate listeners
when a scene restarts.

## Data-driven content

Every future content type has a JSON file under `src/data/`. They load in
`PreloadScene` and are available via `registry.data.<name>`. Prefer adding data
there over hard-coding values in code.

## Progression math

`src/utils/leveling.js` exposes `expToNext(level)` using an exponential curve
(`BASE * GROWTH^(level-1)`). Re-balancing is a two-constant edit.

## Save format

`src/systems/SaveSystem.js` stores a versioned, sectioned document in
localStorage (`{ version, player, settings, progress }`). New systems add their
own top-level section; `mergeDefaults` back-fills missing sections so older
saves keep loading.

## Rendering / responsiveness

- Base resolution `1280x720` scaled with Phaser `Scale.FIT` + `CENTER_BOTH`, so
  the aspect ratio is preserved on desktop, tablet, and mobile.
- All art is generated at runtime in `managers/TextureManager.js`. Swap these
  for real assets later without touching gameplay code — texture keys in
  `config/constants.js` stay the same.

## Living entities & combat (v0.0.3)

- `entities/LivingEntity.js` is the shared base for every combat-capable thing
  (Player, Enemy, future Boss / Summon / Projectile). It owns the common
  contract: `hp/maxHp`, `speed`, `radius`, `knockbackResistance`, a centred
  circular body, `applyKnockback()` (scaled by resistance) and `flashHit()`.
- `systems/DamageSystem.js` is the single `applyDamage(target, amount, source)`
  entry point. `source` already carries `type` (physical/magic/element),
  `element`, `critical` and `status` so affinity / crit / status effects can be
  layered in without touching call sites.
- Enemy-enemy **separation** is a physics collider (broadphase-backed, scales to
  hundreds of entities) rather than a manual O(n²) loop, so swarms flow without
  stacking. Player↔enemy uses an overlap (player is never physically blocked).
- Death flows through `onDeath()` hooks + the `combat:entity-died` event, which
  awards EXP and spawns a lightweight fade effect — keeping pooling clean.
