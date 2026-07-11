import type { ProjectSnapshot } from '@automata/project'

export type Vec3Tuple = [number, number, number]

export type LevelGeometry =
  | {
      shape: 'box'
      uid?: string
      size: Vec3Tuple
      pos: Vec3Tuple
      rot?: Vec3Tuple
      color: string
      friction: number
    }
  | {
      shape: 'cylinder'
      uid?: string
      radius: number
      height: number
      pos: Vec3Tuple
      rot?: Vec3Tuple
      color: string
      friction: number
    }

/** Runtime-ready level data emitted by project compilation. */
export interface Level {
  id: string
  name: string
  timeLimitS: number
  fallY: number
  spawn: Vec3Tuple
  goal: { pos: Vec3Tuple }
  geometry: LevelGeometry[]
  entities: Array<{
    archetype: string
    uid?: string
    pos: Vec3Tuple
    overrides?: Record<string, unknown>
  }>
}

export interface WorldsManifest {
  worlds: Array<{ id: string; name: string; levels: string[] }>
}

export interface PhysicsTuning {
  maxTiltRad: number
  tiltSmooth: number
  gravity: number
  ball: { radius: number; friction: number }
}

/** Stable authoring type IDs owned by the Monkey Ball project format. */
export const MONKEY_BALL_TYPE_IDS = {
  spawn: 'monkey-ball.spawn',
  goal: 'monkey-ball.goal',
  archetype: 'monkey-ball.archetype',
  physics: 'monkey-ball.physics',
  worlds: 'monkey-ball.worlds'
} as const

/** Runtime-ready data compiled from one complete authored project. */
export interface CompiledMonkeyBallProject {
  projectId: string
  tuning: PhysicsTuning
  manifest: WorldsManifest
  levels: Record<string, Level>
  snapshot: ProjectSnapshot
}

export const geometryUid = (geometry: { uid?: string }, index: number): string =>
  geometry.uid ?? `geometry:${index}`

export const entityUid = (entity: { uid?: string }, index: number): string =>
  entity.uid ?? `entity:${index}`
