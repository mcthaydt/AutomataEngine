import type { EventQueue, System } from '@automata/engine'
import type { Level } from '../data/level'
import { isPlaying, type GameCtx } from '../game/context'
import { emitFeedback } from './feedback'

/** Accumulates elapsed time while playing; at the limit, fires timeExpired. */
export function createTimer(level: Level, feedback: EventQueue): System<GameCtx> {
  const limitMs = level.timeLimitS * 1000
  return {
    name: 'timer',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      ctx.store.dispatch({ type: 'tickedMs', ms: ctx.dt * 1000 })
      if (ctx.store.getState().session.elapsedMs >= limitMs) {
        // Emit before the dispatch: timeExpired bumps runId, whose respawn
        // subscription clears the physics queue (not this feedback queue).
        emitFeedback(feedback, 'fell')
        ctx.store.dispatch({ type: 'timeExpired' })
      }
    }
  }
}
