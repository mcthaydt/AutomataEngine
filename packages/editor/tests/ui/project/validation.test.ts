import { describe, expect, it } from 'vitest'
import { createProjectEditorStore } from '../../../src/project/store'
import { mountProjectValidation } from '../../../src/ui/project/validation'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'

describe('project validation panel', () => {
  it('shows no issues for a valid project', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const parent = document.createElement('div')
    mountProjectValidation(parent, { dispatch: (action) => store.dispatch(action) }).update(store.getState())
    expect(parent.querySelector('[data-issue]')).toBeNull()
  })

  it('lists issues and focuses the typed location on click', () => {
    const bad = fakeSnapshot()
    bad.scenes.main!.entities[0]!.components.push({ id: 'x', typeId: 'fake.unknown', data: {} })
    const store = createProjectEditorStore(fakeEditorRegistration, bad)
    const parent = document.createElement('div')
    mountProjectValidation(parent, { dispatch: (action) => store.dispatch(action) }).update(store.getState())

    const issue = parent.querySelector<HTMLButtonElement>('[data-issue]')!
    expect(issue).not.toBeNull()
    issue.click()
    expect(store.getState().selection.kind).toBe('component')
  })
})
