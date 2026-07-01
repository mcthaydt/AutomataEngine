import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import { advanceMachinery } from '../../src/sim/machinery'
import { createInitialNight } from '../../src/state/night'

const rates = nightDefinition.rules.machinery
const healthy = { pumpJammed: false, brokenWindows: 0 }

describe('lighthouse machinery pressure', () => {
  it('raises generator heat under load and cools with low load', () => {
    const loaded = createInitialNight(1, 42)
    loaded.generator.heat = 0.2
    const heated = advanceMachinery(loaded, 5, healthy, rates)
    expect(heated.generator.heat).toBeGreaterThan(0.2)

    const idle = { ...heated, circuits: {
      beacon: { ...heated.circuits.beacon, powered: false },
      radio: { ...heated.circuits.radio, powered: false },
      bilge: { ...heated.circuits.bilge, powered: false },
      workshop: { ...heated.circuits.workshop, powered: false }
    } }
    expect(advanceMachinery(idle, 5, healthy, rates).generator.heat).toBeLessThan(heated.generator.heat)
  })

  it('damages the generator while overheated and clamps machinery meters', () => {
    const state = createInitialNight(1, 42)
    state.generator = { ...state.generator, heat: 0.95, damage: 0.98 }
    const next = advanceMachinery(state, 10, healthy, rates)

    expect(next.generator.heat).toBe(1)
    expect(next.generator.damage).toBe(1)
  })

  it('drains water with a powered unjammed pump', () => {
    const state = createInitialNight(1, 42)
    state.flooding = 20
    expect(advanceMachinery(state, 5, healthy, rates).flooding).toBeLessThan(20)
  })

  it('raises flooding with an unpowered or jammed pump', () => {
    const unpowered = createInitialNight(1, 42)
    unpowered.circuits.bilge = { ...unpowered.circuits.bilge, powered: false }
    const jammed = createInitialNight(1, 42)

    expect(advanceMachinery(unpowered, 5, healthy, rates).flooding).toBeGreaterThan(0)
    expect(advanceMachinery(jammed, 5, { ...healthy, pumpJammed: true }, rates).flooding).toBeGreaterThan(0)
  })

  it('adds broken-window ingress and damages structure at high water', () => {
    const state = createInitialNight(1, 42)
    state.circuits.bilge = { ...state.circuits.bilge, powered: false }
    const normal = advanceMachinery(state, 5, healthy, rates)
    const broken = advanceMachinery(state, 5, { ...healthy, brokenWindows: 2 }, rates)
    expect(broken.flooding).toBeGreaterThan(normal.flooding)

    const highWater = { ...state, flooding: 90, integrity: 2 }
    const damaged = advanceMachinery(highWater, 10, healthy, rates)
    expect(damaged.integrity).toBe(0)
    expect(damaged.flooding).toBeLessThanOrEqual(100)
  })

  it('accumulates darkness without the beacon and resets when power returns', () => {
    const dark = createInitialNight(1, 42)
    dark.circuits.beacon = { ...dark.circuits.beacon, powered: false }
    const accumulated = advanceMachinery(dark, 12, healthy, rates)
    expect(accumulated.darknessS).toBe(12)

    accumulated.circuits.beacon = { ...accumulated.circuits.beacon, powered: true }
    expect(advanceMachinery(accumulated, 1, healthy, rates).darknessS).toBe(0)
  })

  it('emits threshold feedback only when a meter crosses the threshold', () => {
    const state = createInitialNight(1, 42)
    state.generator.heat = rates.overheatThreshold - 0.01
    const crossed = advanceMachinery(state, 1, healthy, rates)
    expect(crossed.feedback.map((event) => event.type)).toContain('generator-overheat')

    const stillHot = advanceMachinery(crossed, 1, healthy, rates)
    expect(stillHot.feedback.filter((event) => event.type === 'generator-overheat')).toHaveLength(1)
  })
})
