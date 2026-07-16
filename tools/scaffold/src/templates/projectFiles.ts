/** Generated `src/project/` modules: the game's authoring surface. */

export function typesTs(name: string): string {
  return `import type { SimTuning } from '../sim/sim'

/** Stable type ids for this game's authoring components and resources. */
export const GAME_TYPE_IDS = {
  spawnPoint: '${name}.spawn-point',
  tuning: '${name}.tuning'
} as const

/** Pure output of project compilation, shared by browser and headless runtimes. */
export interface CompiledProject {
  projectId: string
  sceneId: string
  spawn: { x: number; z: number }
  tuning: SimTuning
  colors: { floor: string; player: string; goal: string }
}
`
}

export function templateTs(snapshotJson: string): string {
  return `import type { ProjectSnapshot } from '@automata/project'

/**
 * The default authored project, in memory. \`public/project\` is generated from
 * this template (npm run generate:project); the content test keeps them equal.
 */
const TEMPLATE: ProjectSnapshot = ${snapshotJson}

export function createTemplate(): ProjectSnapshot {
  return structuredClone(TEMPLATE)
}
`
}

export function compilerTs(): string {
  return `import { CORE_TYPE_IDS, type ProjectSnapshot } from '@automata/project'
import { GAME_TYPE_IDS, type CompiledProject } from './types'

interface TuningData {
  arenaHalf: number
  moveSpeed: number
  goal: { x: number; z: number }
  goalRadius: number
  timeLimitS: number
  colors: { floor: string; player: string; goal: string }
}

/** Pure transform from a validated snapshot to the runtime config. */
export function compileProject(snapshot: ProjectSnapshot): CompiledProject {
  const sceneId = snapshot.manifest.entrySceneId
  const scene = snapshot.scenes[sceneId]
  if (!scene) throw new Error(\`Missing entry scene "\${sceneId}"\`)

  const spawnEntity = scene.entities.find((entity) =>
    entity.components.some((component) => component.typeId === GAME_TYPE_IDS.spawnPoint))
  if (!spawnEntity) throw new Error('Missing spawn point entity')
  const transform = spawnEntity.components.find((component) => component.typeId === CORE_TYPE_IDS.transform)
  if (!transform) throw new Error('Spawn point entity has no transform')
  const { position } = transform.data as { position: { x: number; z: number } }

  const resource = Object.values(snapshot.resources).find((doc) => doc.typeId === GAME_TYPE_IDS.tuning)
  if (!resource) throw new Error('Missing tuning resource')
  const data = resource.data as TuningData

  return {
    projectId: snapshot.manifest.id,
    sceneId,
    spawn: { x: position.x, z: position.z },
    tuning: {
      arenaHalf: data.arenaHalf,
      moveSpeed: data.moveSpeed,
      goal: { x: data.goal.x, z: data.goal.z },
      goalRadius: data.goalRadius,
      timeLimitS: data.timeLimitS
    },
    colors: { ...data.colors }
  }
}
`
}

export function definitionTs(name: string, label: string): string {
  return `import {
  color, defineGameProject, z,
  type ComponentTypeInput, type GameProjectDefinition,
  type ProjectSnapshot, type ResourceTypeInput, type ValidationIssue
} from '@automata/project'
import { compileProject } from './compiler'
import { createTemplate } from './template'
import { GAME_TYPE_IDS, type CompiledProject } from './types'

const num = (label: string, min = 0) => z.number().min(min).meta({ label })

const spawnPoint: ComponentTypeInput = {
  typeId: GAME_TYPE_IDS.spawnPoint,
  label: 'Spawn Point',
  schema: z.strictObject({}),
  defaultData: {},
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#27e0ff' }
}

const tuning: ResourceTypeInput = {
  typeId: GAME_TYPE_IDS.tuning,
  label: 'Tuning',
  singleton: true,
  schema: z.strictObject({
    arenaHalf: num('Arena Half-Extent', 1),
    moveSpeed: num('Move Speed'),
    goal: z.strictObject({
      x: z.number().meta({ label: 'X' }),
      z: z.number().meta({ label: 'Z' })
    }).meta({ label: 'Goal' }),
    goalRadius: num('Goal Radius'),
    timeLimitS: num('Time Limit (s)'),
    colors: z.strictObject({
      floor: color({ label: 'Floor' }),
      player: color({ label: 'Player' }),
      goal: color({ label: 'Goal' })
    }).meta({ label: 'Colors' })
  }),
  defaultData: createTemplate().resources.tuning!.data as Record<string, unknown>
}

/**
 * The project definition: authoring component/resource schemas plus pure
 * validate/compile. Runtime-safe (no editor/engine UI imports) so headless
 * hosts and the shipped game can both depend on it.
 */
export const projectDefinition: GameProjectDefinition<CompiledProject> = defineGameProject<CompiledProject>({
  gameId: '${name}',
  label: '${label}',
  createTemplate,
  components: [spawnPoint],
  resources: [tuning],
  validate: validateSnapshot,
  compile: compileProject
})

function validateSnapshot(snapshot: ProjectSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const sceneId = snapshot.manifest.entrySceneId
  const scene = snapshot.scenes[sceneId]
  if (!scene) return [{ severity: 'error', code: '${name}.scene', message: \`Missing entry scene "\${sceneId}"\` }]

  const spawns = scene.entities.filter((entity) =>
    entity.components.some((component) => component.typeId === GAME_TYPE_IDS.spawnPoint))
  if (spawns.length !== 1) {
    issues.push({
      severity: 'error',
      code: '${name}.spawnPoint',
      message: \`Expected exactly one spawn point, found \${spawns.length}\`,
      sceneId
    })
  }

  const tuningDoc = Object.values(snapshot.resources).find((doc) => doc.typeId === GAME_TYPE_IDS.tuning)
  if (tuningDoc) {
    const data = tuningDoc.data as { arenaHalf: number; goal: { x: number; z: number } }
    if (Math.abs(data.goal.x) > data.arenaHalf || Math.abs(data.goal.z) > data.arenaHalf) {
      issues.push({
        severity: 'error',
        code: '${name}.goal',
        message: 'Goal must lie inside the arena',
        resourceId: tuningDoc.id
      })
    }
  }
  return issues
}
`
}

