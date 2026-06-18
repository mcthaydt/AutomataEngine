import { spawnBurst, type AudioPort, type EventQueue, type System } from '@automata/engine'
import type { GameCtx } from '../game/context'
import { ballPartner, type PairEvent } from './pairing'

export function createGoal(events: EventQueue, audio?: AudioPort): System<GameCtx> {
  return {
    name: 'goal',
    stage: 'postPhysics',
    run(ctx) {
      if (ctx.store.getState().scene !== 'playing') return
      for (const event of events.read<PairEvent>('sensorEnter')) {
        const goal = ballPartner(event, 'goal')
        if (!goal) continue
        const { levelId, elapsedMs, bananas } = ctx.store.getState().session
        if (levelId !== null) {
          ctx.store.dispatch({ type: 'levelCompleted', levelId, timeMs: elapsedMs, bananas })
          audio?.play('goal')
          spawnBurst(ctx.world, {
            origin: goal.transform?.position ?? { x: 0, y: 0, z: 0 },
            count: 24,
            speed: 3.5,
            lifetimeS: 0.8,
            color: '#4ecdc4'
          })
        }
        return
      }
    }
  }
}
