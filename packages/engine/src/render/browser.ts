import { WebGLRenderer } from 'three'
import { canvasDims, createResizeReconciler } from './canvasSize'
import { cappedPixelRatio } from './pixelRatio'
import type { ThreeRenderer } from './three'

export interface CanvasRenderer {
  renderFrame(): void
  dispose(): void
}

/** WebGL glue. Untested shim, keep trivially thin. */
export function attachCanvasRenderer(
  renderer: ThreeRenderer,
  canvas: HTMLCanvasElement,
  opts?: { sizeTo?: 'window' | 'element' }
): CanvasRenderer {
  const gl = new WebGLRenderer({ canvas, antialias: true })
  gl.setPixelRatio(cappedPixelRatio(window.devicePixelRatio))
  const sizeTo = opts?.sizeTo ?? 'window'
  const reconcile = createResizeReconciler(({ w, h }) => {
    gl.setSize(w, h, sizeTo === 'window')
    renderer.camera.aspect = w / h
    renderer.camera.updateProjectionMatrix()
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
