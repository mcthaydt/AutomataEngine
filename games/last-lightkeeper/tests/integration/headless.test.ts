import { describe, expect, it } from 'vitest'
import { runHeadlessScenario } from '../../src/sim/headless'

describe('Last Lightkeeper headless scenarios', () => {
  it('plays through three rescues and reaches a scored dawn victory', () => {
    const result = runHeadlessScenario('victory')

    expect(result.state.outcome).toBe('victory')
    expect(result.state.rescues).toBeGreaterThanOrEqual(3)
    expect(result.state.score).toBeGreaterThan(0)
    expect(result.trace).toMatchObject({
      movement: true,
      carrying: true,
      radio: true,
      powerRouting: true,
      repair: true,
      beacon: true,
      timeAdvanced: true
    })
    expect(result.snapshots.at(-1)).toMatchObject({ outcome: 'victory' })
  })

  it('runs a real machinery path into terminal flooding defeat', () => {
    const result = runHeadlessScenario('failure')

    expect(result.state.outcome).toBe('defeat')
    expect(result.state.terminalReason).toMatch(/flood/i)
    expect(result.trace.timeAdvanced).toBe(true)
    expect(result.snapshots.at(-1)).toMatchObject({ outcome: 'defeat', flooding: 100 })
  })
})
