import { describe, expect, it } from 'vitest'
import { ProjectTransformError, resolveWorldTransform, worldToLocalPosition } from '../src'
import type { SceneDocument } from '../src'

/** Build a scene entity carrying a single core.transform component. */
function withTransform(
  id: string,
  position: { x: number; y: number; z: number },
  opts: { parentId?: string; rotation?: { x: number; y: number; z: number }; scale?: { x: number; y: number; z: number } } = {}
) {
  return {
    id, name: id, parentId: opts.parentId, enabled: true,
    components: [{
      id: 'transform', typeId: 'core.transform',
      data: {
        position,
        rotation: opts.rotation ?? { x: 0, y: 0, z: 0 },
        scale: opts.scale ?? { x: 1, y: 1, z: 1 }
      }
    }]
  }
}

describe('world transform resolution', () => {
  it('composes parent translation and scale exactly', () => {
    const scene: SceneDocument = {
      id: 's', name: 'S',
      entities: [
        withTransform('parent', { x: 10, y: 0, z: 0 }, { scale: { x: 2, y: 2, z: 2 } }),
        withTransform('child', { x: 0, y: 0, z: -1 }, { parentId: 'parent' })
      ]
    }
    expect(resolveWorldTransform(scene, 'child').position).toEqual({ x: 10, y: 0, z: -2 })
  })

  it('rotates local offsets through the parent orientation', () => {
    const scene: SceneDocument = {
      id: 's', name: 'S',
      entities: [
        withTransform('parent', { x: 10, y: 0, z: 0 }, { rotation: { x: 0, y: Math.PI / 2, z: 0 } }),
        withTransform('child', { x: 2, y: 0, z: 0 }, { parentId: 'parent' })
      ]
    }
    const world = resolveWorldTransform(scene, 'child').position
    expect(world.x).toBeCloseTo(10)
    expect(world.y).toBeCloseTo(0)
    expect(world.z).toBeCloseTo(-2)
  })

  it('converts a world target back to local coordinates (inverse of resolution)', () => {
    const scene: SceneDocument = {
      id: 's', name: 'S',
      entities: [withTransform('parent', { x: 10, y: 0, z: 0 }, { rotation: { x: 0, y: Math.PI / 2, z: 0 } })]
    }
    const parentWorld = resolveWorldTransform(scene, 'parent')
    const local = worldToLocalPosition(parentWorld, { x: 10, y: 0, z: -2 })
    expect(local.x).toBeCloseTo(2)
    expect(local.y).toBeCloseTo(0)
    expect(local.z).toBeCloseTo(0)
  })

  it('throws ProjectTransformError on a missing parent', () => {
    const scene: SceneDocument = {
      id: 's', name: 'S',
      entities: [withTransform('child', { x: 0, y: 0, z: 0 }, { parentId: 'ghost' })]
    }
    expect(() => resolveWorldTransform(scene, 'child')).toThrow(ProjectTransformError)
  })

  it('throws ProjectTransformError on a parent cycle', () => {
    const scene: SceneDocument = {
      id: 's', name: 'S',
      entities: [
        withTransform('a', { x: 0, y: 0, z: 0 }, { parentId: 'b' }),
        withTransform('b', { x: 0, y: 0, z: 0 }, { parentId: 'a' })
      ]
    }
    expect(() => resolveWorldTransform(scene, 'a')).toThrow(/cycle/i)
  })
})
