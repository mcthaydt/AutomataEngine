import type { OrthographicCameraDef, Point2 } from './types'

export function worldToOrthographicScreen(camera: OrthographicCameraDef, point: Point2): Point2 {
  return {
    x: camera.viewportWidth / 2 + (point.x - camera.x - camera.shakeX) * camera.zoom,
    y: camera.viewportHeight / 2 - (point.y - camera.y - camera.shakeY) * camera.zoom
  }
}

export function snapWorldPoint(point: Point2, cell: number): Point2 {
  if (cell <= 0) return { ...point }
  return {
    x: Math.round(point.x / cell) * cell,
    y: Math.round(point.y / cell) * cell
  }
}

function hash(seed: number): number {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return value >>> 0
}

export function sampleCameraShake(seed: number, amplitude: number): Point2 {
  if (!Number.isFinite(amplitude) || amplitude < 0) {
    throw new Error('Camera shake amplitude must be a non-negative finite number')
  }
  if (amplitude === 0) return { x: 0, y: 0 }
  const angle = hash(seed) / 0x1_0000_0000 * Math.PI * 2
  const radius = hash(seed ^ 0x9e37_79b9) / 0xffff_ffff * amplitude
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

export function decayCameraShake(amplitude: number, dt: number, rate: number): number {
  if (!Number.isFinite(amplitude) || amplitude < 0) {
    throw new Error('Camera shake amplitude must be a non-negative finite number')
  }
  if (!Number.isFinite(dt) || dt < 0) throw new Error('Camera shake time must be non-negative')
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Camera shake decay rate must be non-negative')
  return amplitude * Math.exp(-rate * dt)
}
