import { describe, expect, it } from 'vitest'
import type { QuestDef } from '../src/config'
import {
  acceptQuest, activeMainQuest, completeQuest, createQuestLog, deserializeQuestLog,
  questsComplete, serializeQuestLog
} from '../src/questCore'

const quests: QuestDef[] = [
  { id: 'm-1', kind: 'main', title: 'Talk to Mara', giverNpcId: 'npc-1', objective: { kind: 'talk' } },
  { id: 'm-2', kind: 'main', title: 'Fetch the relic', giverNpcId: 'npc-1', objective: { kind: 'fetch', itemIds: ['item-1'] } },
  { id: 's-1', kind: 'side', title: 'Small talk', giverNpcId: 'npc-1', objective: { kind: 'talk' } }
]
const none = { collected: [] as string[] }
const held = { collected: ['item-1'] }

describe('questCore', () => {
  it('starts with first main + all sides available, later mains locked', () => {
    expect(createQuestLog(quests)).toEqual({ 'm-1': 'available', 'm-2': 'locked', 's-1': 'available' })
  })

  it('accepts only available quests (no-op otherwise, same reference)', () => {
    const log = createQuestLog(quests)
    expect(acceptQuest(log, 'm-1')['m-1']).toBe('active')
    expect(acceptQuest(log, 'm-2')).toBe(log)
    expect(acceptQuest(log, 'nope')).toBe(log)
  })

  it('completes an active talk quest and unlocks the next main', () => {
    const log = acceptQuest(createQuestLog(quests), 'm-1')
    const done = completeQuest(log, 'm-1', quests, none)
    expect(done['m-1']).toBe('complete')
    expect(done['m-2']).toBe('available')
  })

  it('refuses to complete a fetch quest without the items, allows it with them', () => {
    let log = completeQuest(acceptQuest(createQuestLog(quests), 'm-1'), 'm-1', quests, none)
    log = acceptQuest(log, 'm-2')
    expect(completeQuest(log, 'm-2', quests, none)).toBe(log)
    expect(completeQuest(log, 'm-2', quests, held)['m-2']).toBe('complete')
  })

  it('questsComplete requires all mains, ignores sides; activeMainQuest tracks the chain', () => {
    let log = createQuestLog(quests)
    expect(activeMainQuest(log, quests)?.id).toBe('m-1')
    log = completeQuest(acceptQuest(log, 'm-1'), 'm-1', quests, none)
    log = completeQuest(acceptQuest(log, 'm-2'), 'm-2', quests, held)
    expect(questsComplete(log, quests)).toBe(true)
    expect(activeMainQuest(log, quests)).toBeNull()
  })

  it('round-trips through serialize/deserialize and rejects malformed or mismatched state', () => {
    const log = acceptQuest(createQuestLog(quests), 'm-1')
    expect(deserializeQuestLog(serializeQuestLog(log), quests)).toEqual(log)
    expect(() => deserializeQuestLog({ 'm-1': 'winning' }, quests)).toThrow()
    expect(() => deserializeQuestLog({ 'm-1': 'active' }, quests)).toThrow(/m-2/)
    expect(() => deserializeQuestLog(42, quests)).toThrow()
  })
})
