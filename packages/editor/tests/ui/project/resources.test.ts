import { describe, expect, it } from 'vitest'
import { normalizeResourceType, z } from '@automata/project'
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
    handle.update(store.getState())
    expect(parent.querySelector('[data-resource-id="tuning"]')?.classList.contains('is-selected')).toBe(true)
    handle.dispose()
    expect(parent.children).toHaveLength(0)
  })

  it('adds non-singleton resources with collision-free IDs', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const extra = normalizeResourceType({
      typeId: 'fake.extra', label: 'Extra',
      schema: z.strictObject({}), defaultData: { value: 1 }
    })
    const state = {
      ...store.getState(),
      registration: {
        ...store.getState().registration,
        resourceTypes: [...store.getState().registration.resourceTypes, extra]
      },
      snapshot: {
        ...store.getState().snapshot,
        resources: {
          ...store.getState().snapshot.resources,
          extra: { id: 'extra', typeId: 'fake.extra', data: {} }
        }
      }
    }
    const parent = document.createElement('div')
    const commands: unknown[] = []
    const handle = mountProjectResources(parent, { dispatch: (action) => commands.push(action) })
    handle.update(state)
    const add = parent.querySelector<HTMLButtonElement>('[data-resource-add="fake.extra"]')!
    expect(add.disabled).toBe(false)
    add.click()
    expect(commands).toContainEqual(expect.objectContaining({
      type: 'projectCommand',
      command: expect.objectContaining({ type: 'addResource', resource: expect.objectContaining({ id: 'extra-2' }) })
    }))
  })
})
