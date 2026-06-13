import { describe, expect, it } from 'vitest'
import { vec3 } from '../../src/math/vec3'

describe('vec3', () => {
  it('creates and clones without aliasing', () => {
    const v = vec3.create(1, 2, 3)
    const c = vec3.clone(v)
    expect(c).toEqual({ x: 1, y: 2, z: 3 })
    expect(c).not.toBe(v)
  })

  it('adds, subtracts, scales', () => {
    expect(vec3.add({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 })
    expect(vec3.sub({ x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 0, y: 1, z: 2 })
    expect(vec3.scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 })
  })

  it('computes length and normalizes (zero-safe)', () => {
    expect(vec3.length({ x: 3, y: 4, z: 0 })).toBe(5)
    expect(vec3.normalize({ x: 3, y: 4, z: 0 })).toEqual({ x: 0.6, y: 0.8, z: 0 })
    expect(vec3.normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('lerps componentwise', () => {
    expect(vec3.lerp({ x: 0, y: 0, z: 0 }, { x: 10, y: -10, z: 4 }, 0.5))
      .toEqual({ x: 5, y: -5, z: 2 })
  })
})
