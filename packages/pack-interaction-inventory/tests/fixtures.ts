import type { InventoryPackConfig } from '../src/core'

/** Deterministic fixture shared by unit tests and the critical-path smoke. */
export function fixtureConfig(): InventoryPackConfig {
  return {
    interactRadius: 1.5,
    items: [
      { id: 'cell-a', position: { x: -2, z: 3 } },
      { id: 'cell-b', position: { x: 4, z: -1 } }
    ],
    iconPath: 'assets/item-icon.svg'
  }
}
