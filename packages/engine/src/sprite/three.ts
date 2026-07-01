import {
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture
} from 'three'
import type { SpriteRenderPort } from './port'
import { spriteDepth } from './recording'
import type {
  OrthographicCameraDef,
  SpriteDef,
  SpriteSourceRect,
  SpriteTextureSource
} from './types'

export interface ThreeSpriteRenderer {
  port: SpriteRenderPort
  scene: Scene
  camera: OrthographicCamera
  resizeViewport(width: number, height: number): void
}

interface SpriteObject {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
  definition: SpriteDef
  key: string
}

const frameKey = (textureId: string, frame: SpriteSourceRect): string =>
  `${textureId}:${frame.x}:${frame.y}:${frame.width}:${frame.height}`

const definitionKey = (definition: SpriteDef): string => [
  frameKey(definition.textureId, definition.frame),
  definition.width,
  definition.height,
  definition.pivot.x,
  definition.pivot.y,
  definition.tint ?? '#ffffff',
  definition.alpha ?? 1
].join(':')

function renderOrder(layer: number, depth: number): number {
  return layer * 1_000_000 + Math.max(-999, Math.min(999, Math.round(depth)))
}

function assertFrame(source: SpriteTextureSource, frame: SpriteSourceRect): void {
  const valid = frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0 &&
    frame.x + frame.width <= source.width && frame.y + frame.height <= source.height
  if (!valid) throw new Error('Sprite frame must be inside its texture')
}

export function createThreeSpriteRenderer(
  sources: ReadonlyMap<string, SpriteTextureSource>,
  logicalSize: { width: number; height: number } = { width: 480, height: 270 }
): ThreeSpriteRenderer {
  const scene = new Scene()
  const camera = new OrthographicCamera(
    -logicalSize.width / 2,
    logicalSize.width / 2,
    logicalSize.height / 2,
    -logicalSize.height / 2,
    0.1,
    200
  )
  camera.position.set(0, 0, 100)
  camera.lookAt(0, 0, 0)

  const geometry = new PlaneGeometry(1, 1)
  const textures = new Map<string, Texture>()
  const sprites = new Map<object, SpriteObject>()
  const meshPool = new Map<string, Mesh<PlaneGeometry, MeshBasicMaterial>[]>()
  const materials = new Set<MeshBasicMaterial>()
  let disposed = false

  const textureFor = (textureId: string, frame: SpriteSourceRect): Texture => {
    const source = sources.get(textureId)
    if (!source) throw new Error(`Unknown sprite texture: ${textureId}`)
    assertFrame(source, frame)
    const key = frameKey(textureId, frame)
    let texture = textures.get(key)
    if (!texture) {
      texture = new Texture(source.image)
      texture.colorSpace = SRGBColorSpace
      texture.generateMipmaps = false
      texture.minFilter = NearestFilter
      texture.magFilter = NearestFilter
      texture.repeat.set(frame.width / source.width, frame.height / source.height)
      texture.offset.set(frame.x / source.width, 1 - (frame.y + frame.height) / source.height)
      texture.needsUpdate = true
      textures.set(key, texture)
    }
    return texture
  }

  const port: SpriteRenderPort = {
    get objectCount() { return sprites.size },

    add(entity, definition) {
      if (sprites.has(entity)) return
      const key = definitionKey(definition)
      const pool = meshPool.get(key)
      const mesh = pool?.pop() ?? (() => {
        const material = new MeshBasicMaterial({
          map: textureFor(definition.textureId, definition.frame),
          color: definition.tint ?? '#ffffff',
          opacity: definition.alpha ?? 1,
          transparent: true,
          depthWrite: false
        })
        materials.add(material)
        return new Mesh(geometry, material)
      })()
      mesh.position.set(0, 0, 0)
      mesh.scale.set(1, 1, 1)
      mesh.rotation.set(0, 0, 0)
      mesh.renderOrder = 0
      mesh.visible = true
      mesh.material.map = textureFor(definition.textureId, definition.frame)
      mesh.material.color.set(definition.tint ?? '#ffffff')
      mesh.material.opacity = definition.alpha ?? 1
      mesh.material.needsUpdate = true
      scene.add(mesh)
      sprites.set(entity, {
        mesh,
        key,
        definition: {
          ...definition,
          frame: { ...definition.frame },
          pivot: { ...definition.pivot }
        }
      })
    },

    setPose(entity, pose) {
      const sprite = sprites.get(entity)
      if (!sprite) return
      const { definition, mesh } = sprite
      mesh.position.set(
        pose.x + (0.5 - definition.pivot.x) * definition.width * pose.scaleX,
        pose.y + (0.5 - definition.pivot.y) * definition.height * pose.scaleY,
        spriteDepth(pose.layer, pose.depth)
      )
      mesh.scale.set(definition.width * pose.scaleX, definition.height * pose.scaleY, 1)
      mesh.rotation.z = pose.rotationRad
      mesh.renderOrder = renderOrder(pose.layer, pose.depth)
    },

    setFrame(entity, textureId, frame) {
      const sprite = sprites.get(entity)
      if (!sprite) return
      sprite.mesh.material.map = textureFor(textureId, frame)
      sprite.mesh.material.needsUpdate = true
    },

    setVisible(entity, visible) {
      const sprite = sprites.get(entity)
      if (sprite) sprite.mesh.visible = visible
    },

    setTint(entity, color, alpha) {
      const sprite = sprites.get(entity)
      if (!sprite) return
      sprite.mesh.material.color.set(color)
      sprite.mesh.material.opacity = alpha
    },

    remove(entity) {
      const sprite = sprites.get(entity)
      if (!sprite) return
      sprite.mesh.removeFromParent()
      sprites.delete(entity)
      const pool = meshPool.get(sprite.key) ?? []
      pool.push(sprite.mesh)
      meshPool.set(sprite.key, pool)
    },

    setCamera(definition: OrthographicCameraDef) {
      camera.left = -definition.viewportWidth / 2
      camera.right = definition.viewportWidth / 2
      camera.top = definition.viewportHeight / 2
      camera.bottom = -definition.viewportHeight / 2
      camera.position.set(
        definition.x + definition.shakeX,
        definition.y + definition.shakeY,
        100
      )
      camera.zoom = definition.zoom
      camera.updateProjectionMatrix()
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const sprite of sprites.values()) {
        sprite.mesh.removeFromParent()
      }
      sprites.clear()
      for (const material of materials) material.dispose()
      materials.clear()
      meshPool.clear()
      for (const texture of textures.values()) texture.dispose()
      textures.clear()
      geometry.dispose()
    }
  }

  const resizeViewport = (width: number, height: number): void => {
    if (width <= 0 || height <= 0) return
    const logicalAspect = logicalSize.width / logicalSize.height
    const actualAspect = width / height
    if (actualAspect >= logicalAspect) {
      const halfWidth = logicalSize.height * actualAspect / 2
      camera.left = -halfWidth
      camera.right = halfWidth
      camera.top = logicalSize.height / 2
      camera.bottom = -logicalSize.height / 2
    } else {
      const halfHeight = logicalSize.width / actualAspect / 2
      camera.left = -logicalSize.width / 2
      camera.right = logicalSize.width / 2
      camera.top = halfHeight
      camera.bottom = -halfHeight
    }
    camera.updateProjectionMatrix()
  }

  return { port, scene, camera, resizeViewport }
}
