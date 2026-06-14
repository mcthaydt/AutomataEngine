import {
  archetypeLibraryKind, attachCanvasRenderer, createKeyboardInput, createLoader,
  createRapierPhysics, createThreeRenderer, createVirtualJoystick, fetchTextViaFetch,
  GameLoop, startLoopDriver
} from '@automata/engine'
import './style.css'
import { physicsTuningKind, toPhysicsTuning } from './data/config'
import { levelKind } from './data/level'
import { createGameStore } from './state/root'
import { createGameplay } from './game/gameplay'
import { createHud } from './ui/hud'

async function main(): Promise<void> {
  const app = document.getElementById('app')!
  const canvas = document.createElement('canvas')
  canvas.tabIndex = 0
  app.appendChild(canvas)
  canvas.focus()

  const renderer = createThreeRenderer()
  const canvasRenderer = attachCanvasRenderer(renderer, canvas)
  const physics = await createRapierPhysics()
  const loader = createLoader(fetchTextViaFetch())

  const tuning = toPhysicsTuning(await loader.load(physicsTuningKind, '/data/config/physics.toml'))
  const lib = await loader.load(archetypeLibraryKind, '/data/archetypes/standard.yaml')
  const level = await loader.load(levelKind, '/data/levels/w1-l1.json')

  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: level.id })

  const joystickBase = document.createElement('div')
  joystickBase.className = 'joystick'
  app.appendChild(joystickBase)
  app.addEventListener('pointerdown', () => canvas.focus())
  const inputSources = [createKeyboardInput(window), createVirtualJoystick(joystickBase)]

  const game = createGameplay({ store, physics, render: renderer.port, lib, level, tuning, inputSources })
  const hud = createHud(store, level.timeLimitS)
  app.appendChild(hud.element)

  const loop = new GameLoop({
    fixedUpdate: (dt) => game.fixedUpdate(dt),
    render: (alpha) => { game.render(alpha); canvasRenderer.renderFrame() }
  })
  startLoopDriver(loop)
}

void main()
