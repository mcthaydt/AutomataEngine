import { describe, expect, it } from 'vitest'
import { createRecordingSpriteRenderer, spriteDepth } from '../../src/sprite/recording'
import type { OrthographicCameraDef, SpriteDef, SpritePose } from '../../src/sprite/types'

const definition: SpriteDef = {
  textureId: 'keeper',
  frame: { x: 0, y: 0, width: 16, height: 24 },
  width: 16,
  height: 24,
  pivot: { x: 0.5, y: 0 },
  tint: '#ffffff',
  alpha: 1
}

const pose: SpritePose = {
  x: 10,
  y: 20,
  layer: 4,
  depth: 7,
  scaleX: 1,
  scaleY: 1,
  rotationRad: 0
}

describe('recording sprite renderer', () => {
  it('adds each entity once and records an immutable definition', () => {
    const renderer = createRecordingSpriteRenderer()
    const entity = { id: 'keeper' }
    renderer.port.add(entity, definition)
    renderer.port.add(entity, { ...definition, width: 99 })

    expect(renderer.port.objectCount).toBe(1)
    expect(renderer.getSprite(entity)?.definition).toEqual(definition)
    expect(renderer.getSprite(entity)?.definition).not.toBe(definition)
  })

  it('records pose, frame, visibility, and tint updates', () => {
    const renderer = createRecordingSpriteRenderer()
    const entity = { id: 'keeper' }
    renderer.port.add(entity, definition)
    renderer.port.setPose(entity, pose)
    renderer.port.setFrame(entity, 'keeper-damaged', { x: 16, y: 0, width: 16, height: 24 })
    renderer.port.setVisible(entity, false)
    renderer.port.setTint(entity, '#00ffcc', 0.4)

    expect(renderer.getSprite(entity)).toMatchObject({
      pose,
      textureId: 'keeper-damaged',
      frame: { x: 16, y: 0, width: 16, height: 24 },
      visible: false,
      tint: '#00ffcc',
      alpha: 0.4,
      z: spriteDepth(4, 7)
    })
  })

  it('maps layer and depth into stable separated z coordinates', () => {
    expect(spriteDepth(0, 0)).toBe(0)
    expect(spriteDepth(4, 7)).toBeCloseTo(4.000007)
    expect(spriteDepth(5, -10)).toBeGreaterThan(spriteDepth(4, 999))
  })

  it('records a copied camera definition', () => {
    const renderer = createRecordingSpriteRenderer()
    const camera: OrthographicCameraDef = {
      x: 0, y: 10, viewportWidth: 480, viewportHeight: 270,
      zoom: 1, shakeX: 0, shakeY: 0, pixelSnap: 1
    }
    renderer.port.setCamera(camera)
    camera.x = 99
    expect(renderer.camera()).toMatchObject({ x: 0, viewportWidth: 480 })
  })

  it('treats updates and removals for unknown entities as safe no-ops', () => {
    const renderer = createRecordingSpriteRenderer()
    const unknown = {}
    expect(() => {
      renderer.port.setPose(unknown, pose)
      renderer.port.setFrame(unknown, 'missing', definition.frame)
      renderer.port.setVisible(unknown, false)
      renderer.port.setTint(unknown, '#fff', 1)
      renderer.port.remove(unknown)
    }).not.toThrow()
    expect(renderer.port.objectCount).toBe(0)
  })

  it('removes sprites and disposes idempotently', () => {
    const renderer = createRecordingSpriteRenderer()
    const first = { id: 'first' }
    const second = { id: 'second' }
    renderer.port.add(first, definition)
    renderer.port.add(second, definition)
    renderer.port.remove(first)
    expect(renderer.getSprite(first)).toBeUndefined()
    expect(renderer.port.objectCount).toBe(1)

    renderer.port.dispose()
    renderer.port.dispose()
    expect(renderer.port.objectCount).toBe(0)
    expect(renderer.getSprite(second)).toBeUndefined()
  })
})
