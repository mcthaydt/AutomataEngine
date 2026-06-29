import { vec3, type System, type Vec3 } from '@automata/engine'
import { isPlaying, type GameCtx } from '../game/context'

function outOfBounds(position: Vec3, half: number): boolean {
  const bounds = half + 2
  return Math.abs(position.x) > bounds || Math.abs(position.z) > bounds
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
        if (p.lifetime.remainingS <= 0 || outOfBounds(t.position, ctx.config.arena.half)) ctx.world.remove(p)
      }
    }
  }
}
