import { describe, expect, it, vi } from 'vitest'
import { createProjectEditorStore } from '../../../src/project/store'
import { mountProjectHierarchy } from '../../../src/ui/project/hierarchy'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'

function setup(confirmDelete: (ids: string[]) => boolean = () => true) {
  const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
  const parent = document.createElement('div')
  const handle = mountProjectHierarchy(parent, { dispatch: (action) => store.dispatch(action), confirmDelete })
  const refresh = (): void => handle.update(store.getState())
  refresh()
  return { store, parent, refresh }
}

describe('project hierarchy', () => {
  it('switches scene and selects entities', () => {
    const { store, parent, refresh } = setup()
    parent.querySelector<HTMLButtonElement>('[data-scene-id="main"]')!.click()
    expect(store.getState().activeSceneId).toBe('main')
    refresh()
    parent.querySelector<HTMLButtonElement>('[data-entity-id="box"] .ed-tree-label')!.click()
    expect(store.getState().selection).toEqual({ kind: 'entity', sceneId: 'main', entityIds: ['box'] })
  })

  it('indents nested entities by depth', () => {
    const { store, parent, refresh } = setup()
    store.dispatch({ type: 'projectCommand', command: { type: 'addEntity', sceneId: 'main', entity: { id: 'child', name: 'Child', parentId: 'box', enabled: true, components: [] } } })
    refresh()
    expect(parent.querySelector('[data-entity-id="box"]')!.getAttribute('data-depth')).toBe('0')
    expect(parent.querySelector('[data-entity-id="child"]')!.getAttribute('data-depth')).toBe('1')
  })

  it('confirms before cascading delete', () => {
    const confirm = vi.fn(() => false)
    const { store, parent } = setup(confirm)
    parent.querySelector<HTMLButtonElement>('[data-entity-id="box"] [data-delete]')!.click()
    expect(confirm).toHaveBeenCalledWith(['box'])
    expect(store.getState().snapshot.scenes.main!.entities.find((entity) => entity.id === 'box')).toBeDefined()
  })
})
