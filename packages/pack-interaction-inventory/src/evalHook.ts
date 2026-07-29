import type { PackEvalHook } from '@automata/game-kit'
import {
  createInventoryState, grantItem, inventoryComplete, nextItemTarget, stepInventory, ITEM_PURCHASED_EVENT,
  type InventoryPackConfig, type InventoryState
} from './core'

/** Headless twin of the browser pack: drives the scripted evaluator over the pure core. */
export function createInventoryEvalHook(config: InventoryPackConfig): PackEvalHook {
  return {
    packId: 'interaction-inventory',
    createState: () => createInventoryState(),
    connect: (bus, ref) => {
      bus.on(ITEM_PURCHASED_EVENT, (payload) => {
        const state = ref.get() as InventoryState
        ref.set(grantItem(state, (payload as { itemId: string }).itemId))
      })
    },
    nextTarget: (state, player) => nextItemTarget(state as InventoryState, player, config),
    step: (state, player) => stepInventory(state as InventoryState, player, config),
    complete: (state) => inventoryComplete(state as InventoryState, config),
    publishSlices: (state) => ({ inventory: { collected: [...(state as InventoryState).collected] } })
  }
}
