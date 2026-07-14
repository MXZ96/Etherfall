/* ==========================================================================
   Etherfall - Runtime System (temporary run lifecycle)
   The single authority for EVERYTHING that is temporary to a single run. It is
   deliberately the mirror image of SaveSystem: Save owns permanent progression
   (element unlocks, affinity, world tree, codex, statistics, save blob) and is
   never touched here. Runtime owns only the ephemeral objects that must be torn
   down the instant a run ends and rebuilt from scratch when a new run starts.

   Runtime owns:
     - spell cooldowns / active spell instances
     - active projectiles (pooled group)
     - active area spells
     - physics references (colliders / overlaps)
     - particle emitters
     - temporary timers
     - runtime arrays
     - temporary event listeners (on the global game bus)
     - temporary buffs / runtime state flags

   The system registers disposers as the scene builds its run. On reset() every
   tracked object is destroyed, every array cleared, every cooldown reset and
   every temporary listener removed — so nothing temporary survives a scene
   restart. Because reset() runs inside the SHUTDOWN handler (before Phaser's
   own sweep), it also guarantees no cross-run leaks such as global-event
   listeners that would otherwise accumulate on game.events.
   ========================================================================== */

export class RuntimeSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} save  permanent SaveSystem reference (NEVER mutated by runtime)
   */
  constructor(scene, save) {
    this.scene = scene;
    this.save = save; // permanent anchor; kept only so the split is explicit

    // Disposers run in registration order on reset(). Each is wrapped in
    // try/catch by reset() so a failure in one never blocks the rest.
    this.disposers = [];

    // State resets (cooldowns, flags) run after objects are destroyed.
    this.stateResets = [];

    // Snapshot of what was torn down — handy for debug / validation.
    this.lastReset = null;
  }

  // --- Registration ------------------------------------------------------

  /** Track a physics collider / overlap for later destruction. */
  trackCollider(collider) {
    if (collider && typeof collider.destroy === "function") {
      this.disposers.push(() => collider.destroy());
    }
    return collider;
  }

  /**
   * Track a physics group; on reset it is cleared (children destroyed and
   * removed from the scene, which also frees their bodies).
   */
  trackGroup(group) {
    if (group && typeof group.clear === "function") {
      this.disposers.push(() => group.clear(true, true));
    }
    return group;
  }

  /** Track a particle emitter for destruction on reset. */
  trackEmitter(emitter) {
    if (emitter && typeof emitter.destroy === "function") {
      this.disposers.push(() => emitter.destroy());
    }
    return emitter;
  }

  /**
   * Track a temporary listener on any emitter (typically game.events). The
   * listener is attached now and removed on reset, so it can never leak across
   * runs.
   */
  trackListener(emitter, event, fn, context) {
    if (emitter && typeof emitter.on === "function") {
      emitter.on(event, fn, context);
      this.disposers.push(() => {
        if (typeof emitter.off === "function") emitter.off(event, fn, context);
      });
    }
    return fn;
  }

  /**
   * Track a runtime array (e.g. active area spells). On reset each still-active
   * entry is despawned, then the array is emptied.
   * @param {Array|function():Array} target  the array or a getter for it
   * @param {(item:any)=>void} [despawn]     optional per-item despawn call
   */
  trackArray(target, despawn) {
    this.disposers.push(() => {
      const arr = typeof target === "function" ? target() : target;
      if (!arr || !Array.isArray(arr)) return;
      for (let i = arr.length - 1; i >= 0; i--) {
        const item = arr[i];
        if (item && item.active && typeof despawn === "function") {
          try { despawn(item); } catch (e) { /* ignore */ }
        }
      }
      arr.length = 0;
    });
    return target;
  }

  /** Register a callback that resets transient state (cooldowns, flags). */
  trackStateReset(fn) {
    if (typeof fn === "function") this.stateResets.push(fn);
    return fn;
  }

  // --- Lifecycle ---------------------------------------------------------

  /**
   * Tear down every tracked runtime object. Safe to call multiple times and
   * safe to call when objects are partially torn down (all errors swallowed).
   */
  reset() {
    const counts = { disposers: 0, stateResets: 0 };

    for (const dispose of this.disposers) {
      try { dispose(); counts.disposers++; } catch (e) { /* swallow */ }
    }
    this.disposers.length = 0;

    for (const reset of this.stateResets) {
      try { reset(); counts.stateResets++; } catch (e) { /* swallow */ }
    }
    this.stateResets.length = 0;

    this.lastReset = counts;
  }
}
