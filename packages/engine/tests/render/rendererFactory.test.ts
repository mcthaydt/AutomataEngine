import { describe, expect, it, vi } from 'vitest'
import { hasUsableWebGpu, resolveDefaultRendererFactory, resolveRendererFactory, type RendererFactory, type RendererSurface } from '../../src/render/rendererFactory'

const fakeFactory = (): RendererFactory => vi.fn(() => ({ render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(), dispose: vi.fn() }) as unknown as RendererSurface)
const otherFactory = (): RendererFactory => vi.fn(() => ({ render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(), dispose: vi.fn() }) as unknown as RendererSurface)

describe('resolveRendererFactory', () => {
  it('returns the explicit factory when one is provided', () => {
    const explicit = fakeFactory()
    const fallback = otherFactory()
    expect(resolveRendererFactory(explicit, fallback)).toBe(explicit)
  })

  it('falls back to the default factory when explicit is undefined', () => {
    const fallback = otherFactory()
    expect(resolveRendererFactory(undefined, fallback)).toBe(fallback)
  })

  it('the resolved factory is callable (returns a RendererSurface)', async () => {
    const fallback = fakeFactory()
    const canvas = {} as HTMLCanvasElement
    const surface = await fallback(canvas)
    expect(surface).toBeDefined()
    expect(typeof surface.render).toBe('function')
    expect(typeof surface.setSize).toBe('function')
    expect(typeof surface.setPixelRatio).toBe('function')
    expect(typeof surface.dispose).toBe('function')
  })
})

describe('resolveDefaultRendererFactory', () => {
  it('uses native WebGPU only when the browser exposes it', () => {
    const webGpu = fakeFactory()
    const webGl = otherFactory()
    expect(resolveDefaultRendererFactory(true, webGpu, webGl)).toBe(webGpu)
    expect(resolveDefaultRendererFactory(false, webGpu, webGl)).toBe(webGl)
  })

  it('requires a usable adapter instead of navigator.gpu property presence', async () => {
    await expect(hasUsableWebGpu(undefined)).resolves.toBe(false)
    await expect(hasUsableWebGpu({ requestAdapter: async () => null })).resolves.toBe(false)
    await expect(hasUsableWebGpu({ requestAdapter: async () => ({}) })).resolves.toBe(true)
    await expect(hasUsableWebGpu({ requestAdapter: async () => { throw new Error('unavailable') } })).resolves.toBe(false)
  })
})
