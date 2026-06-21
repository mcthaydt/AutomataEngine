import { describe, expect, it } from 'vitest'
import { mountOutliner } from '../../src/ui/outliner'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem, cylinderItem, markerItem } from '../fixtures/fakeDefinition'

describe('outliner panel', () => {
  it('warns about missing required items', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountOutliner(editor, host)
    expect(host.querySelector('[data-warn]')!.textContent).toContain('Start')
    handle.dispose()
    editor.dispose()
  })

  it('lists items, selects on click, and deletes', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    const handle = mountOutliner(editor, host)
    handle.update(editor.store.getState())

    host.querySelector<HTMLButtonElement>('[data-item="a"] .ed-item-label')!.click()
    expect(editor.store.getState().selection).toEqual(['a'])

    host.querySelector<HTMLButtonElement>('[data-del="a"]')!.click()
    expect(editor.definition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    handle.dispose()
    editor.dispose()
  })

  it('drops the warning when required items exist and falls back to kind labels', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    editor.store.dispatch({
      type: 'loadDoc',
      doc: { title: 't', items: [markerItem('marker:start'), cylinderItem('c')] }
    })
    editor.store.dispatch({ type: 'select', ids: ['c'] })
    const handle = mountOutliner(editor, host)

    expect(host.querySelector('[data-warn]')).toBeNull()
    expect(host.querySelector('[data-item="c"]')!.classList.contains('is-selected')).toBe(true)
    expect(host.querySelector('[data-item="c"] .ed-item-label')!.textContent).toBe('cylinder')

    handle.dispose()
    editor.dispose()
  })
})
