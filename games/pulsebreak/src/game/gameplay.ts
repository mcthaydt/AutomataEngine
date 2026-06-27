import {
  EventQueue, Scheduler, createNullAudio, createTransform, createWorld, mergeInputs,
  particleSystem, registerRenderables, renderSystem, subscribeSelector,
  type AudioPort, type GridId, type InputSource, type RenderPort, type World
} from '@automata/engine'
import { ARENA, CAMERA } from '../config'
import type { Entity } from '../entity'
import type { Rng } from '../sim/rng'
import { spawnPlayer } from '../sim/spawn'
import type { GameStore } from '../state/root'
import { createCollision } from '../systems/collision'
import { createDirector } from '../systems/director'
import { createEnemyAI } from '../systems/enemyAI'
import { createEnemyWeapon } from '../systems/enemyWeapon'
import { createFeedback } from '../systems/feedback'
import { createInvuln } from '../systems/invuln'
import { createPlayerControl } from '../systems/playerControl'
import { createPlayerWeapon } from '../systems/playerWeapon'
import { createProjectiles } from '../systems/projectiles'
import type { GameCtx } from './context'

export interface GameplayDeps {
  store: GameStore
  render: RenderPort
  /** Run-scoped deterministic RNG. */
  rng: Rng
  inputSources: InputSource[]
  /** Optional so tests can omit it; defaults to silent NullAudio. */
  audio?: AudioPort
}

export interface Gameplay {
  readonly world: World<Entity>
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt?: number): void
  dispose(): void
}

function addFloor(world: World<Entity>): void {
  const span = ARENA.half * 2 + 2
  world.add({
    transform: createTransform({ x: 0, y: -0.15, z: 0 }),
    renderable: { primitive: 'box', size: { x: span, y: 0.3, z: span }, color: '#0a1124' }
  })
}

export function createGameplay(deps: GameplayDeps): Gameplay {
  const { store, render, rng, inputSources } = deps
  const audio = deps.audio ?? createNullAudio().port
  const world = createWorld<Entity>()
  const stageGroup = render.createGroup()
  const feedback = new EventQueue()

  const offRender = registerRenderables(world, render, stageGroup)
  render.setCamera(CAMERA.eye, CAMERA.look)
  const grid: GridId = render.setGrid({ size: ARENA.half * 2, divisions: ARENA.half * 2, color: '#1b2f63' })

  const scheduler = new Scheduler<GameCtx>()
  scheduler.add(createInvuln())
  scheduler.add(createPlayerControl())
  scheduler.add(createEnemyAI())
  scheduler.add(createProjectiles())
  scheduler.add(createPlayerWeapon())
  scheduler.add(createEnemyWeapon())
  scheduler.add(createCollision())
  scheduler.add(createDirector())
  scheduler.add(particleSystem<GameCtx>())
  scheduler.add(renderSystem<GameCtx>(render))
  scheduler.onFixedEnd(createFeedback(feedback, audio))

  const buildRun = (): void => {
    world.clear()
    feedback.clear()
    addFloor(world)
    spawnPlayer(world)
  }
  buildRun()
  const offRespawn = subscribeSelector(store, (s) => s.run.runId, buildRun)

  let input = { x: 0, y: 0 }
  return {
    world,
    fixedUpdate(dt) {
      if (store.getState().scene !== 'playing') return
      input = mergeInputs(inputSources)
      feedback.clear()
      scheduler.runFixed({ world, store, feedback, input, rng, dt, alpha: 0 })
    },
    render(alpha, frameDt = 0) {
      // While the sim is frozen the rendered pose must not jitter as alpha sweeps.
      const a = store.getState().scene === 'playing' ? alpha : 1
      scheduler.runStage('render', { world, store, feedback, input, rng, dt: 0, alpha: a, frameDt })
    },
    dispose() {
      offRespawn()
      world.clear()
      offRender()
      render.removeGrid(grid)
      render.removeGroup(stageGroup)
    }
  }
}
