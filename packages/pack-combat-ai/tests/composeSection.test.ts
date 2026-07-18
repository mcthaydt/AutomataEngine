import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { COMBAT_DEFAULTS, composeCombatSection, type CombatComposeInput } from '../src/composeSection'

const input = (): CombatComposeInput => ({
  specConfig: {},
  cast: [
    { id: 'c-hero', name: 'Hero', role: 'player' },
    { id: 'c-brute', name: 'Brute', role: 'antagonist' },
    { id: 'c-stalker', name: 'Stalker', role: 'antagonist' },
    { id: 'c-keeper', name: 'The Keeper', role: 'quest-giver' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: { items: [{ id: 'item-1', position: { x: -2, z: 3 } }, { id: 'item-2', position: { x: 4, z: -1 } }] },
  occupied: [{ x: 0, z: 0 }]
})

describe('composeCombatSection', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    expect(composeCombatSection(input(), createSeededRng(7)))
      .toEqual(composeCombatSection(input(), createSeededRng(7)))
    const a = composeCombatSection(input(), createSeededRng(7))
    const b = composeCombatSection(input(), createSeededRng(8))
    expect(a.enemies.map((enemy) => enemy.post)).not.toEqual(b.enemies.map((enemy) => enemy.post))
  })

  it('derives one enemy per antagonist cast member with default stats', () => {
    const config = composeCombatSection(input(), createSeededRng(7))
    expect(config.enemies.map((enemy) => ({ id: enemy.id, name: enemy.name })))
      .toEqual([{ id: 'enemy-1', name: 'Brute' }, { id: 'enemy-2', name: 'Stalker' }])
    for (const enemy of config.enemies) {
      expect(enemy.maxHealth).toBe(COMBAT_DEFAULTS.enemy.maxHealth)
      expect(enemy.aggroRadius).toBe(COMBAT_DEFAULTS.enemy.aggroRadius)
    }
  })

  it('applies playerMaxHealth from the spec config and defaults elsewhere', () => {
    const custom = { ...input(), specConfig: { playerMaxHealth: 9 } }
    expect(composeCombatSection(custom, createSeededRng(7)).player.maxHealth).toBe(9)
    expect(composeCombatSection(input(), createSeededRng(7)).player.maxHealth)
      .toBe(COMBAT_DEFAULTS.player.maxHealth)
  })

  it('keeps every post outside the spawn aggro keepout and away from occupied points', () => {
    const config = composeCombatSection(input(), createSeededRng(7))
    for (const enemy of config.enemies) {
      const spawnDist = Math.hypot(enemy.post.x - -8, enemy.post.z - -8)
      expect(spawnDist).toBeGreaterThanOrEqual(COMBAT_DEFAULTS.enemy.aggroRadius + 1)
      for (const point of [...input().occupied, ...input().inventory!.items.map((item) => item.position)]) {
        expect(Math.hypot(enemy.post.x - point.x, enemy.post.z - point.z)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('picks a seeded weapon item when inventory is present, null when standalone', () => {
    const armed = composeCombatSection(input(), createSeededRng(7))
    expect(['item-1', 'item-2']).toContain(armed.weapon.itemId)
    expect(armed.weapon.damageMultiplier).toBe(COMBAT_DEFAULTS.weaponDamageMultiplier)
    const standalone = composeCombatSection({ ...input(), inventory: null }, createSeededRng(7))
    expect(standalone.weapon.itemId).toBeNull()
  })

  it('composes an antagonist-free cast to zero enemies (gate vacuously true)', () => {
    const peaceful = { ...input(), cast: [{ id: 'c-hero', name: 'Hero', role: 'player' }] }
    expect(composeCombatSection(peaceful, createSeededRng(7)).enemies).toEqual([])
  })

  it('throws a typed exhaustion error when the placement budget runs out', () => {
    // half 4 -> extent 3: every candidate is within 4.25 of the spawn at the
    // origin, inside the spawn aggro keepout (radius 5) — no post can exist.
    const cramped = { ...input(), arena: { half: 4, spawn: { x: 0, z: 0 }, goal: { x: 1, z: 1 } } }
    expect(() => composeCombatSection(cramped, createSeededRng(7)))
      .toThrow(/Enemy post placement budget exhausted/)
  })
})
