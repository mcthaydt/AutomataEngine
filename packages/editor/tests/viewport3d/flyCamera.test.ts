import { describe, expect, it } from 'vitest'
import {
  cameraForward, cameraView, initialFlyCamera, moveFly, rotateFly
} from '../../src/viewport3d/flyCamera'

describe('fly camera', () => {
  it('looks down -z at yaw 0, pitch 0', () => {
    const forward = cameraForward({ ...initialFlyCamera, position: { x: 0, y: 0, z: 0 }, pitch: 0 })
    expect(forward.x).toBeCloseTo(0)
    expect(forward.y).toBeCloseTo(0)
    expect(forward.z).toBeCloseTo(-1)
  })

  it('cameraView returns position and a lookAt one unit ahead', () => {
    const cam = { position: { x: 0, y: 2, z: 0 }, yaw: 0, pitch: 0 }
    const { position, lookAt } = cameraView(cam)
    expect(position).toEqual({ x: 0, y: 2, z: 0 })
    expect(lookAt.z).toBeCloseTo(-1)
  })

  it('yaw of +90° turns forward toward -x', () => {
    const cam = rotateFly({ ...initialFlyCamera, pitch: 0 }, Math.PI / 2, 0)
    const forward = cameraForward(cam)
    expect(forward.x).toBeCloseTo(-1)
    expect(Math.abs(forward.z)).toBeLessThan(1e-6)
  })

  it('moving forward advances along the forward vector', () => {
    const cam = moveFly({ ...initialFlyCamera, pitch: 0 }, { forward: 1, right: 0, up: 0 }, 2)
    expect(cam.position.z).toBeCloseTo(initialFlyCamera.position.z - 2)
  })

  it('clamps pitch to just under straight up/down', () => {
    const cam = rotateFly(initialFlyCamera, 0, 10)
    expect(cam.pitch).toBeLessThan(Math.PI / 2)
    expect(cam.pitch).toBeGreaterThan(Math.PI / 2 - 0.2)
  })
})
