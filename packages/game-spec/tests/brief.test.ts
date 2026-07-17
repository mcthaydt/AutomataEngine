import { describe, expect, it } from 'vitest'
import { minimalGameSpecDraft as minimalDraft, type GameSpec } from '@automata/contracts'
import { nextSpecVersion, renderDesignBrief, validateGameSpec } from '../src'

function spec(): GameSpec {
  const validated = validateGameSpec(minimalDraft(), { gameId: 'probe' })
  if (!validated.ok) throw new Error('fixture must be valid')
  const stamped = nextSpecVersion({ current: null, currentApproved: false, draft: validated.draft, prompt: 'make a tiny hub game', translations: [{ requested: 'open world', translatedTo: 'one compact district', reason: 'envelope: single district' }] })
  if (!stamped.ok) throw new Error('fixture must stamp')
  return stamped.spec
}

describe('renderDesignBrief', () => {
  it('renders every checkpoint-relevant section deterministically', () => {
    const markdown = renderDesignBrief(spec())
    for (const expected of ['# Probe — Design Brief', 'specVersion 1', 'A tiny hub adventure.', '## Direction', '## Supported translations', 'open world', 'one compact district', '## World', '## Cast', '## Story outline', '## Capabilities', 'interaction-inventory', '## Budgets', 'targetMinutes: 60', '## Acceptance criteria', '## Version history']) expect(markdown).toContain(expected)
    expect(renderDesignBrief(spec())).toBe(markdown)
  })
  it('says so when nothing was translated', () => {
    const untranslated = { ...spec(), provenance: { ...spec().provenance, translations: [] } }
    expect(renderDesignBrief(untranslated)).toContain('No unsupported requests were translated.')
  })
})
