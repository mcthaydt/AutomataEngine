import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  ENEMY_DEFEATED_EVENT,
  INVENTORY_SLICE_ID,
  ITEM_PURCHASED_EVENT,
  MILESTONE_REACHED_EVENT,
  PROGRESSION_SLICE_ID,
  QUEST_COMPLETED_EVENT,
  WALLET_SLICE_ID,
  packConfigSchema,
  parseSavedEconomy,
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

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const PICKUP_COLOR = '#3ddc97'
const PICKUP_RADIUS = 0.3
const SHOP_COLOR = '#c77dff'
const SHOP_RADIUS = 0.5

/** The fifth standard pack: wallet, buy-only shops, and threshold progression. */
export const economyProgressionPack: GamePack<EconomyPackConfig> = {
  id: 'economy-progression',
  version: '1.0.0',
  compatibility: packCompatibility({
    requires: ['interaction-inventory'],
    integratesWith: ['combat-ai', 'dialogue-quests'],
    stateSlices: {
      owns: [WALLET_SLICE_ID, PROGRESSION_SLICE_ID],
      reads: [INVENTORY_SLICE_ID]
    },
    events: {
      emits: [ITEM_PURCHASED_EVENT, MILESTONE_REACHED_EVENT],
      consumes: [ENEMY_DEFEATED_EVENT, QUEST_COMPLETED_EVENT]
    }
  }),
  configSchema: packConfigSchema,

  register(ctx, config): PackRuntimeHandle {
    const milestones: MilestoneDef[] =
      config.progression.milestones.map(({ id, threshold }) => ({
        id,
        threshold
      }))
    let wallet: WalletState =
      createWalletState(config.wallet.startingBalance)
    let progression: ProgressionState = createProgressionState()
    let collectedPickups = new Set<string>()
    // Inventory remains the ownership authority; this local record makes the
    // pack's completion predicate and persistence self-contained.
    let purchased = new Set<string>()

    const publishWallet = (): void => {
      ctx.state.set(WALLET_SLICE_ID, economyProgressionPack.id, {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned
      })
    }
    const publishProgression = (): void => {
      ctx.state.set(PROGRESSION_SLICE_ID, economyProgressionPack.id, {
        achieved: [...progression.achieved]
      })
    }
    ctx.state.register(WALLET_SLICE_ID, economyProgressionPack.id, {
      balance: wallet.balance,
      totalEarned: wallet.totalEarned
    })
    ctx.state.register(PROGRESSION_SLICE_ID, economyProgressionPack.id, {
      achieved: [...progression.achieved]
    })

    const entities = new Map<string, { id: string }>()
    const addMarker = (
      key: string,
      x: number,
      z: number,
      radius: number,
      color: string
    ): void => {
      const entity = { id: key }
      entities.set(key, entity)
      ctx.render.add(entity, { primitive: 'sphere', radius, color })
      ctx.render.setPose(entity, { x, y: radius, z }, IDENTITY)
    }
    for (const pickup of config.pickups) {
      addMarker(
        `economy-pickup-${pickup.id}`,
        pickup.position.x,
        pickup.position.z,
        PICKUP_RADIUS,
        PICKUP_COLOR
      )
    }
    for (const shop of config.shops) {
      addMarker(
        `economy-shop-${shop.id}`,
        shop.position.x,
        shop.position.z,
        SHOP_RADIUS,
        SHOP_COLOR
      )
    }

    const hud = document.createElement('div')
    hud.className = 'economy-hud'
    ctx.host.overlays.append(hud)
    const updateHud = (): void => {
      hud.textContent =
        `¤ ${wallet.balance} · milestones ${progression.achieved.length}/${milestones.length}`
    }
    updateHud()

    /** Recompute progression and emit each newly crossed milestone once. */
    const advanceProgression = (): void => {
      const result = advance(progression, wallet.totalEarned, milestones)
      if (result.newlyAchieved.length === 0) return
      progression = result.state
      publishProgression()
      for (const milestoneId of result.newlyAchieved) {
        ctx.events.emit(MILESTONE_REACHED_EVENT, {
          packId: economyProgressionPack.id,
          milestoneId
        })
      }
    }

    /**
     * Fold the granted inventory slice together with this pack's purchases.
     * The local set prevents a same-tick or missing-consumer repurchase.
     */
    const ownedItems = (): ReadonlySet<string> => {
      const owned = new Set(purchased)
      if (!ctx.state.has(INVENTORY_SLICE_ID)) return owned
      const inventory = ctx.state.get(INVENTORY_SLICE_ID) as {
        collected?: readonly string[]
      }
      for (const itemId of inventory.collected ?? []) owned.add(itemId)
      return owned
    }

    const offEnemyDefeated = ctx.events.on(ENEMY_DEFEATED_EVENT, () => {
      wallet = earn(wallet, config.bounty.perEnemy)
      publishWallet()
      updateHud()
    })
    const offQuestCompleted = ctx.events.on(QUEST_COMPLETED_EVENT, () => {
      wallet = earn(wallet, config.questReward.perQuest)
      publishWallet()
      updateHud()
    })

    return {
      fixedUpdate(_dt, world) {
        // Collect all currency pickups in reach.
        for (const pickup of config.pickups) {
          if (collectedPickups.has(pickup.id)) continue
          const distance = Math.hypot(
            pickup.position.x - world.playerPosition.x,
            pickup.position.z - world.playerPosition.z
          )
          if (distance > PICKUP_RADIUS + 0.5) continue
          collectedPickups.add(pickup.id)
          wallet = earn(wallet, pickup.amount)
          const key = `economy-pickup-${pickup.id}`
          const entity = entities.get(key)
          if (entity) {
            ctx.render.remove(entity)
            entities.delete(key)
          }
        }

        // A fixed step may commit only one purchase across all shops.
        for (const shop of config.shops) {
          if (!inRadius(shop, world.playerPosition)) continue
          const purchase = nextPurchase(
            shop,
            wallet.balance,
            ownedItems()
          )
          if (!purchase) continue
          const result = spend(wallet, purchase.price)
          if (!result.ok) continue
          wallet = result.state
          purchased.add(purchase.itemId)
          ctx.events.emit(ITEM_PURCHASED_EVENT, {
            packId: economyProgressionPack.id,
            itemId: purchase.itemId
          })
          break
        }

        publishWallet()
        advanceProgression()
        updateHud()
      },

      objectivesComplete: () =>
        progressionComplete(progression, milestones) &&
        allStockPurchased(config.shops, purchased),

      saveState: () => ({
        wallet: {
          balance: wallet.balance,
          totalEarned: wallet.totalEarned
        },
        progression: { achieved: [...progression.achieved] },
        collectedPickups: [...collectedPickups],
        purchased: [...purchased]
      }),

      loadState(raw) {
        const saved = parseSavedEconomy(raw, config)
        wallet = saved.wallet
        progression = { achieved: saved.progression.achieved }
        collectedPickups = new Set(saved.collectedPickups)
        purchased = new Set(saved.purchased)

        // Reconcile pickup renderables to restored collection state.
        for (const pickup of config.pickups) {
          const key = `economy-pickup-${pickup.id}`
          const entity = entities.get(key)
          if (collectedPickups.has(pickup.id)) {
            if (entity) {
              ctx.render.remove(entity)
              entities.delete(key)
            }
          } else if (!entity) {
            addMarker(
              key,
              pickup.position.x,
              pickup.position.z,
              PICKUP_RADIUS,
              PICKUP_COLOR
            )
          }
        }
        publishWallet()
        publishProgression()
        updateHud()
      },

      dispose() {
        offEnemyDefeated()
        offQuestCompleted()
        for (const entity of entities.values()) ctx.render.remove(entity)
        entities.clear()
        hud.remove()
      }
    }
  }
}
