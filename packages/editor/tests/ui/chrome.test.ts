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

  it('mounts the agent region only when a mountAgentPanel hook is supplied', () => {
    const root = document.createElement('div')
    const editor = makeTestEditor()
    const seen: HTMLElement[] = []
    const chrome = renderEditorChrome(editor, root, canvases(), {
      mountAgentPanel: (_core, host) => {
        seen.push(host)
        return { update() {}, dispose() {} }
      }
    })

    expect(seen).toHaveLength(1)
    expect(root.querySelector('.ed-chat-host')).not.toBeNull()

    chrome.dispose()
    expect(root.querySelector('.ed-chat-host')).toBeNull()
    editor.dispose()
  })

  it('omits the agent region when no hook is supplied', () => {
    const root = document.createElement('div')
    const editor = makeTestEditor()
    renderEditorChrome(editor, root, canvases())

    expect(root.querySelector('.ed-chat-host')).toBeNull()
    editor.dispose()
  })
})
