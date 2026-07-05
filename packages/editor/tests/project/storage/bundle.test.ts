import { describe, expect, it } from 'vitest'
import { toProjectBundle } from '@automata/project'
import { exportProjectBundle, importProjectBundle } from '../../../src/project/storage/bundle'
import { fakeSnapshot } from '../../fixtures/fakeProject'

describe('project bundle storage', () => {
  it('round-trips a snapshot (canonically) and attaches validation issues', () => {
    const snapshot = fakeSnapshot()
    const exported = exportProjectBundle(snapshot, { validate: () => [{ severity: 'warning', code: 'demo', message: 'heads up' }] })
    expect(exported.issues).toHaveLength(1)
    // Bundles are canonical (stable-id ordered), so compare canonical forms.
    expect(toProjectBundle(importProjectBundle(exported.text).snapshot)).toEqual(toProjectBundle(snapshot))
  })

  it('exports a game-invalid but structurally-parseable work-in-progress snapshot', () => {
    const wip = fakeSnapshot()
    wip.scenes.main!.entities[0]!.components.push({ id: 'u', typeId: 'fake.unknown', data: {} })
    const exported = exportProjectBundle(wip)
    expect(toProjectBundle(importProjectBundle(exported.text).snapshot)).toEqual(toProjectBundle(wip))
  })
})
