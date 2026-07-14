import { describe, expect, it } from 'vitest'
import { minimalGameSpecDraft as minimalDraft } from '@automata/contracts'
import { validateGameSpec } from '../src'

function draft(mutate: (value: ReturnType<typeof minimalDraft>) => void = () => {}) {
  const value = minimalDraft()
  mutate(value)
  return value
}

const codes = (result: { issues: Array<{ code: string }> }) => result.issues.map((issue) => issue.code)

describe('validateGameSpec', () => {
  it('passes a valid draft', () => {
    const result = validateGameSpec(draft(), { gameId: 'probe' })
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('maps schema violations to spec-schema issues with paths', () => {
    const result = validateGameSpec(draft((value) => {
      (value.budgets as Record<string, unknown>).targetMinutes = 999
    }), { gameId: 'probe' })
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatchObject({ code: 'spec-schema', path: expect.stringContaining('budgets.targetMinutes') })
  })

  it('flags identity/gameId mismatch', () => {
    expect(codes(validateGameSpec(draft(), { gameId: 'other' }))).toContain('spec-id-mismatch')
  })

  it('cross-checks budgets against world, cast, and assets', () => {
    const overCast = draft((value) => {
      (value.budgets as Record<string, unknown>).characterCount = 1
      ;(value.cast as unknown[]).push(
        { id: 'npc', name: 'NPC', role: 'ambient', description: 'Extra.' },
        { id: 'npc2', name: 'NPC2', role: 'ambient', description: 'Extra.' }
      )
    })
    expect(codes(validateGameSpec(overCast, { gameId: 'probe' }))).toContain('spec-budget-cast')
    const overInteriors = draft((value) => { (value.budgets as Record<string, unknown>).interiorCount = 0 })
    expect(codes(validateGameSpec(overInteriors, { gameId: 'probe' }))).toContain('spec-budget-interiors')
    const noDistrict = draft((value) => {
      (value.world as { locations: Array<{ kind: string }> }).locations[0]!.kind = 'interior'
    })
    expect(codes(validateGameSpec(noDistrict, { gameId: 'probe' }))).toContain('spec-budget-districts')
    const overAssets = draft((value) => {
      (value.budgets as Record<string, unknown>).assetBudget = 1
      ;(value.assets as unknown[]).push(
        { id: 'x2', kind: 'ui', description: 'Extra.' },
        { id: 'x3', kind: 'ui', description: 'Extra.' }
      )
    })
    expect(codes(validateGameSpec(overAssets, { gameId: 'probe' }))).toContain('spec-budget-assets')
  })

  it('requires a beginning and an ending beat and unique ids', () => {
    const noEnding = draft((value) => {
      (value.story as { beats: Array<{ kind: string }> }).beats[1]!.kind = 'middle'
    })
    expect(codes(validateGameSpec(noEnding, { gameId: 'probe' }))).toContain('spec-story-arc')
    const duplicateIds = draft((value) => {
      ;(value.cast as Array<{ id: string }>).push({
        ...(value.cast as Array<{ id: string; name: string }>)[0]!
      })
    })
    expect(codes(validateGameSpec(duplicateIds, { gameId: 'probe' }))).toContain('spec-duplicate-id')
  })

  it('enforces capability requires and incompatibilities', () => {
    const missingRequirement = draft((value) => {
      value.capabilities = [{ id: 'economy-progression', config: {}, requirements: [] }]
    })
    expect(codes(validateGameSpec(missingRequirement, { gameId: 'probe' }))).toContain('spec-capability-requires')
    const conflict = draft((value) => {
      value.capabilities = [
        { id: 'combat-ai', config: {}, requirements: [] },
        { id: 'save-load', config: {}, requirements: [] }
      ]
    })
    const result = validateGameSpec(conflict, {
      gameId: 'probe',
      compatibility: {
        'interaction-inventory': { requires: [], incompatibleWith: [] },
        'dialogue-quests': { requires: [], incompatibleWith: [] },
        'schedules-relationships': { requires: [], incompatibleWith: [] },
        'combat-ai': { requires: [], incompatibleWith: ['save-load'] },
        'economy-progression': { requires: [], incompatibleWith: [] },
        'hub-navigation-vehicle': { requires: [], incompatibleWith: [] },
        'save-load': { requires: [], incompatibleWith: [] }
      }
    })
    expect(codes(result)).toContain('spec-capability-conflict')
  })
})
