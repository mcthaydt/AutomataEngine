import {
  createNullAudio,
  createNullRenderer,
  createRapierPhysics,
  type ArchetypeLibrary,
  type InputSource
} from '@automata/engine'
import type { HeadlessOpts, TestPlayResult } from '@automata/editor'
import type { PhysicsTuning } from '../data/config'
import type { Level } from '../data/level'
import { createGameplay } from '../game/gameplay'
import { createGameStore } from '../state/root'

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

  let step = 0
  const scripted: InputSource = {
    read: () => (opts.input ? opts.input(step) : { x: 0, y: 0 }),
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
