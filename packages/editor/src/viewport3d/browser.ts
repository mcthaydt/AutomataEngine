import type { FlyCamera } from './flyCamera'
import { rotateFly } from './flyCamera'
import { advanceFlyControls } from './flyControls'

export interface FlyControlsHandle {
  update(dt: number): void
  dispose(): void
}

/** Pointer-lock mouselook plus WASD. Untested shim, keep trivially thin. */
export function attachFlyControls(
  canvas: HTMLCanvasElement,
  getCamera: () => FlyCamera,
  setCamera: (camera: FlyCamera) => void
): FlyControlsHandle {
  const keys = new Set<string>()
  const onKeyDown = (event: KeyboardEvent): void => { keys.add(event.key.toLowerCase()) }
  const onKeyUp = (event: KeyboardEvent): void => { keys.delete(event.key.toLowerCase()) }
  const onClick = (): void => { void canvas.requestPointerLock() }
  const onMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) return
    setCamera(rotateFly(getCamera(), -event.movementX * 0.003, -event.movementY * 0.003))
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('click', onClick)
  window.addEventListener('mousemove', onMove)
  return {
    update(dt) {
      const current = getCamera()
      const next = advanceFlyControls(current, keys, dt)
      if (next !== current) setCamera(next)
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('mousemove', onMove)
    }
  }
}
