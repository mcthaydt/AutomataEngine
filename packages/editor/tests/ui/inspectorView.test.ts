import { describe, expect, it, vi } from 'vitest'
import { mountInspector } from '../../src/ui/inspectorView'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem } from '../fixtures/fakeDefinition'

describe('inspector panel', () => {
  it('renders messy floats rounded to 2 dp', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const messy = boxItem('a')
    messy.transform.position.x = -0.13216145833333348
    editor.store.dispatch({ type: 'loadDoc', doc: { title: 't', items: [messy] } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    const handle = mountInspector(editor, host)
    expect(host.querySelector<HTMLInputElement>('[data-field="pos.x"]')!.value).toBe('-0.13')
    handle.dispose()
    editor.dispose()
  })

  it('steppers nudge by the active snap increment', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    editor.store.dispatch({ type: 'loadDoc', doc: { title: 't', items: [boxItem('a', 1, 0)] } })
    editor.store.dispatch({ type: 'select', ids: ['a'] }) // snap defaults to 0.5
    const handle = mountInspector(editor, host)
    const spy = vi.spyOn(editor.store, 'dispatch')
    host.querySelector<HTMLButtonElement>('[data-field="pos.x"] ~ .ed-stepper [data-step="up"]')!.click()
    expect(spy).toHaveBeenCalledWith({
      type: 'command',
      command: { type: 'setItemField', id: 'a', path: 'pos.x', value: 1.5 }
    })
    handle.dispose()
    editor.dispose()
  })

  it('shows metadata + a hint when nothing is selected', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountInspector(editor, host)
    expect(host.querySelector('[data-field="title"]')).not.toBeNull()
    expect(host.querySelector('.ed-hint')).not.toBeNull()
    handle.dispose()
    editor.dispose()
  })
})
