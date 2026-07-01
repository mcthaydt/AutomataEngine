import type { SpriteRenderPort } from './port'
import type {
  OrthographicCameraDef,
  SpriteDef,
  SpritePose,
  SpriteSourceRect
} from './types'

export interface RecordedSprite {
  definition: SpriteDef
  pose?: SpritePose
  textureId: string
  frame: SpriteSourceRect
  visible: boolean
  tint: string
  alpha: number
  z?: number
}

export interface RecordingSpriteRenderer {
  port: SpriteRenderPort
  getSprite(entity: object): RecordedSprite | undefined
  camera(): OrthographicCameraDef | undefined
}

const cloneRect = (rect: SpriteSourceRect): SpriteSourceRect => ({ ...rect })
const cloneDefinition = (definition: SpriteDef): SpriteDef => ({
  ...definition,
  frame: cloneRect(definition.frame),
  pivot: { ...definition.pivot }
})

export function spriteDepth(layer: number, depth: number): number {
  const localDepth = Math.max(-999, Math.min(999, depth))
  return layer + localDepth * 0.000001
}

export function createRecordingSpriteRenderer(): RecordingSpriteRenderer {
  const sprites = new Map<object, RecordedSprite>()
  let camera: OrthographicCameraDef | undefined

  const port: SpriteRenderPort = {
    get objectCount() { return sprites.size },

    add(entity, definition) {
      if (sprites.has(entity)) return
      sprites.set(entity, {
        definition: cloneDefinition(definition),
        textureId: definition.textureId,
        frame: cloneRect(definition.frame),
        visible: true,
        tint: definition.tint ?? '#ffffff',
        alpha: definition.alpha ?? 1
      })
    },

    setPose(entity, pose) {
      const sprite = sprites.get(entity)
      if (!sprite) return
      sprite.pose = { ...pose }
      sprite.z = spriteDepth(pose.layer, pose.depth)
    },

    setFrame(entity, textureId, frame) {
      const sprite = sprites.get(entity)
      if (!sprite) return
      sprite.textureId = textureId
      sprite.frame = cloneRect(frame)
    },

    setVisible(entity, visible) {
      const sprite = sprites.get(entity)
      if (sprite) sprite.visible = visible
    },

    setTint(entity, color, alpha) {
      const sprite = sprites.get(entity)
      if (!sprite) return
      sprite.tint = color
      sprite.alpha = alpha
    },

    remove(entity) {
      sprites.delete(entity)
    },

    setCamera(next) {
      camera = { ...next }
    },

    dispose() {
      sprites.clear()
      camera = undefined
    }
  }

  return {
    port,
    getSprite(entity) {
      const sprite = sprites.get(entity)
      if (!sprite) return undefined
      return {
        ...sprite,
        definition: cloneDefinition(sprite.definition),
        pose: sprite.pose ? { ...sprite.pose } : undefined,
        frame: cloneRect(sprite.frame)
      }
    },
    camera: () => camera ? { ...camera } : undefined
  }
}
