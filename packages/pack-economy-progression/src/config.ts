import { z } from '@automata/project'
import { savedProgressionSchema } from './progressionCore'
import { savedWalletSchema } from './walletCore'

/**
 * Compiled economy config. Slice IDs and consumed event names are deliberate
 * string copies of other packs' contracts: pack-to-pack imports are forbidden,
 * and the reads/consumes degrade gracefully when those packs are absent.
 */
export const WALLET_SLICE_ID = 'wallet'
export const PROGRESSION_SLICE_ID = 'progression'
export const INVENTORY_SLICE_ID = 'inventory'
export const ITEM_PURCHASED_EVENT = 'itemPurchased'
export const MILESTONE_REACHED_EVENT = 'milestoneReached'
export const ENEMY_DEFEATED_EVENT = 'enemyDefeated'
export const QUEST_COMPLETED_EVENT = 'questCompleted'

/** Runtime slice payloads, also published by the eval twin. */
export interface WalletSliceValue {
  balance: number
  totalEarned: number
}

export interface ProgressionSliceValue {
  achieved: readonly string[]
}

const idSchema = z.string().min(1).max(60)
const positionSchema = z.strictObject({
  x: z.number(),
  z: z.number()
})

const baseConfigSchema = z.strictObject({
  wallet: z.strictObject({
    startingBalance: z.number().int().min(0).max(999)
  }),
  pickups: z.array(z.strictObject({
    id: idSchema,
    position: positionSchema,
    amount: z.number().int().min(1).max(500)
  })).max(12),
  shops: z.array(z.strictObject({
    id: idSchema,
    position: positionSchema,
    radius: z.number().min(0.5).max(5),
    stock: z.array(z.strictObject({
      itemId: idSchema,
      price: z.number().int().min(1).max(999)
    })).max(8)
  })).max(6),
  bounty: z.strictObject({
    perEnemy: z.number().int().min(0).max(500)
  }),
  questReward: z.strictObject({
    perQuest: z.number().int().min(0).max(500)
  }),
  progression: z.strictObject({
    milestones: z.array(z.strictObject({
      id: z.string().min(1).max(40),
      threshold: z.number().int().min(0).max(99999)
    })).min(1).max(12)
  })
})

export type EconomyPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

export const packConfigSchema: z.ZodType<EconomyPackConfig> =
  baseConfigSchema.superRefine((config, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: 'custom', message })
    }

    for (const id of duplicates(config.pickups.map((pickup) => pickup.id))) {
      issue(`duplicate pickup id "${id}"`)
    }
    for (const id of duplicates(config.shops.map((shop) => shop.id))) {
      issue(`duplicate shop id "${id}"`)
    }
    for (const id of duplicates(
      config.shops.flatMap((shop) =>
        shop.stock.map((entry) => entry.itemId)
      )
    )) {
      issue(`duplicate stock item id "${id}"`)
    }
    for (const id of duplicates(
      config.progression.milestones.map((milestone) => milestone.id)
    )) {
      issue(`duplicate milestone id "${id}"`)
    }

    const points = [
      ...config.pickups.map((pickup) => pickup.position),
      ...config.shops.map((shop) => shop.position)
    ]
    for (const point of duplicates(
      points.map(({ x, z }) => `${x},${z}`)
    )) {
      issue(`duplicate pickup/shop position "${point}"`)
    }

    const thresholds = config.progression.milestones.map(
      (milestone) => milestone.threshold
    )
    for (let index = 1; index < thresholds.length; index += 1) {
      if (thresholds[index]! <= thresholds[index - 1]!) {
        issue('milestone thresholds must be strictly ascending')
      }
    }
  })

/**
 * Contract-v2 persistence slot. Pickup and purchase bookkeeping must persist:
 * otherwise reloads can duplicate earnings or regress the completion gate.
 */
export const savedEconomySchema = z.strictObject({
  wallet: savedWalletSchema,
  progression: savedProgressionSchema,
  collectedPickups: z.array(idSchema).max(12),
  purchased: z.array(idSchema).max(8)
})

export type SavedEconomy = z.infer<typeof savedEconomySchema>

const assertKnownUnique = (
  label: string,
  ids: readonly string[],
  known: ReadonlySet<string>
): void => {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Saved economy contains duplicate ${label}`)
  }
  for (const id of ids) {
    if (!known.has(id)) {
      throw new Error(`Saved economy references unknown ${label} "${id}"`)
    }
  }
}

const gcd = (left: number, right: number): number => {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

/** Whether fixed bounty and quest increments can account for the surplus. */
const rewardsCanProduce = (
  amount: number,
  bounty: number,
  questReward: number
): boolean => {
  if (amount === 0) return true
  if (bounty === 0) return questReward > 0 && amount % questReward === 0
  if (questReward === 0) return amount % bounty === 0
  const divisor = gcd(bounty, questReward)
  if (amount % divisor !== 0) return false

  // Counts repeat modulo questReward/gcd, so this bounded search is exact.
  const countLimit = questReward / divisor
  for (
    let bountyCount = 0;
    bountyCount < countLimit && bountyCount * bounty <= amount;
    bountyCount += 1
  ) {
    if ((amount - bountyCount * bounty) % questReward === 0) return true
  }
  return false
}

/**
 * Parse a persistence payload against both its structural schema and the
 * compiled economy that owns it. Validation finishes before runtime mutation.
 */
export function parseSavedEconomy(
  raw: unknown,
  config: EconomyPackConfig
): SavedEconomy {
  const saved = savedEconomySchema.parse(raw)
  const pickups = new Map(
    config.pickups.map((pickup) => [pickup.id, pickup] as const)
  )
  const stock = new Map(
    config.shops.flatMap((shop) =>
      shop.stock.map((entry) => [entry.itemId, entry] as const)
    )
  )
  const milestones = new Map(
    config.progression.milestones.map((milestone) =>
      [milestone.id, milestone] as const
    )
  )

  assertKnownUnique(
    'pickup id',
    saved.collectedPickups,
    new Set(pickups.keys())
  )
  assertKnownUnique(
    'purchased item id',
    saved.purchased,
    new Set(stock.keys())
  )
  assertKnownUnique(
    'milestone id',
    saved.progression.achieved,
    new Set(milestones.keys())
  )

  if (saved.wallet.balance > saved.wallet.totalEarned) {
    throw new Error('Saved wallet balance exceeds total earned')
  }
  const earnedFromBaseAndPickups = config.wallet.startingBalance +
    saved.collectedPickups.reduce(
      (sum, id) => sum + pickups.get(id)!.amount,
      0
    )
  if (saved.wallet.totalEarned < earnedFromBaseAndPickups) {
    throw new Error('Saved total earned omits starting balance or pickups')
  }
  const rewardSurplus =
    saved.wallet.totalEarned - earnedFromBaseAndPickups
  if (!rewardsCanProduce(
    rewardSurplus,
    config.bounty.perEnemy,
    config.questReward.perQuest
  )) {
    throw new Error('Saved total earned cannot be produced by economy rewards')
  }

  const spent = saved.purchased.reduce(
    (sum, id) => sum + stock.get(id)!.price,
    0
  )
  if (saved.wallet.totalEarned - saved.wallet.balance !== spent) {
    throw new Error('Saved wallet balance does not match purchased stock')
  }
  for (const id of saved.progression.achieved) {
    if (milestones.get(id)!.threshold > saved.wallet.totalEarned) {
      throw new Error(`Saved milestone "${id}" precedes its threshold`)
    }
  }
  return saved
}
