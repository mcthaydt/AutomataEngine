import {
  createNullAudio,
  createNullRenderer,
  createRapierPhysics,
  type ArchetypeLibrary,
  type InputSource,
  type Vec3,
  type World
} from '@automata/engine'
import type { Level, PhysicsTuning } from '../project/types'
import type { Entity } from '../entity'
import { createGameplay } from '../game/gameplay'
import { createGameStore } from '../state/root'

export interface PlayObservation {
  step: number
  ball: { position: Vec3; velocity: Vec3 }
  goal: Vec3
}

export interface HeadlessOpts {
  input?: (step: number, observation: PlayObservation) => { x: number; y: number }
  maxSteps: number
}

export interface TestPlayResult {
  outcome: 'completed' | 'gameOver' | 'incomplete'
  timeMs: number
  fallCount: number
  bananas: number
  steps: number
}

function readObservation(world: World<Entity>, goal: Vec3, step: number, dt: number): PlayObservation {
  const ball = world.with('ball', 'transform').first
  const position = ball ? ball.transform.position : { x: 0, y: 0, z: 0 }
  const prev = ball ? ball.transform.prevPosition : position
  const inv = 1 / dt
  return {
    step,
    ball: {
      position: { x: position.x, y: position.y, z: position.z },
      velocity: {
        x: (position.x - prev.x) * inv,
        y: (position.y - prev.y) * inv,
        z: (position.z - prev.z) * inv
      }
    },
    goal
  }
}

/** Runs real gameplay systems headless and returns deterministic play metrics. */
export async function runHeadlessPlay(
  level: Level,
  lib: ArchetypeLibrary,
  tuning: PhysicsTuning,
  opts: HeadlessOpts
): Promise<TestPlayResult> {
  const physics = await createRapierPhysics()
  const render = createNullRenderer()
  const audio = createNullAudio()
  const store = createGameStore()

  const goal: Vec3 = { x: level.goal.pos[0], y: level.goal.pos[1], z: level.goal.pos[2] }
  let step = 0
  let observation: PlayObservation = {
    step: 0,
    ball: {
      position: { x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] },
      velocity: { x: 0, y: 0, z: 0 }
    },
    goal
  }
  const scripted: InputSource = {
    read: () => (opts.input ? opts.input(step, observation) : { x: 0, y: 0 }),
    dispose() {}
  }

  const game = createGameplay({
    store,
    physics,
    render: render.port,
    audio: audio.port,
    lib,
    level,
    tuning,
    inputSources: [scripted]
  })

  store.dispatch({ type: 'levelStarted', levelId: level.id })

  const dt = 1 / 60
  let steps = 0
  for (; steps < opts.maxSteps; steps++) {
    const scene = store.getState().scene
    if (scene === 'levelComplete' || scene === 'gameOver') break

    observation = readObservation(game.world, goal, step, dt)
    game.fixedUpdate(dt)
    step++
  }

  const session = store.getState().session
  const scene = store.getState().scene
  const outcome: TestPlayResult['outcome'] =
    scene === 'levelComplete' ? 'completed' : scene === 'gameOver' ? 'gameOver' : 'incomplete'

  const result: TestPlayResult = {
    outcome,
    timeMs: session.elapsedMs,
    fallCount: Math.max(0, session.runId - 1),
    bananas: session.bananas,
    steps
  }

  game.dispose()
  physics.dispose()

  return result
}
