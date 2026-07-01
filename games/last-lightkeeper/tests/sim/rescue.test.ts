import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import {
  advanceBeaconGuidance,
  advanceRadioCalls,
  getActiveCallText
} from '../../src/sim/rescue'
import { createInitialNight } from '../../src/state/night'

function atRadio(timeS = 45) {
  const state = createInitialNight(1, 42)
  return {
    ...state,
    timeS,
    keeper: {
      ...state.keeper,
      floor: 'navigation' as const,
      x: -28,
      y: 168,
      mode: 'operate' as const
    },
    focus: { kind: 'station' as const, id: 'radio' as const, prompt: 'Operate Radio', distance: 0 }
  }
}

describe('distress call progression', () => {
  it('activates an incoming call at its authored arrival time', () => {
    const next = advanceRadioCalls(atRadio(), false, 1, { radioDisabled: false }, nightDefinition)
    expect(next.activeCallId).toBe('mercy-bell')
    expect(next.calls['mercy-bell']).toMatchObject({ status: 'incoming', identifyProgressS: 0 })
    expect(getActiveCallText(next, nightDefinition)).toMatchObject({
      shipName: 'Mercy Bell',
      status: 'incoming',
      danger: 'reef shelf east of the lantern'
    })
  })

  it('acknowledges only at a powered, non-interfered radio', () => {
    const incoming = advanceRadioCalls(atRadio(), false, 1, { radioDisabled: false }, nightDefinition)
    const acknowledged = advanceRadioCalls(incoming, true, 1, { radioDisabled: false }, nightDefinition)
    expect(acknowledged.calls['mercy-bell']?.status).toBe('acknowledged')

    const unpowered = atRadio()
    unpowered.circuits.radio = { ...unpowered.circuits.radio, powered: false }
    expect(advanceRadioCalls(unpowered, true, 1, { radioDisabled: false }, nightDefinition)
      .calls['mercy-bell']?.status).toBe('incoming')
    expect(advanceRadioCalls(atRadio(), true, 1, { radioDisabled: true }, nightDefinition)
      .calls['mercy-bell']?.status).toBe('incoming')
  })

  it('identifies while operation is held and pauses during interference', () => {
    let state = advanceRadioCalls(atRadio(), false, 1, { radioDisabled: false }, nightDefinition)
    state = advanceRadioCalls(state, true, 1, { radioDisabled: false }, nightDefinition)
    state = advanceRadioCalls(state, true, 2, { radioDisabled: false }, nightDefinition)
    expect(state.calls['mercy-bell']).toMatchObject({ status: 'identifying', identifyProgressS: 2 })

    const paused = advanceRadioCalls(state, true, 2, { radioDisabled: true }, nightDefinition)
    expect(paused.calls['mercy-bell']).toEqual(state.calls['mercy-bell'])

    const known = advanceRadioCalls(paused, true, 2, { radioDisabled: false }, nightDefinition)
    expect(known.calls['mercy-bell']).toMatchObject({ status: 'bearingKnown', identifyProgressS: 4 })
    expect(getActiveCallText(known, nightDefinition)).toMatchObject({ bearingDeg: -28 })
  })

  it('reports the rescue window and marks an unresolved call lost after close', () => {
    const state = atRadio(85)
    state.calls['mercy-bell'] = {
      ...state.calls['mercy-bell']!,
      status: 'bearingKnown',
      identifyProgressS: 4
    }
    state.activeCallId = 'mercy-bell'
    expect(getActiveCallText(state, nightDefinition)).toMatchObject({ windowOpen: true })

    state.timeS = 146
    const lost = advanceRadioCalls(state, false, 1, { radioDisabled: false }, nightDefinition)
    expect(lost.calls['mercy-bell']?.status).toBe('lost')
    expect(lost.losses).toBe(1)
    expect(lost.feedback.filter((event) => event.type === 'ship-lost')).toHaveLength(1)

    const repeated = advanceRadioCalls(lost, false, 1, { radioDisabled: false }, nightDefinition)
    expect(repeated.losses).toBe(1)
    expect(repeated.feedback.filter((event) => event.type === 'ship-lost')).toHaveLength(1)
  })
})

