import type { EventQueue, System } from '@automata/engine'
import { isPlaying, type GameCtx } from '../game/context'
import { ballPartner, type PairEvent } from './pairing'
import { emitFeedback } from './feedback'

export function createCollection(events: EventQueue, feedback: EventQueue): System<GameCtx> {
  return {
    name: 'collection',
    stage: 'postPhysics',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const taken = new Set<object>()
      for (const event of events.read<PairEvent>('sensorEnter')) {
        const banana = ballPartner(event, 'collectible')
        if (!banana || taken.has(banana) || !ctx.world.has(banana)) continue
        taken.add(banana)
        ctx.store.dispatch({ type: 'bananaCollected', value: banana.collectible!.value })
        emitFeedback(feedback, 'collected', banana.transform?.position)
        ctx.world.remove(banana)
      }
    }
  }
}
