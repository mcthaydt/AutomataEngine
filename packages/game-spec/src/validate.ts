import {
  DEFAULT_CAPABILITY_COMPATIBILITY, gameSpecDraftSchema,
  type CapabilityId, type CapabilityRule, type GameSpecDraft
} from '@automata/contracts'

export interface SpecIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path: string
}

export interface ValidateOptions {
  gameId: string
  compatibility?: Record<CapabilityId, CapabilityRule>
}

export type ValidateResult =
  | { ok: true; draft: GameSpecDraft; issues: SpecIssue[] }
  | { ok: false; issues: SpecIssue[] }

const error = (code: string, message: string, path: string): SpecIssue => ({ severity: 'error', code, message, path })

function duplicateIds(items: ReadonlyArray<{ id: string }>, path: string): SpecIssue[] {
  const seen = new Set<string>()
  const issues: SpecIssue[] = []
  items.forEach((item, index) => {
    if (seen.has(item.id)) issues.push(error('spec-duplicate-id', `Duplicate id "${item.id}"`, `${path}[${index}].id`))
    seen.add(item.id)
  })
  return issues
}

/** Validates envelope shape, cross-field budgets, narrative structure, and capability compatibility. */
export function validateGameSpec(draft: unknown, options: ValidateOptions): ValidateResult {
  const parsed = gameSpecDraftSchema.safeParse(draft)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) =>
        error('spec-schema', issue.message, issue.path.map(String).join('.') || '(root)'))
    }
  }

  const spec = parsed.data
  const issues: SpecIssue[] = []
  if (spec.identity.id !== options.gameId) {
    issues.push(error('spec-id-mismatch', `identity.id "${spec.identity.id}" must equal gameId "${options.gameId}"`, 'identity.id'))
  }
  if (spec.cast.length > spec.budgets.characterCount) {
    issues.push(error('spec-budget-cast', `${spec.cast.length} characters exceed characterCount ${spec.budgets.characterCount}`, 'cast'))
  }
  const interiors = spec.world.locations.filter((location) => location.kind === 'interior').length
  const districts = spec.world.locations.filter((location) => location.kind === 'district').length
  if (interiors > spec.budgets.interiorCount) {
    issues.push(error('spec-budget-interiors', `${interiors} interiors exceed interiorCount ${spec.budgets.interiorCount}`, 'world.locations'))
  }
  if (districts !== spec.budgets.districtCount) {
    issues.push(error('spec-budget-districts', `world has ${districts} districts; budget requires exactly ${spec.budgets.districtCount}`, 'world.locations'))
  }
  if (spec.assets.length > spec.budgets.assetBudget) {
    issues.push(error('spec-budget-assets', `${spec.assets.length} asset requirements exceed assetBudget ${spec.budgets.assetBudget}`, 'assets'))
  }
  const mainQuests = spec.story.quests.filter((quest) => quest.kind === 'main').length
  const sideQuests = spec.story.quests.filter((quest) => quest.kind === 'side').length
  if (mainQuests !== spec.budgets.mainQuestCount) {
    issues.push(error('spec-budget-main-quests', `${mainQuests} main quests must equal mainQuestCount ${spec.budgets.mainQuestCount}`, 'story.quests'))
  }
  if (sideQuests !== spec.budgets.sideQuestCount) {
    issues.push(error('spec-budget-side-quests', `${sideQuests} side quests must equal sideQuestCount ${spec.budgets.sideQuestCount}`, 'story.quests'))
  }
  const beatKinds = new Set(spec.story.beats.map((beat) => beat.kind))
  if (!beatKinds.has('beginning') || !beatKinds.has('ending')) {
    issues.push(error('spec-story-arc', 'story.beats must include at least one beginning and one ending beat', 'story.beats'))
  }
  issues.push(
    ...duplicateIds(spec.world.locations, 'world.locations'),
    ...duplicateIds(spec.cast, 'cast'),
    ...duplicateIds(spec.story.beats, 'story.beats'),
    ...duplicateIds(spec.story.quests, 'story.quests'),
    ...duplicateIds(spec.progression.milestones, 'progression.milestones'),
    ...duplicateIds(spec.assets, 'assets'),
    ...duplicateIds(spec.acceptance, 'acceptance'),
    ...duplicateIds(spec.capabilities, 'capabilities')
  )

  const table = options.compatibility ?? DEFAULT_CAPABILITY_COMPATIBILITY
  const selected = new Set(spec.capabilities.map((capability) => capability.id))
  spec.capabilities.forEach((capability, index) => {
    const rule = table[capability.id]
    for (const required of rule.requires) {
      if (!selected.has(required)) {
        issues.push(error('spec-capability-requires', `"${capability.id}" requires "${required}"`, `capabilities[${index}]`))
      }
    }
    for (const incompatible of rule.incompatibleWith) {
      if (selected.has(incompatible)) {
        issues.push(error('spec-capability-conflict', `"${capability.id}" is incompatible with "${incompatible}"`, `capabilities[${index}]`))
      }
    }
  })

  return issues.some((issue) => issue.severity === 'error')
    ? { ok: false, issues }
    : { ok: true, draft: spec, issues }
}
