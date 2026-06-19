import type { PhysicsPort, System } from '@automata/engine'
import type { Entity } from '../entity'
import type { GameCtx } from '../game/context'
import { pathPosition } from './path'

/** Drives kinematic platform bodies along their waypoints. */
export function createMovingPlatform(physics: PhysicsPort): System<GameCtx> {
  const distance = new WeakMap<Entity, number>()
  return {
    name: 'movingPlatform',
    stage: 'update',
    run(ctx) {
      for (const entity of ctx.world.with('movingPlatform', 'transform')) {
        const mp = entity.movingPlatform
        if (mp.waypoints.length === 0) continue
        const d = (distance.get(entity) ?? 0) + mp.speed * ctx.dt
        distance.set(entity, d)
        physics.setKinematicTarget(entity, pathPosition(mp.waypoints, d, mp.mode))
      }
    }
  }
}
