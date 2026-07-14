import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAPABILITY_COMPATIBILITY, capabilityConfigSchemas, capabilityIdSchema, findingSourceSchema,
  gameSpecDraftSchema, gameSpecSchema, minimalGameSpecDraft
} from '../src'

const minimalDraft = minimalGameSpecDraft

describe('gameSpec schemas', () => {
  it('accepts a minimal valid draft and full spec', () => {
    expect(gameSpecDraftSchema.safeParse(minimalDraft()).success).toBe(true)
    const full = {
      specVersion: 1,
      provenance: {
        prompt: 'make a tiny hub game', translations: [],
        history: [{ version: 1, reason: 'initial compile' }]
      },
      ...minimalDraft()
    }
    expect(gameSpecSchema.safeParse(full).success).toBe(true)
  })

  it('rejects unknown keys and out-of-envelope budgets', () => {
    expect(gameSpecDraftSchema.safeParse({ ...minimalDraft(), extra: 1 }).success).toBe(false)
    const over = minimalDraft()
    ;(over.budgets as Record<string, unknown>).targetMinutes = 300
    expect(gameSpecDraftSchema.safeParse(over).success).toBe(false)
    const twoDistricts = minimalDraft()
    ;(twoDistricts.budgets as Record<string, unknown>).districtCount = 2
    expect(gameSpecDraftSchema.safeParse(twoDistricts).success).toBe(false)
  })

  it('bounds capability ids to the seven planned packs', () => {
    expect(capabilityIdSchema.options).toHaveLength(7)
    expect(capabilityIdSchema.safeParse('save-load').success).toBe(true)
    expect(capabilityIdSchema.safeParse('multiplayer').success).toBe(false)
    for (const rule of Object.values(DEFAULT_CAPABILITY_COMPATIBILITY)) {
      for (const req of rule.requires) expect(capabilityIdSchema.safeParse(req).success).toBe(true)
    }
  })

  it('admits the spec finding source', () => {
    expect(findingSourceSchema.safeParse('spec').success).toBe(true)
  })
})

describe('capability config schemas', () => {
  it('keeps config: {} valid for every capability and parses it unchanged', () => {
    for (const id of capabilityIdSchema.options) {
      const draft = minimalGameSpecDraft()
      ;(draft as { capabilities: unknown }).capabilities = [{ id: 'interaction-inventory', config: {}, requirements: [] }]
      if (id !== 'interaction-inventory') {
        ;(draft as { capabilities: Array<Record<string, unknown>> }).capabilities.push({ id, config: {}, requirements: [] })
      }
      const parsed = gameSpecDraftSchema.safeParse(draft)
      expect(parsed.success, `config {} must stay valid for ${id}`).toBe(true)
      if (parsed.success) expect(parsed.data.capabilities.every((entry) => JSON.stringify(entry.config) === '{}')).toBe(true)
    }
  })

  it('accepts and bounds the interaction-inventory config', () => {
    const draft = minimalGameSpecDraft()
    const capabilities = (draft as { capabilities: Array<Record<string, unknown>> }).capabilities
    capabilities[0] = { id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(true)

    capabilities[0] = { id: 'interaction-inventory', config: { requiredItems: 9 }, requirements: [] }
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(false)
    capabilities[0] = { id: 'interaction-inventory', config: { interactRadius: 0.1 }, requirements: [] }
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects a real config on a capability that has none yet', () => {
    const draft = minimalGameSpecDraft()
    ;(draft as { capabilities: unknown }).capabilities = [
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'save-load', config: { slots: 3 }, requirements: [] }
    ]
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(false)
  })
})
