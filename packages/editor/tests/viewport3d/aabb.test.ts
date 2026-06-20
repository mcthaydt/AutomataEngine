import { describe, expect, it } from 'vitest'
import { itemAabb, pickItem, rayAabb } from '../../src/viewport3d/aabb'
import { boxItem, cylinderItem, markerItem } from '../fixtures/fakeDefinition'

describe('AABB + picking', () => {
  it('builds an AABB centered on a box item', () => {
    const aabb = itemAabb(boxItem('a', 0, 0))
    expect(aabb.min).toEqual({ x: -0.5, y: -0.5, z: -0.5 })
    expect(aabb.max).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
  })

  it('rayAabb returns entry distance for a hit, null for a miss', () => {
    const aabb = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }
    expect(rayAabb({ origin: { x: 0, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } }, aabb)).toBeCloseTo(9)
    expect(rayAabb({ origin: { x: 5, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } }, aabb)).toBeNull()
  })

  it('picks the nearest item under the ray', () => {
    const near = boxItem('near', 0, 0)
    const far = { ...boxItem('far', 0, 0), transform: { position: { x: 0, y: 0, z: -5 }, rotationEuler: { x: 0, y: 0, z: 0 } } }
    const id = pickItem([far, near], { origin: { x: 0, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } })
    expect(id).toBe('near')
  })

  it('returns null when nothing is hit', () => {
    expect(pickItem([boxItem('a', 0, 0)], { origin: { x: 50, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } })).toBeNull()
  })

  it('builds an AABB for a cylinder from radius and height', () => {
    const aabb = itemAabb(cylinderItem('c', 2, 4))
    expect(aabb.min).toEqual({ x: -2, y: -2, z: -2 })
    expect(aabb.max).toEqual({ x: 2, y: 2, z: 2 })
  })

  it('uses a small default box for marker items', () => {
    const aabb = itemAabb(markerItem('m'))
    expect(aabb.min.x).toBeCloseTo(-0.4)
    expect(aabb.max.x).toBeCloseTo(0.4)
  })
})
