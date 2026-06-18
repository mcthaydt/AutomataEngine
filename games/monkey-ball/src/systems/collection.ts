import { spawnBurst, type AudioPort, type EventQueue, type System } from '@automata/engine'
import type { GameCtx } from '../game/context'
import { ballPartner, type PairEvent } from './pairing'

export function createCollection(events: EventQueue, audio?: AudioPort): System<GameCtx> {
  return {
    name: 'collection',
    stage: 'postPhysics',
    run(ctx) {
      const taken = new Set<object>()
      for (const event of events.read<PairEvent>('sensorEnter')) {
        const banana = ballPartner(event, 'collectible')
        if (!banana || taken.has(banana) || !ctx.world.has(banana)) continue
        taken.add(banana)
        const origin = banana.transform?.position ?? { x: 0, y: 0, z: 0 }
        ctx.store.dispatch({ type: 'bananaCollected', value: banana.collectible!.value })
        audio?.play('pickup')
        spawnBurst(ctx.world, { origin, count: 10, speed: 2.5, lifetimeS: 0.5, color: '#ffd23f' })
        ctx.world.remove(banana)
      }
    }
  }
}
