import {
  GameLoop,
  createCleanupStack,
  createThreeRenderer,
  type CleanupStack,
  type ThreeRenderer
} from '@automata/engine'
import {
  attachCanvasRenderer,
  startLoopDriver,
  type CanvasRenderer,
  type LoopDriver
} from '@automata/engine/browser'

/** The assembled browser pieces a game's `setup` receives. */
export interface BootContext {
  app: HTMLElement
  canvas: HTMLCanvasElement
  overlays: HTMLElement
  renderer: ThreeRenderer
  canvasRenderer: CanvasRenderer
  cleanup: CleanupStack
}

/** The game-specific policy `setup` returns to the shell. */
export interface GameHooks {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt: number): void
  /** Called when the user presses Escape; the game decides pause vs resume. */
  onEscape?(): void
  /** Called when the tab is hidden; the game decides whether to pause. */
  onHidden?(): void
  /** Called once after the loop is running (e.g. dispatch a boot-completed action). */
  onStarted?(): void
}

export type GameSetup = (ctx: BootContext) => GameHooks | Promise<GameHooks>

/** Un-fakeable browser/WebGL factories, injected so the spine is testable. */
export interface BootDeps {
  createRenderer(): ThreeRenderer
  attachRenderer(renderer: ThreeRenderer, canvas: HTMLCanvasElement): Promise<CanvasRenderer>
  startLoopDriver(loop: GameLoop, onHidden?: () => void): LoopDriver
}

const defaultDeps: BootDeps = {
  createRenderer: createThreeRenderer,
  attachRenderer: attachCanvasRenderer,
  startLoopDriver
}

/** The user-facing failure panel mounted into `#app` when boot fails. */
export function bootError(error: unknown): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'overlay boot-error'
  panel.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`
  return panel
}

/**
 * The shared browser boot spine. Owns the cleanup stack, DOM scaffold, renderer,
 * game loop, visibility/Escape wiring, and roll-back-on-failure; the game supplies
 * only policy through `setup`. Throws synchronously if `#app` is missing.
 */
export function bootGame(setup: GameSetup, deps: BootDeps = defaultDeps): void {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')

  const cleanup = createCleanupStack()
  const dispose = (): void => {
    // Drain every acquired resource; keep the boot error as the user-facing
    // cause even if a cleanup callback also throws.
    try {
      cleanup.dispose()
    } catch (error) {
      console.error('Cleanup failed', error)
    }
  }
  const onBeforeUnload = (): void => dispose()
  window.addEventListener('beforeunload', onBeforeUnload)
  cleanup.defer(() => window.removeEventListener('beforeunload', onBeforeUnload))

  void (async (): Promise<void> => {
    try {
      const canvas = document.createElement('canvas')
      app.append(canvas)
      cleanup.defer(() => canvas.remove())
      const overlays = document.createElement('div')
      overlays.id = 'overlays'
      app.append(overlays)
      cleanup.defer(() => overlays.remove())

      const renderer = deps.createRenderer()
      cleanup.defer(() => renderer.port.dispose())
      const canvasRenderer = await deps.attachRenderer(renderer, canvas)
      cleanup.defer(() => canvasRenderer.dispose())

      const hooks = await setup({ app, canvas, overlays, renderer, canvasRenderer, cleanup })

      const loop = new GameLoop({
        fixedUpdate: (dt) => hooks.fixedUpdate(dt),
        render: (alpha, frameDt) => {
          hooks.render(alpha, frameDt)
          canvasRenderer.renderFrame()
        }
      })
      const loopDriver = deps.startLoopDriver(loop, hooks.onHidden)
      cleanup.defer(() => loopDriver.stop())

      const onEscape = hooks.onEscape
      if (onEscape) {
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape') onEscape()
        }
        window.addEventListener('keydown', onKeyDown)
        cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))
      }

      hooks.onStarted?.()
    } catch (error) {
      dispose()
      app.replaceChildren(bootError(error))
    }
  })()
}
