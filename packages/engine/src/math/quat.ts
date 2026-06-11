import type { Vec3 } from './vec3'

export interface Quat { x: number; y: number; z: number; w: number }

export const quat = {
  identity: (): Quat => ({ x: 0, y: 0, z: 0, w: 1 }),

  /** Intrinsic XYZ euler order, radians. */
  fromEuler(x: number, y: number, z: number): Quat {
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2)
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2)
    const cz = Math.cos(z / 2), sz = Math.sin(z / 2)
    return {
      x: sx * cy * cz + cx * sy * sz,
      y: cx * sy * cz - sx * cy * sz,
      z: cx * cy * sz + sx * sy * cz,
      w: cx * cy * cz - sx * sy * sz
    }
  },

  multiply(a: Quat, b: Quat): Quat {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
    }
  },

  apply(q: Quat, v: Vec3): Vec3 {
    const tx = 2 * (q.y * v.z - q.z * v.y)
    const ty = 2 * (q.z * v.x - q.x * v.z)
    const tz = 2 * (q.x * v.y - q.y * v.x)
    return {
      x: v.x + q.w * tx + (q.y * tz - q.z * ty),
      y: v.y + q.w * ty + (q.z * tx - q.x * tz),
      z: v.z + q.w * tz + (q.x * ty - q.y * tx)
    }
  },

  normalize(q: Quat): Quat {
    const len = Math.hypot(q.x, q.y, q.z, q.w)
    if (len === 0) return quat.identity()
    return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
  },

  /** Normalized lerp, fine for small per-frame interpolation steps. */
  nlerp(a: Quat, b: Quat, t: number): Quat {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
    const sign = dot < 0 ? -1 : 1
    return quat.normalize({
      x: a.x + (sign * b.x - a.x) * t,
      y: a.y + (sign * b.y - a.y) * t,
      z: a.z + (sign * b.z - a.z) * t,
      w: a.w + (sign * b.w - a.w) * t
    })
  }
}
