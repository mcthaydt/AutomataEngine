import { describe, expect, it } from 'vitest'
import type { SceneItem } from '../../src/model/types'
import { mountStatusBar } from '../../src/ui/statusbar'
import { makeTestEditor } from '../fixtures/editorHarness'

const startMarker: SceneItem = {
  id: 'marker:start',
  kind: 'marker',
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' },
  surface: { kind: 'color', value: '#fff' }
}

describe('status bar', () => {
  it('shows validation, snap, selection, and cursor', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountStatusBar(editor, host)

    expect(host.querySelector('[data-valid]')!.textContent).toContain('Missing')

    editor.store.dispatch({ type: 'loadDoc', doc: { title: 't', items: [startMarker] } })
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-valid]')!.textContent).toBe('✓ Valid')

    host.querySelector<HTMLButtonElement>('[data-snap]')!.click() // 0.5 -> 1
    expect(editor.store.getState().ui.snap).toBe(1)
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-snap]')!.textContent).toBe('snap 1')

    handle.setCursor({ x: 6.5, z: 2 })
    expect(host.querySelector('.ed-status-coords')!.textContent).toBe('x 6.50  z 2.00')

    handle.dispose()
    editor.dispose()
  })

  it('labels snap off, clears the cursor, and shows the active place tool', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountStatusBar(editor, host)

    editor.store.dispatch({ type: 'setSnap', snap: 0 })
    editor.store.dispatch({ type: 'setTool', tool: { brushId: 'box', mode: 'place' } })
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-snap]')!.textContent).toBe('snap off')
    expect(host.querySelector('.ed-status-tool')!.textContent).toBe('Place: box')

    handle.setCursor(null)
    expect(host.querySelector('.ed-status-coords')!.textContent).toBe('x —  z —')

    handle.dispose()
    editor.dispose()
  })
})
