import { describe, expect, it } from 'vitest'
import { packConfigSchema } from '../src/config'

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
