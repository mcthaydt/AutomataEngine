import { vec3, type System } from '@automata/engine'
import { ENEMY } from '../config'
import { spawnProjectile } from '../sim/spawn'
import { emitFeedback } from './feedback'
import { isPlaying, type GameCtx } from '../game/context'
import type { EnemyWeapon, Entity } from '../entity'

function fire(ctx: GameCtx, enemy: Entity, weapon: EnemyWeapon, toPlayer: { x: number; z: number }): void {
  const origin = enemy.transform!.position
  const radius = ENEMY[enemy.enemy!.kind].projectileRadius!
  const shot = (velocity: { x: number; y: number; z: number }): void => {
    spawnProjectile(ctx.world, {
      position: origin, velocity, faction: 'enemy', damage: weapon.projectileDamage,
      radius, color: '#ff7b4a'
    })
  }
  if (weapon.burst) {
    for (let i = 0; i < weapon.burst; i++) {
      const angle = (i / weapon.burst) * Math.PI * 2
      shot({ x: Math.cos(angle) * weapon.projectileSpeed, y: 0, z: Math.sin(angle) * weapon.projectileSpeed })
    }
  } else {
    const dir = vec3.normalize({ x: toPlayer.x, y: 0, z: toPlayer.z })
    shot(vec3.scale(dir, weapon.projectileSpeed))
  }
  emitFeedback(ctx.feedback, 'enemyShoot', origin)
}

/** Ranged enemy fire: shooters single-shot, the boss fires radial bursts. */
export function createEnemyWeapon(): System<GameCtx> {
  return {
    name: 'enemyWeapon',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const player = ctx.world.with('player', 'transform').first
      if (!player) return
      for (const enemy of ctx.world.with('enemy', 'transform', 'weapon')) {
        const weapon = enemy.weapon
        weapon.remainingS = Math.max(0, weapon.remainingS - ctx.dt)
        const toPlayer = vec3.sub(player.transform.position, enemy.transform.position)
        if (weapon.remainingS > 0 || vec3.length(toPlayer) > weapon.range) continue
        weapon.remainingS = weapon.cooldownS
        fire(ctx, enemy, weapon, toPlayer)
      }
    }
  }
}
