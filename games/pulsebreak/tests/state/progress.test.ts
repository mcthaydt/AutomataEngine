import { describe, expect, it } from 'vitest'
import { initialProgress, progressReducer } from '../../src/state/progress'

describe('progressReducer', () => {
  it('starts with a zero best score', () => {
    expect(initialProgress).toEqual({ bestScore: 0 })
  })

  it('is identity on its own (best score is recorded cross-slice)', () => {
    const state = { bestScore: 500 }
    expect(progressReducer(state, { type: 'enemyKilled', value: 10 })).toBe(state)
  })
})
