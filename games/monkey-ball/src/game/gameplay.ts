import {
  EventQueue, Scheduler, createWorld, mergeInputs, particleSystem, physicsStepSystem,
  physicsSyncSystem, registerPhysicsBodies, registerRenderables, renderSystem, spawnBurst,
  subscribeSelector, type ArchetypeLibrary, type AudioPort, type InputSource,
  type PhysicsPort, type RenderPort, type World
} from '@automata/engine'
import type { Entity } from '../entity'
import type { Level } from '../data/level'
import type { PhysicsTuning } from '../data/config'
import type { GameStore } from '../state/root'
import type { GameCtx } from './context'
import { populateLevelWorld } from '../level/buildWorld'
import { createTiltControl } from '../systems/tiltControl'
import { createFallOff } from '../systems/fallOff'
import { createGoal } from '../systems/goal'
import { createCollection } from '../systems/collection'
import { createTimer } from '../systems/timer'
import { createBumper } from '../systems/bumper'
import { createMovingPlatform } from '../systems/movingPlatform'
import { createCameraFollow } from '../systems/cameraFollow'

export interface GameplayDeps {
  store: GameStore
  physics: PhysicsPort
  render: RenderPort
  lib: ArchetypeLibrary
  level: Level
  tuning: PhysicsTuning
  inputSources: InputSource[]
  /** Optional so pre-M10 tests can omit it; the app always provides it. */
  audio?: AudioPort
}

export interface Gameplay {
  readonly world: World<Entity>
  fixedUpdate(dt: number): void
  render(alpha: number): void
  dispose(): void
}

export function createGameplay(deps: GameplayDeps): Gameplay {
  const { store, physics, render, audio, lib, level, tuning, inputSources } = deps
  const world = createWorld<Entity>()
  const stageGroup = render.createGroup()
  const events = new EventQueue()

  const offPhysics = registerPhysicsBodies(world, physics)
  const offRender = registerRenderables(world, render, stageGroup)
  populateLevelWorld(world, level, lib)

  const scheduler = new Scheduler<GameCtx>()
  scheduler.add(createTiltControl(physics, render, stageGroup, tuning))
  scheduler.add(createTimer(level, audio))
  scheduler.add(createMovingPlatform(physics))
  scheduler.add(particleSystem<GameCtx>())
  scheduler.add(physicsStepSystem<GameCtx>(physics, events))
  scheduler.add(physicsSyncSystem<GameCtx>(physics))
  scheduler.add(createCollection(events, audio))
  scheduler.add(createBumper(physics, events, audio))
  scheduler.add(createFallOff(level, audio))
  scheduler.add(createGoal(events, audio))
  scheduler.add(createCameraFollow(render))
  scheduler.add(renderSystem<GameCtx>(render))

  const spawn = { x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] }
  const offRespawn = subscribeSelector(store, (s) => s.session.runId, () => {
    world.clear()
    populateLevelWorld(world, level, lib)
    events.clear()
    spawnBurst(world, { origin: spawn, count: 12, speed: 2, lifetimeS: 0.5, color: '#cfd8ff' })
  })

  let input = { x: 0, y: 0 }
  return {
    world,
    fixedUpdate(dt) {
      if (store.getState().scene !== 'playing') return
      input = mergeInputs(inputSources)
      events.clear()
      scheduler.runFixed({ world, store, input, dt, alpha: 0 })
    },
    render(alpha) {
      scheduler.runStage('render', { world, store, input, dt: 0, alpha })
    },
    dispose() {
      offRespawn()
      world.clear()
      offPhysics()
      offRender()
      render.removeGroup(stageGroup)
    }
  }
}
