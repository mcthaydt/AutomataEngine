import {
  color, defineGameProject, listOf, tableOf, vec3, z,
  type ComponentTypeInput, type GameProjectDefinition,
  type ProjectSnapshot, type ResourceTypeInput, type ValidationIssue
} from '@automata/project'
import { compilePulsebreakProject } from './compiler'
import { createPulsebreakTemplate } from './template'
import { PULSEBREAK_TYPE_IDS, type PulsebreakCompiledProject } from './types'
import { ENEMY_KINDS } from '../entity'

/**
 * The Pulsebreak project definition: authoring component/resource schemas plus
 * pure `validate`/`compile`. It is runtime-safe (no editor/engine UI imports) so
 * the headless graph and the shipped game can both depend on it.
 */
const num = (label: string) => z.number().min(0).meta({ label })
const optionalNum = (label: string) => z.number().min(0).meta({ label }).optional()

const playerStart: ComponentTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.playerStart, label: 'Player Start',
  schema: z.strictObject({}),
  defaultData: {}, cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#27e0ff' }
}

const spawnZone: ComponentTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.spawnZone, label: 'Spawn Zone',
  schema: z.strictObject({
    mode: z.enum(['ring', 'point']).meta({ label: 'Mode' }),
    radius: num('Radius'),
    weight: num('Weight'),
    enemies: listOf(z.string(), { label: 'Enemy Types' }).optional(),
    minSeparation: num('Min Separation'),
    edgePaddingMin: num('Edge Padding Min'),
    edgePaddingMax: num('Edge Padding Max'),
    angleJitterRad: num('Angle Jitter (rad)')
  }),
  defaultData: { mode: 'ring', radius: 13, weight: 1, enemies: [], minSeparation: 0, edgePaddingMin: 1, edgePaddingMax: 3, angleJitterRad: 0.35 },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'zone', color: '#ff2e88' }
}

const tuning: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.tuning, label: 'Tuning', singleton: true,
  schema: z.strictObject({
    arena: z.strictObject({
      half: num('Half'),
      y: z.number().meta({ label: 'Y' })
    }).meta({ label: 'Arena' }),
    camera: z.strictObject({
      eye: vec3({ label: 'Eye' }),
      look: vec3({ label: 'Look' })
    }).meta({ label: 'Camera' }),
    player: z.strictObject({
      radius: num('Radius'), startHealth: num('Start Health'), baseDamage: num('Base Damage'),
      baseFireRate: num('Base Fire Rate'), baseMoveSpeed: num('Base Move Speed'), projectileSpeed: num('Projectile Speed'),
      projectileRadius: num('Projectile Radius'), range: num('Range'), invulnS: num('Invuln (s)'),
      color: color({ label: 'Color' })
    }).meta({ label: 'Player' }),
    projectileLifetimeS: num('Projectile Lifetime (s)')
  }),
  defaultData: createPulsebreakTemplate().resources.tuning!.data as Record<string, unknown>
}

const enemyTypes: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.enemyTypes, label: 'Enemy Types', singleton: true,
  schema: z.strictObject({
    enemies: tableOf(z.strictObject({
      id: z.string().meta({ label: 'ID' }),
      health: num('Health'), radius: num('Radius'), speed: num('Speed'),
      contactDamage: num('Contact Damage'), scoreValue: num('Score'),
      color: color({ label: 'Color' }),
      cooldownS: optionalNum('Cooldown (s)'), projectileSpeed: optionalNum('Projectile Speed'),
      projectileDamage: optionalNum('Projectile Damage'), projectileRadius: optionalNum('Projectile Radius'),
      range: optionalNum('Range'), preferredRange: optionalNum('Preferred Range'), burst: optionalNum('Burst')
    }), { label: 'Enemies' }).optional()
  }),
  defaultData: { enemies: [] }
}

const waveSet: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.waveSet, label: 'Wave Set', singleton: true,
  schema: z.strictObject({
    waves: listOf(z.strictObject({
      id: z.string().meta({ label: 'ID' }),
      spawns: tableOf(z.strictObject({
        enemyTypeId: z.string().meta({ label: 'Enemy' }),
        count: num('Count')
      }), { label: 'Spawns' }).optional()
    }), { label: 'Waves' }).optional()
  }),
  defaultData: { waves: [] }
}

const upgradeSet: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.upgradeSet, label: 'Upgrade Set', singleton: true,
  schema: z.strictObject({
    upgrades: tableOf(z.strictObject({
      id: z.enum(['damage', 'fireRate', 'moveSpeed', 'maxHealth']).meta({ label: 'ID' }),
      label: z.string().meta({ label: 'Label' }),
      description: z.string().meta({ label: 'Description' }),
      step: num('Step')
    }), { label: 'Upgrades' }).optional()
  }),
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
  for (const row of enemyRows) {
    if (!(ENEMY_KINDS as readonly string[]).includes(row.id)) {
      error('pulsebreak.enemyKind', `Enemy "${row.id}" is not a runtime-supported kind (${ENEMY_KINDS.join(', ')})`)
    }
  }
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
