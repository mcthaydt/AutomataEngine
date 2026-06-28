import { describe, expect, it } from 'vitest'
import { createOverlayScene } from '../src/overlayScene'
import { panel, staticView } from '../src/dom'

const mk = (overlays: HTMLElement) => createOverlayScene(overlays, () => staticView(panel('x')))

describe('createOverlayScene', () => {
  it('mounts the view into the container on enter', () => {
    const overlays = document.createElement('div')
    mk(overlays).onEnter?.({ from: null, to: 'x' })
    expect(overlays.querySelector('.overlay.x')).toBeTruthy()
  })

  it('disposes and detaches the view on exit', () => {
    const overlays = document.createElement('div')
    const scene = mk(overlays)
    scene.onEnter?.({ from: null, to: 'x' })
    scene.onExit?.({ from: 'x', to: null })
    expect(overlays.querySelector('.overlay.x')).toBeNull()
  })

  it('is inert on exit before enter', () => {
    const overlays = document.createElement('div')
    expect(() => mk(overlays).onExit?.({ from: 'x', to: null })).not.toThrow()
  })
})
