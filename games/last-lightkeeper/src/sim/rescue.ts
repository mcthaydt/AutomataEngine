import type { NightDefinition } from '../data/schema'
import type { DistressCallState, FeedbackEvent, NightState } from '../state/night'
import { INTERACTION_DISTANCE } from './interactions'

export interface RescueConditions {
  radioDisabled?: boolean
  beaconDisabled?: boolean
}

export interface ActiveCallText {
  shipName: string
  status: DistressCallState['status']
  danger: string
  bearingDeg?: number
  windowOpen: boolean
}

function radioOperable(
  state: NightState,
  operate: boolean,
  conditions: RescueConditions,
  definition: NightDefinition
): boolean {
  const radio = definition.stations.find((station) => station.id === 'radio')!
  return operate &&
    !conditions.radioDisabled &&
    state.circuits.radio.powered &&
    state.focus?.kind === 'station' &&
    state.focus.id === 'radio' &&
    state.keeper.floor === radio.floor &&
    Math.abs(state.keeper.x - radio.x) <= INTERACTION_DISTANCE
}

function addFeedback(state: NightState, type: FeedbackEvent['type']): NightState {
  return { ...state, feedback: [...state.feedback, { type, timeS: state.timeS }] }
}

function firstActiveCall(state: NightState, definition: NightDefinition): string | null {
  return definition.calls.find((call) => {
    const status = state.calls[call.id]?.status
    return status !== undefined && status !== 'pending' && status !== 'rescued' && status !== 'lost'
  })?.id ?? null
}

export function advanceRadioCalls(
  state: NightState,
  operate: boolean,
  dt: number,
  conditions: RescueConditions,
  definition: NightDefinition
): NightState {
  if (!Number.isFinite(dt) || dt <= 0) return state
  let next = state
  let calls = state.calls

  for (const call of definition.calls) {
    const current = calls[call.id]
    if (current?.status === 'pending' && state.timeS >= call.arrivalS) {
      calls = { ...calls, [call.id]: { ...current, status: 'incoming' } }
      next = addFeedback({ ...next, calls }, 'call-incoming')
    }
  }
  next = { ...next, calls, activeCallId: firstActiveCall({ ...next, calls }, definition) }
  const activeId = next.activeCallId
  if (activeId === null) return next

  const authored = definition.calls.find((call) => call.id === activeId)!
  const current = next.calls[activeId]!
  if (state.timeS > authored.windowEndS && current.status !== 'rescued' && current.status !== 'lost') {
    calls = { ...next.calls, [activeId]: { ...current, status: 'lost' } }
    next = addFeedback({ ...next, calls, losses: next.losses + 1 }, 'ship-lost')
    return { ...next, activeCallId: firstActiveCall(next, definition) }
  }

  if (!radioOperable(next, operate, conditions, definition)) return next
  if (current.status === 'incoming') {
    calls = { ...next.calls, [activeId]: { ...current, status: 'acknowledged' } }
    return addFeedback({ ...next, calls }, 'call-acknowledged')
  }
  if (current.status === 'acknowledged' || current.status === 'identifying') {
    const identifyProgressS = Math.min(authored.identifyS, current.identifyProgressS + dt)
    const status = identifyProgressS >= authored.identifyS ? 'bearingKnown' : 'identifying'
    calls = { ...next.calls, [activeId]: { ...current, status, identifyProgressS } }
    next = { ...next, calls }
    return status === 'bearingKnown' ? addFeedback(next, 'bearing-known') : next
  }
  return next
}

export function getActiveCallText(
  state: NightState,
  definition: NightDefinition
): ActiveCallText | null {
  if (state.activeCallId === null) return null
  const authored = definition.calls.find((call) => call.id === state.activeCallId)
  const call = state.calls[state.activeCallId]
  if (authored === undefined || call === undefined) return null
  const bearingKnown = ['bearingKnown', 'guiding', 'rescued'].includes(call.status)
  return {
    shipName: authored.shipName,
    status: call.status,
    danger: authored.danger,
    ...(bearingKnown ? { bearingDeg: authored.bearingDeg } : {}),
    windowOpen: state.timeS >= authored.windowStartS && state.timeS <= authored.windowEndS
  }
}

function beaconOperable(
  state: NightState,
  operate: boolean,
  conditions: RescueConditions,
  definition: NightDefinition
): boolean {
  const beacon = definition.stations.find((station) => station.id === 'beacon')!
  return operate &&
    !conditions.beaconDisabled &&
    state.circuits.beacon.powered &&
    state.focus?.kind === 'station' &&
    state.focus.id === 'beacon' &&
    state.keeper.floor === beacon.floor &&
    Math.abs(state.keeper.x - beacon.x) <= INTERACTION_DISTANCE
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function advanceBeaconGuidance(
  state: NightState,
  verticalIntent: number,
  operate: boolean,
  dt: number,
  conditions: RescueConditions,
  definition: NightDefinition
): NightState {
  if (!Number.isFinite(dt) || dt <= 0) return state
  const operable = beaconOperable(state, operate, conditions, definition)
  const beaconBearingDeg = operable
    ? clamp(
      state.beaconBearingDeg + clamp(verticalIntent, -1, 1) * definition.rules.rescue.aimSpeedDegS * dt,
      -90,
      90
    )
    : state.beaconBearingDeg

  const activeId = state.activeCallId
  if (activeId === null) return beaconBearingDeg === state.beaconBearingDeg
    ? state
    : { ...state, beaconBearingDeg }
  const authored = definition.calls.find((call) => call.id === activeId)
  const current = state.calls[activeId]
  if (
    authored === undefined ||
    current === undefined ||
    current.status === 'rescued' ||
    current.status === 'lost' ||
    !['bearingKnown', 'guiding'].includes(current.status)
  ) return { ...state, beaconBearingDeg }

  const windowOpen = state.timeS >= authored.windowStartS && state.timeS <= authored.windowEndS
  const withinTolerance = Math.abs(beaconBearingDeg - authored.bearingDeg) <=
    definition.rules.rescue.bearingToleranceDeg
  const gainingLock = operable && windowOpen && withinTolerance
  const lockS = gainingLock
    ? Math.min(authored.holdS, current.lockS + dt)
    : Math.max(0, current.lockS - definition.rules.rescue.lockDecayPerS * dt)
  const rescued = lockS >= authored.holdS
  const status: DistressCallState['status'] = rescued
    ? 'rescued'
    : lockS > 0
      ? 'guiding'
      : 'bearingKnown'
  const calls = {
    ...state.calls,
    [activeId]: { ...current, status, lockS, scoreAwarded: current.scoreAwarded || rescued }
  }
  let next: NightState = { ...state, beaconBearingDeg, beaconLockS: lockS, calls }
  if (rescued && !current.scoreAwarded) {
    next = {
      ...next,
      activeCallId: null,
      rescues: next.rescues + 1,
      score: next.score + definition.score.rescue
    }
    next = addFeedback(next, 'ship-rescued')
  }
  return next
}
