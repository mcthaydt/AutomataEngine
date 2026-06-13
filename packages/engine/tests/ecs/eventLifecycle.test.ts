import { describe, expect, it } from 'vitest'
import { Scheduler } from '../../src/ecs/scheduler'
import { EventQueue } from '../../src/ecs/events'

// Locks the intended wiring: a producer emits in the 'physics' stage, a consumer
// reads in 'postPhysics' (same step), and Scheduler.onFixedEnd drains the queue
// so events are strictly frame-scoped.
describe('event frame lifecycle', () => {
  type Ctx = { seen: number[] }

  function wire() {
    const events = new EventQueue()
    const scheduler = new Scheduler<Ctx>()
    scheduler.add({ name: 'producer', stage: 'physics', run: () => events.emit({ type: 'tick' }) })
    scheduler.add({
      name: 'consumer', stage: 'postPhysics',
      run: (ctx) => ctx.seen.push(events.read('tick').length)
    })
    scheduler.onFixedEnd(() => events.clear())
    return { events, scheduler }
  }

  it('makes events emitted this step readable this step, then clears them', () => {
    const { events, scheduler } = wire()
    const ctx: Ctx = { seen: [] }
    scheduler.runFixed(ctx)
    expect(ctx.seen).toEqual([1])
    expect(events.read('tick')).toEqual([])
  })

  it('does not accumulate events across fixed steps', () => {
    const { scheduler } = wire()
    const ctx: Ctx = { seen: [] }
    scheduler.runFixed(ctx)
    scheduler.runFixed(ctx)
    scheduler.runFixed(ctx)
    expect(ctx.seen).toEqual([1, 1, 1]) // without the onFixedEnd drain this would be [1, 2, 3]
  })
})
