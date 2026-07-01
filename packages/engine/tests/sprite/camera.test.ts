import { describe, expect, it } from 'vitest'
import {
  decayCameraShake,
  sampleCameraShake,
  snapWorldPoint,
  worldToOrthographicScreen
} from '../../src/sprite/camera'
import type { OrthographicCameraDef } from '../../src/sprite/types'

const camera: OrthographicCameraDef = {
  x: 10,
  y: 20,
  viewportWidth: 480,
  viewportHeight: 270,
  zoom: 2,
  shakeX: 0,
  shakeY: 0,
  pixelSnap: 1
}

describe('orthographic camera math', () => {
  it('maps the camera position to the logical viewport center', () => {
    expect(worldToOrthographicScreen(camera, { x: 10, y: 20 })).toEqual({ x: 240, y: 135 })
  })

  it('maps world offsets with zoom and an upward-positive world axis', () => {
    expect(worldToOrthographicScreen(camera, { x: 15, y: 25 })).toEqual({ x: 250, y: 125 })
  })

  it('applies shake as a camera offset', () => {
    const shaken = { ...camera, shakeX: 2, shakeY: -1 }
    expect(worldToOrthographicScreen(shaken, { x: 10, y: 20 })).toEqual({ x: 236, y: 133 })
  })

  it('snaps world points to the configured logical-pixel grid', () => {
    expect(snapWorldPoint({ x: 1.24, y: -2.26 }, 0.5)).toEqual({ x: 1, y: -2.5 })
    expect(snapWorldPoint({ x: 1.24, y: -2.26 }, 0)).toEqual({ x: 1.24, y: -2.26 })
  })

  it('samples deterministic bounded shake for a seed', () => {
    const first = sampleCameraShake(42, 3)
    expect(sampleCameraShake(42, 3)).toEqual(first)
    expect(sampleCameraShake(43, 3)).not.toEqual(first)
    expect(Math.hypot(first.x, first.y)).toBeLessThanOrEqual(3)
    expect(sampleCameraShake(42, 0)).toEqual({ x: 0, y: 0 })
  })

  it('decays shake exponentially and clamps invalid ranges', () => {
    expect(decayCameraShake(4, 0.5, 2)).toBeCloseTo(4 * Math.exp(-1))
    expect(decayCameraShake(4, 0, 2)).toBe(4)
    expect(decayCameraShake(4, 1, 0)).toBe(4)
    expect(() => decayCameraShake(-1, 1, 2)).toThrow(/amplitude/i)
    expect(() => decayCameraShake(1, -1, 2)).toThrow(/time/i)
  })
})
