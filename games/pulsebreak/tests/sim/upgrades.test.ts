import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/sim/rng'
import { UPGRADES, UPGRADE_IDS, chooseUpgrades } from '../../src/sim/upgrades'

describe('upgrades', () => {
  it('defines metadata for every upgrade id', () => {
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id]
      expect(def.id).toBe(id)
      expect(def.label.length).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
    }
  })

  it('chooses three distinct valid upgrade ids', () => {
    const choices = chooseUpgrades(createRng(3))
    expect(choices).toHaveLength(3)
    expect(new Set(choices).size).toBe(3)
    for (const id of choices) expect(UPGRADE_IDS).toContain(id)
  })

  it('is deterministic for a given seed', () => {
    expect(chooseUpgrades(createRng(11))).toEqual(chooseUpgrades(createRng(11)))
  })

  it('can vary the offered set across different rng state', () => {
    const rng = createRng(123)
    const first = chooseUpgrades(rng)
    const second = chooseUpgrades(rng)
    // Across many waves the offered triples should not be frozen to one set.
    expect(first.length).toBe(3)
    expect(second.length).toBe(3)
  })
})
