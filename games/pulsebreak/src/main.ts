import {
  GameLoop,
  createCleanupStack,
  createSceneManager,
  createThreeRenderer,
  localStorageAdapter,
  subscribeSelector,
  type InputSource,
  type Scene
} from '@automata/engine'
import {
  attachCanvasRenderer, createKeyboardInput, createVirtualJoystick, startLoopDriver
} from '@automata/engine/browser'
import { createBrowserAudio, createOverlayScene, type View } from '@automata/game-kit'
import './style.css'
import { registerSounds } from './audio/sounds'
import { createGameplay } from './game/gameplay'
import { createRng } from './sim/rng'
import { createGameStore } from './state/root'
import type { SceneId } from './state/actions'
import { createHud } from './ui/hud'
import { createTitle } from './ui/title'
import { createUpgrade } from './ui/upgrade'
import { createDefeat, createPauseOverlay, createVictory } from './ui/overlays'

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
    try { cleanup.dispose() } catch (error) { console.error('Cleanup failed', error) }
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

    const renderer = createThreeRenderer()
    cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, canvas)
    cleanup.defer(() => canvasRenderer.dispose())

    const store = createGameStore({ storage: localStorageAdapter() })
    const audioRuntime = createBrowserAudio()
    cleanup.defer(() => audioRuntime.dispose())
    registerSounds(audioRuntime.audio)
    audioRuntime.audio.setMasterVolume(0.7)
    window.addEventListener('pointerdown', audioRuntime.resume, { once: true })
    cleanup.defer(() => window.removeEventListener('pointerdown', audioRuntime.resume))
    const onOverlayClick = (event: MouseEvent): void => {
      if ((event.target as HTMLElement).closest('button')) audioRuntime.audio.play('uiClick')
    }
    overlays.addEventListener('click', onOverlayClick)
    cleanup.defer(() => overlays.removeEventListener('click', onOverlayClick))

    const joystickBase = document.createElement('div')
    joystickBase.className = 'joystick'
    app.append(joystickBase)
    cleanup.defer(() => joystickBase.remove())
    const inputs: InputSource[] = [createKeyboardInput(window), createVirtualJoystick(joystickBase)]
    for (const input of inputs) cleanup.defer(() => input.dispose())

    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    const game = createGameplay({
      store, render: renderer.port, rng: createRng(seed), audio: audioRuntime.audio, inputSources: inputs
    })
    cleanup.defer(() => game.dispose())

    const hud = createHud(store)
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
      upgrade: overlayScene(() => createUpgrade(store)),
      victory: overlayScene(() => createVictory(store)),
      defeat: overlayScene(() => createDefeat(store))
    }
    const sceneManager = createSceneManager(store, (state) => state.scene, scenes)
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
      fixedUpdate: (dt) => game.fixedUpdate(dt),
      render: (alpha, frameDt) => {
        game.render(alpha, frameDt)
        canvasRenderer.renderFrame()
      }
    })
    const loopDriver = startLoopDriver(loop, () => {
      if (store.getState().scene === 'playing') store.dispatch({ type: 'paused' })
    })
    cleanup.defer(() => loopDriver.stop())
  } catch (error) {
    dispose()
    app.replaceChildren(bootError(error))
  }
}

void main()
