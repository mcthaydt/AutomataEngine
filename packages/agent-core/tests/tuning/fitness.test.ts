import { describe, expect, it } from 'vitest'
import { scoreFitness, type FitnessTarget } from '../../src/tuning/fitness'
import type { TestPlayResult } from '@automata/contracts'

const result = (over: Partial<TestPlayResult>): TestPlayResult => ({
  outcome: 'completed',
  timeMs: 1000,
  fallCount: 0,
  bananas: 0,
  steps: 600,
  ...over
})
const band: FitnessTarget = { minSteps: 300, maxSteps: 900 }

describe('scoreFitness', () => {
  it('scores an in-band completion with no falls at 1', () => {
    expect(scoreFitness(result({ steps: 600 }), band)).toBe(1)
  })

  it('scores an unsolved level at 0', () => {
    expect(scoreFitness(result({ outcome: 'incomplete' }), band)).toBe(0)
    expect(scoreFitness(result({ outcome: 'gameOver' }), band)).toBe(0)
  })

  it('penalizes rest-falls', () => {
    expect(scoreFitness(result({ fallCount: 1 }), band)).toBeLessThan(1)
  })

  it('tapers reward for completions outside the step band', () => {
    expect(scoreFitness(result({ steps: 1800 }), band)).toBeLessThan(1)
    expect(scoreFitness(result({ steps: 150 }), band)).toBeLessThan(1)
  })

  it('adds a banana bonus when the target is met', () => {
    const target: FitnessTarget = { ...band, bananas: 2 }
    expect(scoreFitness(result({ bananas: 3 }), target)).toBeGreaterThan(1)
  })
})
