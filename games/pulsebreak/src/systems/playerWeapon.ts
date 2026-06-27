import { vec3, type System, type Vec3, type WithComponents, type World } from '@automata/engine'
import { spawnProjectile } from '../sim/spawn'
import { PLAYER } from '../config'
import { emitFeedback } from './feedback'
import { isPlaying, type GameCtx } from '../game/context'
import type { Entity } from '../entity'

type PlacedEnemy = WithComponents<Entity, 'transform'>

/** Nearest enemy within `maxRange` of `from`, or undefined. */
export function nearestEnemy(world: World<Entity>, from: Vec3, maxRange: number): PlacedEnemy | undefined {
  let best: PlacedEnemy | undefined
  let bestDist = Infinity
  for (const enemy of world.with('enemy', 'transform')) {
    const dist = vec3.length(vec3.sub(enemy.transform.position, from))
    if (dist <= maxRange && dist < bestDist) {
      best = enemy
      bestDist = dist
    }
  }
  return best
}

/** Auto-targets the nearest enemy and auto-fires on the upgradable fire rate. */
export function createPlayerWeapon(): System<GameCtx> {
  return {
    name: 'playerWeapon',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const player = ctx.world.with('player', 'transform', 'firing').first
      if (!player) return
      player.firing.remainingS = Math.max(0, player.firing.remainingS - ctx.dt)
      const target = nearestEnemy(ctx.world, player.transform.position, PLAYER.range)
      if (!target || player.firing.remainingS > 0) return

      const stats = ctx.store.getState().run
      player.firing.remainingS = 1 / stats.fireRate
      const dir = vec3.normalize(vec3.sub(target.transform.position, player.transform.position))
      spawnProjectile(ctx.world, {
        position: player.transform.position,
        velocity: vec3.scale(dir, PLAYER.projectileSpeed),
        faction: 'player',
        damage: stats.damage,
        radius: PLAYER.projectileRadius,
        color: '#aef9ff'
      })
      emitFeedback(ctx.feedback, 'shoot', player.transform.position)
    }
  }
}
