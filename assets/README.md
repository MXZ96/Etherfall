# Assets

This folder is reserved for **binary art and audio** (spritesheets, tiles,
music, SFX) in later versions.

**v0.0.1 generates ALL visuals procedurally** at runtime via
`src/managers/TextureManager.js` (player frames, enemy, grass tile) so the
project is fully functional with zero binary files.

When real assets are added:

- Drop files here (e.g. `assets/player.png`, `assets/enemy.png`).
- Load them in `PreloadScene` instead of (or in addition to) generation.
- Keep the texture keys in `src/config/constants.js` unchanged so gameplay
  code keeps working.
