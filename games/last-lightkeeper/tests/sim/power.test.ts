import { describe, expect, it } from 'vitest'
import type { CircuitId } from '../../src/data/schema'
import { resolvePower, setCircuitRequested } from '../../src/sim/power'
import { createInitialNight } from '../../src/state/night'

function requestAll(priority: CircuitId[] = ['beacon', 'radio', 'bilge', 'workshop']) {
  const state = createInitialNight(1, 42)
  return {
    ...state,
    circuitPriority: priority,
    circuits: Object.fromEntries(priority.map((id) => [id, {
      ...state.circuits[id], requested: true
    }])) as typeof state.circuits
  }
}

describe('power routing', () => {
  it('powers three healthy requested circuits and preserves requested state separately', () => {
    const state = createInitialNight(1, 42)
    const next = resolvePower(state)

    expect(next.generator.capacity).toBe(3)
    expect(next.circuits).toEqual({
      beacon: { requested: true, powered: true, tripped: false },
      radio: { requested: true, powered: true, tripped: false },
      bilge: { requested: true, powered: true, tripped: false },
      workshop: { requested: false, powered: false, tripped: false }
    })
  })

  it('uses explicit player priority for deterministic over-capacity cutoff', () => {
    const state = requestAll(['workshop', 'radio', 'beacon', 'bilge'])
    const next = resolvePower(state)

    expect(next.circuits.workshop.powered).toBe(true)
    expect(next.circuits.radio.powered).toBe(true)
    expect(next.circuits.beacon.powered).toBe(true)
    expect(next.circuits.bilge.powered).toBe(false)
    expect(next.circuits.bilge.requested).toBe(true)
  })

  it('skips tripped circuits without spending capacity', () => {
    const state = requestAll()
    state.circuits.radio = { requested: true, powered: true, tripped: true }
    const next = resolvePower(state)

    expect(next.circuits.radio.powered).toBe(false)
    expect(next.circuits.workshop.powered).toBe(true)
  })

  it('reduces capacity to two or one at heat and damage thresholds', () => {
    const warm = requestAll()
    warm.generator = { ...warm.generator, heat: 0.7 }
    const damaged = requestAll()
    damaged.generator = { ...damaged.generator, damage: 0.8 }

    expect(resolvePower(warm).generator.capacity).toBe(2)
    expect(Object.values(resolvePower(warm).circuits).filter((circuit) => circuit.powered)).toHaveLength(2)
    expect(resolvePower(damaged).generator.capacity).toBe(1)
    expect(Object.values(resolvePower(damaged).circuits).filter((circuit) => circuit.powered)).toHaveLength(1)
  })

  it('only changes circuit requests while operating the breaker', () => {
    const away = createInitialNight(1, 42)
    expect(setCircuitRequested(away, 'workshop', true)).toBe(away)

    const atBreaker = {
      ...away,
      keeper: { ...away.keeper, mode: 'operate' as const },
      focus: { kind: 'station' as const, id: 'breaker' as const, prompt: 'Operate Breaker Panel', distance: 0 }
    }
    const changed = setCircuitRequested(atBreaker, 'workshop', true)
    expect(changed.circuits.workshop.requested).toBe(true)
    expect(changed.circuits.workshop.powered).toBe(false)
    expect(changed.circuits.beacon).toBe(atBreaker.circuits.beacon)
  })
})
