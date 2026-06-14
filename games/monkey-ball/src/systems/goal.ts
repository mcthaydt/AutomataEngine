import type { EventQueue, System } from '@automata/engine'
import type { GameCtx } from '../game/context'
import { ballPartner, type PairEvent } from './pairing'

export function createGoal(events: EventQueue): System<GameCtx> {
  return {
    name: 'goal',
    stage: 'postPhysics',
    run(ctx) {
      if (ctx.store.getState().scene !== 'playing') return
      for (const event of events.read<PairEvent>('sensorEnter')) {
        if (!ballPartner(event, 'goal')) continue
        const { levelId, elapsedMs, bananas } = ctx.store.getState().session
        if (levelId !== null) {
          ctx.store.dispatch({ type: 'levelCompleted', levelId, timeMs: elapsedMs, bananas })
        }
        return
      }
    }
  }
}
