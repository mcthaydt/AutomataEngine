import { PERSPECTIVE_FOV_DEG, type Vec3 } from '@automata/engine'
import { cameraForward, cameraRight, type FlyCamera } from './flyCamera'

/** Editor picking FOV (radians), derived from the engine camera's vertical FOV. */
export const EDITOR_FOV_Y = (PERSPECTIVE_FOV_DEG * Math.PI) / 180

export interface Ray { origin: Vec3; dir: Vec3 }

const norm = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

export function buildRay(
  cam: FlyCamera,
  screen: { x: number; y: number },
  size: { w: number; h: number },
  fovY: number
): Ray {
  const ndcX = (screen.x / size.w) * 2 - 1
  const ndcY = -((screen.y / size.h) * 2 - 1)
  const tanY = Math.tan(fovY / 2)
  const aspect = size.w / size.h
  const forward = cameraForward(cam)
  const right = cameraRight(cam)
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x
  }
  const sx = ndcX * tanY * aspect
  const sy = ndcY * tanY
  return {
    origin: cam.position,
    dir: norm({
      x: forward.x + right.x * sx + up.x * sy,
      y: forward.y + right.y * sx + up.y * sy,
      z: forward.z + right.z * sx + up.z * sy
    })
  }
}

/** Intersection with horizontal plane y = planeY, or null if parallel/behind. */
export function rayPlaneY(ray: Ray, planeY: number): Vec3 | null {
  if (Math.abs(ray.dir.y) < 1e-9) return null
  const t = (planeY - ray.origin.y) / ray.dir.y
  if (t < 0) return null
  return {
    x: ray.origin.x + ray.dir.x * t,
    y: planeY,
    z: ray.origin.z + ray.dir.z * t
  }
}
