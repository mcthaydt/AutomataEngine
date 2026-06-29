import { describe, expect, it, vi } from 'vitest'
import { createProjectEditorStore } from '../../../src/project/store'
import { mountProjectToolbar } from '../../../src/ui/project/toolbar'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'

describe('project toolbar', () => {
  it('wires optional project actions, undo/redo, and play/stop', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const parent = document.createElement('div')
    const callbacks = {
      onSwitchProject: vi.fn(), onSave: vi.fn(), onExport: vi.fn(), onImport: vi.fn(),
      onPlay: vi.fn(), onStop: vi.fn()
    }
    const toolbar = mountProjectToolbar(parent, { dispatch: store.dispatch, callbacks })
    toolbar.update(store.getState())
    for (const selector of ['[data-switch]', '[data-save]', '[data-export]', '[data-import]']) {
      parent.querySelector<HTMLButtonElement>(selector)!.click()
    }
    expect(callbacks.onSwitchProject).toHaveBeenCalled()
    expect(callbacks.onSave).toHaveBeenCalled()
    expect(callbacks.onExport).toHaveBeenCalled()
    expect(callbacks.onImport).toHaveBeenCalled()
    parent.querySelector<HTMLButtonElement>('[data-undo]')!.click()
    parent.querySelector<HTMLButtonElement>('[data-redo]')!.click()
    parent.querySelector<HTMLButtonElement>('[data-play]')!.click()
    expect(callbacks.onPlay).toHaveBeenCalled()

    store.dispatch({ type: 'setMode', mode: 'play' })
    toolbar.update(store.getState())
    parent.querySelector<HTMLButtonElement>('[data-play]')!.click()
    expect(callbacks.onStop).toHaveBeenCalled()
    toolbar.dispose()
    expect(parent.children).toHaveLength(0)
  })

  it('omits unavailable actions and renders every save status', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const parent = document.createElement('div')
    const toolbar = mountProjectToolbar(parent, {
      dispatch: store.dispatch,
      callbacks: { onPlay: () => {}, onStop: () => {} }
    })
    const status = (): string => parent.querySelector('[data-save-status]')!.textContent!
    toolbar.update(store.getState())
    expect(parent.querySelector('[data-switch]')).toBeNull()
    expect(parent.querySelector('[data-save]')).toBeNull()
    expect(status()).toBe('Saved')

    store.dispatch({ type: 'projectCommand', command: { type: 'setProperty', target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8 } })
    toolbar.update(store.getState())
    expect(status()).toBe('1 unsaved')
    store.dispatch({ type: 'beginSave' }); toolbar.update(store.getState()); expect(status()).toBe('Saving…')
    store.dispatch({ type: 'markSaved', paths: ['resources/tuning.resource.json'] }); toolbar.update(store.getState()); expect(status()).toBe('Saved')
    store.dispatch({ type: 'markExported' }); toolbar.update(store.getState()); expect(status()).toBe('Exported')
    store.dispatch({ type: 'saveFailed', message: 'disk full', paths: ['x'] }); toolbar.update(store.getState()); expect(status()).toBe('Error: disk full')
  })
})
