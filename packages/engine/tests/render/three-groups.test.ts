import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createThreeRenderer } from '../../src/render/three'

describe('render groups', () => {
  it('meshes added to a group live under it, not the scene root', () => {
    const { port, scene } = createThreeRenderer()
    const rootCount = scene.children.length
    const stage = port.createGroup()
    port.add({ id: 'floor' }, { primitive: 'box', size: { x: 8, y: 0.5, z: 16 }, color: '#7ec850' }, stage)
    expect(scene.children.length).toBe(rootCount + 1)
  })

  it('rotating a group rotates its children in world space (cosmetic stage tilt)', () => {
    const { port, scene } = createThreeRenderer()
    const stage = port.createGroup()
    const entity = { id: 'floor' }
    port.add(entity, { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color: '#ffffff' }, stage)
    port.setPose(entity, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 })

    port.setGroupRotation(stage, { x: 0, y: 0, z: Math.PI / 2 })
    scene.updateMatrixWorld(true)

    const group = scene.children[scene.children.length - 1]
    const mesh = group.children[0]!
    const world = new Vector3()
    mesh.getWorldPosition(world)
    expect(world.x).toBeCloseTo(0)
    expect(world.y).toBeCloseTo(2)
  })

  it('groups nest', () => {
    const { port } = createThreeRenderer()
    const outer = port.createGroup()
    const inner = port.createGroup(outer)
    expect(() => port.setGroupRotation(inner, { x: 0.1, y: 0, z: 0 })).not.toThrow()
  })

  it('unknown group ids throw a descriptive error', () => {
    const { port } = createThreeRenderer()
    expect(() => port.setGroupRotation(999, { x: 0, y: 0, z: 0 })).toThrow(/999/)
  })
})
