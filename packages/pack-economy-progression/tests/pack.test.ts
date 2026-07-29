import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import {
  createGameHost,
  createPackEventBus,
  createPackStateRegistry,
  type PackBootContext
} from '@automata/game-kit'
import { economyProgressionPack } from '../src/pack'

const config = () => ({
  wallet: { startingBalance: 0 },
  pickups: [{
    id: 'currency-1',
    position: { x: 0, z: 0 },
    amount: 5
  }],
  shops: [],
  bounty: { perEnemy: 3 },
  questReward: { perQuest: 6 },
  progression: { milestones: [{ id: 'm1', threshold: 5 }] }
})

const shopConfig = () => ({
  ...config(),
  wallet: { startingBalance: 10 },
  pickups: [],
  shops: [{
    id: 'shop-1',
    position: { x: 0, z: 0 },
    radius: 1.5,
    stock: [{ itemId: 'catalog-1', price: 8 }]
  }],
  progression: { milestones: [{ id: 'm1', threshold: 10 }] }
})

const overlappingShopsConfig = () => ({
  ...config(),
  wallet: { startingBalance: 20 },
  pickups: [],
  shops: [
    {
      id: 'shop-1',
      position: { x: 0, z: 0 },
      radius: 1.5,
      stock: [{ itemId: 'catalog-1', price: 8 }]
    },
    {
      id: 'shop-2',
      position: { x: 0, z: 0.5 },
      radius: 1.5,
      stock: [{ itemId: 'catalog-2', price: 8 }]
    }
  ],
  progression: { milestones: [{ id: 'm1', threshold: 20 }] }
})

/**
 * Register directly so the test controls the shared event bus and slice
 * registry. `composePacks` would also reject this required pack in isolation.
 */
function boot(rawConfig: unknown = config()) {
  const app = document.createElement('div')
  document.body.append(app)
  const render = createNullRenderer()
  const events = createPackEventBus()
  const state = createPackStateRegistry()
  state.register('inventory', 'interaction-inventory', { collected: [] })
  const ctx: PackBootContext = {
    host: createGameHost(app),
    render: render.port,
    events,
    state
  }
  const parsed = economyProgressionPack.configSchema!.parse(rawConfig)
  const handle = economyProgressionPack.register(ctx, parsed)
  if (!handle) throw new Error('pack must return a runtime handle')
  return { ctx, render, handle, app, events, state }
}

type Booted = ReturnType<typeof boot>

const teardown = (booted: Booted): void => {
  booted.handle.dispose?.()
  booted.ctx.host.dispose()
  booted.app.remove()
}

const saved = (booted: Booted) => booted.handle.saveState!() as {
  wallet: { balance: number; totalEarned: number }
  progression: { achieved: string[] }
  collectedPickups: string[]
  purchased: string[]
}

