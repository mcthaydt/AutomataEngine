import { describe, expect, it } from 'vitest'
import { packConfigSchema, SLOT_COUNT } from '../src/config'
import { validConfig } from './fixtures'

describe('schedules-relationships pack config schema', () => {
  it('parses a valid config unchanged, including zero walkers', () => {
    expect(packConfigSchema.parse(validConfig())).toEqual(validConfig())
    const empty = { ...validConfig(), walkers: [] }
    expect(packConfigSchema.parse(empty)).toEqual(empty)
  })

  it('rejects station arrays that are not exactly SLOT_COUNT long', () => {
    const short = validConfig()
    short.walkers[0]!.stations = short.walkers[0]!.stations.slice(0, SLOT_COUNT - 1)
    expect(() => packConfigSchema.parse(short)).toThrow()
    const long = validConfig()
    long.walkers[0]!.stations = [...long.walkers[0]!.stations, { x: 0, z: 0 }]
    expect(() => packConfigSchema.parse(long)).toThrow()
  })

  it('rejects duplicate walker ids and duplicate tracked npc ids', () => {
    const dupWalker = validConfig()
    dupWalker.walkers.push({ ...dupWalker.walkers[0]! })
    expect(() => packConfigSchema.parse(dupWalker)).toThrow(/duplicate/i)
    const dupTracked = validConfig()
    dupTracked.relationships.tracked.push({ ...dupTracked.relationships.tracked[0]! })
    expect(() => packConfigSchema.parse(dupTracked)).toThrow(/duplicate/i)
  })

  it('rejects a quest id tracked by two npcs', () => {
    const shared = validConfig()
    shared.relationships.tracked.push({ npcId: 'npc-2', name: 'Dockhand', questIds: ['q-main-1'] })
    expect(() => packConfigSchema.parse(shared)).toThrow(/q-main-1/)
  })

  it('rejects thresholds where friend is not above acquaintance', () => {
    const flat = validConfig()
    flat.relationships.thresholds = { acquaintance: 2, friend: 2 }
    expect(() => packConfigSchema.parse(flat)).toThrow(/friend/i)
  })

  it('rejects out-of-bounds slotSeconds and speed, and unknown keys', () => {
    expect(() => packConfigSchema.parse({ ...validConfig(), slotSeconds: 2 })).toThrow()
    const slow = validConfig()
    slow.walkers[0]!.speed = 0
    expect(() => packConfigSchema.parse(slow)).toThrow()
    expect(() => packConfigSchema.parse({ ...validConfig(), extra: true })).toThrow()
  })
})
