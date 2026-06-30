import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind,
  createNullRenderer,
  parseData,
  type PhysicsPort,
  type RigidBodyDef
} from '@automata/engine'
import { loadProjectFiles } from '@automata/project'
import { createMonkeyBallEditorRegistration } from '../../src/project/editor'
import {
  createSeekGoalPlayer,
  scoreMonkeyBallFitness,
  type MonkeyBallFitnessTarget
} from '../../src/project/evaluation'
import type { PlayObservation, TestPlayResult } from '../../src/level/headlessPlay'
import { readDataFile } from '../helpers/data'

const projectRoot = resolve(import.meta.dirname, '../../public/project')
const snapshot = await loadProjectFiles({ readText: (path) => readFile(resolve(projectRoot, path), 'utf8') })
const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')

function recordingPhysics(): PhysicsPort & { bodies: RigidBodyDef[] } {
  const bodies: RigidBodyDef[] = []
  return {
    bodies,
    addBody(_entity, def) { bodies.push(def) },
    removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
    setKinematicTarget() {}, get bodyCount() { return bodies.length }, dispose() {}
  }
}

describe('Monkey Ball editor registration', () => {
  const registration = createMonkeyBallEditorRegistration(lib)

  it('exposes declarative geometry, archetype, spawn, and goal prefabs', () => {
    expect(registration.prefabs.map((prefab) => prefab.id)).toEqual([
      'box', 'cylinder', 'banana', 'bumper', 'moving-platform', 'spawn', 'goal'
    ])
    expect(registration).not.toHaveProperty('panels')
  })

  it('creates preview gameplay from the modified in-memory scene', () => {
    const edited = structuredClone(snapshot)
    const geometry = edited.scenes['w1-l1']!.entities.find((entity) => entity.id === 'geometry:0')!
    const primitive = geometry.components.find((component) => component.typeId === 'core.primitive')!
    ;(primitive.data as { size: { x: number; y: number; z: number } }).size = { x: 10, y: 1, z: 20 }
    const compiled = registration.project.compile(edited)
    const render = createNullRenderer()
    const physics = recordingPhysics()

    const preview = registration.preview!.create(compiled, 'w1-l1', render.port, physics)

    expect(render.calls.find((call) => call.op === 'add' && call.def?.primitive === 'box')?.def).toMatchObject({
      size: { x: 10, y: 1, z: 20 }
    })
    expect(physics.bodies.length).toBeGreaterThan(0)
    preview.dispose()
  })

  it('normalizes evaluation through the existing headless runner', async () => {
    await expect(registration.evaluation!.evaluate(snapshot, { maxSteps: 1 })).resolves.toMatchObject({
      outcome: 'incomplete',
      steps: 1,
      metrics: { falls: 0, bananas: 0 }
    })
  })
})

const playResult = (overrides: Partial<TestPlayResult>): TestPlayResult => ({
  outcome: 'completed',
  timeMs: 1000,
  fallCount: 0,
  bananas: 0,
  steps: 600,
  ...overrides
})

const fitnessTarget: MonkeyBallFitnessTarget = { minSteps: 300, maxSteps: 900 }

describe('Monkey Ball project evaluation policy', () => {
  it('scores completion bands, falls, bananas, and incomplete runs', () => {
    expect(scoreMonkeyBallFitness(playResult({}), fitnessTarget)).toBe(1)
    expect(scoreMonkeyBallFitness(playResult({ outcome: 'incomplete' }), fitnessTarget)).toBe(0)
    expect(scoreMonkeyBallFitness(playResult({ fallCount: 1 }), fitnessTarget)).toBeLessThan(1)
    expect(scoreMonkeyBallFitness(playResult({ steps: 1800 }), fitnessTarget)).toBeLessThan(1)
    expect(scoreMonkeyBallFitness(
      playResult({ bananas: 3 }),
      { ...fitnessTarget, bananas: 2 }
    )).toBeGreaterThan(1)
  })

  it('steers toward the goal and stops inside the arrival radius', () => {
    const observation = (
      ballX: number,
      ballZ: number,
      goalX: number,
      goalZ: number
    ): PlayObservation => ({
      step: 0,
      ball: {
        position: { x: ballX, y: 0, z: ballZ },
        velocity: { x: 0, y: 0, z: 0 }
      },
      goal: { x: goalX, y: 0, z: goalZ }
    })
    const seek = createSeekGoalPlayer()
    const input = seek(0, observation(0, 6, 0, -6))
    expect(input.y).toBeGreaterThan(0)
    expect(Math.abs(input.x)).toBeLessThan(1e-9)
    expect(createSeekGoalPlayer({ arriveRadius: 1 })(0, observation(0, 0.2, 0, 0)))
      .toEqual({ x: 0, y: 0 })
  })
})
