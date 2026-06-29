import { levelSchema } from 'monkey-ball'
import {
  importLegacyMonkeyBallProject,
  monkeyBallProjectDefinition
} from 'monkey-ball/project'
import type { ProjectSnapshot } from '@automata/project'

export const LEGACY_MONKEY_BALL_AUTOSAVE_KEY = 'monkey-ball-editor'

export interface LegacyMonkeyBallRecovery {
  snapshot: ProjectSnapshot
  /** Remove the old key only after the caller completes a durable save/export. */
  markPersisted(): void
}

type LegacyStorage = Pick<Storage, 'getItem' | 'removeItem'>

/** Parse and import the former single-level autosave without mutating it eagerly. */
export function loadLegacyMonkeyBallAutosave(
  storage: LegacyStorage
): LegacyMonkeyBallRecovery | null {
  const raw = storage.getItem(LEGACY_MONKEY_BALL_AUTOSAVE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { version?: number; doc?: unknown }
    if (parsed.version !== 1) return null
    const level = levelSchema.parse(parsed.doc)
    const template = monkeyBallProjectDefinition.compile(
      monkeyBallProjectDefinition.createTemplate()
    )
    const snapshot = importLegacyMonkeyBallProject({
      tuning: template.tuning,
      manifest: {
        worlds: [{ id: 'recovered', name: 'Recovered', levels: [level.id] }]
      },
      levels: { [level.id]: level },
      projectId: 'monkey-ball-recovered',
      projectName: `Recovered ${level.name}`
    })
    return {
      snapshot,
      markPersisted: () => storage.removeItem(LEGACY_MONKEY_BALL_AUTOSAVE_KEY)
    }
  } catch {
    return null
  }
}
