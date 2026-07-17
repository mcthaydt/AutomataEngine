import { createThreeRenderer } from '@automata/engine'
import { attachCanvasRenderer } from '@automata/engine/browser'
import { composePacks, createGameHost, createProjectReader, loadComposition, startGameLoop } from '@automata/game-kit'
import { resolvePacks } from '@automata/pack-registry'
import { createGameplay } from './game/gameplay'
import { loadProject } from './project/load'
import type { SimControl, SimState } from './sim/sim'

const STATUS_TEXT: Record<SimState['status'], string> = {
  running: 'Reach the beacon',
  succeeded: 'Beacon reached!',
  failed: 'Too late — the light went out'
}

function keyboardControl(target: Window): () => SimControl {
  const pressed = new Set<string>()
  target.addEventListener('keydown', (event) => pressed.add(event.key.toLowerCase()))
  target.addEventListener('keyup', (event) => pressed.delete(event.key.toLowerCase()))
  const axis = (negative: string[], positive: string[]): number => {
    const held = (keys: string[]): boolean => keys.some((key) => pressed.has(key))
    return (held(positive) ? 1 : 0) - (held(negative) ? 1 : 0)
  }
  return () => ({
    x: axis(['a', 'arrowleft'], ['d', 'arrowright']),
    z: axis(['w', 'arrowup'], ['s', 'arrowdown'])
  })
}

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')
  const host = createGameHost(app)
  try {
    const compiled = await loadProject(createProjectReader())
    // Data-driven pack composition: the manifest chooses packs; no game code changes per pack.
    const composition = await loadComposition(createProjectReader())
    const packs = resolvePacks(composition.packs.map((entry) => entry.id))
    const configs = Object.fromEntries(composition.packs.map((entry) => [entry.id, entry.config]))
    const hud = document.createElement('div')
    hud.className = 'hud'
    app.append(hud)
    host.cleanup.defer(() => hud.remove())

    const renderer = createThreeRenderer()
    host.cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, host.canvas)
    host.cleanup.defer(() => canvasRenderer.dispose())
    const runtime = composePacks(packs, configs).boot({ host, render: renderer.port })
    const control = keyboardControl(window)
    const game = createGameplay({
      compiled,
      render: renderer.port,
      control: () => control(),
      objectiveGate: () => runtime.objectivesComplete()
    })

    hud.textContent = STATUS_TEXT.running
    startGameLoop({
      fixedUpdate: (dt) => {
        game.fixedUpdate(dt)
        runtime.fixedUpdate(dt, { playerPosition: { x: game.state.position.x, z: game.state.position.z } })
        hud.textContent = STATUS_TEXT[game.state.status]
      },
      render: (alpha, frameDt) => {
        game.render(alpha, frameDt)
        runtime.render(alpha)
      },
      renderFrame: () => canvasRenderer.renderFrame()
    }, host.cleanup)
  } catch (error) {
    host.dispose()
    host.renderBootError(error)
  }
}

void main()
