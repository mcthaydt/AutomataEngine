// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind, createNullRenderer, createRapierPhysics, parseData,
  type PhysicsEvent, type PhysicsPort, type Vec3
} from '@automata/engine'
import { stick } from '@automata/game-kit/testing'
import { createGameplay } from '../../src/game/gameplay'
import { levelKind, type Level } from '../../src/data/level'
import { createGameStore } from '../../src/state/root'
import { readDataFile } from '../helpers/data'
import type { Entity } from '../../src/entity'
import type { PhysicsTuning } from '../../src/data/config'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')
const tuning: PhysicsTuning = {
  maxTiltRad: (12 * Math.PI) / 180, tiltSmooth: 1, gravity: 9.81, ball: { radius: 0.5, friction: 0.6 }
}
const levelWithPlatform: Level = {
  ...level,
  entities: [
    ...level.entities,
    {
      archetype: 'moving-platform',
      pos: [0, 0, 0],
      overrides: {
        movingPlatform: {
          waypoints: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
          speed: 5,
          mode: 'loop'
        }
      }
    }
  ]
}

function createRecordingPhysics() {
  const bodies = new Set<object>()
  const impulses: { entity: object; impulse: Vec3 }[] = []
  const targets: { entity: object; position: Vec3 }[] = []
  let contactEmitted = false
  const port: PhysicsPort = {
    get bodyCount() { return bodies.size },
    addBody(entity) { bodies.add(entity) },
    removeBody(entity) { bodies.delete(entity) },
    setGravity() {},
    step(): PhysicsEvent[] {
      if (contactEmitted) return []
      contactEmitted = true
      const ball = [...bodies].find((entity) => (entity as Entity).ball !== undefined)
      const bumper = [...bodies].find((entity) => (entity as Entity).bumper !== undefined)
      return ball && bumper ? [{ kind: 'contact', started: true, a: ball, b: bumper }] : []
    },
    readPose(entity) {
      const transform = (entity as Entity).transform
      return transform ? { position: transform.position, rotation: transform.rotation } : null
    },
    readLinearVelocity() { return { x: 0, y: 0, z: -4 } },
    applyImpulse(entity, impulse) { impulses.push({ entity, impulse }) },
    setKinematicTarget(entity, position) { targets.push({ entity, position }) },
    dispose() { bodies.clear() }
  }
  return { port, impulses, targets }
}

function startRecordedGame(testLevel: Level = levelWithPlatform) {
  const physics = createRecordingPhysics()
  const render = createNullRenderer()
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: testLevel.id })
  const game = createGameplay({
    store,
    physics: physics.port,
    render: render.port,
    lib,
    level: testLevel,
    tuning,
    inputSources: [stick({ x: 0, y: 0 })]
  })
  return { game, physics, render }
}

describe('gameplay runner — M8 systems', () => {
  it('collects a banana and counts time while rolling forward', async () => {
    const physics = await createRapierPhysics()
    const render = createNullRenderer()
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: level.id })
    const game = createGameplay({
      store, physics, render: render.port, lib, level, tuning, inputSources: [stick({ x: 0, y: 1 })]
    })
    for (let i = 0; i < 240; i++) game.fixedUpdate(1 / 60)
    expect(store.getState().session.bananas).toBeGreaterThanOrEqual(1)
    expect(store.getState().session.elapsedMs).toBeGreaterThan(0)
    game.dispose(); physics.dispose()
  })

  it('applies bumper impulses from contact events emitted by the runner physics step', () => {
    const { game, physics } = startRecordedGame()
    game.fixedUpdate(1 / 60)
    expect(physics.impulses).toHaveLength(1)
    expect(physics.impulses[0]!.impulse.x).toBeGreaterThan(0)
    game.dispose()
  })

  it('advances moving platforms through the runner', () => {
    const { game, physics } = startRecordedGame()
    game.fixedUpdate(0.2)
    expect(physics.targets.at(-1)!.position).toEqual({ x: 1, y: 0, z: 0 })
    game.dispose()
  })

  it('sets the chase camera during runner render', () => {
    const { game, render } = startRecordedGame()
    game.render(0)
    const call = render.calls.filter((c) => c.op === 'setCamera').at(-1)!
    expect(call.lookAt).toEqual({ x: 0, y: 1, z: 6 })
    expect(call.position!.z).toBeGreaterThan(call.lookAt!.z)
    game.dispose()
  })
})
