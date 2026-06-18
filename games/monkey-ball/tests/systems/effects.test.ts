import { describe, expect, it } from 'vitest'
import { EventQueue, createNullAudio, createTransform, createWorld, type PhysicsPort } from '@automata/engine'
import { createCollection } from '../../src/systems/collection'
import { createBumper } from '../../src/systems/bumper'
import { createGoal } from '../../src/systems/goal'
import { createFallOff } from '../../src/systems/fallOff'
import { createTimer } from '../../src/systems/timer'
import { registerSounds } from '../../src/audio/sounds'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'
import type { Level } from '../../src/data/level'

const level: Level = {
  id: 'x', name: 'X', timeLimitS: 0.05, fallY: -10,
  spawn: [0, 1, 0], goal: { pos: [0, 0, -2] }, geometry: [], entities: []
}
const noPhysics = { applyImpulse() {} } as unknown as PhysicsPort
const playedIds = (audio: ReturnType<typeof createNullAudio>) =>
  audio.calls.filter((c) => c.op === 'play').map((c) => c.id)

function playingCtx(world = createWorld<Entity>()) {
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: 'x' })
  const ctx: GameCtx = { world, store, input: { x: 0, y: 0 }, dt: 0.1, alpha: 0 }
  return { ctx, store }
}

describe('effects: sound + particles', () => {
  it('registerSounds registers every sound id', () => {
    const audio = createNullAudio()
    registerSounds(audio.port)
    const ids = audio.calls.filter((c) => c.op === 'register').map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['pickup', 'bumper', 'goal', 'fall', 'uiClick']))
  })

  it('collection plays pickup and bursts particles at the banana', () => {
    const audio = createNullAudio(); registerSounds(audio.port)
    const { ctx } = playingCtx()
    const ball = ctx.world.add({ ball: {}, transform: createTransform() })
    const banana = ctx.world.add({ collectible: { value: 1 }, transform: createTransform({ x: 1, y: 0, z: 0 }) })
    const events = new EventQueue()
    events.emit({ type: 'sensorEnter', a: ball, b: banana })
    createCollection(events, audio.port).run(ctx)
    expect(playedIds(audio)).toEqual(['pickup'])
    expect([...ctx.world.with('particle')].length).toBeGreaterThan(0)
  })

  it('bumper plays the bumper sound', () => {
    const audio = createNullAudio(); registerSounds(audio.port)
    const { ctx } = playingCtx()
    const events = new EventQueue()
    const ball: Entity = { ball: {}, transform: createTransform({ x: 1, y: 0, z: 0 }) }
    const bumper: Entity = { bumper: { impulseStrength: 5 }, transform: createTransform() }
    events.emit({ type: 'contactStart', a: ball, b: bumper })
    createBumper(noPhysics, events, audio.port).run(ctx)
    expect(playedIds(audio)).toEqual(['bumper'])
  })

  it('goal plays the goal sound', () => {
    const audio = createNullAudio(); registerSounds(audio.port)
    const { ctx } = playingCtx()
    const events = new EventQueue()
    events.emit({
      type: 'sensorEnter',
      a: { ball: {}, transform: createTransform() } as Entity,
      b: { goal: {}, transform: createTransform() } as Entity
    })
    createGoal(events, audio.port).run(ctx)
    expect(playedIds(audio)).toEqual(['goal'])
  })

  it('fallOff and timer play the fall sound', () => {
    const fa = createNullAudio(); registerSounds(fa.port)
    const fall = playingCtx()
    fall.ctx.world.add({ ball: {}, transform: createTransform({ x: 0, y: -20, z: 0 }) })
    createFallOff(level, fa.port).run(fall.ctx)
    expect(playedIds(fa)).toEqual(['fall'])

    const ta = createNullAudio(); registerSounds(ta.port)
    const time = playingCtx()
    createTimer(level, ta.port).run(time.ctx)
    expect(playedIds(ta)).toEqual(['fall'])
  })
})
