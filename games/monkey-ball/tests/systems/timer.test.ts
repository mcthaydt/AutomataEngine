import { describe, expect, it } from 'vitest'
import { createWorld } from '@automata/engine'
import { createTimer } from '../../src/systems/timer'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'
import type { Level } from '../../src/data/level'

const level: Level = {
  id: 'x', name: 'X', timeLimitS: 1, fallY: -10,
  spawn: [0, 1, 0], goal: { pos: [0, 0, -2] }, geometry: [], entities: []
}

function setup() {
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: 'x' })
  const ctx: GameCtx = { world: createWorld<Entity>(), store, input: { x: 0, y: 0 }, dt: 0.1, alpha: 0 }
  return { ctx, store }
}

describe('timer', () => {
  it('accumulates elapsed time while playing', () => {
    const { ctx, store } = setup()
    const timer = createTimer(level)
    timer.run(ctx); timer.run(ctx)
    expect(store.getState().session.elapsedMs).toBeCloseTo(200)
  })

  it('expires at the time limit, costing a life and resetting the run', () => {
    const { ctx, store } = setup()
    const timer = createTimer(level)
    for (let i = 0; i < 10; i++) timer.run(ctx)
    expect(store.getState().session.lives).toBe(2)
    expect(store.getState().session.elapsedMs).toBe(0)
  })

  it('does not tick when the scene is not playing', () => {
    const { ctx, store } = setup()
    store.dispatch({ type: 'levelCompleted', levelId: 'x', timeMs: 0, bananas: 0 })
    createTimer(level).run(ctx)
    expect(store.getState().session.elapsedMs).toBe(0)
  })
})
