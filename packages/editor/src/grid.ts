import type { Vec3 } from '@automata/engine'

export function snapToGrid(value: number, cell: number): number {
  return Math.round(value / cell) * cell
}

export function snapVec3XZ(v: Vec3, cell: number): Vec3 {
  return { x: snapToGrid(v.x, cell), y: v.y, z: snapToGrid(v.z, cell) }
}
