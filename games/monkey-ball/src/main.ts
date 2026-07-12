import {
  createCleanupStack, createLoader, createRapierPhysics, createSceneManager,
  createThreeRenderer, fetchTextViaFetch, localStorageAdapter, subscribeSelector,
  type CleanupStack, type Scene
} from '@automata/engine'
import { attachCanvasRenderer } from '@automata/engine/browser'
import {
  createGameHost, createOverlayScene, createProjectReader, createStandardInputs,
  mountBrowserAudio, startGameLoop, type View
} from '@automata/game-kit'
import './style.css'
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

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')
  const host = createGameHost(app)
  try {
    const loader = createLoader(fetchTextViaFetch())
    const renderer = createThreeRenderer()
    host.cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, host.canvas)
    host.cleanup.defer(() => canvasRenderer.dispose())
    const store = createGameStore({ storage: localStorageAdapter() })
    const audioRuntime = mountBrowserAudio(host)
    registerSounds(audioRuntime.audio)
    audioRuntime.audio.setMasterVolume(store.getState().settings.volume)
    host.cleanup.defer(subscribeSelector(
      store, (state) => state.settings.volume, (volume) => audioRuntime.audio.setMasterVolume(volume)
    ))
    const physics = await createRapierPhysics()
    host.cleanup.defer(() => physics.dispose())
    const boot: BootData = await loadBootData(loader, createProjectReader())
    const { project, lib } = boot
    const { tuning, manifest } = project

    let active: { game: Gameplay; cleanup: CleanupStack } | null = null
    const leaveLevel = (): void => {
      const current = active
      active = null
      current?.cleanup.dispose()
    }
    host.cleanup.defer(leaveLevel)

    const enterLevel = (levelId: string): void => {
      if (active || host.cleanup.disposed) return
      const level = loadRequestedLevel(project, store, levelId, false)
      if (!level || active) return

      const session = createCleanupStack()
      try {
        const { inputs } = createStandardInputs(app, session, {
          joystickClass: `joystick ${store.getState().settings.joystickSide}`
        })
        const game = createGameplay({
          store, physics, render: renderer.port, audio: audioRuntime.audio, lib, level, tuning, inputSources: inputs
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
      try {
        enterLevel(levelId)
      } catch (error) {
        leaveLevel()
        console.error('Level startup failed', error)
      }
    }

    const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(host.overlays, make)
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
        const action = levelSessionAction(from, to, active !== null, false)
        if (action === 'leave') leaveLevel()
        if (action === 'enter') {
          const levelId = store.getState().session.levelId
          if (levelId) startLevel(levelId)
        }
      }
    })
    host.cleanup.defer(sceneManager.start())

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    }
    window.addEventListener('keydown', onKeyDown)
    host.cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))

    startGameLoop({
      fixedUpdate: (dt) => active?.game.fixedUpdate(dt),
      render: (alpha, frameDt) => active?.game.render(alpha, frameDt),
      renderFrame: () => canvasRenderer.renderFrame(),
      onBlurPause: () => store.dispatch({ type: 'paused' })
    }, host.cleanup)

    store.dispatch({ type: 'bootCompleted' })
  } catch (error) {
    host.dispose()
    host.renderBootError(error)
  }
}

void main()
