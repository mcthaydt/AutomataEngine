import { describe, expect, it } from 'vitest'
import { initialMapView, screenToWorldXZ, worldToScreen } from '../../src/viewport2d/projection'

const size = { w: 800, h: 600 }

describe('2D map projection', () => {
  it('maps world origin to screen center at default pan', () => {
    const point = worldToScreen(initialMapView, { x: 0, y: 0, z: 0 }, size)
    expect(point).toEqual({ x: 400, y: 300 })
  })

  it('round-trips screen <-> world on the XZ plane', () => {
    const view = { panX: 2, panZ: -1, pixelsPerUnit: 24 }
    const world = screenToWorldXZ(view, { x: 123, y: 456 }, size)
    const back = worldToScreen(view, { x: world.x, y: 0, z: world.z }, size)
    expect(back.x).toBeCloseTo(123)
    expect(back.y).toBeCloseTo(456)
  })

  it('+x is right and +z is down in screen space', () => {
    const right = worldToScreen(initialMapView, { x: 1, y: 0, z: 0 }, size)
    const down = worldToScreen(initialMapView, { x: 0, y: 0, z: 1 }, size)
    expect(right.x).toBeGreaterThan(400)
    expect(down.y).toBeGreaterThan(300)
  })
})
