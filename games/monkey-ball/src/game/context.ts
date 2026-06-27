import type { InputVector, World } from '@automata/engine'
import type { Entity } from '../entity'
import type { GameStore } from '../state/root'

/** Per-frame context handed to every game System by the scheduler. */
export interface GameCtx {
  world: World<Entity>
  store: GameStore
  /** Merged input for this step; x = right, y = forward, |v| <= 1. */
  input: InputVector
  dt: number
  alpha: number
  /** Clamped wall-clock seconds since the previous rendered frame. */
  frameDt?: number
}

/**
 * True only while a level is actually being played. Gameplay systems open with
 * this guard so they stay inert after a same-frame dispatch flips the scene
 * (e.g. a fall or goal reached earlier in the step) — the runner's per-frame
 * gate covers entry, this covers mid-step transitions.
 */
export function isPlaying(ctx: GameCtx): boolean {
  return ctx.store.getState().scene === 'playing'
}
