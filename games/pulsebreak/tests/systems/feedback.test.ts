import { describe, expect, it } from 'vitest'
import { EventQueue, createNullAudio, createWorld } from '@automata/engine'
import { FEEDBACK, createFeedback, emitFeedback, type FeedbackEvent } from '../../src/systems/feedback'
import { SOUNDS, registerSounds } from '../../src/audio/sounds'
import { type GameCtx } from '../../src/game/context'
import { createRng } from '../../src/sim/rng'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import { defaultPulsebreakCompiledProject } from '../../src/project/template'

function ctx(feedback: EventQueue): GameCtx {
  return {
    config: defaultPulsebreakCompiledProject,
    world: createWorld<Entity>(),
    store: createGameStore(),
    feedback,
    input: { x: 0, y: 0 },
    rng: createRng(1),
    dt: 1 / 60,
    alpha: 0
  }
}

describe('feedback', () => {
  it('maps every gameplay fact to a registered sound id', () => {
    const registered = new Set(Object.keys(SOUNDS))
    for (const spec of Object.values(FEEDBACK)) {
      expect(registered.has(spec.sound)).toBe(true)
    }
  })

  it('records a fact with kind and origin', () => {
    const q = new EventQueue()
    emitFeedback(q, 'enemyKilled', { x: 1, y: 0, z: 2 })
    expect(q.read<FeedbackEvent>('feedback')).toEqual([
      { type: 'feedback', kind: 'enemyKilled', origin: { x: 1, y: 0, z: 2 } }
    ])
  })

  it('plays the mapped sound for every fact', () => {
    const q = new EventQueue()
    const audio = createNullAudio()
    registerSounds(audio.port)
    emitFeedback(q, 'playerHit', { x: 0, y: 0, z: 0 })
    createFeedback(q, audio.port)(ctx(q))
    expect(audio.calls.some((c) => c.op === 'play' && c.id === FEEDBACK.playerHit.sound)).toBe(true)
  })

  it('spawns a particle burst for kinds that have one and an origin', () => {
    const q = new EventQueue()
    const c = ctx(q)
    emitFeedback(q, 'enemyKilled', { x: 0, y: 0, z: 0 })
    createFeedback(q, createNullAudio().port)(c)
    expect([...c.world.with('particle')].length).toBeGreaterThan(0)
  })

  it('plays sound only for sound-only kinds', () => {
    const q = new EventQueue()
    const c = ctx(q)
    emitFeedback(q, 'waveCleared')
    createFeedback(q, createNullAudio().port)(c)
    expect([...c.world.with('particle')].length).toBe(0)
  })

  it('skips the burst when no origin is given', () => {
    const q = new EventQueue()
    const c = ctx(q)
    emitFeedback(q, 'enemyKilled')
    createFeedback(q, createNullAudio().port)(c)
    expect([...c.world.with('particle')].length).toBe(0)
  })
})
