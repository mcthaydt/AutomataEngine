import { describe, expect, it, vi } from 'vitest'
import {
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry
} from 'three'
import { createThreeSpriteRenderer } from '../../src/sprite/three'
import type { SpriteDef, SpritePose, SpriteTextureSource } from '../../src/sprite/types'

function texture(width = 64, height = 32): SpriteTextureSource {
  return { image: { width, height } as unknown as TexImageSource, width, height }
}

const definition: SpriteDef = {
  textureId: 'keeper',
  frame: { x: 16, y: 8, width: 16, height: 8 },
  width: 16,
  height: 8,
  pivot: { x: 0.5, y: 0 },
  tint: '#80ffcc',
  alpha: 0.75
}

const pose: SpritePose = {
  x: 10,
  y: 20,
  layer: 4,
  depth: 7,
  scaleX: 2,
  scaleY: 3,
  rotationRad: Math.PI / 4
}

describe('createThreeSpriteRenderer', () => {
  it('creates a transparent unlit textured plane and an orthographic camera', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    const before = renderer.scene.children.length
    renderer.port.add({ id: 'keeper' }, definition)

    expect(renderer.camera).toBeInstanceOf(OrthographicCamera)
    expect(renderer.camera.left).toBe(-240)
    expect(renderer.camera.right).toBe(240)
    expect(renderer.camera.top).toBe(135)
    expect(renderer.camera.bottom).toBe(-135)
    expect(renderer.scene.children).toHaveLength(before + 1)

    const mesh = renderer.scene.children.at(-1) as Mesh
    const material = mesh.material as MeshBasicMaterial
    expect(mesh.geometry).toBeInstanceOf(PlaneGeometry)
    expect(material).toBeInstanceOf(MeshBasicMaterial)
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBe(0.75)
    expect(material.color.getHexString()).toBe('80ffcc')
    expect(material.map?.minFilter).toBe(NearestFilter)
    expect(material.map?.magFilter).toBe(NearestFilter)
  })

  it('maps top-left atlas source rectangles to Three texture offset and repeat', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture(64, 32)]]))
    renderer.port.add({}, definition)
    const material = (renderer.scene.children.at(-1) as Mesh).material as MeshBasicMaterial

    expect(material.map?.repeat.x).toBeCloseTo(0.25)
    expect(material.map?.repeat.y).toBeCloseTo(0.25)
    expect(material.map?.offset.x).toBeCloseTo(0.25)
    expect(material.map?.offset.y).toBeCloseTo(0.5)
  })

  it('applies pivoted pose, scale, rotation, and stable z depth', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    const entity = {}
    renderer.port.add(entity, definition)
    renderer.port.setPose(entity, pose)
    const mesh = renderer.scene.children.at(-1) as Mesh

    expect(mesh.position.x).toBeCloseTo(10)
    expect(mesh.position.y).toBeCloseTo(32)
    expect(mesh.position.z).toBeCloseTo(4.000007)
    expect(mesh.scale.x).toBeCloseTo(32)
    expect(mesh.scale.y).toBeCloseTo(24)
    expect(mesh.rotation.z).toBeCloseTo(Math.PI / 4)
    expect(mesh.renderOrder).toBe(4_000_007)
  })

  it('updates frame texture, visibility, tint, and alpha', () => {
    const renderer = createThreeSpriteRenderer(new Map([
      ['keeper', texture()],
      ['keeper-damaged', texture(32, 32)]
    ]))
    const entity = {}
    renderer.port.add(entity, definition)
    renderer.port.setFrame(entity, 'keeper-damaged', { x: 16, y: 16, width: 16, height: 16 })
    renderer.port.setVisible(entity, false)
    renderer.port.setTint(entity, '#ff0000', 0.25)

    const mesh = renderer.scene.children.at(-1) as Mesh
    const material = mesh.material as MeshBasicMaterial
    expect(mesh.visible).toBe(false)
    expect(material.color.getHexString()).toBe('ff0000')
    expect(material.opacity).toBe(0.25)
    expect(material.map?.repeat.toArray()).toEqual([0.5, 0.5])
    expect(material.map?.offset.toArray()).toEqual([0.5, 0])
  })

  it('updates the orthographic camera without perspective', () => {
    const renderer = createThreeSpriteRenderer(new Map())
    renderer.port.setCamera({
      x: 12, y: 34, viewportWidth: 480, viewportHeight: 270,
      zoom: 2, shakeX: 3, shakeY: -4, pixelSnap: 1
    })
    expect(renderer.camera.position.toArray()).toEqual([15, 30, 100])
    expect(renderer.camera.zoom).toBe(2)
  })

  it('rejects missing textures and invalid atlas rectangles', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    expect(() => renderer.port.add({}, { ...definition, textureId: 'missing' })).toThrow(/texture/i)
    expect(() => renderer.port.add({}, {
      ...definition,
      frame: { x: 60, y: 0, width: 16, height: 8 }
    })).toThrow(/frame/i)
  })

  it('uses white opaque defaults and ignores duplicate adds', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    const entity = {}
    renderer.port.add(entity, { ...definition, tint: undefined, alpha: undefined })
    renderer.port.add(entity, definition)
    const material = (renderer.scene.children.at(-1) as Mesh).material as MeshBasicMaterial
    expect(renderer.port.objectCount).toBe(1)
    expect(material.color.getHexString()).toBe('ffffff')
    expect(material.opacity).toBe(1)
  })

  it('treats updates and removal for unknown sprites as safe no-ops', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    const unknown = {}
    expect(() => {
      renderer.port.setPose(unknown, pose)
      renderer.port.setFrame(unknown, 'keeper', definition.frame)
      renderer.port.setVisible(unknown, false)
      renderer.port.setTint(unknown, '#fff', 1)
      renderer.port.remove(unknown)
    }).not.toThrow()
  })

  it('shares geometry and reuses an exact detached sprite with reset state', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    const firstEntity = { id: 'first' }
    const secondEntity = { id: 'second' }
    renderer.port.add(firstEntity, definition)
    const first = renderer.scene.children.at(-1) as Mesh
    renderer.port.add(secondEntity, definition)
    const second = renderer.scene.children.at(-1) as Mesh
    expect(first.geometry).toBe(second.geometry)

    renderer.port.setPose(firstEntity, pose)
    renderer.port.setVisible(firstEntity, false)
    renderer.port.setTint(firstEntity, '#ff0000', 0.2)
    renderer.port.remove(firstEntity)
    renderer.port.add({ id: 'replacement' }, definition)

    expect(renderer.scene.children.at(-1)).toBe(first)
    expect(first.position.toArray()).toEqual([0, 0, 0])
    expect(first.scale.toArray()).toEqual([1, 1, 1])
    expect(first.rotation.z).toBe(0)
    expect(first.visible).toBe(true)
    expect((first.material as MeshBasicMaterial).color.getHexString()).toBe('80ffcc')
    expect((first.material as MeshBasicMaterial).opacity).toBe(0.75)
  })

  it('defers shared resource disposal until idempotent renderer teardown', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    const entity = {}
    renderer.port.add(entity, definition)
    const mesh = renderer.scene.children.at(-1) as Mesh
    const geometryDisposed = vi.fn()
    const materialDisposed = vi.fn()
    const textureDisposed = vi.fn()
    mesh.geometry.addEventListener('dispose', geometryDisposed)
    ;(mesh.material as MeshBasicMaterial).addEventListener('dispose', materialDisposed)
    ;(mesh.material as MeshBasicMaterial).map?.addEventListener('dispose', textureDisposed)

    renderer.port.remove(entity)
    expect(materialDisposed).not.toHaveBeenCalled()
    expect(textureDisposed).not.toHaveBeenCalled()
    expect(geometryDisposed).not.toHaveBeenCalled()

    renderer.port.dispose()
    renderer.port.dispose()
    expect(materialDisposed).toHaveBeenCalledTimes(1)
    expect(textureDisposed).toHaveBeenCalledTimes(1)
    expect(geometryDisposed).toHaveBeenCalledTimes(1)
    expect(renderer.port.objectCount).toBe(0)
    expect(renderer.scene.children).toHaveLength(0)
  })

  it('removes active sprites during teardown', () => {
    const renderer = createThreeSpriteRenderer(new Map([['keeper', texture()]]))
    renderer.port.add({}, definition)
    expect(renderer.scene.children).toHaveLength(1)
    renderer.port.dispose()
    expect(renderer.scene.children).toHaveLength(0)
  })

  it('fits wide viewports and ignores invalid resize dimensions', () => {
    const renderer = createThreeSpriteRenderer(new Map())
    renderer.resizeViewport(960, 270)
    expect(renderer.camera.left).toBe(-480)
    expect(renderer.camera.right).toBe(480)
    expect(renderer.camera.top).toBe(135)
    renderer.resizeViewport(0, 270)
    expect(renderer.camera.left).toBe(-480)
  })
})
