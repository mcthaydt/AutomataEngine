import { GameLoop, type CleanupStack } from '@automata/engine'
import { startLoopDriver } from '@automata/engine/browser'

export interface GameLoopHooks {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt: number): void
  renderFrame(): void
  onBlurPause?(): void
}

export interface LoopDeps {
  createLoop?: (spec: { fixedUpdate: (dt: number) => void; render: (alpha: number, frameDt: number) => void }) => GameLoop
  drive?: (loop: GameLoop, onBlur?: () => void) => { stop(): void }
}

/** Drives game simulation and canvas rendering until the supplied lifecycle disposes. */
export function startGameLoop(hooks: GameLoopHooks, cleanup: CleanupStack, deps: LoopDeps = {}): void {
  const createLoop = deps.createLoop ?? ((spec) => new GameLoop(spec))
  const drive = deps.drive ?? startLoopDriver
  const loop = createLoop({
    fixedUpdate: (dt) => hooks.fixedUpdate(dt),
    render: (alpha, frameDt) => {
      hooks.render(alpha, frameDt)
      hooks.renderFrame()
    }
  })
  const driver = drive(loop, hooks.onBlurPause)
  cleanup.defer(() => driver.stop())
}
