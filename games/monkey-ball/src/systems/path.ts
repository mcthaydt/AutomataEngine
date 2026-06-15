import { vec3, type Vec3 } from '@automata/engine'

/** Position at arc length `distance` along a polyline, wrapping by mode. */
export function pathPosition(waypoints: Vec3[], distance: number, mode: 'loop' | 'pingpong'): Vec3 {
  if (waypoints.length === 0) return { x: 0, y: 0, z: 0 }
  if (waypoints.length === 1) return vec3.clone(waypoints[0]!)

  const segments = waypoints.slice(1).map((w, i) => vec3.length(vec3.sub(w, waypoints[i]!)))
  const total = segments.reduce((a, b) => a + b, 0)
  if (total === 0) return vec3.clone(waypoints[0]!)

  let t: number
  if (mode === 'loop') {
    t = ((distance % total) + total) % total
  } else {
    const period = total * 2
    const p = ((distance % period) + period) % period
    t = p <= total ? p : period - p
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (t <= seg || i === segments.length - 1) {
      return vec3.lerp(waypoints[i]!, waypoints[i + 1]!, seg === 0 ? 0 : Math.min(1, t / seg))
    }
    t -= seg
  }
  return vec3.clone(waypoints[waypoints.length - 1]!)
}
