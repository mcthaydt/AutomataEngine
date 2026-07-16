import { z } from '@automata/project'

/** Pure inventory state machine: no DOM, clocks, or RNG. */
export interface InventoryItem {
  id: string
  position: { x: number; z: number }
}

export interface InventoryPackConfig {
  interactRadius: number
  items: InventoryItem[]
  /** Public-relative path of the HUD icon, or null for no icon. */
  iconPath: string | null
}

export const packConfigSchema = z.strictObject({
  interactRadius: z.number().min(0.5).max(5),
  items: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    position: z.strictObject({ x: z.number(), z: z.number() })
  })).min(1).max(8),
  iconPath: z.string().min(1).max(200).nullable()
})

export interface InventoryState {
  collected: readonly string[]
}

export function createInventoryState(): InventoryState {
  return { collected: [] }
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** Collect every uncollected item within the interact radius (idempotent per item). */
export function stepInventory(state: InventoryState, player: { x: number; z: number }, config: InventoryPackConfig): InventoryState {
  const picked = config.items.filter((item) =>
    !state.collected.includes(item.id) && distance(item.position, player) <= config.interactRadius)
  if (picked.length === 0) return state
  return { collected: [...state.collected, ...picked.map((item) => item.id)] }
}

export function inventoryComplete(state: InventoryState, config: InventoryPackConfig): boolean {
  return config.items.every((item) => state.collected.includes(item.id))
}

/** Nearest uncollected item's position, or null when all are collected. */
export function nextItemTarget(state: InventoryState, player: { x: number; z: number }, config: InventoryPackConfig): { x: number; z: number } | null {
  let best: InventoryItem | null = null
  for (const item of config.items) {
    if (state.collected.includes(item.id)) continue
    if (!best || distance(item.position, player) < distance(best.position, player)) best = item
  }
  return best ? { ...best.position } : null
}

/** Contract names: the slice this pack owns and the event it emits (v2). */
export const INVENTORY_SLICE_ID = 'inventory'
export const ITEM_ACQUIRED_EVENT = 'itemAcquired'

const savedInventorySchema = z.strictObject({
  collected: z.array(z.string().min(1).max(60)).max(8)
})

export function serializeInventory(state: InventoryState): unknown {
  return { collected: [...state.collected] }
}

export function deserializeInventory(raw: unknown): InventoryState {
  return savedInventorySchema.parse(raw)
}
