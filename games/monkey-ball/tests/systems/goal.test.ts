import { describe, expect, it } from 'vitest'
import { EventQueue, createWorld } from '@automata/engine'
import { createGoal } from '../../src/systems/goal'
import { createGameStore, type GameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

function playingCtx(): { ctx: GameCtx; store: GameStore } {
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
  store.dispatch({ type: 'tickedMs', ms: 5000 })
  store.dispatch({ type: 'bananaCollected', value: 3 })
  const ctx: GameCtx = { world: createWorld<Entity>(), store, input: { x: 0, y: 0 }, dt: 1 / 60, alpha: 0 }
  return { ctx, store }
}

describe('goal', () => {
  it('completes the level when the ball enters the goal sensor', () => {
    const events = new EventQueue()
    events.emit({ type: 'sensorEnter', a: { ball: {} } as Entity, b: { goal: {} } as Entity })
    const { ctx, store } = playingCtx()
    createGoal(events).run(ctx)
    expect(store.getState().scene).toBe('levelComplete')
  })

  it('handles the reversed event order and records time + bananas', () => {
    const events = new EventQueue()
    events.emit({ type: 'sensorEnter', a: { goal: {} } as Entity, b: { ball: {} } as Entity })
    const { ctx, store } = playingCtx()
    createGoal(events).run(ctx)
    expect(store.getState().scene).toBe('levelComplete')
    expect(store.getState().session).toMatchObject({ elapsedMs: 5000, bananas: 3 })
  })

  it('ignores sensor events that are not the ball-goal pair', () => {
    const events = new EventQueue()
    events.emit({ type: 'sensorEnter', a: { ball: {} } as Entity, b: { collectible: { value: 1 } } as Entity })
    const { ctx, store } = playingCtx()
    createGoal(events).run(ctx)
    expect(store.getState().scene).toBe('playing')
  })
})
