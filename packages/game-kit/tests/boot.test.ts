import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameLoop } from '@automata/engine'
import { bootGame, type BootContext, type BootDeps, type GameHooks } from '../src/boot'

interface Harness {
  deps: BootDeps
  canvasRenderer: { renderFrame: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
  rendererDispose: ReturnType<typeof vi.fn>
  loopDriverStop: ReturnType<typeof vi.fn>
  capturedLoop: GameLoop | null
  capturedOnHidden: (() => void) | undefined
}

function makeHarness(): Harness {
  const rendererDispose = vi.fn()
  const canvasRenderer = { renderFrame: vi.fn(), dispose: vi.fn() }
  const loopDriverStop = vi.fn()
  const h: Harness = {
    canvasRenderer, rendererDispose, loopDriverStop, capturedLoop: null, capturedOnHidden: undefined,
    deps: {
      createRenderer: () => ({ port: { dispose: rendererDispose } }) as never,
      attachRenderer: async () => canvasRenderer as never,
      startLoopDriver: (loop, onHidden) => {
        h.capturedLoop = loop
        h.capturedOnHidden = onHidden
        return { stop: loopDriverStop }
      }
    }
  }
  return h
}

beforeEach(() => {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.replaceChildren(app)
})
afterEach(() => { document.body.replaceChildren() })

describe('bootGame', () => {
  it('assembles the context, starts the loop, and calls onStarted', async () => {
    const h = makeHarness()
    const setup = vi.fn((ctx: BootContext): GameHooks => {
      expect(ctx.app.id).toBe('app')
      expect(ctx.canvas.tagName).toBe('CANVAS')
      expect(ctx.overlays.id).toBe('overlays')
      return { fixedUpdate: vi.fn(), render: vi.fn(), onStarted: vi.fn() }
    })
    bootGame(setup, h.deps)
    await vi.waitFor(() => expect(setup).toHaveBeenCalledTimes(1))
    const hooks = setup.mock.results[0]!.value as GameHooks
    await vi.waitFor(() => expect(hooks.onStarted).toHaveBeenCalledTimes(1))
    expect(h.capturedLoop).toBeInstanceOf(GameLoop)
  })

  it('renders through the loop and calls canvasRenderer.renderFrame after the game render', async () => {
    const h = makeHarness()
    const render = vi.fn()
    bootGame(() => ({ fixedUpdate: vi.fn(), render }), h.deps)
    await vi.waitFor(() => expect(h.capturedLoop).not.toBeNull())
    h.capturedLoop!.tick(0)
    expect(render).toHaveBeenCalledTimes(1)
    expect(h.canvasRenderer.renderFrame).toHaveBeenCalledTimes(1)
  })

  it('wires onHidden into the loop driver and onEscape to the Escape key', async () => {
    const h = makeHarness()
    const onHidden = vi.fn()
    const onEscape = vi.fn()
    bootGame(() => ({ fixedUpdate: vi.fn(), render: vi.fn(), onHidden, onEscape }), h.deps)
    await vi.waitFor(() => expect(h.capturedOnHidden).toBe(onHidden))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(onEscape).not.toHaveBeenCalled()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('rolls back acquired resources and shows a boot error when setup throws', async () => {
    const h = makeHarness()
    bootGame(() => { throw new Error('boom') }, h.deps)
    await vi.waitFor(() => {
      const app = document.getElementById('app')!
      expect(app.querySelector('.boot-error')?.textContent).toContain('boom')
    })
    expect(h.rendererDispose).toHaveBeenCalledTimes(1)
    expect(h.canvasRenderer.dispose).toHaveBeenCalledTimes(1)
  })

  it('throws synchronously when #app is missing', () => {
    document.body.replaceChildren()
    expect(() => bootGame(() => ({ fixedUpdate: vi.fn(), render: vi.fn() }), makeHarness().deps))
      .toThrow('Missing #app')
  })
})
