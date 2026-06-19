import { describe, expect, it } from 'vitest'
import { EDITOR_FOV_Y, buildRay, rayPlaneY } from '../../src/viewport3d/ray'

const size = { w: 800, h: 600 }

describe('ray build', () => {
  it('center pixel shoots along the camera forward', () => {
    const cam = { position: { x: 0, y: 5, z: 0 }, yaw: 0, pitch: 0 }
    const ray = buildRay(cam, { x: 400, y: 300 }, size, EDITOR_FOV_Y)
    expect(ray.origin).toEqual({ x: 0, y: 5, z: 0 })
    expect(ray.dir.z).toBeCloseTo(-1)
    expect(ray.dir.x).toBeCloseTo(0)
    expect(ray.dir.y).toBeCloseTo(0)
  })

  it('a downward ray hits the ground plane', () => {
    const cam = { position: { x: 2, y: 10, z: -3 }, yaw: 0, pitch: -Math.PI / 2 + 0.05 }
    const ray = buildRay(cam, { x: 400, y: 300 }, size, EDITOR_FOV_Y)
    const hit = rayPlaneY(ray, 0)
    expect(hit).not.toBeNull()
    expect(hit!.y).toBeCloseTo(0)
    expect(hit!.x).toBeCloseTo(2, 0)
  })

  it('returns null when the ray is parallel to the plane', () => {
    const ray = { origin: { x: 0, y: 5, z: 0 }, dir: { x: 0, y: 0, z: -1 } }
    expect(rayPlaneY(ray, 0)).toBeNull()
  })
})
