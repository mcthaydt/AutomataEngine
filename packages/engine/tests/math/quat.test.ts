import { describe, expect, it } from 'vitest'
import { quat } from '../../src/math/quat'

const HALF_PI = Math.PI / 2

describe('quat', () => {
  it('identity leaves vectors unchanged', () => {
    const v = quat.apply(quat.identity(), { x: 1, y: 2, z: 3 })
    expect(v.x).toBeCloseTo(1); expect(v.y).toBeCloseTo(2); expect(v.z).toBeCloseTo(3)
  })

  it('fromEuler(+90 degrees about X) maps Y to Z', () => {
    const q = quat.fromEuler(HALF_PI, 0, 0)
    const v = quat.apply(q, { x: 0, y: 1, z: 0 })
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(0); expect(v.z).toBeCloseTo(1)
  })

  it('fromEuler(+90 degrees about Z) maps X to Y', () => {
    const q = quat.fromEuler(0, 0, HALF_PI)
    const v = quat.apply(q, { x: 1, y: 0, z: 0 })
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(1); expect(v.z).toBeCloseTo(0)
  })

  it('multiply composes rotations (apply b then a... as a times b)', () => {
    const rotX = quat.fromEuler(HALF_PI, 0, 0)
    const rotZ = quat.fromEuler(0, 0, HALF_PI)
    const composed = quat.multiply(rotX, rotZ)
    const v = quat.apply(composed, { x: 1, y: 0, z: 0 })
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(0); expect(v.z).toBeCloseTo(1)
  })

  it('nlerp(a, b, 0.5) is the normalized halfway rotation', () => {
    const a = quat.identity()
    const b = quat.fromEuler(HALF_PI, 0, 0)
    const half = quat.nlerp(a, b, 0.5)
    const v = quat.apply(half, { x: 0, y: 1, z: 0 })
    expect(v.y).toBeCloseTo(Math.SQRT1_2)
    expect(v.z).toBeCloseTo(Math.SQRT1_2)
    expect(Math.hypot(half.x, half.y, half.z, half.w)).toBeCloseTo(1)
  })
})
