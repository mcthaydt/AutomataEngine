/**
 * Generated `src/` and `scripts/` modules. Only string literals embed the game
 * slug/label; identifiers stay generic so generated code reads the same in
 * every game and diffs cleanly against the template it came from.
 */

export function indexTs(): string {
  return `export { projectDefinition } from './project/definition'
export { GAME_TYPE_IDS, type CompiledProject } from './project/types'
`
}

export function viteEnvDts(): string {
  return '/// <reference types="vite/client" />\n'
}

export function simTs(): string {
  return `/** Authored movement/goal tuning compiled from the project's tuning resource. */
export interface SimTuning {
  arenaHalf: number
  moveSpeed: number
  goal: { x: number; z: number }
  goalRadius: number
  timeLimitS: number
}

/** Move intent; magnitudes above 1 are scaled down, never up. */
export interface SimControl {
  x: number
  z: number
}

export interface SimState {
  position: { x: number; z: number }
  elapsedS: number
  status: 'running' | 'succeeded' | 'failed'
}

export function createInitialState(spawn: { x: number; z: number }): SimState {
  return { position: { x: spawn.x, z: spawn.z }, elapsedS: 0, status: 'running' }
}

const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value))

/** Advance one fixed step. Pure and deterministic: no clocks, RNG, or DOM. */
export function step(state: SimState, control: SimControl, dt: number, tuning: SimTuning): SimState {
  if (state.status !== 'running') return state
  const magnitude = Math.hypot(control.x, control.z)
  const speed = magnitude > 1 ? tuning.moveSpeed / magnitude : tuning.moveSpeed
  const position = {
    x: clamp(state.position.x + control.x * speed * dt, tuning.arenaHalf),
    z: clamp(state.position.z + control.z * speed * dt, tuning.arenaHalf)
  }
  const elapsedS = state.elapsedS + dt
  const distance = Math.hypot(tuning.goal.x - position.x, tuning.goal.z - position.z)
  const status = distance <= tuning.goalRadius ? 'succeeded' : elapsedS >= tuning.timeLimitS ? 'failed' : 'running'
  return { position, elapsedS, status }
}

/** Scripted control that walks straight at the goal; drives headless evaluation. */
export function seekGoal(state: SimState, tuning: SimTuning): SimControl {
  const dx = tuning.goal.x - state.position.x
  const dz = tuning.goal.z - state.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1e-9) return { x: 0, z: 0 }
  return { x: dx / distance, z: dz / distance }
}
`
}

export function gameplayTs(): string {
  return `import type { Quat, RenderPort, Vec3 } from '@automata/engine'
import type { CompiledProject } from '../project/types'
import { createInitialState, step, type SimControl, type SimState } from '../sim/sim'

export interface GameplayDeps {
  compiled: CompiledProject
  render: RenderPort
  /** Sampled once per fixed step. */
  control(state: SimState): SimControl
}

export interface Gameplay {
  readonly state: SimState
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt?: number): void
  dispose(): void
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 }

/** Wire the pure sim to the engine render port; shared by browser boot and editor preview. */
export function createGameplay(deps: GameplayDeps): Gameplay {
  const { compiled, render } = deps
  const { tuning, colors } = compiled
  let state = createInitialState(compiled.spawn)

  const floor = { id: 'floor' }
  const goal = { id: 'goal' }
  const player = { id: 'player' }
  const playerPose = (): Vec3 => ({ x: state.position.x, y: 0.5, z: state.position.z })

  render.add(floor, {
    primitive: 'box',
    size: { x: tuning.arenaHalf * 2, y: 0.3, z: tuning.arenaHalf * 2 },
    color: colors.floor
  })
  render.setPose(floor, { x: 0, y: -0.15, z: 0 }, IDENTITY)
  render.add(goal, { primitive: 'cylinder', radius: tuning.goalRadius, height: 0.2, color: colors.goal })
  render.setPose(goal, { x: tuning.goal.x, y: 0.1, z: tuning.goal.z }, IDENTITY)
  render.add(player, { primitive: 'sphere', radius: 0.5, color: colors.player })
  render.setPose(player, playerPose(), IDENTITY)
  render.setCamera({ x: 0, y: tuning.arenaHalf * 1.5, z: tuning.arenaHalf * 1.9 }, { x: 0, y: 0, z: 0 })

  return {
    get state() { return state },
    fixedUpdate(dt) {
      state = step(state, deps.control(state), dt, tuning)
    },
    render() {
      render.setPose(player, playerPose(), IDENTITY)
    },
    dispose() {
      render.remove(floor)
      render.remove(goal)
      render.remove(player)
    }
  }
}
`
}

