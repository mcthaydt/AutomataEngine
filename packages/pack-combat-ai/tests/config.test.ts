import { describe, expect, it } from 'vitest'
import { packConfigSchema } from '../src/config'

const validConfig = () => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [
    {
      id: 'enemy-1', name: 'Brute', post: { x: 4, z: 4 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    },
    {
      id: 'enemy-2', name: 'Stalker', post: { x: -4, z: 5 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    }
  ]
})

describe('combat pack config schema', () => {
  it('accepts a valid config, a null weapon, and an empty enemy list', () => {
    expect(packConfigSchema.parse(validConfig())).toEqual(validConfig())
    const unarmed = { ...validConfig(), weapon: { itemId: null, damageMultiplier: 2 } }
    expect(packConfigSchema.parse(unarmed).weapon.itemId).toBeNull()
    expect(packConfigSchema.parse({ ...validConfig(), enemies: [] }).enemies).toEqual([])
  })

  it('rejects duplicate enemy ids', () => {
    const config = validConfig()
    config.enemies[1]!.id = 'enemy-1'
    expect(() => packConfigSchema.parse(config)).toThrow(/duplicate enemy id/)
  })

  it('rejects aggroRadius at or above leashRadius', () => {
    const config = validConfig()
    config.enemies[0]!.aggroRadius = 7
    expect(() => packConfigSchema.parse(config)).toThrow(/aggroRadius must be below leashRadius/)
  })

  it('rejects unknown keys and out-of-range values', () => {
    expect(() => packConfigSchema.parse({ ...validConfig(), extra: 1 })).toThrow()
    const config = validConfig()
    config.player.maxHealth = 0
    expect(() => packConfigSchema.parse(config)).toThrow()
  })
})
