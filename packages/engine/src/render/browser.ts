import { WebGLRenderer } from 'three'
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
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const sizeTo = opts?.sizeTo ?? 'window'
  const dims = (): { w: number; h: number } =>
    sizeTo === 'element'
      ? { w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 }
      : { w: window.innerWidth, h: window.innerHeight }
  const resize = (): void => {
    const { w, h } = dims()
    gl.setSize(w, h, sizeTo === 'window')
    renderer.camera.aspect = w / h
    renderer.camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  let observer: ResizeObserver | undefined
  if (sizeTo === 'element' && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(canvas)
  }
  resize()
  return {
    renderFrame: () => gl.render(renderer.scene, renderer.camera),
    dispose() {
      window.removeEventListener('resize', resize)
      observer?.disconnect()
      gl.dispose()
    }
  }
}
