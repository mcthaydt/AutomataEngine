import type { System } from '@automata/engine'
import { isPlaying, type GameCtx } from '../game/context'

/** Ticks the player's hit-invulnerability window toward zero each step. */
export function createInvuln(): System<GameCtx> {
  return {
    name: 'invuln',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      for (const player of ctx.world.with('player', 'invuln')) {
        player.invuln.remainingS = Math.max(0, player.invuln.remainingS - ctx.dt)
      }
    }
  }
}
