import { EventQueue, createWorld, type InputVector } from '@automata/engine'
import type { GameCtx } from '../../src/game/context'
import { createRng } from '../../src/sim/rng'
import { createGameStore, type GameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import { defaultPulsebreakCompiledProject } from '../../src/project/template'
import type { PulsebreakCompiledProject } from '../../src/project/types'

export interface CtxOptions {
  config?: PulsebreakCompiledProject
  input?: InputVector
  seed?: number
  store?: GameStore
  dt?: number
}

/** A GameCtx whose scene is already `playing`, with a fresh empty world. */
export function playingCtx(opts: CtxOptions = {}): GameCtx {
  const config = opts.config ?? defaultPulsebreakCompiledProject
  const store = opts.store ?? createGameStore({ config })
  if (store.getState().scene !== 'playing') store.dispatch({ type: 'runStarted' })
  return {
    config,
    world: createWorld<Entity>(),
    store,
    feedback: new EventQueue(),
    input: opts.input ?? { x: 0, y: 0 },
    rng: createRng(opts.seed ?? 1),
    dt: opts.dt ?? 1 / 60,
    alpha: 0
  }
}
