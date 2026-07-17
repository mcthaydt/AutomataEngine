import { z } from '@automata/project'
import { SLOT_COUNT, type RelationshipsConfig, type SchedulesRelationshipsPackConfig } from './config'
import type { ClockState } from './clockCore'

/** Pure relationship state: affinity per tracked NPC, driven by quest completion. */
export type RelationshipTier = 'stranger' | 'acquaintance' | 'friend'
export type Affinities = Readonly<Record<string, number>>

export function createAffinities(config: RelationshipsConfig): Affinities {
  return Object.fromEntries(config.tracked.map((entry) => [entry.npcId, 0]))
}

export function applyQuestCompleted(affinities: Affinities, questId: string, config: RelationshipsConfig): Affinities {
  const tracker = config.tracked.find((entry) => entry.questIds.includes(questId))
  if (!tracker) return affinities
  return { ...affinities, [tracker.npcId]: (affinities[tracker.npcId] ?? 0) + config.gains.questCompleted }
}

export function tierOf(affinity: number, thresholds: RelationshipsConfig['thresholds']): RelationshipTier {
  if (affinity >= thresholds.friend) return 'friend'
  if (affinity >= thresholds.acquaintance) return 'acquaintance'
  return 'stranger'
}

/** The pack's objectives-complete gate: every tracked NPC reaches acquaintance. */
export function relationshipsComplete(affinities: Affinities, config: RelationshipsConfig): boolean {
  return config.tracked.every((entry) => (affinities[entry.npcId] ?? 0) >= config.thresholds.acquaintance)
}

const savedStateSchema = z.strictObject({
  clock: z.strictObject({
    slot: z.number().int().min(0).max(SLOT_COUNT - 1),
    elapsedInSlot: z.number().min(0)
  }),
  affinities: z.record(z.string().min(1).max(60), z.number().int().min(0))
})
export type SchedulesSavedState = z.infer<typeof savedStateSchema>

export function serializeSchedulesState(clock: ClockState, affinities: Affinities): unknown {
  return { clock: { ...clock }, affinities: { ...affinities } }
}

/** Parse-or-throw; saved affinity keys must exactly match the tracked set. */
export function deserializeSchedulesState(raw: unknown, config: SchedulesRelationshipsPackConfig): SchedulesSavedState {
  const parsed = savedStateSchema.parse(raw)
  const expected = new Set(config.relationships.tracked.map((entry) => entry.npcId))
  for (const id of Object.keys(parsed.affinities)) {
    if (!expected.has(id)) throw new Error(`Saved schedules state has unknown npc "${id}"`)
  }
  for (const id of expected) {
    if (!(id in parsed.affinities)) throw new Error(`Saved schedules state missing npc "${id}"`)
  }
  return parsed
}
