import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import {
  activateFailure,
  advanceRepairs,
  getFailureConditions
} from '../../src/sim/failures'
import { createInitialNight } from '../../src/state/night'

describe('failures and repairs', () => {
  it('activates every shipped data-defined failure and its consequence', () => {
    const ids = nightDefinition.failures.map((failure) => failure.id)
    expect(ids).toEqual([
      'blown-fuse',
      'jammed-pump',
      'broken-window',
      'beacon-misalignment',
      'generator-damage',
      'overheating',
      'lightning-damage',
      'radio-interference'
    ])

    let state = createInitialNight(1, 42)
    for (const id of ids) state = activateFailure(state, id, 0.75, nightDefinition)
    const conditions = getFailureConditions(state)

    expect(conditions).toMatchObject({
      pumpJammed: true,
      brokenWindows: 1,
      beaconDisabled: true,
      radioDisabled: true
    })
    expect(state.circuits.workshop.tripped).toBe(true)
    expect(state.circuits.radio.tripped).toBe(true)
    expect(state.generator.damage).toBeGreaterThan(0)
    expect(state.generator.heat).toBeGreaterThanOrEqual(nightDefinition.rules.machinery.overheatThreshold)
    expect(state.integrity).toBeLessThan(100)
  })

  it('requires station proximity, the required item, and held operation', () => {
    const active = activateFailure(createInitialNight(1, 42), 'jammed-pump', 1, nightDefinition)
    const prepared = {
      ...active,
      keeper: {
        ...active.keeper,
        floor: 'machinery' as const,
        x: 60,
        y: 24,
        carriedItem: 'pump-handle' as const,
        mode: 'operate' as const
      },
      items: { ...active.items, 'pump-handle': 'carried' as const },
      focus: { kind: 'station' as const, id: 'pump' as const, prompt: 'Operate Bilge Pump', distance: 0 }
    }

    expect(advanceRepairs(prepared, true, 2, nightDefinition)).toBe(prepared)
    const inRange = { ...prepared, keeper: { ...prepared.keeper, x: 38 } }
    expect(advanceRepairs(inRange, false, 2, nightDefinition)).toBe(inRange)
    const wrongItem = {
      ...inRange,
      keeper: { ...inRange.keeper, carriedItem: 'wrench' as const },
      items: { ...inRange.items, 'pump-handle': 'racked' as const, wrench: 'carried' as const }
    }
    expect(advanceRepairs(wrongItem, true, 2, nightDefinition)).toBe(wrongItem)
  })

  it('preserves interrupted progress and completes a reusable-tool repair', () => {
    const active = activateFailure(createInitialNight(1, 42), 'jammed-pump', 1, nightDefinition)
    const prepared = {
      ...active,
      keeper: {
        ...active.keeper,
        floor: 'machinery' as const,
        x: 38,
        y: 24,
        carriedItem: 'pump-handle' as const,
        mode: 'operate' as const
      },
      items: { ...active.items, 'pump-handle': 'carried' as const },
      focus: { kind: 'station' as const, id: 'pump' as const, prompt: 'Operate Bilge Pump', distance: 0 }
    }
    const duration = nightDefinition.failures.find((failure) => failure.id === 'jammed-pump')!.durationS

    const partial = advanceRepairs(prepared, true, duration / 2, nightDefinition)
    expect(partial.activeFailures['jammed-pump']?.progressS).toBe(duration / 2)
    const interrupted = advanceRepairs(partial, false, 1, nightDefinition)
    expect(interrupted).toBe(partial)

    const repaired = advanceRepairs(interrupted, true, duration / 2, nightDefinition)
    expect(repaired.activeFailures['jammed-pump']).toBeUndefined()
    expect(repaired.keeper.carriedItem).toBeNull()
    expect(repaired.items['pump-handle']).toBe('racked')
    expect(getFailureConditions(repaired).pumpJammed).toBe(false)
  })

  it('consumes supplies and removes tripped-circuit consequences on repair', () => {
    const active = activateFailure(createInitialNight(1, 42), 'blown-fuse', 1, nightDefinition)
    const prepared = {
      ...active,
      keeper: {
        ...active.keeper,
        floor: 'quarters' as const,
        x: -8,
        y: 120,
        carriedItem: 'fuse' as const,
        mode: 'operate' as const
      },
      items: { ...active.items, fuse: 'carried' as const },
      focus: { kind: 'station' as const, id: 'breaker' as const, prompt: 'Operate Breaker Panel', distance: 0 }
    }
    const duration = nightDefinition.failures.find((failure) => failure.id === 'blown-fuse')!.durationS
    const repaired = advanceRepairs(prepared, true, duration, nightDefinition)

    expect(repaired.activeFailures['blown-fuse']).toBeUndefined()
    expect(repaired.items.fuse).toBe('consumed')
    expect(repaired.circuits.workshop.tripped).toBe(false)
  })
})
