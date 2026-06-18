import { describe, expect, it } from 'vitest'
import { EventQueue, createTransform, createWorld } from '@automata/engine'
import { createCollection } from '../../src/systems/collection'
import type { FeedbackEvent } from '../../src/systems/feedback'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

function setup() {
  const world = createWorld<Entity>()
  const ball = world.add({ ball: {}, transform: createTransform() })
  const banana = world.add({ collectible: { value: 2 }, transform: createTransform({ x: 1, y: 0, z: 0 }) })
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
  const events = new EventQueue()
  const feedback = new EventQueue()
  const ctx: GameCtx = { world, store, input: { x: 0, y: 0 }, dt: 1 / 60, alpha: 0 }
  return { world, ball, banana, store, events, feedback, ctx }
}

describe('collection', () => {
  it('despawns the banana and credits its value on sensorEnter', () => {
    const { world, ball, banana, store, events, feedback, ctx } = setup()
    events.emit({ type: 'sensorEnter', a: ball, b: banana })
    createCollection(events, feedback).run(ctx)
    expect(store.getState().session.bananas).toBe(2)
    expect(world.has(banana)).toBe(false)
    expect([...world.with('collectible')]).toHaveLength(0)
  })

  it('emits a "collected" feedback fact at the banana position', () => {
    const { ball, banana, events, feedback, ctx } = setup()
    events.emit({ type: 'sensorEnter', a: ball, b: banana })
    createCollection(events, feedback).run(ctx)
    expect(feedback.read<FeedbackEvent>('feedback')).toEqual([
      { type: 'feedback', kind: 'collected', origin: { x: 1, y: 0, z: 0 } }
    ])
  })

  it('credits each banana once even if the event repeats in a frame', () => {
    const { ball, banana, store, events, feedback, ctx } = setup()
    events.emit({ type: 'sensorEnter', a: ball, b: banana })
    events.emit({ type: 'sensorEnter', a: banana, b: ball })
    createCollection(events, feedback).run(ctx)
    expect(store.getState().session.bananas).toBe(2)
  })

  it('ignores non-collectible sensor pairs', () => {
    const { world, ball, store, events, feedback, ctx } = setup()
    const goal = world.add({ goal: {}, transform: createTransform() })
    events.emit({ type: 'sensorEnter', a: ball, b: goal })
    createCollection(events, feedback).run(ctx)
    expect(store.getState().session.bananas).toBe(0)
  })

  it('is inert once the scene is no longer playing', () => {
    const { world, ball, banana, store, events, feedback, ctx } = setup()
    store.dispatch({ type: 'levelCompleted', levelId: 'w1-l1', timeMs: 1000, bananas: 0 })
    events.emit({ type: 'sensorEnter', a: ball, b: banana })
    createCollection(events, feedback).run(ctx)
    expect(store.getState().session.bananas).toBe(0)
    expect(world.has(banana)).toBe(true)
  })
})
