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

  it('runs Edit and View actions from the menu', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountMenuBar(editor, host)
    const item = (id: string): HTMLButtonElement =>
      host.querySelector<HTMLButtonElement>(`[data-menu-item="${id}"]`)!
    const listLen = (): number =>
      editor.definition.scene.listItems(editor.store.getState().document.doc).length

    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    handle.update(editor.store.getState())

    item('undo').click()
    expect(listLen()).toBe(0)
    handle.update(editor.store.getState())
    expect(item('redo').disabled).toBe(false)
    item('redo').click()
    expect(listLen()).toBe(1)

    editor.store.dispatch({ type: 'select', ids: ['a'] })
    handle.update(editor.store.getState())
    expect(item('delete').disabled).toBe(false)
    item('delete').click()
    expect(listLen()).toBe(0)

    item('swap').click()
    expect(editor.store.getState().ui.primaryView).toBe('3d')
    item('swap').click()
    expect(editor.store.getState().ui.primaryView).toBe('2d')

    const inset = editor.store.getState().ui.insetVisible
    item('inset').click()
    expect(editor.store.getState().ui.insetVisible).toBe(!inset)

    item('snap').click() // 0.5 -> 1
    expect(editor.store.getState().ui.snap).toBe(1)

    handle.dispose()
    editor.dispose()
  })
})
