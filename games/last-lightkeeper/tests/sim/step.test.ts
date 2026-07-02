import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import { activateFailure } from '../../src/sim/failures'
import { stepNight } from '../../src/sim/step'
import { createInitialNight } from '../../src/state/night'

describe('night input step', () => {
  it('moves before resolving a carry interaction', () => {
    const night = createInitialNight(1, 42)
    const state = {
      ...night,
      keeper: { ...night.keeper, floor: 'workshop' as const, x: -36, y: 72 }
    }

    const next = stepNight(
      state,
      { movement: { x: -1, y: 0 }, operate: false, carryPressed: true },
      0.25,
      { playing: true }
    )

    expect(next.keeper.x).toBe(-48)
    expect(next.keeper.carriedItem).toBe('wrench')
    expect(next.items.wrench).toBe('carried')
  })

  it('updates focus after movement before exposing station operation', () => {
    const night = createInitialNight(1, 42)
    const state = {
      ...night,
      keeper: { ...night.keeper, floor: 'navigation' as const, x: 20, y: 168 }
    }

    const next = stepNight(
      state,
      { movement: { x: 1, y: 0 }, operate: true, carryPressed: false },
      1 / 12,
      { playing: true }
    )

    expect(next.keeper.x).toBe(24)
    expect(next.focus).toMatchObject({ kind: 'station', id: 'chart' })
    expect(next.keeper.mode).toBe('operate')
  })

  it('leaves the complete night state untouched outside active play', () => {
    const state = createInitialNight(1, 42)
    expect(stepNight(
      state,
      { movement: { x: 1, y: 0 }, operate: true, carryPressed: true },
      1,
      { playing: false }
    )).toBe(state)
  })

  it('resolves capacity and circuit priority before machinery consequences', () => {
    const state = createInitialNight(1, 42)
    state.generator.heat = 0.8
    state.flooding = 10

    const next = stepNight(
      state,
      { movement: { x: 0, y: 0 }, operate: false, carryPressed: false },
      1,
      { playing: true }
    )

    expect(next.generator.capacity).toBe(1)
    expect(next.circuits.beacon.powered).toBe(true)
    expect(next.circuits.bilge.powered).toBe(false)
    expect(next.flooding).toBeGreaterThan(10)
    expect(next.timeS).toBe(1)
  })

  it('cycles breaker priority on an interaction edge and requests all routed circuits', () => {
    const initial = createInitialNight(1, 42)
    const state = {
      ...initial,
      keeper: { ...initial.keeper, x: -8 }
    }

    const next = stepNight(
      state,
      {
        movement: { x: 0, y: 0 },
        operate: true,
        carryPressed: false,
        interactPressed: true
      },
      1 / 60,
      { playing: true }
    )

    expect(next.circuitPriority).toEqual(['radio', 'bilge', 'workshop', 'beacon'])
    expect(Object.values(next.circuits).every((circuit) => circuit.requested)).toBe(true)
    expect(next.circuits.beacon.powered).toBe(false)
    expect(next.circuits.workshop.powered).toBe(true)
  })

  it('completes repairs before applying storm events due on the same step', () => {
    const failed = activateFailure(createInitialNight(1, 42), 'blown-fuse', 1, nightDefinition)
    const duration = nightDefinition.failures.find((failure) => failure.id === 'blown-fuse')!.durationS
    const state = {
      ...failed,
      timeS: 74,
      keeper: {
        ...failed.keeper,
        floor: 'quarters' as const,
        x: -8,
        y: 120,
        carriedItem: 'fuse' as const
      },
      items: { ...failed.items, fuse: 'carried' as const },
      activeFailures: {
        ...failed.activeFailures,
        'blown-fuse': { ...failed.activeFailures['blown-fuse']!, progressS: duration - 1 }
      },
      storm: {
        schedule: [{
          id: 'same-step-failure',
          kind: 'failure' as const,
          timeS: 75,
          failureId: 'blown-fuse' as const,
          severity: 1
        }],
        nextEventIndex: 0
      }
    }

    const next = stepNight(
      state,
      { movement: { x: 0, y: 0 }, operate: true, carryPressed: false },
      1,
      { playing: true }
    )

    expect(next.items.fuse).toBe('consumed')
    expect(next.activeFailures['blown-fuse']).toMatchObject({ progressS: 0, activatedAtS: 75 })
    expect(next.storm.nextEventIndex).toBe(1)
    expect(next.timeS).toBe(75)
  })

  it('advances distress calls at the new simulation time before storm events', () => {
    const initial = createInitialNight(1, 42)
    const state = {
      ...initial,
      timeS: 44,
      keeper: {
        ...initial.keeper,
        floor: 'navigation' as const,
        x: -28,
        y: 168
      }
    }

    const next = stepNight(
      state,
      { movement: { x: 0, y: 0 }, operate: true, carryPressed: false },
      1,
      { playing: true }
    )

    expect(next.timeS).toBe(45)
    expect(next.activeCallId).toBe('mercy-bell')
    expect(next.calls['mercy-bell']?.status).toBe('acknowledged')
  })
})
