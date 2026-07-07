import {
  createSceneManager,
  localStorageAdapter,
  subscribeSelector,
  type InputSource,
  type Scene
} from '@automata/engine'
import { createKeyboardInput, createVirtualJoystick } from '@automata/engine/browser'
import { bootGame, createOverlayScene, createProjectReader, mountAudio, type View } from '@automata/game-kit'
import './style.css'
import { registerSounds } from './audio/sounds'
import { createGameplay } from './game/gameplay'
import { loadPulsebreakProject } from './project'
import { createRng } from './sim/rng'
import { createGameStore } from './state/root'
import type { SceneId } from './state/actions'
import { createHud } from './ui/hud'
import { createTitle } from './ui/title'
import { createUpgrade } from './ui/upgrade'
import { createDefeat, createPauseOverlay, createVictory } from './ui/overlays'

bootGame(async (ctx) => {
  const { app, overlays, renderer, cleanup } = ctx

  const reader = createProjectReader()
  const config = await loadPulsebreakProject(reader)

  const store = createGameStore({ config, storage: localStorageAdapter() })
  const audioRuntime = mountAudio(ctx, registerSounds)
  audioRuntime.audio.setMasterVolume(0.7)

  const joystickBase = document.createElement('div')
  joystickBase.className = 'joystick'
  app.append(joystickBase)
  cleanup.defer(() => joystickBase.remove())
  const inputs: InputSource[] = [createKeyboardInput(window), createVirtualJoystick(joystickBase)]
  for (const input of inputs) cleanup.defer(() => input.dispose())

  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  const game = createGameplay({
    config, store, render: renderer.port, rng: createRng(seed), audio: audioRuntime.audio, inputSources: inputs
  })
  cleanup.defer(() => game.dispose())

  const hud = createHud(store, config.waves.length)
  app.append(hud.element)
  cleanup.defer(() => hud.dispose())

  // HUD + joystick are only meaningful inside a run.
  const inRun = (scene: SceneId): boolean => scene === 'playing' || scene === 'paused' || scene === 'upgrade'
  const reflectChrome = (scene: SceneId): void => {
    hud.element.style.display = inRun(scene) ? 'flex' : 'none'
    joystickBase.style.display = scene === 'playing' ? 'block' : 'none'
  }
  reflectChrome(store.getState().scene)
  cleanup.defer(subscribeSelector(store, (s) => s.scene, reflectChrome))

  const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(overlays, make)
  const scenes: Record<SceneId, Scene<SceneId>> = {
    title: overlayScene(() => createTitle(store)),
    playing: {},
    paused: overlayScene(() => createPauseOverlay(store)),
    upgrade: overlayScene(() => createUpgrade(store, config.upgrades)),
    victory: overlayScene(() => createVictory(store)),
    defeat: overlayScene(() => createDefeat(store))
  }
  const sceneManager = createSceneManager(store, (state) => state.scene, scenes)
  cleanup.defer(sceneManager.start())

  return {
    fixedUpdate: (dt) => game.fixedUpdate(dt),
    render: (alpha, frameDt) => game.render(alpha, frameDt),
    onEscape: () => {
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    },
    onHidden: () => {
      if (store.getState().scene === 'playing') store.dispatch({ type: 'paused' })
    }
  }
})
