import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachCanvasRenderer, type RendererFactory, type RendererSurface } from '../../src/render/browser'
import { createThreeRenderer } from '../../src/render/three'
import { createThreeSpriteRenderer } from '../../src/sprite/three'

function fakeSurface(): RendererSurface {
  return {
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    dispose: vi.fn()
  } as unknown as RendererSurface
}

function surfaceSpies(surface: RendererSurface) {
  return surface as unknown as {
    render: ReturnType<typeof vi.fn>
    setSize: ReturnType<typeof vi.fn>
    setPixelRatio: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }
}

describe('attachCanvasRenderer: swappable backend', () => {
  let originalWindow: typeof globalThis.window
  let originalResizeObserver: typeof globalThis.ResizeObserver

  beforeEach(() => {
    originalWindow = globalThis.window
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.window = {
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 2,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as typeof window
    globalThis.ResizeObserver = class {
      observe(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.ResizeObserver = originalResizeObserver
  })

  it('uses the custom createRenderer factory instead of the default WebGPU', async () => {
    const surface = fakeSurface()
    const spies = surfaceSpies(surface)
    const factory: RendererFactory = vi.fn(() => surface)
    const renderer = createThreeRenderer()
    const canvas = { clientWidth: 100, clientHeight: 100 } as unknown as HTMLCanvasElement

    const handle = await attachCanvasRenderer(renderer, canvas, { createRenderer: factory })

    expect(factory).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledWith(canvas)
    expect(spies.setPixelRatio).toHaveBeenCalledWith(2)
    handle.renderFrame()
    expect(spies.render).toHaveBeenCalledWith(renderer.scene, renderer.camera)
    handle.dispose()
    expect(spies.dispose).toHaveBeenCalledTimes(1)
  })

  it('caps devicePixelRatio above MAX_PIXEL_RATIO (2) when calling setPixelRatio', async () => {
    ;(globalThis.window as { devicePixelRatio: number }).devicePixelRatio = 4
    const surface = fakeSurface()
    const spies = surfaceSpies(surface)
    const renderer = createThreeRenderer()
    const canvas = { clientWidth: 100, clientHeight: 100 } as unknown as HTMLCanvasElement
    const handle = await attachCanvasRenderer(renderer, canvas, { createRenderer: () => surface })
    expect(spies.setPixelRatio).toHaveBeenCalledWith(2)
    handle.dispose()
  })

  it('updates the camera aspect from window size (default sizeTo)', async () => {
    const surface = fakeSurface()
    const spies = surfaceSpies(surface)
    const renderer = createThreeRenderer()
    const canvas = { clientWidth: 320, clientHeight: 180 } as unknown as HTMLCanvasElement
    const handle = await attachCanvasRenderer(renderer, canvas, { createRenderer: () => surface })
    expect(renderer.camera.aspect).toBeCloseTo(800 / 600, 5)
    expect(spies.setSize).toHaveBeenCalledWith(800, 600, true)
    handle.dispose()
  })

  it('updates the camera aspect from element size when sizeTo is element', async () => {
    const surface = fakeSurface()
    const spies = surfaceSpies(surface)
    const renderer = createThreeRenderer()
    const canvas = { clientWidth: 320, clientHeight: 180 } as unknown as HTMLCanvasElement
    const handle = await attachCanvasRenderer(renderer, canvas, {
      createRenderer: () => surface,
      sizeTo: 'element'
    })
    expect(renderer.camera.aspect).toBeCloseTo(320 / 180, 5)
    expect(spies.setSize).toHaveBeenCalledWith(320, 180, false)
    handle.dispose()
  })

  it('resizes an orthographic sprite renderer through the shared scene contract', async () => {
    const surface = fakeSurface()
    const renderer = createThreeSpriteRenderer(new Map())
    const canvas = { clientWidth: 320, clientHeight: 320 } as unknown as HTMLCanvasElement
    const handle = await attachCanvasRenderer(renderer, canvas, {
      createRenderer: () => surface,
      sizeTo: 'element'
    })

    expect(renderer.camera.left).toBe(-240)
    expect(renderer.camera.right).toBe(240)
    expect(renderer.camera.top).toBe(240)
    expect(renderer.camera.bottom).toBe(-240)
    handle.dispose()
  })
})
