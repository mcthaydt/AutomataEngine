import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachFlyControls } from '../../src/viewport3d/browser'
import { initialFlyCamera, type FlyCamera } from '../../src/viewport3d/flyCamera'

interface FlyControlsHandle {
  update(dt: number): void
  dispose(): void
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('attachFlyControls', () => {
  it('owns listeners without creating a private animation-frame loop', () => {
    const requestFrame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const canvas = document.createElement('canvas')
    let camera: FlyCamera = initialFlyCamera
    const rawHandle: unknown = attachFlyControls(canvas, () => camera, (next) => { camera = next })
    const handle = rawHandle as unknown as FlyControlsHandle

    try {
      expect(requestFrame).not.toHaveBeenCalled()
      expect(handle).toMatchObject({ update: expect.any(Function), dispose: expect.any(Function) })
    } finally {
      if (typeof rawHandle === 'function') (rawHandle as () => void)()
      else handle.dispose?.()
    }
  })

  it('moves the same distance over equal elapsed time at different refresh rates', () => {
    const simulate = (frames: number): FlyCamera => {
      const canvas = document.createElement('canvas')
      let camera: FlyCamera = {
        ...initialFlyCamera,
        position: { ...initialFlyCamera.position }
      }
      const handle = attachFlyControls(canvas, () => camera, (next) => { camera = next })
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
      for (let frame = 0; frame < frames; frame++) handle.update(1 / frames)
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }))
      handle.dispose()
      return camera
    }

    const at60Hz = simulate(60)
    const at120Hz = simulate(120)
    expect(at60Hz.position.z).not.toBe(initialFlyCamera.position.z)
    expect(at60Hz.position.x).toBeCloseTo(at120Hz.position.x, 5)
    expect(at60Hz.position.y).toBeCloseTo(at120Hz.position.y, 5)
    expect(at60Hz.position.z).toBeCloseTo(at120Hz.position.z, 5)
  })
})
