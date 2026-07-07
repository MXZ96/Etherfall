/* ==========================================================================
   Etherfall - Progression Formula
   Exponential EXP curve. The requirement to advance FROM `level` to the next
   grows geometrically, keeping early levels quick and late levels lengthy.

   expToNext(level) = round(BASE * GROWTH ^ (level - 1))

   Example curve (BASE=100, GROWTH=1.5):
     L1->L2 : 100
     L2->L3 : 150
     L3->L4 : 225
     L4->L5 : 338
   This is scalable and trivially re-balanced by editing the two constants.
   ========================================================================== */

const BASE = 100;
const GROWTH = 1.5;

/**
 * EXP required to go from `level` to `level + 1`.
 */
export function expToNext(level) {
  return Math.round(BASE * Math.pow(GROWTH, level - 1));
}

/**
 * Cumulative EXP required to *reach* `level` from level 1.
 * (Handy for save/debug tooling; the live game only needs expToNext.)
 */
export function cumulativeExpForLevel(level) {
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += expToNext(l);
  }
  return total;
}
