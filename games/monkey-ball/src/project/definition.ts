import {
  defineGameProject,
  type ComponentTypeRegistration,
  type GameProjectDefinition,
  type ProjectSnapshot,
  type ResourceTypeRegistration,
  type ValidationIssue
} from '@automata/project'
import { compileMonkeyBallProject } from './compiler'
import { createMonkeyBallTemplate } from './template'
import { MONKEY_BALL_TYPE_IDS, type CompiledMonkeyBallProject } from './types'

const vec3Array = {
  kind: 'array' as const,
  presentation: 'list' as const,
  item: { kind: 'vec3' as const }
}

const spawn: ComponentTypeRegistration = {
  typeId: MONKEY_BALL_TYPE_IDS.spawn,
  label: 'Spawn',
  schema: {
    kind: 'object',
    fields: [
      { key: 'timeLimitS', label: 'Time Limit (s)', kind: 'number', required: true, min: 1 },
      { key: 'fallY', label: 'Fall Height', kind: 'number', required: true }
    ]
  },
  defaultData: { timeLimitS: 60, fallY: -10 },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#ff5964' }
}

const goal: ComponentTypeRegistration = {
  typeId: MONKEY_BALL_TYPE_IDS.goal,
  label: 'Goal',
  schema: { kind: 'object', fields: [] },
  defaultData: {},
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#4ecdc4' }
}

const archetype: ComponentTypeRegistration = {
  typeId: MONKEY_BALL_TYPE_IDS.archetype,
  label: 'Archetype',
  schema: {
    kind: 'object',
    fields: [
      {
        key: 'archetypeId', label: 'Archetype', kind: 'enum', required: true,
        values: ['banana', 'bumper', 'moving-platform']
      },
      {
        key: 'overrides', label: 'Overrides', kind: 'object', required: true,
        fields: [
          {
            key: 'movingPlatform', label: 'Moving Platform', kind: 'object', required: false,
            fields: [
              { key: 'waypoints', label: 'Waypoints', ...vec3Array, required: true },
              { key: 'speed', label: 'Speed', kind: 'number', required: true, min: 0 },
              { key: 'mode', label: 'Mode', kind: 'enum', required: true, values: ['loop', 'pingpong'] }
            ]
          },
          {
            key: 'renderable', label: 'Renderable', kind: 'object', required: false,
            fields: [
              { key: 'radius', label: 'Radius', kind: 'number', required: false, min: 0 },
              { key: 'height', label: 'Height', kind: 'number', required: false, min: 0 }
            ]
          },
          {
            key: 'rigidBody', label: 'Rigid Body', kind: 'object', required: false,
            fields: [{
              key: 'shape', label: 'Shape', kind: 'object', required: true,
              fields: [
                { key: 'type', label: 'Type', kind: 'enum', required: true, values: ['cylinder'] },
                { key: 'halfHeight', label: 'Half Height', kind: 'number', required: true, min: 0 },
                { key: 'radius', label: 'Radius', kind: 'number', required: true, min: 0 }
              ]
            }]
          }
        ]
      }
    ]
  },
  defaultData: { archetypeId: 'banana', overrides: {} },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#ffd23f' }
}

const physics: ResourceTypeRegistration = {
  typeId: MONKEY_BALL_TYPE_IDS.physics,
  label: 'Physics',
  singleton: true,
  schema: {
    kind: 'object',
    fields: [
      { key: 'maxTiltRad', label: 'Max Tilt (rad)', kind: 'number', required: true, min: 0, max: Math.PI / 4 },
      { key: 'tiltSmooth', label: 'Tilt Smoothing', kind: 'number', required: true, min: 0, max: 1 },
      { key: 'gravity', label: 'Gravity', kind: 'number', required: true, min: 0 },
      {
        key: 'ball', label: 'Ball', kind: 'object', required: true,
        fields: [
          { key: 'radius', label: 'Radius', kind: 'number', required: true, min: 0 },
          { key: 'friction', label: 'Friction', kind: 'number', required: true, min: 0 }
        ]
      }
    ]
  },
  defaultData: createMonkeyBallTemplate().resources.physics!.data as Record<string, unknown>
}

const worlds: ResourceTypeRegistration = {
  typeId: MONKEY_BALL_TYPE_IDS.worlds,
  label: 'Worlds',
  singleton: true,
  schema: {
    kind: 'object',
    fields: [{
      key: 'worlds', label: 'Worlds', kind: 'array', presentation: 'list', minItems: 1,
      item: {
        kind: 'object',
        fields: [
          { key: 'id', label: 'ID', kind: 'string', required: true },
          { key: 'name', label: 'Name', kind: 'string', required: true },
          {
            key: 'levels', label: 'Levels', kind: 'array', presentation: 'list', minItems: 1,
            item: { kind: 'string' }
          }
        ]
      }
    }]
  },
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
