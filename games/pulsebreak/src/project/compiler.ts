import { CORE_TYPE_IDS, resolveWorldTransform, type ProjectSnapshot, type ResourceDocument, type SceneDocument } from '@automata/project'
import type { EnemyKind } from '../entity'
import type { UpgradeDef, UpgradeId } from '../sim/upgrades'
import { PULSEBREAK_TYPE_IDS, type EnemySpec, type PulsebreakCompiledProject, type SpawnZone, type WaveSpec } from './types'

/**
 * Pure compile from an authored project snapshot to the runtime config.
 *
 * Resolves the singleton tuning/enemy/wave/upgrade resources, walks the entry
 * scene for the floor, player start, and spawn zones (resolving world
 * transforms), and produces the complete runtime configuration so authored
 * project documents remain the only tuning source.
 */
interface TuningData {
  arena: { half: number; y: number }
  camera: { eye: Vec3Data; look: Vec3Data }
  player: Record<string, unknown>
  projectileLifetimeS: number
}
interface Vec3Data { x: number; y: number; z: number }
interface EnemyRow extends EnemySpec { id: string }
interface WaveRow { id: string; spawns: Array<{ enemyTypeId: string; count: number }> }
interface UpgradeRow { id: UpgradeId; label: string; description: string; step: number }

export function compilePulsebreakProject(snapshot: ProjectSnapshot): PulsebreakCompiledProject {
  const sceneId = snapshot.manifest.entrySceneId
  const scene = snapshot.scenes[sceneId]
  if (!scene) throw new Error(`Pulsebreak project: missing entry scene "${sceneId}"`)

  const tuning = singleton<TuningData>(snapshot, PULSEBREAK_TYPE_IDS.tuning)
  const enemyRows = singleton<{ enemies: EnemyRow[] }>(snapshot, PULSEBREAK_TYPE_IDS.enemyTypes).enemies
  const waveRows = singleton<{ waves: WaveRow[] }>(snapshot, PULSEBREAK_TYPE_IDS.waveSet).waves
  const upgradeRows = singleton<{ upgrades: UpgradeRow[] }>(snapshot, PULSEBREAK_TYPE_IDS.upgradeSet).upgrades

  const floor = compileFloor(scene)
  const spawn = compilePlayerSpawn(scene)
  const spawnZones = compileSpawnZones(scene)

  return {
    projectId: snapshot.manifest.id,
    sceneId,
    arena: { ...tuning.arena },
    camera: { eye: { ...tuning.camera.eye }, look: { ...tuning.camera.look } },
    player: { ...(tuning.player as Record<string, unknown>), spawn } as PulsebreakCompiledProject['player'],
    enemy: compileEnemies(enemyRows),
    waves: compileWaves(waveRows),
    upgrades: compileUpgrades(upgradeRows),
    upgradeStep: compileUpgradeStep(upgradeRows),
    projectileLifetimeS: tuning.projectileLifetimeS,
    floor,
    spawnZones
  }
}

function singleton<T>(snapshot: ProjectSnapshot, typeId: string): T {
  const resource = Object.values(snapshot.resources).find((doc: ResourceDocument) => doc.typeId === typeId)
  if (!resource) throw new Error(`Pulsebreak project: missing resource "${typeId}"`)
  return resource.data as T
}

function compileFloor(scene: SceneDocument): PulsebreakCompiledProject['floor'] {
  const floor = scene.entities.find((entity) => entity.components.some((component) => component.typeId === CORE_TYPE_IDS.primitive))
  if (!floor) throw new Error('Pulsebreak project: scene has no floor primitive')
  const world = resolveWorldTransform(scene, floor.id)
  const primitive = floor.components.find((component) => component.typeId === CORE_TYPE_IDS.primitive)!.data as { size: Vec3Data }
  const surface = floor.components.find((component) => component.typeId === CORE_TYPE_IDS.surface)?.data as { color?: string } | undefined
  return { position: world.position, size: { ...primitive.size }, color: surface?.color ?? '#0a1124' }
}

function compilePlayerSpawn(scene: SceneDocument): Vec3Data {
  const start = scene.entities.find((entity) => entity.components.some((component) => component.typeId === PULSEBREAK_TYPE_IDS.playerStart))
  if (!start) throw new Error('Pulsebreak project: scene has no player start')
  return resolveWorldTransform(scene, start.id).position
}

function compileSpawnZones(scene: SceneDocument): SpawnZone[] {
  const zones: SpawnZone[] = []
  for (const entity of scene.entities) {
    const zone = entity.components.find((component) => component.typeId === PULSEBREAK_TYPE_IDS.spawnZone)
    if (!zone) continue
    const data = zone.data as {
      mode: 'ring' | 'point'; radius: number; weight: number; enemies: string[];
      minSeparation: number; edgePaddingMin: number; edgePaddingMax: number; angleJitterRad: number
    }
    zones.push({
      id: entity.id,
      mode: data.mode,
      center: resolveWorldTransform(scene, entity.id).position,
      radius: data.radius,
      weight: data.weight,
      enemyTypeIds: data.enemies as EnemyKind[],
      minSeparation: data.minSeparation,
      edgePaddingMin: data.edgePaddingMin,
      edgePaddingMax: data.edgePaddingMax,
      angleJitterRad: data.angleJitterRad
    })
  }
  return zones.sort((a, b) => a.id.localeCompare(b.id))
}

function compileEnemies(rows: EnemyRow[]): Record<EnemyKind, EnemySpec> {
  const out: Record<string, EnemySpec> = {}
  for (const row of rows) {
    const { id, ...spec } = row
    out[id] = spec
  }
  return out as Record<EnemyKind, EnemySpec>
}

function compileWaves(rows: WaveRow[]): WaveSpec[] {
  return rows.map((row) => {
    const wave: WaveSpec = { rammer: 0, shooter: 0, boss: 0 }
    for (const spawn of row.spawns) {
      if (spawn.enemyTypeId in wave) wave[spawn.enemyTypeId as keyof WaveSpec] += spawn.count
    }
    return wave
  })
}

function compileUpgrades(rows: UpgradeRow[]): Record<UpgradeId, UpgradeDef> {
  const out: Record<string, UpgradeDef> = {}
  for (const row of rows) out[row.id] = { id: row.id, label: row.label, description: row.description }
  return out as Record<UpgradeId, UpgradeDef>
}

function compileUpgradeStep(rows: UpgradeRow[]): Record<UpgradeId, number> {
  const out: Record<string, number> = {}
  for (const row of rows) out[row.id] = row.step
  return out as Record<UpgradeId, number>
}
