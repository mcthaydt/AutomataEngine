import type { ProjectSnapshot } from '@automata/project'
import type { PhysicsTuning } from '../data/config'
import type { Level, WorldsManifest } from '../data/level'

/** Stable authoring type IDs owned by the Monkey Ball project format. */
export const MONKEY_BALL_TYPE_IDS = {
  spawn: 'monkey-ball.spawn',
  goal: 'monkey-ball.goal',
  archetype: 'monkey-ball.archetype',
  physics: 'monkey-ball.physics',
  worlds: 'monkey-ball.worlds'
} as const

/** Parsed legacy inputs accepted by the deterministic migration seam. */
export interface LegacyMonkeyBallProjectInput {
  tuning: PhysicsTuning
  manifest: WorldsManifest
  levels: Readonly<Record<string, Level>>
  projectId?: string
  projectName?: string
}

/** Runtime-ready data compiled from one complete authored project. */
export interface CompiledMonkeyBallProject {
  projectId: string
  tuning: PhysicsTuning
  manifest: WorldsManifest
  levels: Record<string, Level>
  /** Retained for editor preview/evaluation and migration parity checks. */
  snapshot: ProjectSnapshot
}
