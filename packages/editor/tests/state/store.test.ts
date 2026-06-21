import { describe, expect, it } from 'vitest'
import { createEditorStore, selectItems } from '../../src/state/store'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('editor store', () => {
  it('starts empty in edit mode', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    expect(store.getState().mode).toBe('edit')
    expect(selectItems(fakeDefinition, store.getState())).toEqual([])
  })

  it('routes commands through the document slice and exposes items', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a', 5, 0) } })
    store.dispatch({ type: 'select', ids: ['a'] })
    expect(selectItems(fakeDefinition, store.getState())).toHaveLength(1)
    expect(store.getState().selection).toEqual(['a'])
    expect(store.getState().document.dirty).toBe(true)
  })

  it('undo flows through the store', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    store.dispatch({ type: 'undo' })
    expect(selectItems(fakeDefinition, store.getState())).toEqual([])
  })
})
