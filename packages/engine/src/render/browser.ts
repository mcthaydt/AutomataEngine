import { WebGLRenderer } from 'three'
import { canvasDims, createResizeReconciler } from './canvasSize'
import { cappedPixelRatio } from './pixelRatio'
import {
  resolveRendererFactory,
  resolveDefaultRendererFactory,
  hasUsableWebGpu,
  type CanvasRenderer,
  type RendererFactory,
  type RendererSurface,
  type ThreeSceneRenderer
} from './rendererFactory'

export type { CanvasRenderer, RendererFactory, RendererSurface } from './rendererFactory'

/** Default backend: WebGPU (forward-looking). Falls back via app-supplied factory. */
export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<RendererSurface> {
  const { WebGPURenderer } = await import('three/webgpu')
  const renderer = new WebGPURenderer({ canvas, antialias: true })
  await renderer.init()
  return renderer
}

/** Legacy backend: WebGL. Synchronous construction. */
export function createWebGLRenderer(canvas: HTMLCanvasElement): RendererSurface {
  return new WebGLRenderer({ canvas, antialias: true })
}

/** Prefer native WebGPU, but bypass its slow compatibility layer when absent. */
export async function createDefaultRenderer(canvas: HTMLCanvasElement): Promise<RendererSurface> {
  const gpu = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu
  const create = resolveDefaultRendererFactory(
    await hasUsableWebGpu(gpu),
    createWebGPURenderer,
    createWebGLRenderer
  )
  return await create(canvas)
}

/** Canvas glue. Untested shim, keep trivially thin. Default backend is WebGPU. */
export async function attachCanvasRenderer(
  renderer: ThreeSceneRenderer,
  canvas: HTMLCanvasElement,
  opts?: { sizeTo?: 'window' | 'element'; createRenderer?: RendererFactory }
): Promise<CanvasRenderer> {
  const create = resolveRendererFactory(opts?.createRenderer, createDefaultRenderer)
  const gl = await create(canvas)
  gl.setPixelRatio(cappedPixelRatio(window.devicePixelRatio))
  const sizeTo = opts?.sizeTo ?? 'window'
  const reconcile = createResizeReconciler(({ w, h }) => {
    gl.setSize(w, h, sizeTo === 'window')
    renderer.resizeViewport(w, h)
  })
  const resize = (): void => reconcile(canvasDims(canvas, sizeTo, window))
  window.addEventListener('resize', resize)
  let observer: ResizeObserver | undefined
  if (sizeTo === 'element' && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(canvas)
  }
  resize()
  return {
    // Re-size before drawing: the construction-time resize() runs before the
    // canvas is laid out (clientWidth 0 → a 1×1 buffer → black 3D), and a
    // hidden/re-shown canvas leaves the buffer stale until an event fires.
    renderFrame: () => {
      resize()
      gl.render(renderer.scene, renderer.camera)
    },
    dispose() {
      window.removeEventListener('resize', resize)
      observer?.disconnect()
      gl.dispose()
    }
  }
}
