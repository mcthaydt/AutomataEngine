import { describe, expect, it } from 'vitest'
import { mountPalette } from '../../src/ui/palette'
import { makeTestEditor } from '../fixtures/editorHarness'

describe('palette panel', () => {
  it('renders Select + brushes and reflects the active tool', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountPalette(editor, host)

    expect(host.querySelector('[data-tool="select"]')).not.toBeNull()
    expect(host.querySelectorAll('[data-brush]').length).toBeGreaterThan(0)

    host.querySelector<HTMLButtonElement>('[data-brush="box"]')!.click()
    handle.update(editor.store.getState())
    expect(editor.store.getState().tool.selection).toEqual({ brushId: 'box', mode: 'place' })
    expect(host.querySelector('[data-brush="box"]')!.getAttribute('aria-pressed')).toBe('true')

    host.querySelector<HTMLButtonElement>('[data-tool="select"]')!.click()
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-tool="select"]')!.getAttribute('aria-pressed')).toBe('true')

    handle.dispose()
    editor.dispose()
  })
})
