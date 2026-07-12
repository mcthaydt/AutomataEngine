import { createCleanupStack, type CleanupStack } from '@automata/engine'

export interface GameHost {
  app: HTMLElement
  canvas: HTMLCanvasElement
  overlays: HTMLElement
  cleanup: CleanupStack
  dispose(): void
  renderBootError(error: unknown): void
}

/** Shared browser mount point, cleanup lifecycle, and boot-failure surface for games. */
export function createGameHost(app: HTMLElement): GameHost {
  const cleanup = createCleanupStack()
  const dispose = (): void => {
    try {
      cleanup.dispose()
    } catch (error) {
      console.error('Cleanup failed', error)
    }
  }
  const onBeforeUnload = (): void => dispose()
  window.addEventListener('beforeunload', onBeforeUnload)
  cleanup.defer(() => window.removeEventListener('beforeunload', onBeforeUnload))

  const canvas = document.createElement('canvas')
  app.append(canvas)
  cleanup.defer(() => canvas.remove())
  const overlays = document.createElement('div')
  overlays.id = 'overlays'
  app.append(overlays)
  cleanup.defer(() => overlays.remove())

  const renderBootError = (error: unknown): void => {
    const panel = document.createElement('div')
    panel.className = 'overlay boot-error'
    panel.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`
    app.replaceChildren(panel)
  }

  return { app, canvas, overlays, cleanup, dispose, renderBootError }
}
