import { vec3, type System, type Vec3 } from '@automata/engine'
import { ARENA } from '../config'
import { isPlaying, type GameCtx } from '../game/context'

const BOUNDS = ARENA.half + 2

function outOfBounds(position: Vec3): boolean {
  return Math.abs(position.x) > BOUNDS || Math.abs(position.z) > BOUNDS
}

/** Integrates projectile motion; removes expired or out-of-bounds shots. */
export function createProjectiles(): System<GameCtx> {
  return {
    name: 'projectiles',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      for (const p of [...ctx.world.with('projectile', 'transform', 'velocity', 'lifetime')]) {
        const t = p.transform
        t.prevPosition = t.position
        t.position = vec3.add(t.position, vec3.scale(p.velocity, ctx.dt))
        p.lifetime.remainingS -= ctx.dt
        if (p.lifetime.remainingS <= 0 || outOfBounds(t.position)) ctx.world.remove(p)
      }
    }
  }
}
