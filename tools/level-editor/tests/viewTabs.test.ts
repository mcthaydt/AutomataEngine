import { describe, expect, it } from 'vitest'
import { createViewTabs } from '../src/viewTabs'

describe('view tabs', () => {
  it('shows one full canvas view and switches with tab buttons', () => {
    const host = document.createElement('div')
    const canvas3d = document.createElement('canvas')
    const canvas2d = document.createElement('canvas')
    host.append(canvas3d, canvas2d)

    const tabs = createViewTabs(host, {
      initialView: '3d',
      views: [
        { id: '3d', label: '3D', canvas: canvas3d },
        { id: '2d', label: '2D', canvas: canvas2d }
      ]
    })

    expect(tabs.activeView()).toBe('3d')
    expect(canvas3d.hidden).toBe(false)
    expect(canvas3d.classList.contains('is-active')).toBe(true)
    expect(canvas2d.hidden).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-view-tab="3d"]')?.getAttribute('aria-pressed')).toBe('true')

    host.querySelector<HTMLButtonElement>('[data-view-tab="2d"]')?.click()

    expect(tabs.activeView()).toBe('2d')
    expect(canvas3d.hidden).toBe(true)
    expect(canvas3d.classList.contains('is-active')).toBe(false)
    expect(canvas2d.hidden).toBe(false)
    expect(canvas2d.classList.contains('is-active')).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-view-tab="2d"]')?.getAttribute('aria-pressed')).toBe('true')

    tabs.dispose()
    expect(host.querySelector('#view-tabs')).toBeNull()
  })
})
