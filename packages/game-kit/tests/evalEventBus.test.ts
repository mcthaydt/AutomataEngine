import { describe, expect, it } from 'vitest'
import { createPackEventBus, type PackEvalHook } from '@automata/game-kit'

/** Minimal driver mirror: create bus, connect hooks, pass emit into step. */
function drive(hooks: PackEvalHook[], ticks: number): Map<string, unknown> {
  const states = new Map(hooks.map((hook) => [hook.packId, hook.createState()]))
  const bus = createPackEventBus()
  for (const hook of hooks) {
    hook.connect?.(bus, {
      get: () => states.get(hook.packId),
      set: (state) => states.set(hook.packId, state)
    })
  }
  const emit = (name: string, payload: unknown): void => bus.emit(name, payload)
  const player = { x: 0, z: 0 }
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const hook of hooks) {
      states.set(hook.packId, hook.step(states.get(hook.packId), player, {}, emit))
    }
  }
  return states
}

describe('eval event bus', () => {
  it('delivers an emitted event to a connected consumer synchronously', () => {
    const emitter: PackEvalHook = {
      packId: 'emitter',
      createState: () => ({ fired: false }),
      nextTarget: () => null,
      step: (state, _player, _slices, emit) => {
        if (!(state as { fired: boolean }).fired) emit?.('ping', { n: 7 })
        return { fired: true }
      },
      complete: () => true
    }
    const consumer: PackEvalHook = {
      packId: 'consumer',
      createState: () => ({ total: 0 }),
      connect: (bus, ref) => {
        bus.on('ping', (payload) => {
          const current = ref.get() as { total: number }
          ref.set({ total: current.total + (payload as { n: number }).n })
        })
      },
      nextTarget: () => null,
      step: (state) => state,
      complete: () => true
    }

    const states = drive([emitter, consumer], 3)

    expect((states.get('consumer') as { total: number }).total).toBe(7)
  })
})
