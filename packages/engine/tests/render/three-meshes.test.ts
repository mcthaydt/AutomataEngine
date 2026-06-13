import { describe, expect, it } from 'vitest'
import { Mesh, MeshStandardMaterial, SphereGeometry } from 'three'
import { createThreeRenderer } from '../../src/render/three'
import { quat } from '../../src/math/quat'

describe('createThreeRenderer: meshes', () => {
  it('adds primitive meshes to the scene with the requested color', () => {
    const { port, scene } = createThreeRenderer()
    const before = scene.children.length
    port.add({ id: 'ball' }, { primitive: 'sphere', radius: 0.5, color: '#ff5964' })
    port.add({ id: 'floor' }, { primitive: 'box', size: { x: 8, y: 0.5, z: 16 }, color: '#7ec850' })
    port.add({ id: 'bumper' }, { primitive: 'cylinder', radius: 0.6, height: 0.5, color: '#ffd23f' })
    expect(scene.children.length).toBe(before + 3)
    expect(port.objectCount).toBe(3)

    const sphere = scene.children[before] as Mesh
    expect(sphere.geometry).toBeInstanceOf(SphereGeometry)
    expect((sphere.material as MeshStandardMaterial).color.getHexString()).toBe('ff5964')
  })

  it('setPose moves and rotates the mesh', () => {
    const { port, scene } = createThreeRenderer()
    const entity = { id: 'ball' }
    port.add(entity, { primitive: 'sphere', radius: 0.5, color: '#ffffff' })
    const mesh = scene.children[scene.children.length - 1] as Mesh
    port.setPose(entity, { x: 1, y: 2, z: 3 }, quat.fromEuler(Math.PI / 2, 0, 0))
    expect(mesh.position.x).toBeCloseTo(1)
    expect(mesh.position.y).toBeCloseTo(2)
    expect(mesh.position.z).toBeCloseTo(3)
    expect(mesh.quaternion.x).toBeCloseTo(Math.SQRT1_2)
    expect(mesh.quaternion.w).toBeCloseTo(Math.SQRT1_2)
  })

  it('remove disposes geometry and material and detaches the mesh', () => {
    const { port, scene } = createThreeRenderer()
    const entity = { id: 'ball' }
    port.add(entity, { primitive: 'sphere', radius: 0.5, color: '#ffffff' })
    const mesh = scene.children[scene.children.length - 1] as Mesh
    let geometryDisposed = false
    mesh.geometry.addEventListener('dispose', () => { geometryDisposed = true })
    port.remove(entity)
    expect(port.objectCount).toBe(0)
    expect(mesh.parent).toBeNull()
    expect(geometryDisposed).toBe(true)
  })

  it('setPose and remove for unknown entities are safe no-ops', () => {
    const { port } = createThreeRenderer()
    expect(() => {
      port.setPose({}, { x: 0, y: 0, z: 0 }, quat.identity())
      port.remove({})
    }).not.toThrow()
  })

  it('dispose removes tracked meshes, render groups, and scene-owned lights', () => {
    const { port, scene } = createThreeRenderer()
    const stage = port.createGroup()
    port.add({ id: 'floor' }, { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color: '#fff' }, stage)
    const group = scene.children.at(-1)!
    expect(port.objectCount).toBe(1)
    port.dispose()
    expect(port.objectCount).toBe(0)
    expect(group.parent).toBeNull()
    expect(scene.children).toHaveLength(0)
    expect(() => port.setGroupRotation(stage, { x: 0, y: 0, z: 0 })).toThrow(/Unknown render group/)
  })
})
