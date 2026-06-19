import type { Vec3 } from '@automata/engine'

export interface FlyCamera { position: Vec3; yaw: number; pitch: number }

export const initialFlyCamera: FlyCamera = { position: { x: 0, y: 8, z: 16 }, yaw: 0, pitch: -0.4 }

const PITCH_LIMIT = Math.PI / 2 - 0.05

/** Forward unit vector. yaw rotates about +y (0 => -z); pitch tilts up/down. */
export function cameraForward(cam: FlyCamera): Vec3 {
  const cp = Math.cos(cam.pitch)
  return { x: -Math.sin(cam.yaw) * cp, y: Math.sin(cam.pitch), z: -Math.cos(cam.yaw) * cp }
}

function cameraRight(cam: FlyCamera): Vec3 {
  return { x: Math.cos(cam.yaw), y: 0, z: -Math.sin(cam.yaw) }
}

export function cameraView(cam: FlyCamera): { position: Vec3; lookAt: Vec3 } {
  const forward = cameraForward(cam)
  return {
    position: cam.position,
    lookAt: {
      x: cam.position.x + forward.x,
      y: cam.position.y + forward.y,
      z: cam.position.z + forward.z
    }
  }
}

export function rotateFly(cam: FlyCamera, dYaw: number, dPitch: number): FlyCamera {
  const pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dPitch))
  return { ...cam, yaw: cam.yaw + dYaw, pitch }
}

export function moveFly(
  cam: FlyCamera,
  move: { forward: number; right: number; up: number },
  speed: number
): FlyCamera {
  const forward = cameraForward(cam)
  const right = cameraRight(cam)
  return {
    ...cam,
    position: {
      x: cam.position.x + (forward.x * move.forward + right.x * move.right) * speed,
      y: cam.position.y + (move.up + forward.y * move.forward) * speed,
      z: cam.position.z + (forward.z * move.forward + right.z * move.right) * speed
    }
  }
}
