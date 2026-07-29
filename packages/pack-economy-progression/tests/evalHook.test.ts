import { describe, expect, it } from 'vitest'
import {
  createPackEventBus,
  type PackEvalHook
} from '@automata/game-kit'
import { createEconomyProgressionEvalHook } from '../src/evalHook'

const config = () => ({
  wallet: { startingBalance: 0 },
  pickups: [{
    id: 'currency-1',
    position: { x: 0, z: 0 },
    amount: 5
  }],
  shops: [],
  bounty: { perEnemy: 3 },
  questReward: { perQuest: 6 },
  progression: { milestones: [{ id: 'm1', threshold: 5 }] }
})

function drive(hook: PackEvalHook, ticks: number): unknown {
  let state = hook.createState()
  const bus = createPackEventBus()
  hook.connect?.(bus, {
    get: () => state,
    set: (next) => { state = next }
  })
  const emit = (name: string, payload: unknown): void =>
    bus.emit(name, payload)
  const player = { x: 0, z: 0 }
  for (let tick = 0; tick < ticks; tick += 1) {
    state = hook.step(state, player, {}, emit)
  }
  return state
}

describe('createEconomyProgressionEvalHook', () => {
  it('collects a pickup and completes progression', () => {
    const hook = createEconomyProgressionEvalHook(config())
    const state = drive(hook, 3)
    expect(hook.complete(state)).toBe(true)
  })

  it('earns bounty from a consumed enemyDefeated event', () => {
    const rawConfig = config()
    rawConfig.pickups = []
    rawConfig.progression.milestones = [{ id: 'm1', threshold: 3 }]
    const hook = createEconomyProgressionEvalHook(rawConfig)
    let state = hook.createState()
    const bus = createPackEventBus()
    hook.connect?.(bus, {
      get: () => state,
      set: (next) => { state = next }
    })

    bus.emit('enemyDefeated', { enemyId: 'e1' })
    state = hook.step(
      state,
      { x: 0, z: 0 },
      {},
      (name, payload) => bus.emit(name, payload)
    )

    expect(hook.complete(state)).toBe(true)
  })

  it('targets shop stock and does not complete until it is bought', () => {
    const rawConfig = {
      ...config(),
      wallet: { startingBalance: 10 },
      pickups: [],
      shops: [{
        id: 'shop-1',
        position: { x: 4, z: 0 },
        radius: 1.5,
        stock: [{ itemId: 'catalog-1', price: 8 }]
      }],
      progression: { milestones: [{ id: 'm1', threshold: 10 }] }
    }
    const hook = createEconomyProgressionEvalHook(rawConfig)
    let state = hook.createState()
    const emitted: Array<[string, unknown]> = []
    const emit = (name: string, payload: unknown): void => {
      emitted.push([name, payload])
    }

    state = hook.step(state, { x: 0, z: 0 }, {}, emit)
    expect(hook.complete(state)).toBe(false)
    expect(
      hook.nextTarget(state, { x: 0, z: 0 }, {})
    ).toEqual({ x: 4, z: 0 })

    state = hook.step(state, { x: 4, z: 0 }, {}, emit)
    expect(emitted.map(([name]) => name)).toContain('itemPurchased')
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, { x: 4, z: 0 }, {})).toBeNull()
  })
})
