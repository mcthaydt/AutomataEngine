import type { Vec3 } from '@automata/engine'
import { ARENA } from '../config'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Clamps an XZ position to the square arena, leaving y untouched. */
export function clampToArena(position: Vec3): Vec3 {
  return {
    x: clamp(position.x, -ARENA.half, ARENA.half),
    y: position.y,
    z: clamp(position.z, -ARENA.half, ARENA.half)
  }
}
