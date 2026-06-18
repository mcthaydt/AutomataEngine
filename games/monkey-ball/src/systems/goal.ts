import type { EventQueue, System } from '@automata/engine'
import { isPlaying, type GameCtx } from '../game/context'
import { ballPartner, type PairEvent } from './pairing'
import { emitFeedback } from './feedback'

export function createGoal(events: EventQueue, feedback: EventQueue): System<GameCtx> {
  return {
    name: 'goal',
    stage: 'postPhysics',
    run(ctx) {
      if (!isPlaying(ctx)) return
      for (const event of events.read<PairEvent>('sensorEnter')) {
        const goal = ballPartner(event, 'goal')
        if (!goal) continue
        const { levelId, elapsedMs, bananas } = ctx.store.getState().session
        if (levelId !== null) {
          ctx.store.dispatch({ type: 'levelCompleted', levelId, timeMs: elapsedMs, bananas })
          emitFeedback(feedback, 'goalReached', goal.transform?.position)
        }
        return
      }
    }
  }
}
