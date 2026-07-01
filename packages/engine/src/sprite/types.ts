export interface Point2 {
  x: number
  y: number
}

export interface SpriteSourceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SpriteFrame {
  textureId: string
  source: SpriteSourceRect
  durationS: number
  event?: string
}

export interface SpriteAnimation {
  name: string
  loop: boolean
  frames: readonly SpriteFrame[]
}

export interface AnimationState {
  animation: string
  frame: number
  elapsedS: number
  complete: boolean
}

export interface OrthographicCameraDef {
  x: number
  y: number
  viewportWidth: number
  viewportHeight: number
  zoom: number
  shakeX: number
  shakeY: number
  pixelSnap: number
}

export interface SpriteDef {
  textureId: string
  frame: SpriteSourceRect
  width: number
  height: number
  pivot: Point2
  tint?: string
  alpha?: number
}

export interface SpritePose {
  x: number
  y: number
  layer: number
  depth: number
  scaleX: number
  scaleY: number
  rotationRad: number
}

export interface SpriteTextureSource {
  image: TexImageSource
  width: number
  height: number
}
