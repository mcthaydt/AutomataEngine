import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { packConfigSchema } from '../src/config'
import { composeSchedulesSection, type SchedulesComposeInput } from '../src/composeSection'

const input = (): SchedulesComposeInput => ({
  specConfig: {},
  cast: [
    { id: 'c-player', name: 'You', role: 'player' },
    { id: 'c-keeper', name: 'The Keeper', role: 'quest-giver' },
    { id: 'c-stroller', name: 'Stroller', role: 'ambient' },
    { id: 'c-lounger', name: 'Lounger', role: 'ambient' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: { items: [{ id: 'item-1', position: { x: -2, z: 3 } }] },
  dialogue: {
    npcs: [{ id: 'npc-1', name: 'The Keeper', position: { x: 5, z: 5 } }],
    quests: [
      { id: 'q-main-1', kind: 'main', giverNpcId: 'npc-1' },
      { id: 'q-main-2', kind: 'main', giverNpcId: 'npc-1' },
      { id: 'q-side-1', kind: 'side', giverNpcId: 'npc-1' }
    ]
  }
})

describe('composeSchedulesSection', () => {
  it('is deterministic and schema-valid, with defaults applied here', () => {
    const a = composeSchedulesSection(input(), createSeededRng(7))
    const b = composeSchedulesSection(input(), createSeededRng(7))
    expect(a).toEqual(b)
    expect(() => packConfigSchema.parse(a)).not.toThrow()
    expect(a.slotSeconds).toBe(20)
  })

  it('creates one walker per ambient cast member with four keepout-clear stations', () => {
    const config = composeSchedulesSection(input(), createSeededRng(7))
    expect(config.walkers.map((walker) => walker.name)).toEqual(['Stroller', 'Lounger'])
    const keepouts = [
      input().arena.spawn, input().arena.goal,
      ...input().inventory.items.map((item) => item.position),
      ...input().dialogue.npcs.map((npc) => npc.position)
    ]
    for (const walker of config.walkers) {
      expect(walker.stations).toHaveLength(4)
      for (const station of walker.stations) {
        expect(Math.abs(station.x)).toBeLessThanOrEqual(11)
        expect(Math.abs(station.z)).toBeLessThanOrEqual(11)
        for (const point of keepouts) {
          expect(Math.hypot(station.x - point.x, station.z - point.z)).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('tracks exactly the distinct main-quest givers with their main quests (sides untracked)', () => {
    const config = composeSchedulesSection(input(), createSeededRng(7))
    expect(config.relationships.tracked).toEqual([
      { npcId: 'npc-1', name: 'The Keeper', questIds: ['q-main-1', 'q-main-2'] }
    ])
    expect(config.relationships.thresholds).toEqual({ acquaintance: 1, friend: 2 })
    expect(config.relationships.gains).toEqual({ questCompleted: 1 })
  })

  it('composes legally with zero ambient cast members', () => {
    const noAmbient = input()
    ;(noAmbient as { cast: unknown }).cast = input().cast.filter((member) => member.role !== 'ambient')
    const config = composeSchedulesSection(noAmbient, createSeededRng(7))
    expect(config.walkers).toEqual([])
    expect(() => packConfigSchema.parse(config)).not.toThrow()
  })

  it('throws a typed error when station placement exhausts the draw budget', () => {
    const cramped = input()
    ;(cramped as { arena: unknown }).arena = { half: 2, spawn: { x: 0, z: 0 }, goal: { x: 1, z: 1 } }
    expect(() => composeSchedulesSection(cramped, createSeededRng(7))).toThrow(/budget/i)
  })
})
