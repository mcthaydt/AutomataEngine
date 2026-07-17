import { z } from '@automata/project'

/**
 * Compiled pack config: ambient walker schedules and quest-driven relationship
 * tracking, cross-validated so structural mistakes are compose-time errors.
 * Contract names for the slices/events this pack owns, reads, emits, and
 * consumes live here; the dialogue-pack names are deliberate string copies —
 * pack-to-pack imports are forbidden.
 */
export const CLOCK_SLICE_ID = 'clock'
export const RELATIONSHIPS_SLICE_ID = 'relationships'
export const QUEST_LOG_SLICE_ID = 'questLog'
export const QUEST_COMPLETED_EVENT = 'questCompleted'
export const TIME_SLOT_CHANGED_EVENT = 'timeSlotChanged'
export const RELATIONSHIP_CHANGED_EVENT = 'relationshipChanged'

export const SLOT_NAMES = ['morning', 'afternoon', 'evening', 'night'] as const
export const SLOT_COUNT = SLOT_NAMES.length

/** Runtime slice payloads — also the eval hook's published shapes. */
export interface ClockSliceValue { slot: number; slotName: string }
export interface RelationshipsSliceValue { affinities: Record<string, number> }

const idSchema = z.string().min(1).max(60)
const positionSchema = z.strictObject({ x: z.number(), z: z.number() })

const walkerSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  speed: z.number().min(0.5).max(8),
  stations: z.array(positionSchema).length(SLOT_COUNT)
})
export type WalkerDef = z.infer<typeof walkerSchema>

const trackedSchema = z.strictObject({
  npcId: idSchema,
  name: z.string().min(1).max(80),
  questIds: z.array(idSchema).min(1).max(18)
})
export type TrackedRelationship = z.infer<typeof trackedSchema>

const relationshipsSchema = z.strictObject({
  tracked: z.array(trackedSchema).max(12),
  thresholds: z.strictObject({
    acquaintance: z.number().int().min(1).max(20),
    friend: z.number().int().min(2).max(40)
  }),
  gains: z.strictObject({ questCompleted: z.number().int().min(1).max(4) })
})
export type RelationshipsConfig = z.infer<typeof relationshipsSchema>

const baseConfigSchema = z.strictObject({
  slotSeconds: z.number().min(5).max(120),
  walkers: z.array(walkerSchema).max(12),
  relationships: relationshipsSchema
})
export type SchedulesRelationshipsPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

export const packConfigSchema: z.ZodType<SchedulesRelationshipsPackConfig> = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  for (const dup of duplicates(config.walkers.map((walker) => walker.id))) issue(`duplicate walker id "${dup}"`)
  for (const dup of duplicates(config.relationships.tracked.map((entry) => entry.npcId))) issue(`duplicate tracked npc id "${dup}"`)
  const seenQuestIds = new Map<string, string>()
  for (const entry of config.relationships.tracked) {
    for (const questId of entry.questIds) {
      const owner = seenQuestIds.get(questId)
      if (owner) issue(`quest "${questId}" tracked by both "${owner}" and "${entry.npcId}"`)
      else seenQuestIds.set(questId, entry.npcId)
    }
  }
  if (config.relationships.thresholds.friend <= config.relationships.thresholds.acquaintance) {
    issue('friend threshold must be above acquaintance')
  }
})
