/* ==========================================================================
   Etherfall - Texture Manager
   Generates ALL art procedurally at runtime so the project is fully
   functional with zero binary asset files (important for an instant,
   deployable GitHub Pages build). Produces:
     - player spritesheet (idle + 4-frame walk cycle)
     - enemy texture
     - grass tile (tiled for the world background)
   Replace these with real art later; the keys in constants.TEXTURE_KEYS
   stay the same so nothing else changes.
   ========================================================================== */

import { PLAYER, ENEMY, TEXTURE_KEYS } from "../config/constants.js";

export class TextureManager {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
  }

  /** Generate every texture the game needs. Call once during boot. */
  generateAll() {
    this.createPlayerTexture();
    this.createEnemyTexture();
    this.createGrassTexture();
    this.createProjectileTexture();
  }

  /** Safely create a canvas texture, returning the CanvasTexture or null. */
  createCanvas(key, width, height) {
    if (this.scene.textures.exists(key)) return null;
    return this.scene.textures.createCanvas(key, width, height);
  }

  // ------------------------------------------------------------------------
  // PLAYER: one canvas, 5 horizontal frames (0 = idle, 1..4 = walk cycle).
  // ------------------------------------------------------------------------
  createPlayerTexture() {
    const fw = PLAYER.FRAME_WIDTH;
    const fh = PLAYER.FRAME_HEIGHT;
    const frames = 5;
    const canvas = this.createCanvas(TEXTURE_KEYS.PLAYER, fw * frames, fh);
    if (!canvas) return;
    const ctx = canvas.getContext();

    for (let i = 0; i < frames; i++) {
      ctx.save();
      ctx.translate(i * fw, 0);
      this.drawPlayerFrame(ctx, i, fw, fh);
      ctx.restore();
    }
    canvas.refresh();

    // Register each frame so Phaser animations can reference them.
    const tex = this.scene.textures.get(TEXTURE_KEYS.PLAYER);
    for (let i = 0; i < frames; i++) {
      tex.add(i, 0, i * fw, 0, fw, fh);
    }
  }

  drawPlayerFrame(ctx, frame, fw, fh) {
    const cx = fw / 2;
    const hood = "#2a2140";
    const cloak = "#3a2d63";
    const trim = "#7b5cff";
    const skin = "#c9b8a8";

    // Leg swing: idle still, walk cycles through 1,0,-1,0.
    const swing = frame === 0 ? 0 : Math.sin((frame / 4) * Math.PI * 2) * 0.45;

    // Legs
    ctx.fillStyle = "#1b1530";
    this.drawLimb(ctx, cx - 5, fh - 16, 6, 16, swing);
    this.drawLimb(ctx, cx + 5, fh - 16, 6, 16, -swing);

    // Cloak / body (trapezoid)
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(cx - 12, fh - 14);
    ctx.lineTo(cx + 12, fh - 14);
    ctx.lineTo(cx + 8, 24);
    ctx.lineTo(cx - 8, 24);
    ctx.closePath();
    ctx.fill();

    // Cloak trim
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(cx, 16, 9, 0, Math.PI * 2);
    ctx.fill();

    // Hood
    ctx.fillStyle = hood;
    ctx.beginPath();
    ctx.arc(cx, 14, 11, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
  }

  /** Draw a simple rotating limb (leg/arm) pivoting at its top. */
  drawLimb(ctx, x, y, w, h, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillRect(-w / 2, 0, w, h);
    ctx.restore();
  }

  // ------------------------------------------------------------------------
  // ENEMY: a small menacing floating mote.
  // ------------------------------------------------------------------------
  createEnemyTexture() {
    const size = ENEMY.RADIUS * 2 + 6;
    const canvas = this.createCanvas(TEXTURE_KEYS.ENEMY, size, size);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const c = size / 2;

    // Body
    ctx.fillStyle = "#6e1f2a";
    ctx.beginPath();
    ctx.arc(c, c, ENEMY.RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Outer glow ring
    ctx.strokeStyle = "#b8344a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(c - 4, c - 2, 2.2, 0, Math.PI * 2);
    ctx.arc(c + 4, c - 2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  // ------------------------------------------------------------------------
  // GRASS: a tileable dark-fantasy ground tile.
  // ------------------------------------------------------------------------
  createGrassTexture() {
    const size = 64;
    const canvas = this.createCanvas(TEXTURE_KEYS.GRASS, size, size);
    if (!canvas) return;
    const ctx = canvas.getContext();

    // Base
    ctx.fillStyle = "#16241a";
    ctx.fillRect(0, 0, size, size);

    // Subtle blade noise (deterministic-ish via random is fine for a tile).
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const shade = Math.random();
      if (shade < 0.5) ctx.fillStyle = "#1d2f22";
      else if (shade < 0.8) ctx.fillStyle = "#122017";
      else ctx.fillStyle = "#243a2a";
      ctx.fillRect(x, y, 2, 2);
    }

    canvas.refresh();
  }

  // ------------------------------------------------------------------------
  // PROJECTILE: a soft white glow orb, tinted per element at runtime.
  // ------------------------------------------------------------------------
  createProjectileTexture() {
    const size = 28;
    const canvas = this.createCanvas(TEXTURE_KEYS.PROJECTILE, size, size);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const c = size / 2;

    // Radial gradient = glow.
    const grad = ctx.createRadialGradient(c, c, 1, c, c, c);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }
}
