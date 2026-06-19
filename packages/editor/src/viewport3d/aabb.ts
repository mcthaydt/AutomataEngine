import type { Vec3 } from '@automata/engine'
import type { SceneItem } from '../model/types'
import type { Ray } from './ray'

export interface Aabb { min: Vec3; max: Vec3 }

const MARKER_HALF = 0.4

/** Axis-aligned bounds of an item. Rotation is ignored as a deliberate pick approximation. */
export function itemAabb(item: SceneItem): Aabb {
  const position = item.transform.position
  let hx = MARKER_HALF
  let hy = MARKER_HALF
  let hz = MARKER_HALF
  if (item.shape.type === 'box') {
    hx = item.shape.size.x / 2
    hy = item.shape.size.y / 2
    hz = item.shape.size.z / 2
  } else if (item.shape.type === 'cylinder') {
    hx = item.shape.radius
    hy = item.shape.height / 2
    hz = item.shape.radius
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

export function pickItem(items: SceneItem[], ray: Ray): string | null {
  let best: { id: string; t: number } | null = null
  for (const item of items) {
    const t = rayAabb(ray, itemAabb(item))
    if (t !== null && (best === null || t < best.t)) best = { id: item.id, t }
  }
  return best?.id ?? null
}
