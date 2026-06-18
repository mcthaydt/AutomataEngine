import type { EventQueue, System } from '@automata/engine'
import { isPlaying, type GameCtx } from '../game/context'
import type { Level } from '../data/level'
import { emitFeedback } from './feedback'

/** Below the level's fall plane: lose a life and respawn (store rebuilds the run). */
export function createFallOff(level: Level, feedback: EventQueue): System<GameCtx> {
  return {
    name: 'fallOff',
    stage: 'postPhysics',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const ball = ctx.world.with('ball', 'transform').first
      if (ball && ball.transform.position.y < level.fallY) {
        // Emit before the dispatch: ballFell bumps runId, whose respawn
        // subscription clears the physics queue (not this feedback queue).
        emitFeedback(feedback, 'fell')
        ctx.store.dispatch({ type: 'ballFell' })
      }
    }
  }
}
