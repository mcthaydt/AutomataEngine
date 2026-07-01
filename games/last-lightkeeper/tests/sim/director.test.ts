import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import {
  advanceStormDirector,
  createStormSchedule,
  initializeStormDirector
} from '../../src/sim/director'
import { createRng } from '../../src/sim/rng'
import { createInitialNight } from '../../src/state/night'

const seedOneIds = [
  'blown-fuse',
  'blown-fuse', 'overheating', 'blown-fuse',
  'beacon-misalignment', 'jammed-pump', 'jammed-pump', 'blown-fuse', 'beacon-misalignment',
  'overheating', 'generator-damage', 'broken-window', 'overheating',
  'blown-fuse', 'blown-fuse', 'lightning-damage',
  'jammed-pump'
]

const seedTwoIds = [
  'blown-fuse',
  'blown-fuse', 'blown-fuse', 'jammed-pump',
  'radio-interference', 'jammed-pump', 'radio-interference', 'broken-window', 'jammed-pump',
  'broken-window', 'broken-window', 'radio-interference', 'blown-fuse',
  'overheating', 'blown-fuse', 'generator-damage',
  'broken-window'
]

describe('deterministic storm director', () => {
  it('creates exact repeatable schedules for two seeds', () => {
    const one = createStormSchedule(nightDefinition, createRng(1))
    const two = createStormSchedule(nightDefinition, createRng(2))

    expect(one.filter((event) => event.kind === 'failure').map((event) => event.failureId)).toEqual(seedOneIds)
    expect(two.filter((event) => event.kind === 'failure').map((event) => event.failureId)).toEqual(seedTwoIds)
    expect(createStormSchedule(nightDefinition, createRng(1))).toEqual(one)
  })

  it('keeps failures phase-eligible, cooldown-spaced, and increasingly severe', () => {
    const schedule = createStormSchedule(nightDefinition, createRng(1))
    const regular = schedule.filter((event) => event.kind === 'failure')

    for (const event of regular) {
      const phase = nightDefinition.phases.find((candidate) =>
        event.timeS >= candidate.startS && event.timeS < candidate.endS
      )!
      const failure = nightDefinition.failures.find((candidate) => candidate.id === event.failureId)!
      expect(failure.eligiblePhases).toContain(phase.id)
    }
    for (let index = 1; index < regular.length; index++) {
      expect(regular[index]!.timeS - regular[index - 1]!.timeS)
        .toBeGreaterThanOrEqual(nightDefinition.storm.cooldownS)
    }
    expect(regular.find((event) => event.timeS >= 540)!.severity)
      .toBeGreaterThan(regular.find((event) => event.timeS < 150)!.severity)
  })

  it('always includes the authored final blackout event', () => {
    const schedule = createStormSchedule(nightDefinition, createRng(7))
    expect(schedule).toContainEqual({
      id: 'final-blackout',
      kind: 'final-blackout',
      timeS: nightDefinition.storm.finalBlackoutS,
      failureId: null,
      severity: 1
    })
  })

  it('enforces the active stack budget, emits due events once, and preserves the schedule', () => {
    const schedule = createStormSchedule(nightDefinition, createRng(2))
    const initial = initializeStormDirector(createInitialNight(1, 2), schedule)
    const advanced = advanceStormDirector(initial, 610, nightDefinition)

    expect(Object.values(advanced.activeFailures)).toHaveLength(nightDefinition.storm.maxActiveFailures)
    expect(Object.values(advanced.circuits).every((circuit) => circuit.tripped && !circuit.powered)).toBe(true)
    expect(advanced.storm.schedule).toEqual(schedule)
    expect(advanced.storm.nextEventIndex).toBeGreaterThan(0)

    const repeated = advanceStormDirector(advanced, 610, nightDefinition)
    expect(repeated).toBe(advanced)
  })
})