export function evaluationTs(): string {
  return `import { emptyComposition, type CompositionManifest } from '@automata/contracts'
import { resolveEvalHooks } from '@automata/pack-registry'
import type { ProjectSnapshot } from '@automata/project'
import { createInitialState, seekGoal, step, type SimControl, type SimState } from '../sim/sim'
import { compileProject } from './compiler'

export interface EvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}

const seekPoint = (state: SimState, target: { x: number; z: number }): SimControl => {
  const dx = target.x - state.position.x
  const dz = target.z - state.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1e-9) return { x: 0, z: 0 }
  return { x: dx / distance, z: dz / distance }
}

/** Composition-aware normalized evaluation used by editor, agent, and MCP hosts. */
export async function evaluateProject(
  snapshot: ProjectSnapshot,
  opts: { maxSteps: number },
  composition: CompositionManifest = emptyComposition(snapshot.manifest.gameId)
): Promise<EvaluationResult> {
  const compiled = compileProject(snapshot)
  const dt = 1 / 60
  const maxSteps = Math.max(0, Math.floor(opts.maxSteps))
  const hooks = resolveEvalHooks(composition)
  const hookStates = hooks.map((hook) => hook.createState())
  const hooksComplete = (): boolean => hooks.every((hook, index) => hook.complete(hookStates[index]))

  let state = createInitialState(compiled.spawn)
  let steps = 0
  while (steps < maxSteps && state.status === 'running') {
    let target: { x: number; z: number } | null = null
    for (let index = 0; index < hooks.length && target === null; index += 1) {
      target = hooks[index]!.nextTarget(hookStates[index], state.position)
    }
    const control = target ? seekPoint(state, target) : seekGoal(state, compiled.tuning)
    let next = step(state, control, dt, compiled.tuning)
    if (next.status === 'succeeded' && !hooksComplete()) next = { ...next, status: 'running' }
    state = next
    for (let index = 0; index < hooks.length; index += 1) {
      hookStates[index] = hooks[index]!.step(hookStates[index], state.position)
    }
    steps += 1
  }

  const objectivesComplete = hooksComplete()
  const outcome = state.status === 'succeeded' ? 'passed' : state.status === 'failed' ? 'failed' : 'incomplete'
  const score = outcome === 'passed' ? Math.max(0, 1 - state.elapsedS / compiled.tuning.timeLimitS) : 0
  const distanceToGoal = Math.hypot(
    compiled.tuning.goal.x - state.position.x,
    compiled.tuning.goal.z - state.position.z
  )
  return {
    outcome,
    score,
    metrics: { status: state.status, elapsedS: state.elapsedS, distanceToGoal, objectivesComplete },
    steps
  }
}
`
}

