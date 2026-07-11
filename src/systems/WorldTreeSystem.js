/* ==========================================================================
   Etherfall - World Tree System (Ancient Forces, v0.0.9)
   The World Tree is NOT a skill tree. The Vessel does not unlock powers; the
   Ancient Forces *recognise* the Vessel. This system is the single authority
   for that recognition:

     - Fire  : "The First Flame"      (starting force, acknowledged on Awakening)
     - Water : "The Endless Tide"     (discovered via the Water Discovery event)
     - Air   : "The Whispering Sky"   (future)
     - Earth : "The Eternal Stone"    (future)
     - Spirit: "The Silent Witness"   (hidden — never revealed)

   Each force has a recognition state:
     - "unknown"       : not yet encountered (shown as ??? in the World Tree)
     - "known"         : the force has been encountered / discovered
     - "acknowledged"  : the force has formally Awakened and recognises the Vessel

   The system is pure state + rules + persistence. Visuals (the animated
   branches, codex page) are driven by consumers reading getForces()/forceState().
   All content lives in data/worldtree.json; nothing is hardcoded here.
   ========================================================================== */

import { EVENTS } from "../utils/events.js";

// Recognition states, in ascending order of significance.
const STATE = {
  UNKNOWN: "unknown",
  KNOWN: "known",
  ACKNOWLEDGED: "acknowledged",
};

export class WorldTreeSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} data  registry data (expects data.worldtree)
   * @param {SaveSystem} saveSystem  optional; persists force recognition
   */
  constructor(scene, data, saveSystem) {
    this.scene = scene;
    this.save = saveSystem;

    const wt = (data && data.worldtree) || {};
    this.defs = {};
    (wt.forces || []).forEach((d) => {
      this.defs[d.id] = d;
    });

    // Recognition state per force, loaded from (or initialised from) the save.
    const blank = {};
    for (const id in this.defs) {
      // Fire is the starting force: recognised from the very first run.
      blank[id] = this.defs[id].starting ? STATE.KNOWN : STATE.UNKNOWN;
    }
    const stored = (saveSystem && saveSystem.getSection("worldtree")) || {};
    const storedForces = stored.forces || {};
    this.state = {};
    for (const id in blank) {
      this.state[id] = storedForces[id] || blank[id];
    }
  }

  /** All force definitions (including hidden Spirit). */
  getForces() {
    return Object.values(this.defs);
  }

  /** Definition for a force id (or null). */
  getDef(id) {
    return this.defs[id] || null;
  }

  /** Recognition state of a force: "unknown" | "known" | "acknowledged". */
  forceState(id) {
    return this.state[id] || STATE.UNKNOWN;
  }

  /** True once a force has been encountered at all (known or acknowledged). */
  isForceDiscovered(id) {
    return this.forceState(id) !== STATE.UNKNOWN;
  }

  /** True once a force has formally Awakened and acknowledged the Vessel. */
  isForceAcknowledged(id) {
    return this.forceState(id) === STATE.ACKNOWLEDGED;
  }

  /**
   * Mark a force as encountered/discovered (e.g. the Water Discovery event).
   * Does not downgrade an already-acknowledged force.
   * @param {string} id
   * @returns {boolean} whether state changed
   */
  discoverForce(id) {
    if (!this.defs[id] || this.state[id] === STATE.ACKNOWLEDGED) return false;
    if (this.state[id] === STATE.KNOWN) return false;
    this.state[id] = STATE.KNOWN;
    this.persist();
    this.scene.game.events.emit(EVENTS.FORCE_DISCOVERED, id, this.defs[id]);
    return true;
  }

  /**
   * Mark a force as having formally acknowledged the Vessel (Fire Awakening).
   * @param {string} id
   * @returns {boolean} whether state changed
   */
  acknowledgeForce(id) {
    if (!this.defs[id] || this.state[id] === STATE.ACKNOWLEDGED) return false;
    this.state[id] = STATE.ACKNOWLEDGED;
    this.persist();
    this.scene.game.events.emit(EVENTS.FORCE_ACKNOWLEDGED, id, this.defs[id]);
    return true;
  }

  /** Persist recognition state (no-op without a save system). */
  persist() {
    if (!this.save) return;
    this.save.patchSection("worldtree", { forces: { ...this.state } });
  }

  /** Snapshot for save/debug consumers. */
  serialize() {
    return { forces: { ...this.state } };
  }
}

export { STATE as FORCE_STATE };
