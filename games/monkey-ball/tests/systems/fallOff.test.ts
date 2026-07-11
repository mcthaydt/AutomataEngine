import { describe, expect, it } from 'vitest'
import { EventQueue, createTransform, createWorld } from '@automata/engine'
import { createFallOff } from '../../src/systems/fallOff'
import type { FeedbackEvent } from '../../src/systems/feedback'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'
import type { Level } from '../../src/project/types'

const level: Level = {
  id: 'x', name: 'X', timeLimitS: 60, fallY: -10,
  spawn: [0, 1, 6], goal: { pos: [0, 0, -6] }, geometry: [], entities: []
}

function setup(y: number) {
  const world = createWorld<Entity>()
  world.add({ ball: {}, transform: createTransform({ x: 0, y, z: 0 }) })
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: 'x' })
  const feedback = new EventQueue()
  const ctx: GameCtx = { world, store, input: { x: 0, y: 0 }, dt: 1 / 60, alpha: 0 }
  return { ctx, store, feedback }
}

describe('fallOff', () => {
  it('does nothing while the ball is above fallY', () => {
    const { ctx, store, feedback } = setup(0)
    createFallOff(level, feedback).run(ctx)
    expect(store.getState().session.lives).toBe(3)
    expect(store.getState().session.runId).toBe(1)
  })

  it('dispatches ballFell and emits a "fell" fact when the ball drops below fallY', () => {
    const { ctx, store, feedback } = setup(-11)
    createFallOff(level, feedback).run(ctx)
    expect(store.getState().session.lives).toBe(2)
    expect(store.getState().session.runId).toBe(2)
    expect(feedback.read<FeedbackEvent>('feedback')).toEqual([{ type: 'feedback', kind: 'fell', origin: undefined }])
  })

  it('is inert once the scene is no longer playing', () => {
    const { ctx, store, feedback } = setup(-11)
    store.dispatch({ type: 'levelCompleted', levelId: 'x', timeMs: 1000, bananas: 0 })
    createFallOff(level, feedback).run(ctx)
    expect(store.getState().session.lives).toBe(3)
    expect(feedback.read('feedback')).toHaveLength(0)
  })
})
