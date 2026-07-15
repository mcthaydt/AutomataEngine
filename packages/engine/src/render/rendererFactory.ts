import type { Camera, Scene } from 'three'

export interface ThreeSceneRenderer {
  scene: Scene
  camera: Camera
  resizeViewport(width: number, height: number): void
}

export interface CanvasRenderer {
  renderFrame(): void
  dispose(): void
}

/** Minimal surface both WebGLRenderer and WebGPURenderer satisfy. */
export interface RendererSurface {
  render(scene: Scene, camera: Camera): void
  setSize(width: number, height: number, updateStyle?: boolean): void
  setPixelRatio(ratio: number): void
  dispose(): void
}

/** Factory: builds a renderer backend for the given canvas. May be async (WebGPU init). */
export type RendererFactory = (canvas: HTMLCanvasElement) => RendererSurface | Promise<RendererSurface>

/**
 * Resolve the renderer factory for `attachCanvasRenderer`. Explicit opt-in
 * overrides the default WebGPU backend. Pure/testable: takes the default as an
 * argument so tests don't need a DOM.
 */
export function resolveRendererFactory(
  explicit: RendererFactory | undefined,
  fallback: RendererFactory
): RendererFactory {
  return explicit ?? fallback
}

/**
 * Pick the native backend before construction. WebGPURenderer's WebGL2
 * compatibility layer is substantially slower than Three's direct
 * WebGLRenderer under headless SwiftShader, so unsupported browsers should
 * not rely on the compatibility layer's implicit fallback.
 */
export function resolveDefaultRendererFactory(
  supportsNativeWebGpu: boolean,
  webGpuFactory: RendererFactory,
  webGlFactory: RendererFactory
): RendererFactory {
  return supportsNativeWebGpu ? webGpuFactory : webGlFactory
}

export interface WebGpuProbe {
  requestAdapter(): Promise<unknown | null>
}

/** Browsers may expose navigator.gpu while providing no usable adapter. */
export async function hasUsableWebGpu(gpu: WebGpuProbe | undefined): Promise<boolean> {
  if (!gpu) return false
  try {
    return await gpu.requestAdapter() !== null
  } catch {
    return false
  }
}
