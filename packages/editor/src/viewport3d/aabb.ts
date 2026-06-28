import type { Vec3 } from '@automata/engine'
import type { SceneItem } from '../model/types'
import type { Ray } from './ray'

export interface Aabb { min: Vec3; max: Vec3 }

/**
 * A minimal, game-agnostic picking footprint. The generic project picker works
 * purely from `{ id, position, bounds }`, so it never depends on the legacy
 * `SceneItem`; the legacy helpers below adapt `SceneItem` onto the same path.
 */
export type Bounds =
  | { kind: 'box'; half: Vec3 }
  | { kind: 'cylinder'; radius: number; halfHeight: number }
  | { kind: 'point'; half: number }

export interface BoundedItem {
  id: string
  position: Vec3
  bounds: Bounds
}

const MARKER_HALF = 0.4

/** Axis-aligned bounds from a position + bounds shape (rotation deliberately ignored). */
export function boundedAabb(position: Vec3, bounds: Bounds): Aabb {
  let hx: number
  let hy: number
  let hz: number
  switch (bounds.kind) {
    case 'box':
      hx = bounds.half.x; hy = bounds.half.y; hz = bounds.half.z
      break
    case 'cylinder':
      hx = bounds.radius; hy = bounds.halfHeight; hz = bounds.radius
      break
    case 'point':
      hx = bounds.half; hy = bounds.half; hz = bounds.half
      break
  }
  return {
    min: { x: position.x - hx, y: position.y - hy, z: position.z - hz },
    max: { x: position.x + hx, y: position.y + hy, z: position.z + hz }
  }
}

/** Slab method. Returns entry distance t >= 0, or null if the ray misses. */
export function rayAabb(ray: Ray, box: Aabb): number | null {
  let tmin = -Infinity
  let tmax = Infinity
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = ray.origin[axis]
    const dir = ray.dir[axis]
    const lo = box.min[axis]
    const hi = box.max[axis]
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return null
      continue
    }
    let t1 = (lo - origin) / dir
    let t2 = (hi - origin) / dir
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }
  return tmax < 0 ? null : Math.max(tmin, 0)
}

/** Pick the nearest bounded item under the ray by stable id. */
export function pickBounded(items: readonly BoundedItem[], ray: Ray): string | null {
  let best: { id: string; t: number } | null = null
  for (const item of items) {
    const t = rayAabb(ray, boundedAabb(item.position, item.bounds))
    if (t !== null && (best === null || t < best.t)) best = { id: item.id, t }
  }
  return best?.id ?? null
}

/** Legacy `SceneItem` → bounds adapter so old and new picking share one path. */
function sceneItemBounds(item: SceneItem): Bounds {
  if (item.shape.type === 'box') {
    return { kind: 'box', half: { x: item.shape.size.x / 2, y: item.shape.size.y / 2, z: item.shape.size.z / 2 } }
  }
  if (item.shape.type === 'cylinder') {
    return { kind: 'cylinder', radius: item.shape.radius, halfHeight: item.shape.height / 2 }
  }
  return { kind: 'point', half: MARKER_HALF }
}

/** Axis-aligned bounds of a legacy item. Rotation is ignored as a pick approximation. */
export function itemAabb(item: SceneItem): Aabb {
  return boundedAabb(item.transform.position, sceneItemBounds(item))
}

export function pickItem(items: SceneItem[], ray: Ray): string | null {
  return pickBounded(items.map((item) => ({ id: item.id, position: item.transform.position, bounds: sceneItemBounds(item) })), ray)
}
