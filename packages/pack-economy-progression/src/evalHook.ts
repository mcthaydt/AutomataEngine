import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import {
  ENEMY_DEFEATED_EVENT,
  INVENTORY_SLICE_ID,
  ITEM_PURCHASED_EVENT,
  MILESTONE_REACHED_EVENT,
  PROGRESSION_SLICE_ID,
  QUEST_COMPLETED_EVENT,
  WALLET_SLICE_ID,
  type EconomyPackConfig
} from './config'
import {
  advance,
  createProgressionState,
  progressionComplete,
  type MilestoneDef,
  type ProgressionState
} from './progressionCore'
import { allStockPurchased, inRadius, nextPurchase } from './shopCore'
import {
  createWalletState,
  earn,
  spend,
  type WalletState
} from './walletCore'

/** One harness tick equals one fixed simulation step. */
export const EVAL_TICK_DT = 1 / 60

interface EvalState {
  wallet: WalletState
  progression: ProgressionState
  collected: readonly string[]
  /** Completion must remain answerable without a slice view. */
  purchased: readonly string[]
}

/** Match runtime ownership: inventory-granted IDs plus local purchases. */
const ownedView = (
  state: EvalState,
  slices?: EvalSliceView
): ReadonlySet<string> => {
  const owned = new Set(state.purchased)
  const inventory = slices?.[INVENTORY_SLICE_ID] as
    { collected?: readonly string[] } | undefined
  for (const itemId of inventory?.collected ?? []) owned.add(itemId)
  return owned
}

/** Must match the browser adapter's pickup radius plus player reach. */
const PICKUP_REACH = 0.8

/**
 * Headless twin: consumes bounty/reward events through `connect` and emits
 * purchase/milestone events from `step`.
 */
export function createEconomyProgressionEvalHook(
  config: EconomyPackConfig
): PackEvalHook {
  const milestones: MilestoneDef[] =
    config.progression.milestones.map(({ id, threshold }) => ({
      id,
      threshold
    }))
  const complete = (state: EvalState): boolean =>
    progressionComplete(state.progression, milestones) &&
    allStockPurchased(config.shops, new Set(state.purchased))

  return {
    packId: 'economy-progression',

    createState: (): EvalState => ({
      wallet: createWalletState(config.wallet.startingBalance),
      progression: createProgressionState(),
      collected: [],
      purchased: []
    }),

    connect(bus, ref) {
      const bump = (amount: number): void => {
        const state = ref.get() as EvalState
        ref.set({
          ...state,
          wallet: earn(state.wallet, amount)
        })
      }
      bus.on(ENEMY_DEFEATED_EVENT, () => bump(config.bounty.perEnemy))
      bus.on(QUEST_COMPLETED_EVENT, () =>
        bump(config.questReward.perQuest)
      )
    },

    nextTarget(state, player, slices) {
      const evalState = state as EvalState
      if (complete(evalState)) return null

      const collected = new Set(evalState.collected)
      let best: { x: number; z: number } | null = null
      let bestDistance = Infinity
      for (const pickup of config.pickups) {
        if (collected.has(pickup.id)) continue
        const distance = Math.hypot(
          pickup.position.x - player.x,
          pickup.position.z - player.z
        )
        if (distance < bestDistance) {
          bestDistance = distance
          best = pickup.position
        }
      }
      if (best) return { ...best }

      const owned = ownedView(evalState, slices)
      for (const shop of config.shops) {
        if (nextPurchase(shop, evalState.wallet.balance, owned)) {
          best = shop.position
          break
        }
      }
      return best ? { ...best } : null
    },

    step(state, player, slices, emit) {
      const evalState = state as EvalState
      let wallet = evalState.wallet
      const collected = new Set(evalState.collected)
      for (const pickup of config.pickups) {
        if (collected.has(pickup.id)) continue
        const distance = Math.hypot(
          pickup.position.x - player.x,
          pickup.position.z - player.z
        )
        if (distance > PICKUP_REACH) continue
        collected.add(pickup.id)
        wallet = earn(wallet, pickup.amount)
      }

      const purchased = new Set(evalState.purchased)
      for (const shop of config.shops) {
        if (!inRadius(shop, player)) continue
        // Recompute after each purchase so later shops see the same live union
        // as the browser adapter's slice read.
        const purchase = nextPurchase(
          shop,
          wallet.balance,
          ownedView({ ...evalState, purchased: [...purchased] }, slices)
        )
        if (!purchase) continue
        const result = spend(wallet, purchase.price)
        if (!result.ok) continue
        wallet = result.state
        purchased.add(purchase.itemId)
        emit?.(ITEM_PURCHASED_EVENT, {
          packId: 'economy-progression',
          itemId: purchase.itemId
        })
      }

      const advanced = advance(
        evalState.progression,
        wallet.totalEarned,
        milestones
      )
      for (const milestoneId of advanced.newlyAchieved) {
        emit?.(MILESTONE_REACHED_EVENT, {
          packId: 'economy-progression',
          milestoneId
        })
      }
      return {
        wallet,
        progression: advanced.state,
        collected: [...collected],
        purchased: [...purchased]
      } satisfies EvalState
    },

    complete: (state) => complete(state as EvalState),

    publishSlices: (state) => ({
      [WALLET_SLICE_ID]: {
        balance: (state as EvalState).wallet.balance,
        totalEarned: (state as EvalState).wallet.totalEarned
      },
      [PROGRESSION_SLICE_ID]: {
        achieved: [...(state as EvalState).progression.achieved]
      }
    })
  }
}
