/* ==========================================================================
   Etherfall - Magic (spell framework)
   A lightweight, data-driven wrapper around a single magic.json entry. It
   knows its own stats and how to spawn its Projectile toward a target. The
   MagicSystem owns the active spell + auto-attack cadence; Magic itself just
   describes "what" a spell is and "how" to launch it.

   Adding a new spell = adding an entry in data/magic.json (no code changes).
   ========================================================================== */

export class Magic {
  /**
   * @param {object} def  one entry from data/magic.json
   */
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.element = def.element;
    this.damage = def.damage;
    this.cooldown = def.cooldown;
    this.speed = def.speed;
    this.range = def.range;
    this.size = def.size;
    this.lifetime = def.lifetime ?? 1500;
  }

  /**
   * Spawn a projectile of this spell from (x,y) toward (tx,ty).
   * @returns {Projectile|null}
   */
  createProjectile(scene, group, x, y, tx, ty, color) {
    const angle = Math.atan2(ty - y, tx - x);
    const p = group.get(x, y);
    if (p) p.fire(this, angle, color);
    return p;
  }
}
