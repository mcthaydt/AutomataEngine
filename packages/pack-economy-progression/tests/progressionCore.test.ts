import { describe, expect, it } from 'vitest'
import {
  advance,
  createProgressionState,
  deserializeProgression,
  progressionComplete,
  serializeProgression,
  type MilestoneDef
} from '../src/progressionCore'

const milestones: MilestoneDef[] = [
  { id: 'm2', threshold: 10 },
  { id: 'm1', threshold: 5 }
]

describe('progressionCore', () => {
  it('flips milestones in ascending threshold order and reports only new ones', () => {
    const first = advance(createProgressionState(), 6, milestones)
    expect(first.newlyAchieved).toEqual(['m1'])
    const second = advance(first.state, 12, milestones)
    expect(second.newlyAchieved).toEqual(['m2'])
    expect(advance(second.state, 99, milestones).newlyAchieved).toEqual([])
  })

  it('completes only when every milestone is achieved', () => {
    const result = advance(createProgressionState(), 99, milestones)
    expect(progressionComplete(result.state, milestones)).toBe(true)
    expect(progressionComplete(createProgressionState(), milestones)).toBe(false)
  })

  it('round-trips through serialize and deserialize', () => {
    const result = advance(createProgressionState(), 6, milestones)
    expect(deserializeProgression(serializeProgression(result.state))).toEqual(result.state)
  })
})
