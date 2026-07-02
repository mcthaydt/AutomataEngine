import { describe, expect, it } from 'vitest'
import { createLighthouseCamera } from '../../src/render/camera'
import { createInitialNight } from '../../src/state/night'

describe('lighthouse camera', () => {
  it('keeps a fixed full-tower 480x270 pixel-snapped frame', () => {
    const controller = createLighthouseCamera(42)
    const camera = controller.update(createInitialNight(1, 42), 0)
    expect(camera).toMatchObject({
      viewportWidth: 480,
      viewportHeight: 270,
      zoom: 1,
      pixelSnap: 1,
      x: 0,
      y: 135
    })
  })

  it('applies only a small snapped focus offset toward the keeper', () => {
    const state = createInitialNight(1, 42)
    state.keeper = { ...state.keeper, x: 80, y: 216 }
    const camera = createLighthouseCamera(42).update(state, 0)
    expect(Math.abs(camera.x)).toBeLessThanOrEqual(8)
    expect(Math.abs(camera.y - 135)).toBeLessThanOrEqual(4)
    expect(Number.isInteger(camera.x)).toBe(true)
    expect(Number.isInteger(camera.y)).toBe(true)
  })

  it('bounds and decays shake without mutating simulation state', () => {
    const state = createInitialNight(1, 42)
    const before = structuredClone(state)
    const controller = createLighthouseCamera(7)
    controller.impulse(10)
    const shaken = controller.update(state, 0)
    const initialMagnitude = Math.hypot(shaken.shakeX, shaken.shakeY)
    expect(initialMagnitude).toBeLessThanOrEqual(4)

    const decayed = controller.update(state, 1)
    expect(Math.hypot(decayed.shakeX, decayed.shakeY)).toBeLessThan(initialMagnitude)
    expect(state).toEqual(before)
  })
})
