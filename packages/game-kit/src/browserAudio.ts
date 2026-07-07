import { createNullAudio, type AudioPort, type CleanupStack } from '@automata/engine'
import { createWebAudio } from '@automata/engine/browser'

export interface BrowserAudio {
  audio: AudioPort
  resume(): void
  dispose(): void
}

/** WebAudio runtime with graceful fallback to silent audio when unavailable. */
export function createBrowserAudio(
  createContext: () => AudioContext = () => new AudioContext()
): BrowserAudio {
  try {
    const context = createContext()
    let disposed = false
    return {
      audio: createWebAudio(context),
      resume() { void context.resume() },
      dispose() {
        if (disposed) return
        disposed = true
        void context.close()
      }
    }
  } catch {
    return {
      audio: createNullAudio().port,
      resume() {},
      dispose() {}
    }
  }
}

/**
 * The audio cluster every game repeats: create the runtime, register its sounds,
 * resume it on the first pointer interaction, and play `uiClick` on overlay
 * button clicks. Teardown is deferred onto `ctx.cleanup`. The caller sets volume
 * on the returned runtime (reactively or with a literal).
 */
export function mountAudio(
  ctx: { overlays: HTMLElement; cleanup: CleanupStack },
  register: (audio: AudioPort) => void
): BrowserAudio {
  const runtime = createBrowserAudio()
  ctx.cleanup.defer(() => runtime.dispose())
  register(runtime.audio)

  const resume = (): void => runtime.resume()
  window.addEventListener('pointerdown', resume, { once: true })
  ctx.cleanup.defer(() => window.removeEventListener('pointerdown', resume))

  const onOverlayClick = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('button')) runtime.audio.play('uiClick')
  }
  ctx.overlays.addEventListener('click', onOverlayClick)
  ctx.cleanup.defer(() => ctx.overlays.removeEventListener('click', onOverlayClick))

  return runtime
}
