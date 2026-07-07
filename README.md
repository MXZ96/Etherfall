# Etherfall

A browser **Bullet-Heaven Roguelite** (top-down action RPG) built with **Phaser 3**
and **vanilla ES Modules**. This repository is **version 0.0.1** — the foundational
framework only. No magic, enemies-with-attacks, bosses, or artifacts yet; just a
clean, scalable architecture to grow into.

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
    ├── entities/         # Player, Enemy
    ├── systems/          # Save, Settings, Level, EnemySpawner
    ├── managers/         # Input, Audio, Texture
    ├── ui/               # HUD, LevelUpUI
    ├── utils/            # math, events, leveling
    └── data/             # JSON content (magic, fusion, enemy, ...)
```

## How it works (v0.0.1)

1. **BootScene** creates persistent managers (Save / Settings / Audio) on the
   global registry, then generates **all art procedurally** via `TextureManager`
   so the game ships with zero binary assets.
2. **PreloadScene** loads every `src/data/*.json` file and stores them on the
   registry as the single source of truth for future content.
3. **MainMenuScene** -> **GameScene** starts the run: a large bounded world,
   a WASD/arrow-controlled player, a camera that follows and centres the player,
   and an `EnemySpawner` that walks basic enemies toward the player.
4. The **LevelSystem** tracks EXP with an exponential curve. On level-up the
   game pauses and the **LevelUpUI** overlay shows three placeholder cards.
5. **PauseScene** (Esc/P) overlays resume / fullscreen / quit options.

## Future systems (architecture is ready)

The data files and folder layout already anticipate:

- **Magic / Fusion** — `data/magic.json`, `data/fusion.json`
- **Enemies / Bosses** — `data/enemy.json`, `data/boss.json` (Enemy is data-driven ready)
- **Artifacts / Achievements** — `data/artifact.json`, `data/achievement.json`
- **Weather / Events** — `data/weather.json`, `data/event.json`
- **Affinity**, **Multiplayer** — manager/registry seams are in place
- **Audio** — `AudioManager` buses (master/music/sfx) wired to settings

Saving (localStorage) is versioned and sectioned so new systems can extend the
save blob without breaking older saves.
