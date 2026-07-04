import {
  defineGameProject, listOf, vec3, z,
  type ComponentTypeInput,
  type GameProjectDefinition,
  type ProjectSnapshot,
  type ResourceTypeInput,
  type ValidationIssue
} from '@automata/project'
import { compileMonkeyBallProject } from './compiler'
import { createMonkeyBallTemplate } from './template'
import { MONKEY_BALL_TYPE_IDS, type CompiledMonkeyBallProject } from './types'

const spawn: ComponentTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.spawn,
  label: 'Spawn',
  schema: z.strictObject({
    timeLimitS: z.number().min(1).meta({ label: 'Time Limit (s)' }),
    fallY: z.number().meta({ label: 'Fall Height' })
  }),
  defaultData: { timeLimitS: 60, fallY: -10 },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#ff5964' }
}

const goal: ComponentTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.goal,
  label: 'Goal',
  schema: z.strictObject({}),
  defaultData: {},
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#4ecdc4' }
}

const archetype: ComponentTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.archetype,
  label: 'Archetype',
  schema: z.strictObject({
    archetypeId: z.enum(['banana', 'bumper', 'moving-platform']).meta({ label: 'Archetype' }),
    overrides: z.strictObject({
      movingPlatform: z.strictObject({
        waypoints: listOf(vec3(), { label: 'Waypoints' }),
        speed: z.number().min(0).meta({ label: 'Speed' }),
        mode: z.enum(['loop', 'pingpong']).meta({ label: 'Mode' })
      }).meta({ label: 'Moving Platform' }).optional(),
      renderable: z.strictObject({
        radius: z.number().min(0).meta({ label: 'Radius' }).optional(),
        height: z.number().min(0).meta({ label: 'Height' }).optional()
      }).meta({ label: 'Renderable' }).optional(),
      rigidBody: z.strictObject({
        shape: z.strictObject({
          type: z.enum(['cylinder']).meta({ label: 'Type' }),
          halfHeight: z.number().min(0).meta({ label: 'Half Height' }),
          radius: z.number().min(0).meta({ label: 'Radius' })
        }).meta({ label: 'Shape' })
      }).meta({ label: 'Rigid Body' }).optional()
    }).meta({ label: 'Overrides' })
  }),
  defaultData: { archetypeId: 'banana', overrides: {} },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#ffd23f' }
}

const physics: ResourceTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.physics,
  label: 'Physics',
  singleton: true,
  schema: z.strictObject({
    maxTiltRad: z.number().min(0).max(Math.PI / 4).meta({ label: 'Max Tilt (rad)' }),
    tiltSmooth: z.number().min(0).max(1).meta({ label: 'Tilt Smoothing' }),
    gravity: z.number().min(0).meta({ label: 'Gravity' }),
    ball: z.strictObject({
      radius: z.number().min(0).meta({ label: 'Radius' }),
      friction: z.number().min(0).meta({ label: 'Friction' })
    }).meta({ label: 'Ball' })
  }),
  defaultData: createMonkeyBallTemplate().resources.physics!.data as Record<string, unknown>
}

const worlds: ResourceTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.worlds,
  label: 'Worlds',
  singleton: true,
  schema: z.strictObject({
    worlds: listOf(z.strictObject({
      id: z.string().meta({ label: 'ID' }),
      name: z.string().meta({ label: 'Name' }),
      levels: listOf(z.string(), { label: 'Levels', minItems: 1 }).optional()
    }), { label: 'Worlds', minItems: 1 }).optional()
  }),
  defaultData: createMonkeyBallTemplate().resources.worlds!.data as Record<string, unknown>
}

export const monkeyBallProjectDefinition: GameProjectDefinition<CompiledMonkeyBallProject> = defineGameProject({
  gameId: 'monkey-ball',
  label: 'Monkey Ball',
  createTemplate: createMonkeyBallTemplate,
  components: [spawn, goal, archetype],
  resources: [physics, worlds],
  validate: validateMonkeyBallProject,
  compile: compileMonkeyBallProject
})

function validateMonkeyBallProject(snapshot: ProjectSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const referenced = new Set<string>()
  const manifest = Object.values(snapshot.resources).find((resource) => resource.typeId === MONKEY_BALL_TYPE_IDS.worlds)
    ?.data as { worlds?: Array<{ id: string; levels: string[] }> } | undefined
  for (const world of manifest?.worlds ?? []) {
    for (const levelId of world.levels) {
      if (referenced.has(levelId)) issues.push(error('monkey-ball.levelDuplicate', `Level "${levelId}" appears more than once`))
      referenced.add(levelId)
      if (!snapshot.scenes[levelId]) issues.push(error('monkey-ball.levelMissing', `World references missing scene "${levelId}"`))
    }
  }

  for (const sceneEntry of snapshot.manifest.scenes) {
    const scene = snapshot.scenes[sceneEntry.id]
    if (!scene) continue
    if (!referenced.has(scene.id)) issues.push(error('monkey-ball.levelUnlisted', `Scene "${scene.id}" is not listed in Worlds`, scene.id))
    const count = (typeId: string) => scene.entities.filter((entity) => entity.components.some((component) => component.typeId === typeId)).length
    if (count(MONKEY_BALL_TYPE_IDS.spawn) !== 1) issues.push(error('monkey-ball.spawn', `Scene "${scene.id}" requires exactly one spawn`, scene.id))
    if (count(MONKEY_BALL_TYPE_IDS.goal) !== 1) issues.push(error('monkey-ball.goal', `Scene "${scene.id}" requires exactly one goal`, scene.id))
    if (count('core.primitive') < 1) issues.push(error('monkey-ball.geometry', `Scene "${scene.id}" requires geometry`, scene.id))
  }
  return issues
}

function error(code: string, message: string, sceneId?: string): ValidationIssue {
  return { severity: 'error', code, message, ...(sceneId ? { sceneId } : {}) }
}
