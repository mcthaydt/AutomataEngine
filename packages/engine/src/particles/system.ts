import type { EngineEntity } from '../ecs/components'
import type { System } from '../ecs/scheduler'
import type { World } from '../ecs/world'
import { vec3 } from '../math/vec3'
import { burstSeeds, type BurstOptions } from './emitter'

/** Spawns a particle burst into the world. */
export function spawnBurst<E extends EngineEntity>(world: World<E>, options: BurstOptions): void {
  for (const seed of burstSeeds(options)) world.add(seed as E)
}

/** Integrates particle motion + lifetime; removes expired particles. */
export function particleSystem<Ctx extends { world: World<EngineEntity>; dt: number }>(): System<Ctx> {
  return {
    name: 'particles',
    stage: 'update',
    run(ctx) {
      for (const entity of [...ctx.world.with('particle', 'transform', 'lifetime')]) {
        const particle = entity.particle
        const transform = entity.transform
        particle.velocity = { ...particle.velocity, y: particle.velocity.y - particle.gravity * ctx.dt }
        transform.prevPosition = transform.position
        transform.position = vec3.add(transform.position, vec3.scale(particle.velocity, ctx.dt))
        entity.lifetime.remainingS -= ctx.dt
        if (entity.lifetime.remainingS <= 0) ctx.world.remove(entity)
      }
    }
  }
}
