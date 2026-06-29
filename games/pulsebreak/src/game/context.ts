import type { EventQueue, InputVector, World } from '@automata/engine'
import type { Entity } from '../entity'
import type { PulsebreakCompiledProject } from '../project/types'
import type { Rng } from '../sim/rng'
import type { GameStore } from '../state/root'

/** Per-step context handed to every gameplay system by the scheduler. */
export interface GameCtx {
  /** Immutable authored/compiled configuration shared by every runtime system. */
  config: PulsebreakCompiledProject
  world: World<Entity>
  store: GameStore
  /** Gameplay facts drained into sound + particles at the end of each step. */
  feedback: EventQueue
  /** Merged input for this step; x = right, y = forward, |v| <= 1. */
  input: InputVector
  /** Run-scoped deterministic RNG (spawning + upgrade offers). */
  rng: Rng
  dt: number
  alpha: number
  /** Clamped wall-clock seconds since the previous rendered frame. */
  frameDt?: number
}

/** True only while a run is actively being played. */
export function isPlaying(ctx: GameCtx): boolean {
  return ctx.store.getState().scene === 'playing'
}
