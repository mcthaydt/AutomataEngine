import { describe, expect, it, vi } from 'vitest'
import { createGameHost } from '../src/host'

describe('createGameHost', () => {
  it('mounts a canvas and #overlays into app', () => {
    const app = document.createElement('div')
    const host = createGameHost(app)
    expect(app.querySelector('canvas')).toBe(host.canvas)
    expect(app.querySelector('#overlays')).toBe(host.overlays)
  })

  it('dispose removes mounted nodes and runs deferred cleanup', () => {
    const app = document.createElement('div')
    const host = createGameHost(app)
    const spy = vi.fn()
    host.cleanup.defer(spy)
    host.dispose()
    expect(app.querySelector('canvas')).toBeNull()
    expect(app.querySelector('#overlays')).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('removes the beforeunload listener on dispose', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    createGameHost(document.createElement('div')).dispose()
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('renderBootError replaces app content with a panel', () => {
    const app = document.createElement('div')
    createGameHost(app).renderBootError(new Error('boom'))
    expect(app.querySelector('.boot-error')?.textContent).toContain('boom')
  })
})
