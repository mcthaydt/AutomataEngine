import type { PackEvalHook } from '@automata/game-kit'
import {
  createInventoryState, inventoryComplete, nextItemTarget, stepInventory,
  type InventoryPackConfig, type InventoryState
} from './core'

/** Headless twin of the browser pack: drives the scripted evaluator over the pure core. */
export function createInventoryEvalHook(config: InventoryPackConfig): PackEvalHook {
  return {
    packId: 'interaction-inventory',
    createState: () => createInventoryState(),
    nextTarget: (state, player) => nextItemTarget(state as InventoryState, player, config),
    step: (state, player) => stepInventory(state as InventoryState, player, config),
    complete: (state) => inventoryComplete(state as InventoryState, config),
    publishSlices: (state) => ({ inventory: { collected: [...(state as InventoryState).collected] } })
  }
}
