import { describe, expect, it } from 'vitest'
import { minimalGameSpecDraft as minimalDraft, type GameSpec, type GameSpecDraft } from '@automata/contracts'
import { nextSpecVersion, validateGameSpec } from '../src'

function validDraft(): GameSpecDraft {
  const result = validateGameSpec(minimalDraft(), { gameId: 'probe' })
  if (!result.ok) throw new Error('fixture must be valid')
  return result.draft
}
const base = { prompt: 'make a tiny hub game', translations: [] }

describe('nextSpecVersion', () => {
  it('stamps version 1 with initial history when no spec exists', () => {
    const result = nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base })
    expect(result).toMatchObject({ ok: true, spec: { specVersion: 1 } })
    expect((result as { spec: GameSpec }).spec.provenance.history).toEqual([{ version: 1, reason: 'initial compile' }])
  })

  it('replaces in place while unapproved', () => {
    const v1 = (nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base }) as { spec: GameSpec }).spec
    expect(nextSpecVersion({ current: v1, currentApproved: false, draft: validDraft(), ...base })).toMatchObject({ ok: true, spec: { specVersion: 1 } })
  })

  it('refuses to mutate an approved version without changeReason', () => {
    const v1 = (nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base }) as { spec: GameSpec }).spec
    expect(nextSpecVersion({ current: v1, currentApproved: true, draft: validDraft(), ...base }))
      .toMatchObject({ ok: false, issue: { code: 'spec-approved-immutable' } })
  })

  it('bumps with a recorded reason after approval', () => {
    const v1 = (nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base }) as { spec: GameSpec }).spec
    const bumped = nextSpecVersion({ current: v1, currentApproved: true, draft: validDraft(), ...base, changeReason: 'shrink the cast' })
    expect(bumped).toMatchObject({ ok: true, spec: { specVersion: 2 } })
    expect((bumped as { spec: GameSpec }).spec.provenance.history).toEqual([
      { version: 1, reason: 'initial compile' }, { version: 2, reason: 'shrink the cast' }
    ])
  })
})