describe('economyProgressionPack', () => {
  it('collects currency, completes progression, and updates the HUD', () => {
    const booted = boot()
    expect(
      booted.ctx.host.overlays.querySelector('.economy-hud')?.textContent
    ).toBe('¤ 0 · milestones 0/1')

    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })

    expect(saved(booted).wallet.totalEarned).toBe(5)
    expect(booted.handle.objectivesComplete!()).toBe(true)
    expect(
      booted.ctx.host.overlays.querySelector('.economy-hud')?.textContent
    ).toBe('¤ 5 · milestones 1/1')
    teardown(booted)
  })

  it('removes a collected pickup marker and clears markers on dispose', () => {
    const booted = boot()
    expect(booted.render.port.objectCount).toBe(1)
    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    expect(booted.render.port.objectCount).toBe(0)
    teardown(booted)
    expect(booted.render.port.objectCount).toBe(0)
  })

  it('writes the wallet and progression slices it owns', () => {
    const booted = boot()
    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    expect(booted.state.get('wallet')).toEqual({
      balance: 5,
      totalEarned: 5
    })
    expect(booted.state.get('progression')).toEqual({ achieved: ['m1'] })
    teardown(booted)
  })

  it('auto-buys in range, emits events, and gates completion on stock', () => {
    const booted = boot(shopConfig())
    const purchases: unknown[] = []
    const milestones: unknown[] = []
    booted.events.on('itemPurchased', (payload) => purchases.push(payload))
    booted.events.on('milestoneReached', (payload) => milestones.push(payload))

    expect(booted.handle.objectivesComplete!()).toBe(false)
    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })

    expect(purchases).toEqual([{
      packId: 'economy-progression',
      itemId: 'catalog-1'
    }])
    expect(milestones).toEqual([{
      packId: 'economy-progression',
      milestoneId: 'm1'
    }])
    expect(saved(booted).wallet).toEqual({
      balance: 2,
      totalEarned: 10
    })
    expect(booted.handle.objectivesComplete!()).toBe(true)

    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    expect(purchases).toHaveLength(1)
    expect(saved(booted).wallet.balance).toBe(2)
    teardown(booted)
  })

  it('does not buy unaffordable stock', () => {
    const booted = boot({
      ...shopConfig(),
      wallet: { startingBalance: 3 }
    })
    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    expect(saved(booted).purchased).toEqual([])
    expect(saved(booted).wallet.balance).toBe(3)
    teardown(booted)
  })

  it('buys at most one item globally per fixed step', () => {
    const booted = boot(overlappingShopsConfig())

    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    expect(saved(booted).purchased).toEqual(['catalog-1'])
    expect(booted.handle.objectivesComplete!()).toBe(false)

    booted.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    expect(saved(booted).purchased).toEqual(['catalog-1', 'catalog-2'])
    expect(booted.handle.objectivesComplete!()).toBe(true)
    teardown(booted)
  })

  it('earns bounty and quest rewards from subscribed events', () => {
    const booted = boot()
    booted.events.emit('enemyDefeated', {
      packId: 'combat-ai',
      enemyId: 'e1'
    })
    booted.events.emit('questCompleted', {
      packId: 'dialogue-quests',
      questId: 'q1'
    })
    expect(saved(booted).wallet).toEqual({
      balance: 9,
      totalEarned: 9
    })
    teardown(booted)
  })

  it('unsubscribes from economy reward events on dispose', () => {
    const booted = boot()
    booted.handle.dispose!()

    booted.events.emit('enemyDefeated', {
      packId: 'combat-ai',
      enemyId: 'e1'
    })
    booted.events.emit('questCompleted', {
      packId: 'dialogue-quests',
      questId: 'q1'
    })

    expect(saved(booted).wallet).toEqual({
      balance: 0,
      totalEarned: 0
    })
    booted.ctx.host.dispose()
    booted.app.remove()
  })

  it('round-trips all load-bearing economy state', () => {
    const first = boot(shopConfig())
    first.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    const snapshot = first.handle.saveState!()
    teardown(first)

    const fresh = boot(shopConfig())
    fresh.handle.loadState!(snapshot)
    expect(fresh.handle.objectivesComplete!()).toBe(true)
    expect(saved(fresh)).toEqual(snapshot)

    const collected = boot()
    collected.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    const pickupSnapshot = collected.handle.saveState!()
    const reloaded = boot()
    reloaded.handle.loadState!(pickupSnapshot)
    reloaded.handle.fixedUpdate!(1 / 60, {
      playerPosition: { x: 0, z: 0 }
    })
    expect(saved(reloaded).wallet.totalEarned).toBe(5)

    teardown(fresh)
    teardown(collected)
    teardown(reloaded)
  })

  it('rejects malformed saved state', () => {
    const booted = boot()
    expect(() => booted.handle.loadState!({
      wallet: { balance: -1, totalEarned: 0 }
    })).toThrow()
    teardown(booted)
  })

  it.each([
    {
      name: 'unknown pickup id',
      rawConfig: config(),
      snapshot: {
        wallet: { balance: 0, totalEarned: 0 },
        progression: { achieved: [] },
        collectedPickups: ['missing'],
        purchased: []
      }
    },
    {
      name: 'duplicate pickup id',
      rawConfig: config(),
      snapshot: {
        wallet: { balance: 5, totalEarned: 5 },
        progression: { achieved: ['m1'] },
        collectedPickups: ['currency-1', 'currency-1'],
        purchased: []
      }
    },
    {
      name: 'unknown purchased item id',
      rawConfig: shopConfig(),
      snapshot: {
        wallet: { balance: 2, totalEarned: 10 },
        progression: { achieved: ['m1'] },
        collectedPickups: [],
        purchased: ['missing']
      }
    },
    {
      name: 'duplicate purchased item id',
      rawConfig: shopConfig(),
      snapshot: {
        wallet: { balance: 2, totalEarned: 10 },
        progression: { achieved: ['m1'] },
        collectedPickups: [],
        purchased: ['catalog-1', 'catalog-1']
      }
    },
    {
      name: 'unknown achieved milestone id',
      rawConfig: config(),
      snapshot: {
        wallet: { balance: 5, totalEarned: 5 },
        progression: { achieved: ['missing'] },
        collectedPickups: ['currency-1'],
        purchased: []
      }
    },
    {
      name: 'duplicate achieved milestone id',
      rawConfig: config(),
      snapshot: {
        wallet: { balance: 5, totalEarned: 5 },
        progression: { achieved: ['m1', 'm1'] },
        collectedPickups: ['currency-1'],
        purchased: []
      }
    },
    {
      name: 'milestone achieved before its threshold',
      rawConfig: config(),
      snapshot: {
        wallet: { balance: 0, totalEarned: 0 },
        progression: { achieved: ['m1'] },
        collectedPickups: [],
        purchased: []
      }
    },
    {
      name: 'balance greater than total earned',
      rawConfig: config(),
      snapshot: {
        wallet: { balance: 1, totalEarned: 0 },
        progression: { achieved: [] },
        collectedPickups: [],
        purchased: []
      }
    },
    {
      name: 'purchase cost inconsistent with balance',
      rawConfig: shopConfig(),
      snapshot: {
        wallet: { balance: 3, totalEarned: 10 },
        progression: { achieved: ['m1'] },
        collectedPickups: [],
        purchased: ['catalog-1']
      }
    },
    {
      name: 'total earned below starting balance',
      rawConfig: shopConfig(),
      snapshot: {
        wallet: { balance: 5, totalEarned: 5 },
        progression: { achieved: [] },
        collectedPickups: [],
        purchased: []
      }
    },
    {
      name: 'earnings not produced by pickups or event rewards',
      rawConfig: config(),
      snapshot: {
        wallet: { balance: 2, totalEarned: 2 },
        progression: { achieved: [] },
        collectedPickups: [],
        purchased: []
      }
    }
  ])('rejects $name without mutating live state', ({ rawConfig, snapshot }) => {
    const booted = boot(rawConfig)
    const before = saved(booted)
    expect(() => booted.handle.loadState!(snapshot)).toThrow()
    expect(saved(booted)).toEqual(before)
    teardown(booted)
  })
})
