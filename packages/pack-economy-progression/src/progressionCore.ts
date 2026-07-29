import { z } from '@automata/project'

export interface MilestoneDef {
  id: string
  threshold: number
}

export interface ProgressionState {
  achieved: readonly string[]
}

export function createProgressionState(): ProgressionState {
  return { achieved: [] }
}

export interface AdvanceResult {
  state: ProgressionState
  newlyAchieved: readonly string[]
}

/** Flip every milestone at or below totalEarned, in ascending threshold order. */
export function advance(
  state: ProgressionState,
  totalEarned: number,
  milestones: readonly MilestoneDef[]
): AdvanceResult {
  const already = new Set(state.achieved)
  const newlyAchieved = [...milestones]
    .sort((left, right) => left.threshold - right.threshold)
    .filter((milestone) =>
      totalEarned >= milestone.threshold && !already.has(milestone.id)
    )
    .map((milestone) => milestone.id)

  if (newlyAchieved.length === 0) return { state, newlyAchieved: [] }
  return {
    state: { achieved: [...state.achieved, ...newlyAchieved] },
    newlyAchieved
  }
}

export function progressionComplete(
  state: ProgressionState,
  milestones: readonly MilestoneDef[]
): boolean {
  const achieved = new Set(state.achieved)
  return milestones.every((milestone) => achieved.has(milestone.id))
}

export const savedProgressionSchema = z.strictObject({
  achieved: z.array(z.string().min(1).max(40)).max(12)
})

export function serializeProgression(state: ProgressionState): unknown {
  return { achieved: [...state.achieved] }
}

export function deserializeProgression(raw: unknown): ProgressionState {
  return savedProgressionSchema.parse(raw)
}
