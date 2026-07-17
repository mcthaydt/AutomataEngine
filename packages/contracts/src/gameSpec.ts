import { z } from 'zod'
import { gameSlugSchema } from './workspaceTools'

/**
 * Phase 2 contract: the versioned GameSpec — the machine-readable creative and
 * production contract compiled from a prompt and frozen at Design approval.
 * Every envelope limit is a zod bound: validation IS envelope enforcement.
 * No wall-clock timestamps live here; time belongs to the session ledger.
 */

export const capabilityIdSchema = z.enum([
  'interaction-inventory', 'dialogue-quests', 'schedules-relationships',
  'combat-ai', 'economy-progression', 'hub-navigation-vehicle', 'save-load'
])
export type CapabilityId = z.infer<typeof capabilityIdSchema>

export interface CapabilityRule {
  requires: CapabilityId[]
  incompatibleWith: CapabilityId[]
}

/** Phase-2 placeholder table; Phase 4 packs take ownership of their real declarations. */
export const DEFAULT_CAPABILITY_COMPATIBILITY: Record<CapabilityId, CapabilityRule> = {
  'interaction-inventory': { requires: [], incompatibleWith: [] },
  'dialogue-quests': { requires: ['interaction-inventory'], incompatibleWith: [] },
  'schedules-relationships': { requires: ['dialogue-quests'], incompatibleWith: [] },
  'combat-ai': { requires: [], incompatibleWith: [] },
  'economy-progression': { requires: ['interaction-inventory'], incompatibleWith: [] },
  'hub-navigation-vehicle': { requires: [], incompatibleWith: [] },
  'save-load': { requires: [], incompatibleWith: [] }
}

export const specTranslationSchema = z.strictObject({
  requested: z.string().min(1).max(400),
  translatedTo: z.string().min(1).max(400),
  reason: z.string().min(1).max(400)
})
export type SpecTranslation = z.infer<typeof specTranslationSchema>

const specProvenanceSchema = z.strictObject({
  prompt: z.string().min(1).max(4000),
  translations: z.array(specTranslationSchema).max(20),
  history: z.array(z.strictObject({
    version: z.number().int().min(1),
    reason: z.string().min(1).max(400)
  })).min(1).max(50)
})

const specIdentitySchema = z.strictObject({
  id: gameSlugSchema,
  title: z.string().min(1).max(80),
  logline: z.string().min(1).max(240),
  themes: z.array(z.string().min(1).max(60)).min(1).max(8),
  contentRating: z.enum(['everyone', 'teen', 'mature'])
})

const specDirectionSchema = z.strictObject({
  visualStyle: z.string().min(1).max(240),
  audioStyle: z.string().min(1).max(240),
  dialogueTone: z.string().min(1).max(240),
  camera: z.enum(['third-person-follow', 'fixed', 'top-down'])
})

const specBudgetsSchema = z.strictObject({
  targetMinutes: z.number().int().min(30).max(120),
  districtCount: z.literal(1),
  interiorCount: z.number().int().min(0).max(8),
  characterCount: z.number().int().min(1).max(12),
  mainQuestCount: z.number().int().min(1).max(8),
  sideQuestCount: z.number().int().min(0).max(10),
  enemyTypeCount: z.number().int().min(0).max(6),
  assetBudget: z.number().int().min(1).max(80),
  buildTimeMinutes: z.number().int().min(5).max(240)
})

/**
 * Per-capability config schemas. interaction-inventory is real as of Phase 3
 * (the template for Phase 4's seven); the rest stay empty stubs until their
 * packs own them. All fields are optional with NO zod defaults: `config: {}`
 * must parse to `{}` so stored Phase-2 specs keep their content hashes —
 * defaults are applied by the compose step, never by the schema.
 */
