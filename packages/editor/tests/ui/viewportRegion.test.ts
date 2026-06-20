import { describe, expect, it } from 'vitest'
import { mountViewportRegion } from '../../src/ui/viewportRegion'
import { makeTestEditor } from '../fixtures/editorHarness'

const canvases = (): { '2d': HTMLCanvasElement; '3d': HTMLCanvasElement } =>
  ({ '2d': document.createElement('canvas'), '3d': document.createElement('canvas') })

describe('viewport region', () => {
  it('puts the primary view in main and the other in the inset', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const cs = canvases()
    const handle = mountViewportRegion(editor, host, cs)

    expect(cs['2d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('main')
    expect(cs['3d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('inset')

    editor.store.dispatch({ type: 'setPrimaryView', view: '3d' })
    handle.update(editor.store.getState())
    expect(cs['3d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('main')

    handle.dispose()
    editor.dispose()
  })

  it('swap and hide affordances dispatch ui actions', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountViewportRegion(editor, host, canvases())

    host.querySelector<HTMLButtonElement>('[data-vp-swap]')!.click()
    expect(editor.store.getState().ui.primaryView).toBe('3d')

    host.querySelector<HTMLButtonElement>('[data-vp-hide]')!.click()
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-vp="inset"]')!.classList.contains('is-hidden')).toBe(true)

    handle.dispose()
    editor.dispose()
  })
})
