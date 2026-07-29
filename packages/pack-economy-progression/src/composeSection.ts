import type { SeededRng } from '@automata/engine'
import { packConfigSchema, type EconomyPackConfig } from './config'
import { totalStockPrice } from './shopCore'

export const ECONOMY_DEFAULTS = {
  startingBalance: 5,
  pickupCount: 3,
  pickupAmount: 5,
  shopRadius: 1.5,
  catalogPrice: 8,
  bountyPerEnemy: 3,
  questRewardPerQuest: 6
} as const

export interface EconomyComposeInput {
  specConfig: { startingBalance?: number }
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  /** Spec progression milestones; seeded ascending thresholds are assigned here. */
  milestones: ReadonlyArray<{ id: string }>
  arena: {
    half: number
    spawn: { x: number; z: number }
    goal: { x: number; z: number }
  }
  /** Required because economy depends on interaction-inventory. */
  inventory: {
    items: ReadonlyArray<{
      id: string
      position: { x: number; z: number }
    }>
  }
  /** Soft keepout points from NPCs, walker stations, and enemy posts. */
  occupied: ReadonlyArray<{ x: number; z: number }>
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const DRAW_BUDGET = 200
const INVENTORY_CAP = 8

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (
  left: { x: number; z: number },
  right: { x: number; z: number },
  minimum: number
): boolean =>
  Math.hypot(left.x - right.x, left.z - right.z) >= minimum

/**
 * Seed currency pickups, vendor shops, catalog stock, and reachable milestones.
 * Every draw comes from the supplied RNG; fixed defaults live here rather than
 * in the GameSpec schema so stored spec hashes remain stable.
 */
export function composeEconomySection(
  input: EconomyComposeInput,
  rng: SeededRng
): EconomyPackConfig {
  const startingBalance =
    input.specConfig.startingBalance ?? ECONOMY_DEFAULTS.startingBalance
  const extent = input.arena.half - WALL_MARGIN
  const soft = [
    ...input.inventory.items.map((item) => item.position),
    ...input.occupied
  ]
  const taken: Array<{ x: number; z: number }> = []

  const drawPosition = (label: string): { x: number; z: number } => {
    for (let draw = 0; draw < DRAW_BUDGET; draw += 1) {
      const candidate = {
        x: round2((rng.next() * 2 - 1) * extent),
        z: round2((rng.next() * 2 - 1) * extent)
      }
      if (!far(candidate, input.arena.spawn, KEEPOUT)) continue
      if (!far(candidate, input.arena.goal, KEEPOUT)) continue
      if (!soft.every((point) => far(candidate, point, SEPARATION))) continue
      if (!taken.every((point) => far(candidate, point, SEPARATION))) continue
      taken.push(candidate)
      return candidate
    }
    throw new Error(`Economy placement budget exhausted: ${label}`)
  }

  const pickups = Array.from(
    { length: ECONOMY_DEFAULTS.pickupCount },
    (_, index) => ({
      id: `currency-${index + 1}`,
      position: drawPosition(`pickup ${index + 1}`),
      amount: ECONOMY_DEFAULTS.pickupAmount
    })
  )

  const totalBase = startingBalance +
    pickups.reduce((sum, pickup) => sum + pickup.amount, 0)

  const vendors = input.cast.filter((member) => member.role === 'vendor')
  // Catalog goods are new IDs and are capped by both inventory capacity and
  // base earning, because completion requires clearing every stocked item.
  const affordabilityBudget = Math.floor(
    totalBase / ECONOMY_DEFAULTS.catalogPrice
  )
  let catalogBudget = Math.max(
    0,
    Math.min(
      INVENTORY_CAP - input.inventory.items.length,
      affordabilityBudget
    )
  )
  let catalogIndex = 0
  const shops = vendors.map((vendor, index) => {
    const stock = catalogBudget > 0
      ? [{
          itemId: `catalog-${(catalogIndex += 1)}`,
          price: ECONOMY_DEFAULTS.catalogPrice
        }]
      : []
    if (stock.length > 0) catalogBudget -= 1
    return {
      id: `shop-${index + 1}`,
      position: drawPosition(`shop ${index + 1} (${vendor.name})`),
      radius: ECONOMY_DEFAULTS.shopRadius,
      stock
    }
  })

  const count = input.milestones.length
  if (count === 0 || totalBase < count) {
    throw new Error(
      `Economy progression unreachable: totalBase ${totalBase} < ${count} milestones`
    )
  }
  let previous = 0
  const milestones = input.milestones.map((milestone, index) => {
    let threshold = Math.round(((index + 1) / count) * totalBase)
    if (threshold <= previous) threshold = previous + 1
    previous = threshold
    return { id: milestone.id, threshold }
  })

  const top = milestones[milestones.length - 1]!.threshold
  if (top > totalBase) {
    throw new Error(
      `Economy reachability invariant violated: top ${top} > base ${totalBase}`
    )
  }
  const stockCost = totalStockPrice(shops)
  if (stockCost > totalBase) {
    throw new Error(
      `Economy affordability invariant violated: stock ${stockCost} > base ${totalBase}`
    )
  }

  return packConfigSchema.parse({
    wallet: { startingBalance },
    pickups,
    shops,
    bounty: { perEnemy: ECONOMY_DEFAULTS.bountyPerEnemy },
    questReward: { perQuest: ECONOMY_DEFAULTS.questRewardPerQuest },
    progression: { milestones }
  })
}