export const capabilityConfigSchemas = {
  'interaction-inventory': z.strictObject({
    requiredItems: z.number().int().min(1).max(8).optional(),
    interactRadius: z.number().min(0.5).max(5).optional()
  }),
  'dialogue-quests': z.strictObject({
    talkRadius: z.number().min(0.5).max(5).optional()
  }),
  'schedules-relationships': z.strictObject({}),
  'combat-ai': z.strictObject({}),
  'economy-progression': z.strictObject({}),
  'hub-navigation-vehicle': z.strictObject({}),
  'save-load': z.strictObject({})
} as const satisfies Record<CapabilityId, z.ZodType>

const capabilitySelection = <Id extends CapabilityId>(id: Id) => z.strictObject({
  id: z.literal(id),
  config: capabilityConfigSchemas[id],
  requirements: z.array(z.string().min(1).max(240)).max(10)
})

const capabilitySelectionSchema = z.discriminatedUnion('id', [
  capabilitySelection('interaction-inventory'),
  capabilitySelection('dialogue-quests'),
  capabilitySelection('schedules-relationships'),
  capabilitySelection('combat-ai'),
  capabilitySelection('economy-progression'),
  capabilitySelection('hub-navigation-vehicle'),
  capabilitySelection('save-load')
])

const specLocationSchema = z.strictObject({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  kind: z.enum(['district', 'interior']),
  description: z.string().min(1).max(400)
})

const specCharacterSchema = z.strictObject({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  role: z.enum(['player', 'ally', 'vendor', 'quest-giver', 'antagonist', 'ambient']),
  description: z.string().min(1).max(400)
})

const specStoryBeatSchema = z.strictObject({
  id: z.string().min(1).max(40),
  kind: z.enum(['beginning', 'middle', 'ending']),
  summary: z.string().min(1).max(400)
})

/** Quest stubs make the declared main/side-quest budgets structurally verifiable. */
const specQuestSchema = z.strictObject({
  id: z.string().min(1).max(40),
  kind: z.enum(['main', 'side']),
  summary: z.string().min(1).max(240)
})

export const acceptanceCriterionSchema = z.strictObject({
  id: z.string().min(1).max(60),
  description: z.string().min(1).max(400),
  kind: z.enum(['structural', 'simulation', 'browser', 'manual']),
  target: z.string().min(1).max(240)
})
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>

export const assetRequirementIdSchema = z.string().min(1).max(60).regex(/^[a-z][a-z0-9-]*$/)

export const assetRequirementSchema = z.strictObject({
  id: assetRequirementIdSchema,
  kind: z.enum(['model', 'texture', 'audio', 'music', 'ui']),
  description: z.string().min(1).max(400)
})

export const gameSpecSchema = z.strictObject({
  specVersion: z.number().int().min(1),
  provenance: specProvenanceSchema,
  identity: specIdentitySchema,
  direction: specDirectionSchema,
  budgets: specBudgetsSchema,
  capabilities: z.array(capabilitySelectionSchema).min(1).max(7),
  world: z.strictObject({ locations: z.array(specLocationSchema).min(1).max(9) }),
  cast: z.array(specCharacterSchema).min(1).max(12),
  story: z.strictObject({
    premise: z.string().min(1).max(600),
    beats: z.array(specStoryBeatSchema).min(2).max(20),
    quests: z.array(specQuestSchema).min(1).max(18)
  }),
  progression: z.strictObject({
    milestones: z.array(z.strictObject({
      id: z.string().min(1).max(40),
      summary: z.string().min(1).max(240)
    })).min(1).max(12)
  }),
  assets: z.array(assetRequirementSchema).max(80),
  acceptance: z.array(acceptanceCriterionSchema).min(1).max(30)
})
export type GameSpec = z.infer<typeof gameSpecSchema>

/** The author-facing form omits server-owned versioning and provenance. */
export const gameSpecDraftSchema = gameSpecSchema.omit({ specVersion: true, provenance: true })
export type GameSpecDraft = z.infer<typeof gameSpecDraftSchema>
