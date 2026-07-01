import { describe, expect, it } from 'vitest'
import { NIGHT_DURATION_S, nightDefinition, parseNightDefinition } from '../../src/data/night'

describe('authored Last Lightkeeper night', () => {
  it('defines five ordered floors connected by adjacent ladders', () => {
    expect(nightDefinition.floors.map((floor) => floor.id)).toEqual([
      'lantern', 'navigation', 'quarters', 'workshop', 'machinery'
    ])
    expect(nightDefinition.floors.map((floor) => floor.y)).toEqual([216, 168, 120, 72, 24])
    expect(nightDefinition.ladders).toHaveLength(4)
    expect(nightDefinition.ladders.map(({ from, to }) => [from, to])).toEqual([
      ['machinery', 'workshop'],
      ['workshop', 'quarters'],
      ['quarters', 'navigation'],
      ['navigation', 'lantern']
    ])
  })

  it('places every required station, circuit, and repair item', () => {
    expect(nightDefinition.stations.map((station) => station.id)).toEqual(expect.arrayContaining([
      'beacon', 'radio', 'chart', 'breaker', 'workbench', 'generator', 'pump'
    ]))
    expect(nightDefinition.circuits).toEqual(['beacon', 'radio', 'bilge', 'workshop'])
    expect(nightDefinition.items.map((item) => item.id)).toEqual([
      'wrench', 'fuse', 'pump-handle', 'boards', 'coolant'
    ])
  })

  it('authors four calls with three distinct ship silhouettes and valid rescue windows', () => {
    expect(nightDefinition.calls).toHaveLength(4)
    expect(new Set(nightDefinition.calls.map((call) => call.shipVisual)).size).toBeGreaterThanOrEqual(3)
    for (const call of nightDefinition.calls) {
      expect(call.arrivalS).toBeLessThan(call.windowStartS)
      expect(call.windowStartS).toBeLessThan(call.windowEndS)
      expect(call.windowEndS).toBeLessThanOrEqual(NIGHT_DURATION_S)
      expect(call.bearingDeg).toBeGreaterThanOrEqual(-90)
      expect(call.bearingDeg).toBeLessThanOrEqual(90)
    }
  })

  it('defines contiguous teaching, rising, severe, blackout, and dawn phases', () => {
    expect(nightDefinition.phases.map((phase) => phase.id)).toEqual([
      'first-signal', 'rising-storm', 'severe-weather', 'blackout-crisis', 'dawn'
    ])
    expect(nightDefinition.phases[0]?.startS).toBe(0)
    expect(nightDefinition.phases.at(-1)?.endS).toBe(NIGHT_DURATION_S)
    for (let index = 1; index < nightDefinition.phases.length; index++) {
      expect(nightDefinition.phases[index]?.startS).toBe(nightDefinition.phases[index - 1]?.endS)
    }
  })

  it('rejects invalid layouts, calls, and phase timelines', () => {
    expect(() => parseNightDefinition({ ...nightDefinition, floors: nightDefinition.floors.slice(1) })).toThrow(/floor/i)
    expect(() => parseNightDefinition({
      ...nightDefinition,
      calls: [{ ...nightDefinition.calls[0]!, windowEndS: NIGHT_DURATION_S + 1 }]
    })).toThrow(/window/i)
    expect(() => parseNightDefinition({
      ...nightDefinition,
      phases: nightDefinition.phases.map((phase, index) => index === 1 ? { ...phase, startS: 151 } : phase)
    })).toThrow(/contiguous/i)
  })
})
