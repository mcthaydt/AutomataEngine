import { describe, expect, it } from 'vitest'
import { createProjectEditorStore } from '../../../src/project/store'
import { mountProjectPalette } from '../../../src/ui/project/palette'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'

describe('project palette', () => {
  it('selects a prefab as the active placement tool', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const parent = document.createElement('div')
    const selected: Array<string | null> = []
    const handle = mountProjectPalette(parent, { dispatch: (command) => store.dispatch({ type: 'projectCommand', command }), onSelectPrefab: (id) => selected.push(id) })
    handle.update(store.getState())
    parent.querySelector<HTMLButtonElement>('[data-prefab="box"]')!.click()
    parent.querySelector<HTMLButtonElement>('[data-prefab="box"]')!.click()
    expect(selected).toEqual(['box', null])
    handle.dispose()
    expect(parent.children).toHaveLength(0)
  })

  it('offers add-component options gated by cardinality', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const parent = document.createElement('div')
    const handle = mountProjectPalette(parent, { dispatch: (command) => store.dispatch({ type: 'projectCommand', command }), onSelectPrefab: () => {} })
    store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] } })
    handle.update(store.getState())
    // box already has a single transform/primitive/surface (max 1) -> not offered; spawn is.
    expect(parent.querySelector('[data-add-component="fake.spawn"]')).not.toBeNull()
    expect(parent.querySelector('[data-add-component="core.transform"]')).toBeNull()
  })

  it('ignores missing entities and creates collision-free component IDs', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const parent = document.createElement('div')
    const commands: unknown[] = []
    const handle = mountProjectPalette(parent, { dispatch: (command) => commands.push(command), onSelectPrefab: () => {} })
    handle.update({ ...store.getState(), selection: { kind: 'entity', sceneId: 'main', entityIds: ['missing'] } })
    expect(parent.querySelector('[data-add-component-menu]')).toBeNull()

    store.getState().snapshot.scenes.main!.entities[0]!.components.push({ id: 'spawn', typeId: 'unknown', data: {} })
    handle.update({ ...store.getState(), selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] } })
    parent.querySelector<HTMLButtonElement>('[data-add-component="fake.spawn"]')!.click()
    expect(commands).toContainEqual(expect.objectContaining({ component: expect.objectContaining({ id: 'spawn-2' }) }))
  })
})
