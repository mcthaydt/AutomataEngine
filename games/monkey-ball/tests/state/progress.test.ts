import { describe, expect, it } from 'vitest'
import type { WorldsManifest } from '../../src/project/types'
import { initialProgress, progressReducer } from '../../src/state/progress'
import { isLevelUnlocked, isWorldUnlocked, levelOrder } from '../../src/state/unlocks'

const manifest: WorldsManifest = {
  worlds: [
    { id: 'w1', name: 'One', levels: ['w1-l1', 'w1-l2'] },
    { id: 'w2', name: 'Two', levels: ['w2-l1'] }
  ]
}

const complete = (state: ReturnType<typeof progressReducer>, levelId: string) =>
  progressReducer(state, { type: 'levelCompleted', levelId, timeMs: 1, bananas: 0 })

describe('progress reducer', () => {
  it('records completion, best time (min), and max bananas', () => {
    let state = progressReducer(initialProgress, {
      type: 'levelCompleted',
      levelId: 'w1-l1',
      timeMs: 9000,
      bananas: 2
    })
    state = progressReducer(state, {
      type: 'levelCompleted',
      levelId: 'w1-l1',
      timeMs: 7000,
      bananas: 1
    })

    expect(state['w1-l1']).toEqual({ completed: true, bestTimeMs: 7000, maxBananas: 2 })
  })

  it('ignores unrelated actions', () => {
    expect(progressReducer(initialProgress, { type: 'ballFell' })).toBe(initialProgress)
  })
})

describe('unlock rules', () => {
  it('orders levels across worlds', () => {
    expect(levelOrder(manifest)).toEqual(['w1-l1', 'w1-l2', 'w2-l1'])
  })

  it('unlocks the first level always; later levels only after the previous completes', () => {
    expect(isLevelUnlocked(manifest, {}, 'w1-l1')).toBe(true)
    expect(isLevelUnlocked(manifest, {}, 'w1-l2')).toBe(false)
    expect(isLevelUnlocked(manifest, complete({}, 'w1-l1'), 'w1-l2')).toBe(true)
  })

  it('unlocks world 2 once world 1 is fully completed', () => {
    let progress = complete({}, 'w1-l1')
    expect(isWorldUnlocked(manifest, progress, 'w2')).toBe(false)

    progress = complete(progress, 'w1-l2')
    expect(isWorldUnlocked(manifest, progress, 'w2')).toBe(true)
  })
})
