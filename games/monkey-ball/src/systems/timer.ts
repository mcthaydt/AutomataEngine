import type { AudioPort, System } from '@automata/engine'
import type { Level } from '../data/level'
import type { GameCtx } from '../game/context'

/** Accumulates elapsed time while playing; at the limit, fires timeExpired. */
export function createTimer(level: Level, audio?: AudioPort): System<GameCtx> {
  const limitMs = level.timeLimitS * 1000
  return {
    name: 'timer',
    stage: 'update',
    run(ctx) {
      if (ctx.store.getState().scene !== 'playing') return
      ctx.store.dispatch({ type: 'tickedMs', ms: ctx.dt * 1000 })
      if (ctx.store.getState().session.elapsedMs >= limitMs) {
        audio?.play('fall')
        ctx.store.dispatch({ type: 'timeExpired' })
      }
    }
  }
}
