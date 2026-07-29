import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import {
  composeEconomySection,
  type EconomyComposeInput
} from '../src/composeSection'
import { totalStockPrice } from '../src/shopCore'

const input = (
  overrides: Partial<EconomyComposeInput> = {}
): EconomyComposeInput => ({
  specConfig: {},
  cast: [{ id: 'c-shop', name: 'Trader', role: 'vendor' }],
  milestones: [{ id: 'm1' }, { id: 'm2' }],
  arena: {
    half: 12,
    spawn: { x: -8, z: -8 },
    goal: { x: 6, z: 6 }
  },
  inventory: {
    items: [{ id: 'item-1', position: { x: 2, z: 3 } }]
  },
  occupied: [],
  ...overrides
})

describe('composeEconomySection', () => {
  it('is deterministic for a fixed seed', () => {
    const first = composeEconomySection(input(), createSeededRng(7))
    const second = composeEconomySection(input(), createSeededRng(7))
    expect(first).toEqual(second)
  })

  it('keeps the top threshold reachable from starting balance and pickups', () => {
    const config = composeEconomySection(input(), createSeededRng(7))
    const base = config.wallet.startingBalance +
      config.pickups.reduce((sum, pickup) => sum + pickup.amount, 0)
    const top = Math.max(
      ...config.progression.milestones.map((milestone) => milestone.threshold)
    )
    expect(top).toBeLessThanOrEqual(base)
    expect(
      config.progression.milestones.map((milestone) => milestone.id)
    ).toEqual(['m1', 'm2'])
  })

  it('keeps placed and purchasable items within the inventory cap', () => {
    const placed = 6
    const items = Array.from({ length: placed }, (_, index) => ({
      id: `item-${index + 1}`,
      position: { x: index, z: 0 }
    }))
    const config = composeEconomySection(
      input({ inventory: { items } }),
      createSeededRng(7)
    )
    const purchasable = config.shops.reduce(
      (sum, shop) => sum + shop.stock.length,
      0
    )
    expect(placed + purchasable).toBeLessThanOrEqual(8)
  })

  it('produces no shop when the cast has no vendor', () => {
    const config = composeEconomySection(
      input({ cast: [] }),
      createSeededRng(7)
    )
    expect(config.shops).toEqual([])
  })

  it('keeps every stocked item affordable from base earning', () => {
    const cast = Array.from({ length: 5 }, (_, index) => ({
      id: `v${index}`,
      name: `V${index}`,
      role: 'vendor'
    }))
    const config = composeEconomySection(input({ cast }), createSeededRng(7))
    const base = config.wallet.startingBalance +
      config.pickups.reduce((sum, pickup) => sum + pickup.amount, 0)
    expect(totalStockPrice(config.shops)).toBeLessThanOrEqual(base)
  })

  it('honors soft keepouts from other composed sections', () => {
    const occupied = [{ x: 5, z: 5 }, { x: -4, z: 2 }]
    const config = composeEconomySection(
      input({ occupied }),
      createSeededRng(7)
    )
    const placed = [
      ...config.pickups.map((pickup) => pickup.position),
      ...config.shops.map((shop) => shop.position)
    ]
    for (const point of placed) {
      for (const keepout of occupied) {
        expect(
          Math.hypot(point.x - keepout.x, point.z - keepout.z)
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('throws a typed error when the placement budget is exhausted', () => {
    expect(() => composeEconomySection(
      input({
        arena: {
          half: 1.5,
          spawn: { x: -8, z: -8 },
          goal: { x: 6, z: 6 }
        }
      }),
      createSeededRng(7)
    )).toThrow(/placement budget exhausted/i)
  })
})
