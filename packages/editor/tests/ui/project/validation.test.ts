import { describe, expect, it } from 'vitest'
import type { ProjectEditorAction } from '../../../src/project/actions'
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

  it('maps every issue location to its typed selection and disposes cleanly', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const issues = [
      { severity: 'error' as const, code: 'component', message: 'component', sceneId: 'main', entityId: 'box', componentId: 'p' },
      { severity: 'error' as const, code: 'entity', message: 'entity', sceneId: 'main', entityId: 'box' },
      { severity: 'warning' as const, code: 'resource', message: 'resource', resourceId: 'tuning' },
      { severity: 'warning' as const, code: 'scene', message: 'scene', sceneId: 'main' },
      { severity: 'warning' as const, code: 'project', message: 'project' }
    ]
    const state = {
      ...store.getState(),
      registration: { ...store.getState().registration, validate: () => issues }
    }
    const parent = document.createElement('div')
    const dispatched: ProjectEditorAction[] = []
    const panel = mountProjectValidation(parent, { dispatch: (action) => dispatched.push(action) })
    panel.update(state)
    for (const row of parent.querySelectorAll<HTMLButtonElement>('[data-issue]')) row.click()
    expect(dispatched.map((action) => action.type === 'select' ? action.selection.kind : '')).toEqual([
      'component', 'entity', 'resource', 'scene', 'project'
    ])
    panel.dispose()
    expect(parent.children).toHaveLength(0)
  })
})
