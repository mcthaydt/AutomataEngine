import type { WorldsManifest } from '../data/level'
import type { ProgressState } from './progress'

/** The flat, ordered list of level ids across all worlds. */
export function levelOrder(manifest: WorldsManifest): string[] {
  return manifest.worlds.flatMap((world) => world.levels)
}

/** A level is unlocked if it is the first overall, or its predecessor is completed. */
export function isLevelUnlocked(
  manifest: WorldsManifest,
  progress: ProgressState,
  levelId: string
): boolean {
  const order = levelOrder(manifest)
  const index = order.indexOf(levelId)
  if (index <= 0) return index === 0
  return progress[order[index - 1]!]?.completed === true
}

/** A world is unlocked exactly when its first level is unlocked. */
export function isWorldUnlocked(
  manifest: WorldsManifest,
  progress: ProgressState,
  worldId: string
): boolean {
  const world = manifest.worlds.find((candidate) => candidate.id === worldId)
  if (!world || world.levels.length === 0) return false
  return isLevelUnlocked(manifest, progress, world.levels[0]!)
}
