import type { SeededRng } from '@automata/engine'
import type { InventoryItem, InventoryPackConfig } from './core'

export const INVENTORY_DEFAULTS = { requiredItems: 1, interactRadius: 1.5 } as const

export interface ComposeSectionInput {
  specConfig: { requiredItems?: number; interactRadius?: number }
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  iconPath: string | null
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const DRAW_BUDGET = 200

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Seeded item placement; defaults applied here, never by the spec schema. */
export function composeInventorySection(input: ComposeSectionInput, rng: SeededRng): InventoryPackConfig {
  const requiredItems = input.specConfig.requiredItems ?? INVENTORY_DEFAULTS.requiredItems
  const interactRadius = input.specConfig.interactRadius ?? INVENTORY_DEFAULTS.interactRadius
  const extent = input.arena.half - WALL_MARGIN
  const items: InventoryItem[] = []
  for (let draw = 0; items.length < requiredItems && draw < DRAW_BUDGET; draw += 1) {
    const candidate = { x: round2((rng.next() * 2 - 1) * extent), z: round2((rng.next() * 2 - 1) * extent) }
    if (!far(candidate, input.arena.spawn, KEEPOUT)) continue
    if (!far(candidate, input.arena.goal, KEEPOUT)) continue
    if (!items.every((item) => far(candidate, item.position, SEPARATION))) continue
    items.push({ id: `item-${items.length + 1}`, position: candidate })
  }
  if (items.length < requiredItems) {
    throw new Error(`Item placement budget exhausted: placed ${items.length}/${requiredItems}`)
  }
  return { interactRadius, items, iconPath: input.iconPath }
}
