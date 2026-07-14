import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { INVENTORY_DEFAULTS, composeInventorySection } from '../src/composeSection'

const arena = { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 8, z: 8 } }
const input = (specConfig: { requiredItems?: number; interactRadius?: number } = {}) =>
  ({ specConfig, arena, iconPath: 'assets/item-icon.svg' as string | null })

describe('composeInventorySection', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    const a = composeInventorySection(input({ requiredItems: 2 }), createSeededRng(7))
    const b = composeInventorySection(input({ requiredItems: 2 }), createSeededRng(7))
    const c = composeInventorySection(input({ requiredItems: 2 }), createSeededRng(8))
    expect(a).toEqual(b)
    expect(a.items).not.toEqual(c.items)
  })

  it('applies defaults when spec config fields are absent', () => {
    const composed = composeInventorySection(input(), createSeededRng(7))
    expect(composed.items).toHaveLength(INVENTORY_DEFAULTS.requiredItems)
    expect(composed.interactRadius).toBe(INVENTORY_DEFAULTS.interactRadius)
    expect(composed.iconPath).toBe('assets/item-icon.svg')
  })

  it('honors placement constraints across many seeds', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { items } = composeInventorySection(input({ requiredItems: 8 }), createSeededRng(seed))
      expect(items).toHaveLength(8)
      expect(items.map((item) => item.id)).toEqual(items.map((_, index) => `item-${index + 1}`))
      for (const [index, item] of items.entries()) {
        expect(Math.abs(item.position.x)).toBeLessThanOrEqual(arena.half - 1)
        expect(Math.abs(item.position.z)).toBeLessThanOrEqual(arena.half - 1)
        expect(Math.hypot(item.position.x - arena.spawn.x, item.position.z - arena.spawn.z)).toBeGreaterThanOrEqual(3)
        expect(Math.hypot(item.position.x - arena.goal.x, item.position.z - arena.goal.z)).toBeGreaterThanOrEqual(3)
        for (const other of items.slice(index + 1)) {
          expect(Math.hypot(item.position.x - other.position.x, item.position.z - other.position.z)).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('throws when the placement budget cannot satisfy the constraints', () => {
    const tiny = { specConfig: { requiredItems: 8 }, arena: { half: 2, spawn: { x: 0, z: 0 }, goal: { x: 0, z: 0 } }, iconPath: null }
    expect(() => composeInventorySection(tiny, createSeededRng(1))).toThrow(/placement/i)
  })
})
