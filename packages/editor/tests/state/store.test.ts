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

  it('clears selection when a command batch deletes selected items', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('b') } })
    store.dispatch({ type: 'select', ids: ['a', 'b'] })

    store.dispatch({ type: 'commandBatch', commands: [{ type: 'deleteItems', ids: ['a'] }] })

    expect(selectItems(fakeDefinition, store.getState()).map((item) => item.id)).toEqual(['b'])
    expect(store.getState().selection).toEqual(['b'])
  })

  it('preserves selection when a command batch delete is rejected', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('b') } })
    store.dispatch({ type: 'select', ids: ['a', 'b'] })

    store.dispatch({
      type: 'commandBatch',
      commands: [
        { type: 'deleteItems', ids: ['a'] },
        { type: 'setItemField', id: 'b', path: 'pos.x', value: 1 }
      ]
    })

    expect(selectItems(fakeDefinition, store.getState()).map((item) => item.id)).toEqual(['a', 'b'])
    expect(store.getState().selection).toEqual(['a', 'b'])
  })
})
