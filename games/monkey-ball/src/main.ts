import {
  GameLoop,
  attachCanvasRenderer,
  createKeyboardInput,
  createLoader,
  createRapierPhysics,
  createSceneManager,
  createThreeRenderer,
  createVirtualJoystick,
  createWebAudio,
  fetchTextViaFetch,
  localStorageAdapter,
  startLoopDriver,
  subscribeSelector,
  type InputSource,
  type PhysicsPort,
  type Scene
} from '@automata/engine'
import './style.css'
import { registerSounds } from './audio/sounds'
import { levelKind } from './data/level'
import { createGameplay, type Gameplay } from './game/gameplay'
import { loadBootData, type BootData } from './scenes/boot'
import { shouldMountLoadedLevel } from './scenes/levelLifecycle'
import { createGameStore } from './state/root'
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
  const app = document.getElementById('app')!
  const canvas = document.createElement('canvas')
  app.appendChild(canvas)
  const overlays = document.createElement('div')
  overlays.id = 'overlays'
  app.appendChild(overlays)

  const renderer = createThreeRenderer()
  const canvasRenderer = attachCanvasRenderer(renderer, canvas)
  const loader = createLoader(fetchTextViaFetch())
  const store = createGameStore({ storage: localStorageAdapter() })
  const audioContext = new AudioContext()
  const audio = createWebAudio(audioContext)
  registerSounds(audio)
  audio.setMasterVolume(store.getState().settings.volume)
  subscribeSelector(store, (state) => state.settings.volume, (volume) => audio.setMasterVolume(volume))
  overlays.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button')) audio.play('uiClick')
  })
  window.addEventListener('pointerdown', () => { void audioContext.resume() }, { once: true })

  let physics: PhysicsPort
  let boot: BootData
  try {
    physics = await createRapierPhysics()
    boot = await loadBootData(loader)
  } catch (error) {
    overlays.append(bootError(error))
    return
  }
  const { tuning, lib, manifest } = boot

  let active: {
    game: Gameplay
    hud: View
    joystickBase: HTMLElement
    inputs: InputSource[]
  } | null = null

  async function enterLevel(levelId: string): Promise<void> {
    const level = await loader.load(levelKind, `/data/levels/${levelId}.json`)
    if (!shouldMountLoadedLevel(store.getState(), levelId, active !== null)) return

    const joystickBase = document.createElement('div')
    joystickBase.className = `joystick ${store.getState().settings.joystickSide}`
    app.appendChild(joystickBase)
    const inputs: InputSource[] = [
      createKeyboardInput(window),
      createVirtualJoystick(joystickBase)
    ]
    const game = createGameplay({
      store,
      physics,
      render: renderer.port,
      audio,
      lib,
      level,
      tuning,
      inputSources: inputs
    })
    const hud = createHud(store, level.timeLimitS)
    app.appendChild(hud.element)
    active = { game, hud, joystickBase, inputs }
  }

  function leaveLevel(): void {
    if (!active) return
    active.game.dispose()
    active.hud.dispose()
    active.joystickBase.remove()
    for (const input of active.inputs) input.dispose()
    active = null
  }

  subscribeSelector(store, (state) => state.scene, (scene) => {
    if (scene === 'playing' && active === null) {
      void enterLevel(store.getState().session.levelId!)
    } else if ((scene === 'menu' || scene === 'levelSelect') && active !== null) {
      leaveLevel()
    }
  })

  const overlayScene = (make: () => View): Scene => {
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

  const scenes: Record<string, Scene> = {
    boot: {},
    playing: {},
    menu: overlayScene(() => createMenu(store)),
    levelSelect: overlayScene(() => createLevelSelect(store, manifest)),
    paused: overlayScene(() => createPauseOverlay(store)),
    levelComplete: overlayScene(() => createLevelComplete(store)),
    gameOver: overlayScene(() => createGameOver(store))
  }
  createSceneManager(store, (state) => state.scene, scenes).start()

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const scene = store.getState().scene
    if (scene === 'playing') store.dispatch({ type: 'paused' })
    else if (scene === 'paused') store.dispatch({ type: 'resumed' })
  })

  const loop = new GameLoop({
    fixedUpdate: (dt) => active?.game.fixedUpdate(dt),
    render: (alpha) => {
      active?.game.render(alpha)
      canvasRenderer.renderFrame()
    }
  })
  startLoopDriver(loop, () => store.dispatch({ type: 'paused' }))

  store.dispatch({ type: 'bootCompleted' })
}

void main()
