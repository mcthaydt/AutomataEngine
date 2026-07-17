import type { CleanupStack } from '@automata/engine'
import { createBrowserAudio, type BrowserAudio } from './browserAudio'

export interface AudioHost {
  overlays: HTMLElement
  cleanup: CleanupStack
}

/** Wires browser audio to a host's lifecycle, overlays, and first user gesture. */
export function mountBrowserAudio(host: AudioHost, opts: { create?: () => BrowserAudio } = {}): BrowserAudio {
  const runtime = (opts.create ?? createBrowserAudio)()
  host.cleanup.defer(() => runtime.dispose())

  const onOverlayClick = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('button')) runtime.audio.play('uiClick')
  }
  host.overlays.addEventListener('click', onOverlayClick)
  host.cleanup.defer(() => host.overlays.removeEventListener('click', onOverlayClick))

  window.addEventListener('pointerdown', runtime.resume, { once: true })
  host.cleanup.defer(() => window.removeEventListener('pointerdown', runtime.resume))

  return runtime
}