function atBeacon(timeS = 100) {
  const state = createInitialNight(1, 42)
  state.timeS = timeS
  state.activeCallId = 'mercy-bell'
  state.calls['mercy-bell'] = {
    ...state.calls['mercy-bell']!,
    status: 'bearingKnown',
    identifyProgressS: 4
  }
  state.keeper = {
    ...state.keeper,
    floor: 'lantern',
    x: 20,
    y: 216,
    mode: 'operate'
  }
  state.focus = { kind: 'station', id: 'beacon', prompt: 'Operate Beacon Controls', distance: 0 }
  return state
}

describe('beacon guidance', () => {
  it('requires powered functional controls and operator proximity to aim', () => {
    const unpowered = atBeacon()
    unpowered.circuits.beacon = { ...unpowered.circuits.beacon, powered: false }
    expect(advanceBeaconGuidance(unpowered, 1, true, 1, { beaconDisabled: false }, nightDefinition)
      .beaconBearingDeg).toBe(0)
    expect(advanceBeaconGuidance(atBeacon(), 1, true, 1, { beaconDisabled: true }, nightDefinition)
      .beaconBearingDeg).toBe(0)

    const far = atBeacon()
    far.keeper = { ...far.keeper, x: 60 }
    expect(advanceBeaconGuidance(far, 1, true, 1, { beaconDisabled: false }, nightDefinition)
      .beaconBearingDeg).toBe(0)

    expect(advanceBeaconGuidance(atBeacon(), 1, true, 1, { beaconDisabled: false }, nightDefinition)
      .beaconBearingDeg).toBe(nightDefinition.rules.rescue.aimSpeedDegS)
  })

  it('clamps beacon aim to authored bearing bounds', () => {
    const right = atBeacon()
    right.beaconBearingDeg = 85
    const left = atBeacon()
    left.beaconBearingDeg = -85
    expect(advanceBeaconGuidance(right, 1, true, 1, { beaconDisabled: false }, nightDefinition)
      .beaconBearingDeg).toBe(90)
    expect(advanceBeaconGuidance(left, -1, true, 1, { beaconDisabled: false }, nightDefinition)
      .beaconBearingDeg).toBe(-90)
  })

  it('builds lock within tolerance and decays it when aim is lost', () => {
    const state = atBeacon()
    state.beaconBearingDeg = -28
    const guiding = advanceBeaconGuidance(state, 0, true, 2, { beaconDisabled: false }, nightDefinition)
    expect(guiding.calls['mercy-bell']).toMatchObject({ status: 'guiding', lockS: 2 })
    expect(guiding.beaconLockS).toBe(2)

    guiding.beaconBearingDeg = 0
    const decayed = advanceBeaconGuidance(guiding, 0, true, 1, { beaconDisabled: false }, nightDefinition)
    expect(decayed.beaconLockS).toBe(1)
    expect(decayed.calls['mercy-bell']?.status).toBe('guiding')
  })

  it('rescues once after the complete hold and never duplicates feedback or score', () => {
    const state = atBeacon()
    state.beaconBearingDeg = -28
    const rescued = advanceBeaconGuidance(state, 0, true, 5, { beaconDisabled: false }, nightDefinition)

    expect(rescued.calls['mercy-bell']?.status).toBe('rescued')
    expect(rescued.rescues).toBe(1)
    expect(rescued.score).toBe(nightDefinition.score.rescue)
    expect(rescued.feedback.filter((event) => event.type === 'ship-rescued')).toHaveLength(1)

    const repeated = advanceBeaconGuidance(rescued, 0, true, 5, { beaconDisabled: false }, nightDefinition)
    expect(repeated.rescues).toBe(1)
    expect(repeated.score).toBe(nightDefinition.score.rescue)
    expect(repeated.feedback.filter((event) => event.type === 'ship-rescued')).toHaveLength(1)
  })
})
