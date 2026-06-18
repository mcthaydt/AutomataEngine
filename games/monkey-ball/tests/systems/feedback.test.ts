import { describe, expect, it } from 'vitest'
import { EventQueue, createNullAudio, createWorld } from '@automata/engine'
import { createFeedback, emitFeedback, FEEDBACK } from '../../src/systems/feedback'
import { registerSounds } from '../../src/audio/sounds'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

const playedIds = (audio: ReturnType<typeof createNullAudio>) =>
  audio.calls.filter((c) => c.op === 'play').map((c) => c.id)

function ctxWith(world = createWorld<Entity>()): GameCtx {
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: 'x' })
  return { world, store, input: { x: 0, y: 0 }, dt: 1 / 60, alpha: 0 }
}

describe('feedback', () => {
  it('emitFeedback enqueues a feedback fact with kind and origin', () => {
    const queue = new EventQueue()
    emitFeedback(queue, 'collected', { x: 1, y: 2, z: 3 })
    expect(queue.read('feedback')).toEqual([
      { type: 'feedback', kind: 'collected', origin: { x: 1, y: 2, z: 3 } }
    ])
  })

  it('plays the mapped sound and bursts particles at the origin for a "collected" fact', () => {
    const audio = createNullAudio(); registerSounds(audio.port)
    const queue = new EventQueue()
    emitFeedback(queue, 'collected', { x: 1, y: 0, z: 0 })
    const ctx = ctxWith()
    createFeedback(queue, audio.port).run(ctx)
    expect(playedIds(audio)).toEqual([FEEDBACK.collected.sound])
    expect([...ctx.world.with('particle')].length).toBeGreaterThan(0)
  })

  it('plays each mapped sound for bumped and goalReached', () => {
    const audio = createNullAudio(); registerSounds(audio.port)
    const queue = new EventQueue()
    emitFeedback(queue, 'bumped', { x: 0, y: 0, z: 0 })
    emitFeedback(queue, 'goalReached', { x: 0, y: 0, z: 0 })
    createFeedback(queue, audio.port).run(ctxWith())
    expect(playedIds(audio)).toEqual([FEEDBACK.bumped.sound, FEEDBACK.goalReached.sound])
  })

  it('plays the fall sound but spawns no particles for a "fell" fact (no burst spec)', () => {
    const audio = createNullAudio(); registerSounds(audio.port)
    const queue = new EventQueue()
    emitFeedback(queue, 'fell')
    const ctx = ctxWith()
    createFeedback(queue, audio.port).run(ctx)
    expect(playedIds(audio)).toEqual([FEEDBACK.fell.sound])
    expect([...ctx.world.with('particle')]).toHaveLength(0)
  })

  it('spawns no particles when a burst-carrying fact arrives without an origin', () => {
    const audio = createNullAudio(); registerSounds(audio.port)
    const queue = new EventQueue()
    emitFeedback(queue, 'collected')
    const ctx = ctxWith()
    createFeedback(queue, audio.port).run(ctx)
    expect(playedIds(audio)).toEqual([FEEDBACK.collected.sound])
    expect([...ctx.world.with('particle')]).toHaveLength(0)
  })
})
