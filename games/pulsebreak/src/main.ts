import {
  createSceneManager, createThreeRenderer, localStorageAdapter, subscribeSelector,
  type Scene
} from '@automata/engine'
import { attachCanvasRenderer } from '@automata/engine/browser'
import {
  createGameHost, createOverlayScene, createProjectReader, createStandardInputs,
  mountBrowserAudio, startGameLoop, type View
} from '@automata/game-kit'
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

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')
  const host = createGameHost(app)
  try {
    const config = await loadPulsebreakProject(createProjectReader())
    const renderer = createThreeRenderer()
    host.cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, host.canvas)
    host.cleanup.defer(() => canvasRenderer.dispose())

    const store = createGameStore({ config, storage: localStorageAdapter() })
    const audioRuntime = mountBrowserAudio(host)
    registerSounds(audioRuntime.audio)
    audioRuntime.audio.setMasterVolume(0.7)

    const { inputs, element: joystickBase } = createStandardInputs(app, host.cleanup)
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    const game = createGameplay({
      config, store, render: renderer.port, rng: createRng(seed), audio: audioRuntime.audio, inputSources: inputs
    })
    host.cleanup.defer(() => game.dispose())

    const hud = createHud(store, config.waves.length)
    app.append(hud.element)
    host.cleanup.defer(() => hud.dispose())

    const inRun = (scene: SceneId): boolean => scene === 'playing' || scene === 'paused' || scene === 'upgrade'
    const reflectChrome = (scene: SceneId): void => {
      hud.element.style.display = inRun(scene) ? 'flex' : 'none'
      joystickBase.style.display = scene === 'playing' ? 'block' : 'none'
    }
    reflectChrome(store.getState().scene)
    host.cleanup.defer(subscribeSelector(store, (state) => state.scene, reflectChrome))

    const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(host.overlays, make)
    const scenes: Record<SceneId, Scene<SceneId>> = {
      title: overlayScene(() => createTitle(store)),
      playing: {},
      paused: overlayScene(() => createPauseOverlay(store)),
      upgrade: overlayScene(() => createUpgrade(store, config.upgrades)),
      victory: overlayScene(() => createVictory(store)),
      defeat: overlayScene(() => createDefeat(store))
    }
    const sceneManager = createSceneManager(store, (state) => state.scene, scenes)
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
      fixedUpdate: (dt) => game.fixedUpdate(dt),
      render: (alpha, frameDt) => game.render(alpha, frameDt),
      renderFrame: () => canvasRenderer.renderFrame(),
      onBlurPause: () => { if (store.getState().scene === 'playing') store.dispatch({ type: 'paused' }) }
    }, host.cleanup)
  } catch (error) {
    host.dispose()
    host.renderBootError(error)
  }
}

void main()
