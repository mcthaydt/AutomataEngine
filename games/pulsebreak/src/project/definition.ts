import {
  defineGameProject,
  type ComponentTypeRegistration, type GameProjectDefinition,
  type ProjectSnapshot, type ResourceTypeRegistration, type ValidationIssue
} from '@automata/project'
import { compilePulsebreakProject } from './compiler'
import { createPulsebreakTemplate } from './template'
import { PULSEBREAK_TYPE_IDS, type PulsebreakCompiledProject } from './types'

/**
 * The Pulsebreak project definition: authoring component/resource schemas plus
 * pure `validate`/`compile`. It is runtime-safe (no editor/engine UI imports) so
 * the headless graph and the shipped game can both depend on it.
 */
const numberField = (key: string, label: string) => ({ key, label, kind: 'number' as const, required: true, min: 0 })
const optionalNumber = (key: string, label: string) => ({ key, label, kind: 'number' as const, required: false, min: 0 })

const playerStart: ComponentTypeRegistration = {
  typeId: PULSEBREAK_TYPE_IDS.playerStart, label: 'Player Start',
  schema: { kind: 'object', fields: [] },
  defaultData: {}, cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#27e0ff' }
}

const spawnZone: ComponentTypeRegistration = {
  typeId: PULSEBREAK_TYPE_IDS.spawnZone, label: 'Spawn Zone',
  schema: {
    kind: 'object',
    fields: [
      { key: 'mode', label: 'Mode', kind: 'enum', required: true, values: ['ring', 'point'] },
      numberField('radius', 'Radius'),
      numberField('weight', 'Weight'),
      { key: 'enemies', label: 'Enemy Types', kind: 'array', presentation: 'list', item: { kind: 'string' } },
      numberField('minSeparation', 'Min Separation'),
      numberField('edgePaddingMin', 'Edge Padding Min'),
      numberField('edgePaddingMax', 'Edge Padding Max'),
      numberField('angleJitterRad', 'Angle Jitter (rad)')
    ]
  },
  defaultData: { mode: 'ring', radius: 13, weight: 1, enemies: [], minSeparation: 0, edgePaddingMin: 1, edgePaddingMax: 3, angleJitterRad: 0.35 },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'zone', color: '#ff2e88' }
}

const tuning: ResourceTypeRegistration = {
  typeId: PULSEBREAK_TYPE_IDS.tuning, label: 'Tuning', singleton: true,
  schema: {
    kind: 'object',
    fields: [
      { key: 'arena', label: 'Arena', kind: 'object', required: true, fields: [numberField('half', 'Half'), { key: 'y', label: 'Y', kind: 'number', required: true }] },
      { key: 'camera', label: 'Camera', kind: 'object', required: true, fields: [{ key: 'eye', label: 'Eye', kind: 'vec3', required: true }, { key: 'look', label: 'Look', kind: 'vec3', required: true }] },
      {
        key: 'player', label: 'Player', kind: 'object', required: true, fields: [
          numberField('radius', 'Radius'), numberField('startHealth', 'Start Health'), numberField('baseDamage', 'Base Damage'),
          numberField('baseFireRate', 'Base Fire Rate'), numberField('baseMoveSpeed', 'Base Move Speed'), numberField('projectileSpeed', 'Projectile Speed'),
          numberField('projectileRadius', 'Projectile Radius'), numberField('range', 'Range'), numberField('invulnS', 'Invuln (s)'),
          { key: 'color', label: 'Color', kind: 'color', required: true }
        ]
      },
      numberField('projectileLifetimeS', 'Projectile Lifetime (s)')
    ]
  },
  defaultData: createPulsebreakTemplate().resources.tuning!.data as Record<string, unknown>
}

const enemyTypes: ResourceTypeRegistration = {
  typeId: PULSEBREAK_TYPE_IDS.enemyTypes, label: 'Enemy Types', singleton: true,
  schema: {
    kind: 'object',
    fields: [{
      key: 'enemies', label: 'Enemies', kind: 'array', presentation: 'table', item: {
        kind: 'object', fields: [
          { key: 'id', label: 'ID', kind: 'string', required: true },
          numberField('health', 'Health'), numberField('radius', 'Radius'), numberField('speed', 'Speed'),
          numberField('contactDamage', 'Contact Damage'), numberField('scoreValue', 'Score'),
          { key: 'color', label: 'Color', kind: 'color', required: true },
          optionalNumber('cooldownS', 'Cooldown (s)'), optionalNumber('projectileSpeed', 'Projectile Speed'),
          optionalNumber('projectileDamage', 'Projectile Damage'), optionalNumber('projectileRadius', 'Projectile Radius'),
          optionalNumber('range', 'Range'), optionalNumber('preferredRange', 'Preferred Range'), optionalNumber('burst', 'Burst')
        ]
      }
    }]
  },
  defaultData: { enemies: [] }
}

const waveSet: ResourceTypeRegistration = {
  typeId: PULSEBREAK_TYPE_IDS.waveSet, label: 'Wave Set', singleton: true,
  schema: {
    kind: 'object',
    fields: [{
      key: 'waves', label: 'Waves', kind: 'array', presentation: 'list', item: {
        kind: 'object', fields: [
          { key: 'id', label: 'ID', kind: 'string', required: true },
          {
            key: 'spawns', label: 'Spawns', kind: 'array', presentation: 'table', item: {
              kind: 'object', fields: [{ key: 'enemyTypeId', label: 'Enemy', kind: 'string', required: true }, numberField('count', 'Count')]
            }
          }
        ]
      }
    }]
  },
  defaultData: { waves: [] }
}

