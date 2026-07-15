import type { SimTuning } from '../sim/sim'

/** Stable type ids for this game's authoring components and resources. */
export const GAME_TYPE_IDS = {
  spawnPoint: 'first-light.spawn-point',
  tuning: 'first-light.tuning'
} as const

/** Pure output of project compilation, shared by browser and headless runtimes. */
export interface CompiledProject {
  projectId: string
  sceneId: string
  spawn: { x: number; z: number }
  tuning: SimTuning
  colors: { floor: string; player: string; goal: string }
}
