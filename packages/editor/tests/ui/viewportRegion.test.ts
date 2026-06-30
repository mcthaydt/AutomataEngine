import { describe, expect, it, vi } from 'vitest'
import { createViewportRegion } from '../../src/ui/viewportRegion'

const canvases = (): { '2d': HTMLCanvasElement; '3d': HTMLCanvasElement } => ({
  '2d': document.createElement('canvas'),
  '3d': document.createElement('canvas')
})

describe('viewport region', () => {
  it('puts the selected project view in main and the other in the inset', () => {
    const host = document.createElement('div')
    const cs = canvases()
    const handle = createViewportRegion(host, cs, {
      setPrimaryView() {}, toggleInset() {}
    })

    handle.update({ primaryView: '2d', insetVisible: true })
    expect(cs['2d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('main')
    expect(cs['3d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('inset')

    handle.update({ primaryView: '3d', insetVisible: true })
    expect(cs['3d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('main')
    handle.dispose()
  })

  it('routes swap and hide affordances through the injected controller', () => {
    const host = document.createElement('div')
    const setPrimaryView = vi.fn()
    const toggleInset = vi.fn()
    const handle = createViewportRegion(host, canvases(), { setPrimaryView, toggleInset })
    handle.update({ primaryView: '2d', insetVisible: true })

    host.querySelector<HTMLButtonElement>('[data-vp-swap]')!.click()
    expect(setPrimaryView).toHaveBeenCalledWith('3d')
    host.querySelector<HTMLButtonElement>('[data-vp-hide]')!.click()
    expect(toggleInset).toHaveBeenCalledOnce()

    handle.update({ primaryView: '2d', insetVisible: false })
    expect(host.querySelector('[data-vp="inset"]')!.classList.contains('is-hidden')).toBe(true)
    handle.dispose()
  })
})
