/* ==========================================================================
   Etherfall - Math Utilities
   Small, pure helpers used across entities and systems.
   ========================================================================== */

/**
 * Clamp a number into the inclusive [min, max] range.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between a and b by t (0..1).
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Normalize a 2D vector (x, y) in place-style; returns a new {x, y} with
 * magnitude 1 (or 0,0 if the input was zero). Used so diagonal movement is
 * not faster than cardinal movement.
 */
export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/**
 * Euclidean distance between two points.
 */
export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Random float in [min, max).
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Random integer in [min, max] inclusive.
 */
export function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

/**
 * Move `current` toward `target` by at most `maxDelta` (smooth accel/decel).
 * Used for the player's velocity so movement eases in/out instead of
 * snapping. Returns the new value.
 */
export function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}