const upgradeSet: ResourceTypeRegistration = {
  typeId: PULSEBREAK_TYPE_IDS.upgradeSet, label: 'Upgrade Set', singleton: true,
  schema: {
    kind: 'object',
    fields: [{
      key: 'upgrades', label: 'Upgrades', kind: 'array', presentation: 'table', item: {
        kind: 'object', fields: [
          { key: 'id', label: 'ID', kind: 'enum', required: true, values: ['damage', 'fireRate', 'moveSpeed', 'maxHealth'] },
          { key: 'label', label: 'Label', kind: 'string', required: true },
          { key: 'description', label: 'Description', kind: 'string', required: true },
          numberField('step', 'Step')
        ]
      }
    }]
  },
  defaultData: { upgrades: [] }
}

export const pulsebreakProjectDefinition: GameProjectDefinition<PulsebreakCompiledProject> = defineGameProject<PulsebreakCompiledProject>({
  gameId: 'pulsebreak',
  label: 'Pulsebreak',
  createTemplate: createPulsebreakTemplate,
  components: [playerStart, spawnZone],
  resources: [tuning, enemyTypes, waveSet, upgradeSet],
  validate: validatePulsebreakProject,
  compile: compilePulsebreakProject
})

interface EnemyRow { id: string }
interface WaveRow { id: string; spawns: Array<{ enemyTypeId: string; count: number }> }

function resourceData<T>(snapshot: ProjectSnapshot, typeId: string): T | undefined {
  return Object.values(snapshot.resources).find((doc) => doc.typeId === typeId)?.data as T | undefined
}

function validatePulsebreakProject(snapshot: ProjectSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const sceneId = snapshot.manifest.entrySceneId
  const scene = snapshot.scenes[sceneId]
  if (!scene) return [{ severity: 'error', code: 'pulsebreak.scene', message: `Missing entry scene "${sceneId}"` }]

  const error = (code: string, message: string, extra: Partial<ValidationIssue> = {}): void => { issues.push({ severity: 'error', code, message, ...extra }) }

  const starts = scene.entities.filter((entity) => entity.components.some((component) => component.typeId === PULSEBREAK_TYPE_IDS.playerStart))
  if (starts.length !== 1) error('pulsebreak.playerStart', `Expected exactly one player start, found ${starts.length}`, { sceneId })

  const enemyRows = resourceData<{ enemies: EnemyRow[] }>(snapshot, PULSEBREAK_TYPE_IDS.enemyTypes)?.enemies ?? []
  assertUniqueIds(enemyRows, 'pulsebreak.enemyId', 'enemy', error)
  const enemyIds = new Set(enemyRows.map((row) => row.id))

  const waveRows = resourceData<{ waves: WaveRow[] }>(snapshot, PULSEBREAK_TYPE_IDS.waveSet)?.waves ?? []
  assertUniqueIds(waveRows, 'pulsebreak.waveId', 'wave', error)
  if (waveRows.length === 0) error('pulsebreak.waves', 'At least one wave is required')
  for (const wave of waveRows) {
    for (const spawn of wave.spawns) {
      if (!enemyIds.has(spawn.enemyTypeId)) error('pulsebreak.waveEnemy', `Wave "${wave.id}" references unknown enemy "${spawn.enemyTypeId}"`)
    }
  }
  const finalWave = waveRows[waveRows.length - 1]
  if (finalWave && !finalWave.spawns.some((spawn) => spawn.enemyTypeId === 'boss' && spawn.count > 0)) {
    error('pulsebreak.finalBoss', 'The final wave must spawn at least one boss')
  }

  const referencedEnemies = new Set<string>()
  for (const wave of waveRows) for (const spawn of wave.spawns) if (spawn.count > 0) referencedEnemies.add(spawn.enemyTypeId)

  const zoneEnemyTypes = new Set<string>()
  for (const entity of scene.entities) {
    const zone = entity.components.find((component) => component.typeId === PULSEBREAK_TYPE_IDS.spawnZone)
    if (!zone) continue
    const data = zone.data as { weight: number; enemies: string[] }
    if (data.weight <= 0) error('pulsebreak.zoneWeight', `Zone "${entity.id}" must have a positive weight`, { sceneId, entityId: entity.id })
    for (const enemyId of data.enemies) {
      zoneEnemyTypes.add(enemyId)
      if (!enemyIds.has(enemyId)) error('pulsebreak.zoneEnemy', `Zone "${entity.id}" references unknown enemy "${enemyId}"`, { sceneId, entityId: entity.id })
    }
  }
  for (const enemyId of referencedEnemies) {
    if (!zoneEnemyTypes.has(enemyId)) error('pulsebreak.noZone', `Enemy "${enemyId}" has no spawn zone`)
  }

  return issues
}

function assertUniqueIds(rows: ReadonlyArray<{ id: string }>, code: string, label: string, error: (code: string, message: string) => void): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) error(code, `Duplicate ${label} id "${row.id}"`)
    seen.add(row.id)
  }
}
