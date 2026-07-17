import {
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
  gameId: 'first-light',
  label: 'First Light',
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
  if (!scene) return [{ severity: 'error', code: 'first-light.scene', message: `Missing entry scene "${sceneId}"` }]

  const spawns = scene.entities.filter((entity) =>
    entity.components.some((component) => component.typeId === GAME_TYPE_IDS.spawnPoint))
  if (spawns.length !== 1) {
    issues.push({
      severity: 'error',
      code: 'first-light.spawnPoint',
      message: `Expected exactly one spawn point, found ${spawns.length}`,
      sceneId
    })
  }

  const tuningDoc = Object.values(snapshot.resources).find((doc) => doc.typeId === GAME_TYPE_IDS.tuning)
  if (tuningDoc) {
    const data = tuningDoc.data as { arenaHalf: number; goal: { x: number; z: number } }
    if (Math.abs(data.goal.x) > data.arenaHalf || Math.abs(data.goal.z) > data.arenaHalf) {
      issues.push({
        severity: 'error',
        code: 'first-light.goal',
        message: 'Goal must lie inside the arena',
        resourceId: tuningDoc.id
      })
    }
  }
  return issues
}
