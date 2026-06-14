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
}
