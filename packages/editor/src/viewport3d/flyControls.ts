import type { FlyCamera } from './flyCamera'
import { moveFly } from './flyCamera'

function movementFromKeys(keys: ReadonlySet<string>): { forward: number; right: number; up: number } {
  return {
    forward: (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0),
    right: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
    up: (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0)
  }
}

/** Advance keyboard flight by elapsed seconds; callers retain ownership of frame scheduling. */
export function advanceFlyControls(
  camera: FlyCamera,
  keys: ReadonlySet<string>,
  dt: number,
  speed = 15
): FlyCamera {
  const move = movementFromKeys(keys)
  return move.forward || move.right || move.up
    ? moveFly(camera, move, speed * Math.max(0, dt))
    : camera
}
