import { describe, expect, it } from 'vitest'
import { EventQueue, createWorld } from '@automata/engine'
import { isPlaying, type GameCtx } from '../../src/game/context'
import { createRng } from '../../src/sim/rng'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'

function ctx(): GameCtx {
  return {
    world: createWorld<Entity>(),
    store: createGameStore(),
    feedback: new EventQueue(),
    input: { x: 0, y: 0 },
    rng: createRng(1),
    dt: 1 / 60,
    alpha: 0
  }
}

describe('isPlaying', () => {
  it('is true only while the scene is playing', () => {
    const c = ctx()
    expect(isPlaying(c)).toBe(false)
    c.store.dispatch({ type: 'runStarted' })
    expect(isPlaying(c)).toBe(true)
    c.store.dispatch({ type: 'paused' })
    expect(isPlaying(c)).toBe(false)
  })
})
