import type { EventQueue, System } from '@automata/engine'
import type { GameCtx } from '../game/context'
import { ballPartner, type PairEvent } from './pairing'

export function createCollection(events: EventQueue): System<GameCtx> {
  return {
    name: 'collection',
    stage: 'postPhysics',
    run(ctx) {
      const taken = new Set<object>()
      for (const event of events.read<PairEvent>('sensorEnter')) {
        const banana = ballPartner(event, 'collectible')
        if (!banana || taken.has(banana) || !ctx.world.has(banana)) continue
        taken.add(banana)
        ctx.store.dispatch({ type: 'bananaCollected', value: banana.collectible!.value })
        ctx.world.remove(banana)
      }
    }
  }
}
