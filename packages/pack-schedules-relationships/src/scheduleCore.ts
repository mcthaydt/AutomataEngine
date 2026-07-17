import type { WalkerDef } from './config'

/** Pure straight-line walker movement; walkers are decorative and have no collision. */
export interface WalkerPosition { x: number; z: number }

export function walkerTarget(walker: WalkerDef, slot: number): WalkerPosition {
  const station = walker.stations[slot]
  if (!station) throw new Error(`Walker "${walker.id}" has no station for slot ${slot}`)
  return station
}

export function stepWalker(position: WalkerPosition, target: WalkerPosition, speed: number, dt: number): WalkerPosition {
  const dx = target.x - position.x
  const dz = target.z - position.z
  const dist = Math.hypot(dx, dz)
  const stride = speed * dt
  if (dist <= stride) return { x: target.x, z: target.z }
  return { x: position.x + (dx / dist) * stride, z: position.z + (dz / dist) * stride }
}

export function initialWalkerPositions(walkers: readonly WalkerDef[], slot: number): Record<string, WalkerPosition> {
  return Object.fromEntries(walkers.map((walker) => [walker.id, { ...walkerTarget(walker, slot) }]))
}
