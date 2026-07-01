import type {
  OrthographicCameraDef,
  SpriteDef,
  SpritePose,
  SpriteSourceRect
} from './types'

export interface SpriteRenderPort {
  add(entity: object, definition: SpriteDef): void
  setPose(entity: object, pose: SpritePose): void
  setFrame(entity: object, textureId: string, frame: SpriteSourceRect): void
  setVisible(entity: object, visible: boolean): void
  setTint(entity: object, color: string, alpha: number): void
  remove(entity: object): void
  setCamera(camera: OrthographicCameraDef): void
  readonly objectCount: number
  dispose(): void
}
