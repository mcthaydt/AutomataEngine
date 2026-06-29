import { vec3, type System, type Vec3 } from '@automata/engine'
import { clampToArena } from '../sim/arena'
import { isPlaying, type GameCtx } from '../game/context'
import type { Entity } from '../entity'

/** Steering direction (unit-ish) for an enemy given its bearing to the player. */
function steer(enemy: Entity, dir: Vec3, dist: number): Vec3 {
  const pref = enemy.weapon?.preferredRange
  if (enemy.enemy?.kind === 'shooter' && pref !== undefined) {
    if (dist > pref + 1) return dir
    if (dist < pref - 1) return vec3.scale(dir, -1)
    return { x: -dir.z, y: 0, z: dir.x }
  }
  return dir
}

/** Moves enemies: rammers + boss chase; shooters kite to their preferred range. */
export function createEnemyAI(): System<GameCtx> {
  return {
    name: 'enemyAI',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const player = ctx.world.with('player', 'transform').first
      if (!player) return
      for (const enemy of ctx.world.with('enemy', 'transform', 'velocity')) {
        const toPlayer = vec3.sub(player.transform.position, enemy.transform.position)
        const dist = vec3.length(toPlayer)
        const dir = vec3.normalize(toPlayer)
        const move = steer(enemy, dir, dist)
        enemy.velocity = vec3.scale(move, ctx.config.enemy[enemy.enemy.kind].speed)
        const t = enemy.transform
        t.prevPosition = t.position
        t.position = clampToArena(vec3.add(t.position, vec3.scale(enemy.velocity, ctx.dt)), ctx.config)
      }
    }
  }
}
