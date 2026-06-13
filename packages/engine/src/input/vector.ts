import type { InputVector } from './types'

/** Clamps a 2D vector to the unit disc, preserving direction. |v| <= 1. */
export function clampToUnit(x: number, y: number): InputVector {
  const len = Math.hypot(x, y)
  return len > 1 ? { x: x / len, y: y / len } : { x, y }
}
