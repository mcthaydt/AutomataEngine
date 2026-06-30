import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachFlyControls } from '../../src/viewport3d/browser'
import { initialFlyCamera, type FlyCamera } from '../../src/viewport3d/flyCamera'
import { advanceFlyControls } from '../../src/viewport3d/flyControls'

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

  it('maps every movement key and preserves identity when idle', () => {
    expect(advanceFlyControls(initialFlyCamera, new Set(), 1)).toBe(initialFlyCamera)
    for (const key of ['w', 's', 'a', 'd', 'e', 'q']) {
      expect(advanceFlyControls(initialFlyCamera, new Set([key]), 0.1)).not.toBe(initialFlyCamera)
    }
    expect(advanceFlyControls(initialFlyCamera, new Set(['w', 's', 'a', 'd', 'e', 'q']), 1)).toBe(initialFlyCamera)
    const clamped = advanceFlyControls(initialFlyCamera, new Set(['w']), -1)
    expect(clamped).not.toBe(initialFlyCamera)
    expect(clamped.position).toEqual(initialFlyCamera.position)
  })

  it('requests pointer lock and applies mouse look only while locked', () => {
    const canvas = document.createElement('canvas')
    const requestPointerLock = vi.fn()
    Object.defineProperty(canvas, 'requestPointerLock', { value: requestPointerLock })
    let camera: FlyCamera = initialFlyCamera
    const setCamera = vi.fn((next: FlyCamera) => { camera = next })
    const handle = attachFlyControls(canvas, () => camera, setCamera)

    canvas.click()
    expect(requestPointerLock).toHaveBeenCalledOnce()
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 10, movementY: 5 }))
    expect(setCamera).not.toHaveBeenCalled()

    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      value: canvas
    })
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 10, movementY: 5 }))
    expect(setCamera).toHaveBeenCalledOnce()
    handle.update(0.1)
    handle.dispose()
  })
})
