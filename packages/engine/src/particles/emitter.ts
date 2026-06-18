import { createTransform, type EngineEntity } from '../ecs/components'
import { vec3, type Vec3 } from '../math/vec3'
import type { RenderableDef } from '../render/types'

export interface BurstOptions {
  origin: Vec3
  count: number
  speed: number
  lifetimeS: number
  color: string
  gravity?: number
  radius?: number
}

/** Radial burst seeds spread by the golden angle. */
export function burstSeeds(options: BurstOptions): EngineEntity[] {
  const gravity = options.gravity ?? 9.81
  const radius = options.radius ?? 0.08
  const renderable: RenderableDef = { primitive: 'sphere', radius, color: options.color }
  const seeds: EngineEntity[] = []
  for (let i = 0; i < options.count; i++) {
    const phi = i * 2.399963267
    const y = 1 - (2 * (i + 0.5)) / options.count
    const r = Math.sqrt(1 - y * y)
    const dir = { x: Math.cos(phi) * r, y: Math.abs(y), z: Math.sin(phi) * r }
    seeds.push({
      transform: createTransform(vec3.clone(options.origin)),
      renderable: { ...renderable },
      particle: { velocity: vec3.scale(dir, options.speed), gravity },
      lifetime: { remainingS: options.lifetimeS }
    })
  }
  return seeds
}
