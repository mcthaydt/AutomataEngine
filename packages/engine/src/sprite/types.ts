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
