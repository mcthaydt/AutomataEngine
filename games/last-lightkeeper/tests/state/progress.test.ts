import { describe, expect, it } from 'vitest'
import type { StoragePort } from '@automata/engine'
import {
  initialProgress,
  loadProgress,
  recordCompletedRun,
  saveProgress
} from '../../src/state/progress'

function storage(value: string | null = null): StoragePort & { value: string | null } {
  return {
    value,
    get() { return this.value },
    set(_key, next) { this.value = next }
  }
}

describe('progress persistence', () => {
  it('loads valid versioned progress', () => {
    const port = storage(JSON.stringify({
      version: 1,
      data: { bestScore: 1200, bestRescues: 4, completedRuns: 2 }
    }))
    expect(loadProgress(port)).toEqual({ bestScore: 1200, bestRescues: 4, completedRuns: 2 })
  })

  it.each([
    null,
    'not json',
    JSON.stringify({ version: 2, data: initialProgress }),
    JSON.stringify({ version: 1, data: { bestScore: -1, bestRescues: 2, completedRuns: 1 } }),
    JSON.stringify({ version: 1, data: { bestScore: Number.NaN, bestRescues: 2, completedRuns: 1 } })
  ])('falls back safely for malformed progress %#', (value) => {
    expect(loadProgress(storage(value))).toEqual(initialProgress)
  })

  it('tolerates storage read and write exceptions', () => {
    const broken: StoragePort = {
      get() { throw new Error('private mode') },
      set() { throw new Error('quota') }
    }
    expect(loadProgress(broken)).toEqual(initialProgress)
    expect(() => saveProgress(broken, initialProgress)).not.toThrow()
  })

  it('saves a versioned envelope', () => {
    const port = storage()
    saveProgress(port, { bestScore: 900, bestRescues: 3, completedRuns: 1 })
    expect(JSON.parse(port.value!)).toEqual({
      version: 1,
      data: { bestScore: 900, bestRescues: 3, completedRuns: 1 }
    })
  })

  it('records highs without lowering them and increments completed runs', () => {
    const first = recordCompletedRun(initialProgress, 1400, 3)
    expect(first).toEqual({ bestScore: 1400, bestRescues: 3, completedRuns: 1 })
    expect(recordCompletedRun(first, 200, 1)).toEqual({
      bestScore: 1400, bestRescues: 3, completedRuns: 2
    })
  })
})
