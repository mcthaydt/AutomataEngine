import type { Vec3 } from '@automata/engine'
import type { PulsebreakCompiledProject } from '../project/types'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Clamps an XZ position to the square arena, leaving y untouched. */
export function clampToArena(position: Vec3, config: PulsebreakCompiledProject): Vec3 {
  return {
    x: clamp(position.x, -config.arena.half, config.arena.half),
    y: position.y,
    z: clamp(position.z, -config.arena.half, config.arena.half)
  }
}
