import {
  createCleanupStack,
  createLoader,
  createRapierPhysics,
  createSceneManager,
  localStorageAdapter,
  subscribeSelector,
  type CleanupStack,
  type InputSource,
  type Scene
} from '@automata/engine'
import { createKeyboardInput, createVirtualJoystick } from '@automata/engine/browser'
import { bootGame, createOverlayScene, createProjectReader, mountAudio, type View } from '@automata/game-kit'
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

bootGame(async (ctx) => {
  const { app, overlays, renderer, cleanup } = ctx

  const reader = createProjectReader()
  const loader = createLoader(reader.fetchText)
  const store = createGameStore({ storage: localStorageAdapter() })
  const audioRuntime = mountAudio(ctx, registerSounds)
  audioRuntime.audio.setMasterVolume(store.getState().settings.volume)
  cleanup.defer(subscribeSelector(
    store,
    (state) => state.settings.volume,
    (volume) => audioRuntime.audio.setMasterVolume(volume)
  ))
  const physics = await createRapierPhysics()
  cleanup.defer(() => physics.dispose())
  const boot: BootData = await loadBootData(loader, reader)
  const { project, lib } = boot
  const { tuning, manifest } = project

  let active: { game: Gameplay; cleanup: CleanupStack } | null = null

  const leaveLevel = (): void => {
    const current = active
    active = null
    current?.cleanup.dispose()
  }
  cleanup.defer(leaveLevel)

  const enterLevel = (levelId: string): void => {
    if (active || cleanup.disposed) return
    const level = loadRequestedLevel(project, store, levelId, false)
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
    try {
      enterLevel(levelId)
    } catch (error) {
      leaveLevel()
      console.error('Level startup failed', error)
    }
  }

  const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(overlays, make)

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
  cleanup.defer(sceneManager.start())

  return {
    fixedUpdate: (dt) => active?.game.fixedUpdate(dt),
    render: (alpha, frameDt) => active?.game.render(alpha, frameDt),
    onEscape: () => {
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    },
    onHidden: () => store.dispatch({ type: 'paused' }),
    onStarted: () => store.dispatch({ type: 'bootCompleted' })
  }
})