export function editorTs(): string {
  return `import type { EditorProjectRegistration, EditorRegistrationLoader, ProjectPlayHandle } from '@automata/editor'
import { emptyComposition, parseCompositionManifest } from '@automata/contracts'
import { CORE_TYPE_IDS } from '@automata/project'
import { resolveEditorContributions } from '@automata/pack-registry'
import { createGameplay } from '../game/gameplay'
import { seekGoal } from '../sim/sim'
import { projectDefinition } from './definition'
import { evaluateProject } from './evaluation'
import { GAME_TYPE_IDS, type CompiledProject } from './types'

/** Declarative authoring registration; the shared editor UI supplies all DOM. */
export const editorRegistration: EditorProjectRegistration<CompiledProject> = {
  project: projectDefinition,
  prefabs: [
    {
      id: 'spawn-point',
      label: 'Spawn Point',
      components: [
        {
          typeId: CORE_TYPE_IDS.transform,
          data: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
        },
        { typeId: GAME_TYPE_IDS.spawnPoint, data: {} }
      ]
    }
  ],
  preview: {
    create(compiled, _sceneId, render): ProjectPlayHandle {
      // The preview demonstrates the sim by walking itself to the goal.
      return createGameplay({ compiled, render, control: (state) => seekGoal(state, compiled.tuning) })
    }
  },
  evaluation: { evaluate: evaluateProject }
}

/**
 * Registry convention entry: the browser editor discovers and calls this.
 * Composition-aware: composed packs contribute prefab templates and preview
 * markers; plain scaffolds (no composition.json) load the base registration.
 */
export const loadEditorRegistration: EditorRegistrationLoader = async (deps) => {
  let text: string | null = null
  try {
    text = await deps.readText('project/composition.json')
  } catch {
    text = null
  }
  const composition = text === null
    ? emptyComposition(projectDefinition.gameId)
    : parseCompositionManifest(text)
  const contributions = resolveEditorContributions(composition)
  if (contributions.length === 0) return editorRegistration
  return {
    ...editorRegistration,
    prefabs: [
      ...editorRegistration.prefabs,
      ...contributions.flatMap(({ contribution }) => contribution.prefabs)
    ],
    preview: {
      create(compiled, sceneId, render, physics): ProjectPlayHandle {
        const previewAdapter = editorRegistration.preview!
        const packHandles = contributions.flatMap(({ contribution, config }) =>
          contribution.createPreview ? [contribution.createPreview(config, render)] : [])
        const inner = previewAdapter.create(compiled, sceneId, render, physics)
        return {
          fixedUpdate: (dt) => inner.fixedUpdate(dt),
          render: (alpha, frameDt) => {
            inner.render(alpha, frameDt)
            for (const handle of packHandles) handle.render?.(alpha)
          },
          dispose: () => {
            for (const handle of packHandles) handle.dispose()
            inner.dispose()
          }
        }
      }
    }
  }
}
`
}

export function projectIndexTs(): string {
  return `import { emptyComposition, parseCompositionManifest } from '@automata/contracts'
import type { EditorRegistrationLoader } from '@automata/editor/headless'
import { projectDefinition } from './definition'
import { evaluateProject } from './evaluation'

export { GAME_TYPE_IDS, type CompiledProject } from './types'
export { projectDefinition } from './definition'
export { compileProject } from './compiler'
export { createTemplate } from './template'
export { loadProject } from './load'
export { evaluateProject, type EvaluationResult } from './evaluation'

/**
 * Registry convention entry for Node hosts (MCP server, headless evaluation).
 * Reads composition data when present; plain scaffolds fall back to an empty
 * composition, while malformed manifests remain real errors.
 */
export const loadHeadlessRegistration: EditorRegistrationLoader = async (deps) => {
  let text: string | null = null
  try {
    text = await deps.readText('project/composition.json')
  } catch {
    text = null
  }
  const composition = text === null
    ? emptyComposition(projectDefinition.gameId)
    : parseCompositionManifest(text)
  return {
    project: projectDefinition,
    prefabs: [],
    evaluation: { evaluate: (snapshot, opts) => evaluateProject(snapshot, opts, composition) }
  }
}
`
}

export function loadTs(name: string, label: string): string {
  return `import { loadProjectFiles, validateProject, type ProjectFileReader } from '@automata/project'
import { projectDefinition } from './definition'
import type { CompiledProject } from './types'

/**
 * Runtime-safe loader: read a project folder, assert it belongs to this game,
 * validate it, and return the compiled config. Throws with every error issue's
 * code/path so boot failures are diagnosable.
 */
export async function loadProject(reader: ProjectFileReader): Promise<CompiledProject> {
  const { snapshot } = await loadProjectFiles(reader, { migrate: projectDefinition.migrate })
  if (snapshot.manifest.gameId !== '${name}') {
    throw new Error(\`Expected a ${label} project, got gameId "\${snapshot.manifest.gameId}"\`)
  }
  const errors = validateProject(projectDefinition, snapshot).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(\`Invalid ${label} project:\\n\${errors.map((issue) => \`  \${issue.code} \${issue.pointer ?? ''}\`.trimEnd()).join('\\n')}\`)
  }
  return projectDefinition.compile(snapshot)
}
`
}