export function mainTs(name: string): string {
  return `import { GameLoop, createThreeRenderer } from '@automata/engine'
import { attachCanvasRenderer, startLoopDriver } from '@automata/engine/browser'
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

  const compiled = await loadProject({
    async readText(path) {
      const response = await fetch(new URL(\`project/\${path}\`, document.baseURI))
      if (!response.ok) throw new Error(\`Project request failed (\${response.status}): \${path}\`)
      return response.text()
    }
  })

  const canvas = document.createElement('canvas')
  app.append(canvas)
  const hud = document.createElement('div')
  hud.className = 'hud'
  app.append(hud)

  const renderer = createThreeRenderer()
  const canvasRenderer = await attachCanvasRenderer(renderer, canvas)
  const control = keyboardControl(window)
  const game = createGameplay({ compiled, render: renderer.port, control: () => control() })

  const loop = new GameLoop({
    fixedUpdate: (dt) => {
      game.fixedUpdate(dt)
      hud.textContent = STATUS_TEXT[game.state.status]
    },
    render: (alpha, frameDt) => {
      game.render(alpha, frameDt)
      canvasRenderer.renderFrame()
    }
  })
  hud.textContent = STATUS_TEXT.running
  startLoopDriver(loop, () => {})
}

void main().catch((error: unknown) => {
  const app = document.getElementById('app')
  if (app) app.textContent = \`Failed to start ${name}: \${error instanceof Error ? error.message : String(error)}\`
})
`
}

export function validateProjectScript(name: string): string {
  return `import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadProjectFiles, validateProject } from '@automata/project'
import { projectDefinition } from '../src/project/definition'

/**
 * Build-time gate: load the shipped public project, validate and compile it,
 * print structured errors to stderr, and exit non-zero on any error.
 */
const root = resolve(import.meta.dirname, '../public/project')
const snapshot = await loadProjectFiles({ readText: (path) => readFile(resolve(root, path), 'utf8') })

const errors = validateProject(projectDefinition, snapshot).filter((issue) => issue.severity === 'error')
if (errors.length > 0) {
  for (const issue of errors) process.stderr.write(\`\${issue.code} \${issue.pointer ?? ''} \${issue.message}\\n\`)
  process.exit(1)
}

projectDefinition.compile(snapshot)
process.stdout.write('${name} project OK\\n')
`
}

export function generateProjectScript(): string {
  return `import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createTemplate } from '../src/project/template'

/** Regenerate public/project from the in-code template — the sanctioned edit path. */
const root = resolve(import.meta.dirname, '../public/project')
const snapshot = createTemplate()

const files: Array<[string, unknown]> = [['automata.project.json', snapshot.manifest]]
for (const scene of snapshot.manifest.scenes) files.push([scene.path, snapshot.scenes[scene.id]])
for (const resource of snapshot.manifest.resources) files.push([resource.path, snapshot.resources[resource.id]])

for (const [path, value] of files) {
  const target = resolve(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, \`\${JSON.stringify(value, null, 2)}\\n\`)
}
process.stdout.write(\`\${files.length} project files written\\n\`)
`
}
