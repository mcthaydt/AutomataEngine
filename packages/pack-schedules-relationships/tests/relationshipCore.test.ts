import { describe, expect, it } from 'vitest'
import {
  applyQuestCompleted, createAffinities, deserializeSchedulesState, relationshipsComplete,
  serializeSchedulesState, tierOf
} from '../src/relationshipCore'
import { validConfig } from './fixtures'

const config = validConfig()
const rel = config.relationships

describe('relationshipCore', () => {
  it('starts every tracked npc at zero (stranger), incomplete', () => {
    const affinities = createAffinities(rel)
    expect(affinities).toEqual({ 'npc-1': 0 })
    expect(tierOf(0, rel.thresholds)).toBe('stranger')
    expect(relationshipsComplete(affinities, rel)).toBe(false)
  })

  it('bumps the tracking npc on its quest; untracked quests are ignored (same ref)', () => {
    const zero = createAffinities(rel)
    const bumped = applyQuestCompleted(zero, 'q-main-1', rel)
    expect(bumped).toEqual({ 'npc-1': 1 })
    expect(applyQuestCompleted(zero, 'q-side-9', rel)).toBe(zero)
  })

  it('maps thresholds to tiers and completes at acquaintance everywhere', () => {
    expect(tierOf(1, rel.thresholds)).toBe('acquaintance')
    expect(tierOf(2, rel.thresholds)).toBe('friend')
    expect(relationshipsComplete({ 'npc-1': 1 }, rel)).toBe(true)
  })

  it('is vacuously complete with no tracked npcs', () => {
    expect(relationshipsComplete({}, { ...rel, tracked: [] })).toBe(true)
  })

  it('round-trips saved state and rejects malformed or mismatched saves', () => {
    const saved = serializeSchedulesState({ slot: 2, elapsedInSlot: 3.5 }, { 'npc-1': 1 })
    expect(deserializeSchedulesState(saved, config)).toEqual({
      clock: { slot: 2, elapsedInSlot: 3.5 }, affinities: { 'npc-1': 1 }
    })
    expect(() => deserializeSchedulesState(42, config)).toThrow()
    expect(() => deserializeSchedulesState(
      serializeSchedulesState({ slot: 9, elapsedInSlot: 0 }, { 'npc-1': 0 }), config)).toThrow()
    expect(() => deserializeSchedulesState(
      serializeSchedulesState({ slot: 0, elapsedInSlot: 0 }, { 'npc-9': 0 }), config)).toThrow(/npc-9/)
    expect(() => deserializeSchedulesState(
      serializeSchedulesState({ slot: 0, elapsedInSlot: 0 }, {}), config)).toThrow(/npc-1/)
  })
})
