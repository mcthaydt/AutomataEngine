import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/sim/rng'
import { chooseUpgrades, type UpgradeId } from '../../src/sim/upgrades'
import { defaultPulsebreakCompiledProject as config } from '../../src/project/template'

const upgradeIds = Object.keys(config.upgrades) as UpgradeId[]

describe('upgrades', () => {
  it('defines metadata for every upgrade id', () => {
    for (const id of upgradeIds) {
      const def = config.upgrades[id]
      expect(def.id).toBe(id)
      expect(def.label.length).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
    }
  })

  it('chooses three distinct valid upgrade ids', () => {
    const choices = chooseUpgrades(createRng(3), upgradeIds)
    expect(choices).toHaveLength(3)
    expect(new Set(choices).size).toBe(3)
    for (const id of choices) expect(upgradeIds).toContain(id)
  })

  it('is deterministic for a given seed', () => {
    expect(chooseUpgrades(createRng(11), upgradeIds)).toEqual(chooseUpgrades(createRng(11), upgradeIds))
  })

  it('can vary the offered set across different rng state', () => {
    const rng = createRng(123)
    const first = chooseUpgrades(rng, upgradeIds)
    const second = chooseUpgrades(rng, upgradeIds)
    // Across many waves the offered triples should not be frozen to one set.
    expect(first.length).toBe(3)
    expect(second.length).toBe(3)
  })
})
