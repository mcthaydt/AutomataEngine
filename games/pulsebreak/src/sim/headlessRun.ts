import {
  createNullAudio, createNullRenderer, type InputSource, type InputVector, type World
} from '@automata/engine'
import { createGameplay, type Gameplay } from '../game/gameplay'
import type { Entity } from '../entity'
import { createRng } from './rng'
import type { UpgradeId } from './upgrades'
import { createGameStore, type GameStore } from '../state/root'

export type ControlPolicy = (world: World<Entity>, store: GameStore) => InputVector

export interface HeadlessOptions {
  seed?: number
  /** Per-step input policy driving the drone (default: idle). */
  control?: ControlPolicy
  /** Strip the player's weapon so a run can be driven to a deterministic defeat. */
  disarm?: boolean
  /** Upgrade selection when the upgrade screen opens (default: prefer offense). */
  pickUpgrade?: (choices: UpgradeId[]) => UpgradeId
}

const PREFERRED: UpgradeId[] = ['damage', 'fireRate', 'moveSpeed', 'maxHealth']

/** Prefers offence: picks the most-preferred upgrade among those offered. */
function defaultPick(choices: UpgradeId[]): UpgradeId {
  return [...choices].sort((a, b) => PREFERRED.indexOf(a) - PREFERRED.indexOf(b))[0]!
}

export interface HeadlessRun {
  store: GameStore
  game: Gameplay
  step(dt?: number): void
  /** Steps until `predicate` holds or `maxSteps` is reached; returns steps taken. */
  runUntil(predicate: () => boolean, maxSteps: number): number
  dispose(): void
}

/**
 * A circle-strafing pilot: orbits the enemy swarm (tangential to its centroid)
 * while drifting outward and steering off the walls, so auto-fire thins the
 * pack without the drone wading into melee.
 */
export const kite: ControlPolicy = (world) => {
  const player = world.with('player', 'transform').first
  if (!player) return { x: 0, y: 0 }
  const px = player.transform.position.x
  const pz = player.transform.position.z

  let sumX = 0
  let sumZ = 0
  let count = 0
  for (const enemy of world.with('enemy', 'transform')) {
    sumX += enemy.transform.position.x
    sumZ += enemy.transform.position.z
    count++
  }

  let ax: number
  let az: number
  if (count === 0) {
    ax = -px
    az = -pz
  } else {
    const awayX = px - sumX / count
    const awayZ = pz - sumZ / count
    const len = Math.hypot(awayX, awayZ) || 1
    const ux = awayX / len
    const uz = awayZ / len
    // tangential orbit + outward drift + gentle inward steer away from walls
    ax = -uz + ux * 0.6 - px * 0.08
    az = ux + uz * 0.6 - pz * 0.08
  }
  const norm = Math.hypot(ax, az) || 1
  return { x: ax / norm, y: -az / norm }
}

/** Wires gameplay to recording doubles for deterministic, headless full-run tests. */
export function createHeadlessRun(opts: HeadlessOptions = {}): HeadlessRun {
  const control = opts.control ?? (() => ({ x: 0, y: 0 }))
  const pick = opts.pickUpgrade ?? defaultPick
  const store = createGameStore()
  const render = createNullRenderer()
  const audio = createNullAudio()
  let current: InputVector = { x: 0, y: 0 }
  const source: InputSource = { read: () => current, dispose() {} }
  const game = createGameplay({
    store, render: render.port, audio: audio.port,
    rng: createRng(opts.seed ?? 1), inputSources: [source]
  })

  const step = (dt = 1 / 60): void => {
    if (store.getState().scene === 'upgrade') {
      store.dispatch({ type: 'upgradeChosen', id: pick(store.getState().run.choices) })
    }
    if (opts.disarm) {
      const player = game.world.with('player', 'firing').first
      if (player) game.world.removeComponent(player, 'firing')
    }
    current = control(game.world, store)
    game.fixedUpdate(dt)
  }

  const runUntil = (predicate: () => boolean, maxSteps: number): number => {
    let steps = 0
    while (!predicate() && steps < maxSteps) {
      step()
      steps++
    }
    return steps
  }

  return { store, game, step, runUntil, dispose: () => game.dispose() }
}
