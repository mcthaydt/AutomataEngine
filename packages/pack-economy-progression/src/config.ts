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
