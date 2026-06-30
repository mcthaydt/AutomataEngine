import { describe, expect, it } from 'vitest'
import { boundedAabb, pickBounded, rayAabb } from '../../src/viewport3d/aabb'

describe('AABB + project picking', () => {
  it('builds bounds for registered spatial shapes', () => {
    expect(boundedAabb(
      { x: 1, y: 0, z: 0 },
      { kind: 'box', half: { x: 0.5, y: 1, z: 2 } }
    )).toEqual({
      min: { x: 0.5, y: -1, z: -2 },
      max: { x: 1.5, y: 1, z: 2 }
    })
    expect(boundedAabb(
      { x: 0, y: 0, z: 0 },
      { kind: 'cylinder', radius: 2, halfHeight: 3 }
    )).toEqual({
      min: { x: -2, y: -3, z: -2 },
      max: { x: 2, y: 3, z: 2 }
    })
    expect(boundedAabb(
      { x: 0, y: 0, z: 0 },
      { kind: 'point', half: 0.4 }
    ).min.x).toBeCloseTo(-0.4)
  })

  it('returns ray entry distance for a hit and null for a miss', () => {
    const aabb = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }
    expect(rayAabb(
      { origin: { x: 0, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } },
      aabb
    )).toBeCloseTo(9)
    expect(rayAabb(
      { origin: { x: 5, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } },
      aabb
    )).toBeNull()
  })

  it('picks the nearest bounded project entity', () => {
    const near = {
      id: 'near', position: { x: 0, y: 0, z: 0 },
      bounds: { kind: 'box', half: { x: 0.5, y: 0.5, z: 0.5 } }
    } as const
    const far = {
      id: 'far', position: { x: 0, y: 0, z: -5 },
      bounds: { kind: 'box', half: { x: 0.5, y: 0.5, z: 0.5 } }
    } as const
    const ray = { origin: { x: 0, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } }
    expect(pickBounded([far, near], ray)).toBe('near')
    expect(pickBounded([near], {
      origin: { x: 50, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 }
    })).toBeNull()
  })
})
