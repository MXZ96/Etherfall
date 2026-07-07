/* ==========================================================================
   Etherfall - Progression Formula
   Scalable, non-hardcoded EXP curve. The requirement to advance FROM `level`
   to the next grows by a fixed step each level (an arithmetic progression),
   which reproduces the v0.0.2 spec example exactly:

     expToNext(level) = EXP.BASE + EXP.STEP * (level - 1)

     L1->L2 : 100   L2->L3 : 150   L3->L4 : 200
     cumulative to reach a level: L1=0  L2=100  L3=250  L4=450

   To swap in a steeper exponential curve later, edit expToNext() only.
   ========================================================================== */

import { EXP } from "../config/constants.js";

/**
 * EXP required to go from `level` to `level + 1`.
 */
export function expToNext(level) {
  return EXP.BASE + EXP.STEP * (level - 1);
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
