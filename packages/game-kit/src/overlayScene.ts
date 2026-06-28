import type { Scene } from '@automata/engine'
import type { View } from './view'

/**
 * A Scene that mounts a freshly-built View into `overlays` on enter and disposes
 * it on exit. Generalizes the overlay-mounting closure each game's main.ts inlines.
 */
export function createOverlayScene<Id extends PropertyKey = string>(
  overlays: HTMLElement,
  make: () => View
): Scene<Id> {
  let view: View | null = null
  return {
    onEnter() {
      view = make()
      overlays.append(view.element)
    },
    onExit() {
      view?.dispose()
      view = null
    }
  }
}
