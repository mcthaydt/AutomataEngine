import { describe, expect, it } from 'vitest'
import { createProjectEditorStore } from '../../../src/project/store'
import { mountProjectResources } from '../../../src/ui/project/resources'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'

describe('project resources', () => {
  it('groups documents by type, disables singleton add, and selects on click', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const parent = document.createElement('div')
    const handle = mountProjectResources(parent, { dispatch: (action) => store.dispatch(action) })
    handle.update(store.getState())

    expect(parent.querySelector('[data-resource-type="fake.tuning"]')).not.toBeNull()
    const add = parent.querySelector<HTMLButtonElement>('[data-resource-add="fake.tuning"]')!
    expect(add.disabled).toBe(true)

    parent.querySelector<HTMLButtonElement>('[data-resource-id="tuning"]')!.click()
    expect(store.getState().selection).toEqual({ kind: 'resource', resourceId: 'tuning' })
  })
})
