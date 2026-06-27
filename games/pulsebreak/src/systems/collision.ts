import { vec3, type System, type WithComponents } from '@automata/engine'
import { PLAYER } from '../config'
import { emitFeedback } from './feedback'
import { isPlaying, type GameCtx } from '../game/context'
import type { Entity } from '../entity'

type Collidable = WithComponents<Entity, 'transform' | 'collider'>
type Player = WithComponents<Entity, 'transform' | 'collider' | 'invuln'>
type LiveEnemy = WithComponents<Entity, 'transform' | 'collider' | 'health'>

function overlap(a: Collidable, b: Collidable): boolean {
  const gap = a.collider.radius + b.collider.radius
  return vec3.length(vec3.sub(a.transform.position, b.transform.position)) <= gap
}

function damageEnemy(ctx: GameCtx, enemy: LiveEnemy, damage: number): void {
  enemy.health.current -= damage
  if (enemy.health.current <= 0) {
    ctx.store.dispatch({ type: 'enemyKilled', value: enemy.scoreValue ?? 0 })
    emitFeedback(ctx.feedback, 'enemyKilled', enemy.transform.position)
    ctx.world.remove(enemy)
  } else {
    emitFeedback(ctx.feedback, 'enemyHit', enemy.transform.position)
  }
}

function hurtPlayer(ctx: GameCtx, player: Player, amount: number): void {
  if (player.invuln.remainingS > 0) return
  player.invuln.remainingS = PLAYER.invulnS
  ctx.store.dispatch({ type: 'playerDamaged', amount })
  emitFeedback(ctx.feedback, 'playerHit', player.transform.position)
}

/** Circle-overlap resolution: player shots vs enemies, enemy shots + bodies vs player. */
export function createCollision(): System<GameCtx> {
  return {
    name: 'collision',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const player = ctx.world.with('player', 'transform', 'collider', 'invuln').first
      const projectiles = [...ctx.world.with('projectile', 'transform', 'collider')]
      const enemies = [...ctx.world.with('enemy', 'transform', 'collider', 'health')]

      for (const proj of projectiles) {
        if (proj.projectile.faction !== 'player') continue
        for (const enemy of enemies) {
          if (enemy.health.current <= 0 || !overlap(proj, enemy)) continue
          damageEnemy(ctx, enemy, proj.projectile.damage)
          ctx.world.remove(proj)
          break
        }
      }

      if (!player) return
      for (const proj of projectiles) {
        if (proj.projectile.faction !== 'enemy' || !ctx.world.has(proj)) continue
        if (overlap(proj, player)) {
          ctx.world.remove(proj)
          hurtPlayer(ctx, player, proj.projectile.damage)
        }
      }
      for (const enemy of ctx.world.with('enemy', 'transform', 'collider', 'contactDamage')) {
        if (overlap(enemy, player)) hurtPlayer(ctx, player, enemy.contactDamage.amount)
      }
    }
  }
}
