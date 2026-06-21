import { describe, expect, it } from 'vitest'
import { renderEditorChrome } from '../../src/ui/chrome'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem } from '../fixtures/fakeDefinition'

const canvases = (): { '2d': HTMLCanvasElement; '3d': HTMLCanvasElement } =>
  ({ '2d': document.createElement('canvas'), '3d': document.createElement('canvas') })

describe('editor chrome', () => {
  it('mounts every region and reacts to a single dispatch', () => {
    const root = document.createElement('div')
    const editor = makeTestEditor()
    const chrome = renderEditorChrome(editor, root, canvases())

    expect(root.querySelector('.ed-menubar')).not.toBeNull()
    expect(root.querySelectorAll('[data-brush]').length).toBeGreaterThan(0)
    expect(root.querySelector('[data-vp="main"]')).not.toBeNull()
    expect(root.querySelector('[data-valid]')!.textContent).toContain('Missing')

    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(root.querySelector('[data-item="a"]')).not.toBeNull()

    chrome.setCursorReadout({ x: 1, z: 2 })
    expect(root.querySelector('.ed-status-coords')!.textContent).toBe('x 1.00  z 2.00')

    chrome.dispose()
    expect(root.querySelector('.ed-root')).toBeNull()
    editor.dispose()
  })
})
