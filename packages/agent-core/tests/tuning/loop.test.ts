import { describe, expect, it } from 'vitest'
import { runTuningLoop } from '../../src/tuning/loop'

describe('runTuningLoop', () => {
  it('keeps a candidate only when it beats the best score', async () => {
    const proposals = [10, 5, 20]
    let i = 0
    const result = await runTuningLoop<number>({
      initial: 0,
      score: async (s) => s,
      propose: async () => proposals[i++]!,
      validate: () => true,
      maxIterations: 3
    })
    expect(result.best).toBe(20)
    expect(result.bestScore).toBe(20)
    expect(result.accepted).toBe(2)
  })

  it('rejects proposals that fail validation and stops after patience', async () => {
    const result = await runTuningLoop<number>({
      initial: 1,
      score: async (s) => s,
      propose: async () => 99,
      validate: () => false,
      maxIterations: 5,
      patience: 2
    })
    expect(result.best).toBe(1)
    expect(result.accepted).toBe(0)
    expect(result.iterations).toBe(2)
  })

  it('stops early once the target score is reached', async () => {
    let calls = 0
    const result = await runTuningLoop<number>({
      initial: 0,
      score: async (s) => s,
      propose: async () => {
        calls += 1
        return 100
      },
      validate: () => true,
      target: 50,
      maxIterations: 10
    })
    expect(result.bestScore).toBeGreaterThanOrEqual(50)
    expect(calls).toBe(1)
  })
})
