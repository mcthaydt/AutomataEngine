import type { GameLoop } from './gameLoop'

export interface LoopDriver { stop(): void }

/** rAF glue + auto-pause hook. Untested shim, keep trivially thin. */
export function startLoopDriver(
  loop: GameLoop,
  onHidden?: () => void
): LoopDriver {
  let running = true
  const frame = (now: number): void => {
    if (!running) return
    loop.tick(now)
    requestAnimationFrame(frame)
  }
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') onHidden?.()
  }
  document.addEventListener('visibilitychange', onVisibility)
  requestAnimationFrame(frame)
  return {
    stop() {
      running = false
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}
