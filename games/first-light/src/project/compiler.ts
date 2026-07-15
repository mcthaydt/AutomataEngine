import { CORE_TYPE_IDS, type ProjectSnapshot } from '@automata/project'
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
  if (!scene) throw new Error(`Missing entry scene "${sceneId}"`)

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
