import {
  GameLoop,
  createCleanupStack,
  createLoader,
  createRapierPhysics,
  createSceneManager,
  createThreeRenderer,
  fetchTextViaFetch,
  localStorageAdapter,
  subscribeSelector,
  type CleanupStack,
  type InputSource,
  type Scene
} from '@automata/engine'
import {
  attachCanvasRenderer, createKeyboardInput, createVirtualJoystick, startLoopDriver
} from '@automata/engine/browser'
import './style.css'
import { createBrowserAudio } from './audio/browserAudio'
import { registerSounds } from './audio/sounds'
import { createGameplay, type Gameplay } from './game/gameplay'
import { loadBootData, type BootData } from './scenes/boot'
import { levelSessionAction, loadRequestedLevel } from './scenes/levelLifecycle'
import { createGameStore } from './state/root'
import type { SceneId } from './state/actions'
import { createHud } from './ui/hud'
import { createLevelSelect } from './ui/levelSelect'
import { createMenu } from './ui/menu'
import { createGameOver, createLevelComplete, createPauseOverlay } from './ui/overlays'
import type { View } from './ui/view'

function bootError(error: unknown): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'overlay boot-error'
  panel.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`
  return panel
}

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')

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

  try {
    const canvas = document.createElement('canvas')
    app.append(canvas)
    cleanup.defer(() => canvas.remove())
    const overlays = document.createElement('div')
    overlays.id = 'overlays'
    app.append(overlays)
    cleanup.defer(() => overlays.remove())

    const loader = createLoader(fetchTextViaFetch())
    const renderer = createThreeRenderer()
    cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, canvas)
    cleanup.defer(() => canvasRenderer.dispose())
    const store = createGameStore({ storage: localStorageAdapter() })
    const audioRuntime = createBrowserAudio()
    cleanup.defer(() => audioRuntime.dispose())
    registerSounds(audioRuntime.audio)
    audioRuntime.audio.setMasterVolume(store.getState().settings.volume)
    cleanup.defer(subscribeSelector(
      store,
      (state) => state.settings.volume,
      (volume) => audioRuntime.audio.setMasterVolume(volume)
    ))
    const onOverlayClick = (event: MouseEvent): void => {
      if ((event.target as HTMLElement).closest('button')) audioRuntime.audio.play('uiClick')
    }
    overlays.addEventListener('click', onOverlayClick)
    cleanup.defer(() => overlays.removeEventListener('click', onOverlayClick))
    window.addEventListener('pointerdown', audioRuntime.resume, { once: true })
    cleanup.defer(() => window.removeEventListener('pointerdown', audioRuntime.resume))
    const physics = await createRapierPhysics()
    cleanup.defer(() => physics.dispose())
    const boot: BootData = await loadBootData(loader)
    const { tuning, lib, manifest } = boot

    let active: { game: Gameplay; cleanup: CleanupStack } | null = null
    let pendingLoad = false
    let loadEpoch = 0

    const leaveLevel = (): void => {
      loadEpoch++
      pendingLoad = false
      const current = active
      active = null
      current?.cleanup.dispose()
    }
    cleanup.defer(leaveLevel)

    const enterLevel = async (levelId: string): Promise<void> => {
      if (active || pendingLoad || cleanup.disposed) return
      pendingLoad = true
      const epoch = loadEpoch
      const level = await loadRequestedLevel(loader, store, levelId, false)
      if (epoch !== loadEpoch || cleanup.disposed) return
      pendingLoad = false
      if (!level || active) return

      const session = createCleanupStack()
      try {
        const joystickBase = document.createElement('div')
        joystickBase.className = `joystick ${store.getState().settings.joystickSide}`
        app.append(joystickBase)
        session.defer(() => joystickBase.remove())
        const inputs: InputSource[] = [
          createKeyboardInput(window),
          createVirtualJoystick(joystickBase)
        ]
        for (const input of inputs) session.defer(() => input.dispose())
        const game = createGameplay({
          store,
          physics,
          render: renderer.port,
          audio: audioRuntime.audio,
          lib,
          level,
          tuning,
          inputSources: inputs
        })
        session.defer(() => game.dispose())
        const hud = createHud(store, level.timeLimitS)
        app.append(hud.element)
        session.defer(() => hud.dispose())
        active = { game, cleanup: session }
      } catch (error) {
        session.dispose()
        throw error
      }
    }

    const startLevel = (levelId: string): void => {
      void enterLevel(levelId).catch((error) => {
        leaveLevel()
        console.error('Level startup failed', error)
      })
    }

    const overlayScene = (make: () => View): Scene<SceneId> => {
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

    const scenes: Record<SceneId, Scene<SceneId>> = {
      boot: {},
      playing: {},
      menu: overlayScene(() => createMenu(store)),
      levelSelect: overlayScene(() => createLevelSelect(store, manifest)),
      paused: overlayScene(() => createPauseOverlay(store)),
      levelComplete: overlayScene(() => createLevelComplete(store)),
      gameOver: overlayScene(() => createGameOver(store))
    }
    const sceneManager = createSceneManager(store, (state) => state.scene, scenes, {
      onTransition: ({ from, to }) => {
        const action = levelSessionAction(from, to, active !== null, pendingLoad)
        if (action === 'leave') leaveLevel()
        if (action === 'enter') {
          const levelId = store.getState().session.levelId
          if (levelId) startLevel(levelId)
        }
      }
    })
    cleanup.defer(sceneManager.start())

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    }
    window.addEventListener('keydown', onKeyDown)
    cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))

    const loop = new GameLoop({
      fixedUpdate: (dt) => active?.game.fixedUpdate(dt),
      render: (alpha, frameDt) => {
        active?.game.render(alpha, frameDt)
        canvasRenderer.renderFrame()
      }
    })
    const loopDriver = startLoopDriver(loop, () => store.dispatch({ type: 'paused' }))
    cleanup.defer(() => loopDriver.stop())

    store.dispatch({ type: 'bootCompleted' })
  } catch (error) {
    // Roll back every resource acquired before the failure, but keep the boot
    // error as the user-facing cause even if a cleanup callback also fails.
    dispose()
    app.replaceChildren(bootError(error))
  }
}

void main()
