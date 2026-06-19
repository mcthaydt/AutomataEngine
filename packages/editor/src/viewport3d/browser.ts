import type { FlyCamera } from './flyCamera'
import { moveFly, rotateFly } from './flyCamera'

/** Pointer-lock mouselook plus WASD. Untested shim, keep trivially thin. */
export function attachFlyControls(
  canvas: HTMLCanvasElement,
  getCamera: () => FlyCamera,
  setCamera: (camera: FlyCamera) => void
): () => void {
  const keys = new Set<string>()
  const onKeyDown = (event: KeyboardEvent): void => { keys.add(event.key.toLowerCase()) }
  const onKeyUp = (event: KeyboardEvent): void => { keys.delete(event.key.toLowerCase()) }
  const onClick = (): void => { void canvas.requestPointerLock() }
  const onMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) return
    setCamera(rotateFly(getCamera(), -event.movementX * 0.003, -event.movementY * 0.003))
  }
  const tick = (): void => {
    const move = {
      forward: (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0),
      right: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
      up: (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0)
    }
    if (move.forward || move.right || move.up) setCamera(moveFly(getCamera(), move, 0.25))
    raf = requestAnimationFrame(tick)
  }
  let raf = requestAnimationFrame(tick)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('click', onClick)
  window.addEventListener('mousemove', onMove)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    canvas.removeEventListener('click', onClick)
    window.removeEventListener('mousemove', onMove)
  }
}
