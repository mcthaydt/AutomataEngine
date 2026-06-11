import { WebGLRenderer } from 'three'
import type { ThreeRenderer } from './three'

export interface CanvasRenderer {
  renderFrame(): void
  dispose(): void
}

/** WebGL glue. Untested shim, keep trivially thin. */
export function attachCanvasRenderer(
  renderer: ThreeRenderer,
  canvas: HTMLCanvasElement
): CanvasRenderer {
  const gl = new WebGLRenderer({ canvas, antialias: true })
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const resize = (): void => {
    gl.setSize(window.innerWidth, window.innerHeight)
    renderer.camera.aspect = window.innerWidth / window.innerHeight
    renderer.camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()
  return {
    renderFrame: () => gl.render(renderer.scene, renderer.camera),
    dispose() {
      window.removeEventListener('resize', resize)
      gl.dispose()
    }
  }
}
