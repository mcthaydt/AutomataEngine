import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '@automata/engine'
import { installAutosave, loadAutosave } from '../../src/io/autosave'
import { createEditorStore } from '../../src/state/store'
import { boxItem, renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('debounce-writes the doc and restores it', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const store = createEditorStore<FakeDoc>(renderDefinition)
    const stop = installAutosave(store, renderDefinition, storage, { key: 'edit', debounceMs: 200 })

    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(storage.get('edit')).toBeNull()
    vi.advanceTimersByTime(250)

    const restored = loadAutosave(renderDefinition, storage, 'edit')
    expect(restored && renderDefinition.scene.listItems(restored)).toHaveLength(1)
    stop()
  })

  it('returns null for missing, corrupt, or wrong-version data', () => {
    const storage = memoryStorage()

    expect(loadAutosave(renderDefinition, storage, 'edit')).toBeNull()
    storage.set('edit', 'not json')
    expect(loadAutosave(renderDefinition, storage, 'edit')).toBeNull()
    storage.set('edit', JSON.stringify({ version: 999, doc: { title: 'x', items: [] } }))
    expect(loadAutosave(renderDefinition, storage, 'edit')).toBeNull()
  })
})
