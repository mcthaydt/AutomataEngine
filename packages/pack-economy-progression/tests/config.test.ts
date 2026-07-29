import { describe, expect, it } from 'vitest'
import { packConfigSchema, parseSavedEconomy } from '../src/config'

const base = () => ({
  wallet: { startingBalance: 5 },
  pickups: [{ id: 'p1', position: { x: 1, z: 1 }, amount: 5 }],
  shops: [{
    id: 's1',
    position: { x: 2, z: 2 },
    radius: 1.5,
    stock: [{ itemId: 'catalog-1', price: 8 }]
  }],
  bounty: { perEnemy: 3 },
  questReward: { perQuest: 6 },
  progression: {
    milestones: [
      { id: 'm1', threshold: 5 },
      { id: 'm2', threshold: 12 }
    ]
  }
})

describe('packConfigSchema', () => {
  it('accepts a well-formed config', () => {
    expect(() => packConfigSchema.parse(base())).not.toThrow()
  })

  it('rejects non-ascending or duplicate milestone thresholds', () => {
    const invalid = base()
    invalid.progression.milestones = [
      { id: 'm1', threshold: 12 },
      { id: 'm2', threshold: 5 }
    ]
    expect(() => packConfigSchema.parse(invalid)).toThrow()
  })

  it('rejects duplicate pickup ids', () => {
    const invalid = base()
    invalid.pickups = [
      invalid.pickups[0]!,
      { ...invalid.pickups[0]!, position: { x: 9, z: 9 } }
    ]
    expect(() => packConfigSchema.parse(invalid)).toThrow()
  })

  it('rejects duplicate shop ids', () => {
    const invalid = base()
    invalid.shops = [
      invalid.shops[0]!,
      { ...invalid.shops[0]!, position: { x: 9, z: 9 } }
    ]
    expect(() => packConfigSchema.parse(invalid)).toThrow()
  })

  it('rejects duplicate stock item ids within one shop', () => {
    const invalid = base()
    invalid.shops[0]!.stock.push({ itemId: 'catalog-1', price: 9 })
    expect(() => packConfigSchema.parse(invalid)).toThrow(
      /duplicate stock item id/i
    )
  })

  it('rejects duplicate stock item ids across shops', () => {
    const invalid = base()
    invalid.shops.push({
      id: 's2',
      position: { x: 9, z: 9 },
      radius: 1.5,
      stock: [{ itemId: 'catalog-1', price: 4 }]
    })
    expect(() => packConfigSchema.parse(invalid)).toThrow(
      /duplicate stock item id/i
    )
  })

  it('rejects duplicate milestone ids', () => {
    const invalid = base()
    invalid.progression.milestones = [
      { id: 'm1', threshold: 5 },
      { id: 'm1', threshold: 12 }
    ]
    expect(() => packConfigSchema.parse(invalid)).toThrow()
  })

  it('rejects coincident pickup and shop positions', () => {
    const invalid = base()
    invalid.shops[0]!.position = { ...invalid.pickups[0]!.position }
    expect(() => packConfigSchema.parse(invalid)).toThrow()
  })

  it('rejects unknown keys', () => {
    expect(() => packConfigSchema.parse({ ...base(), extra: 1 })).toThrow()
  })
})

describe('parseSavedEconomy reward accounting', () => {
  const rewardsConfig = (perEnemy: number, perQuest: number) =>
    packConfigSchema.parse({
      wallet: { startingBalance: 0 },
      pickups: [],
      shops: [],
      bounty: { perEnemy },
      questReward: { perQuest },
      progression: {
        milestones: [{ id: 'm1', threshold: 0 }]
      }
    })
  const snapshot = (totalEarned: number) => ({
    wallet: { balance: totalEarned, totalEarned },
    progression: { achieved: ['m1'] },
    collectedPickups: [],
    purchased: []
  })

  it.each([
    { bounty: 0, quest: 0, earned: 0 },
    { bounty: 0, quest: 6, earned: 6 },
    { bounty: 3, quest: 0, earned: 3 },
    { bounty: 3, quest: 6, earned: 3 }
  ])('accepts an exact fixed-reward combination %#', ({
    bounty,
    quest,
    earned
  }) => {
    expect(parseSavedEconomy(
      snapshot(earned),
      rewardsConfig(bounty, quest)
    ).wallet.totalEarned).toBe(earned)
  })

  it.each([
    { bounty: 4, quest: 6, earned: 2 },
    { bounty: 0, quest: 0, earned: 1 }
  ])('rejects an unreachable fixed-reward combination %#', ({
    bounty,
    quest,
    earned
  }) => {
    expect(() => parseSavedEconomy(
      snapshot(earned),
      rewardsConfig(bounty, quest)
    )).toThrow(/cannot be produced/i)
  })
})
