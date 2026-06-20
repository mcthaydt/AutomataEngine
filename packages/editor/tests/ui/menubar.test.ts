import { describe, expect, it } from 'vitest'
import { mountMenuBar } from '../../src/ui/menubar'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem } from '../fixtures/fakeDefinition'

describe('menu bar', () => {
  it('disables Undo until there is history; New resets the doc', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountMenuBar(editor, host)

    expect(host.querySelector<HTMLButtonElement>('[data-menu-item="undo"]')!.disabled).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-menu-item="import"]')!.disabled).toBe(true)

    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    handle.update(editor.store.getState())
    expect(host.querySelector<HTMLButtonElement>('[data-menu-item="undo"]')!.disabled).toBe(false)

    host.querySelector<HTMLButtonElement>('[data-menu-item="new"]')!.click()
    expect(editor.definition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    expect(editor.store.getState().document.dirty).toBe(false)

    handle.dispose()
    editor.dispose()
  })
})
