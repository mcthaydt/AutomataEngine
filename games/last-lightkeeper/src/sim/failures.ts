import type { FailureId, NightDefinition } from '../data/schema'
import type { ActiveFailure, NightState } from '../state/night'
import { completeCarriedItemUse, INTERACTION_DISTANCE } from './interactions'

export interface FailureConditions {
  pumpJammed: boolean
  brokenWindows: number
  beaconDisabled: boolean
  radioDisabled: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function getFailureConditions(state: NightState): FailureConditions {
  return {
    pumpJammed: state.activeFailures['jammed-pump'] !== undefined,
    brokenWindows: state.activeFailures['broken-window'] === undefined ? 0 : 1,
    beaconDisabled: state.activeFailures['beacon-misalignment'] !== undefined,
    radioDisabled: state.activeFailures['radio-interference'] !== undefined
  }
}

export function activateFailure(
  state: NightState,
  id: FailureId,
  severity: number,
  definition: NightDefinition
): NightState {
  if (state.activeFailures[id] !== undefined) return state
  const failure = definition.failures.find((candidate) => candidate.id === id)
  if (failure === undefined) return state

  const active: ActiveFailure = {
    id,
    severity: clamp(severity, 0, 1),
    progressS: 0,
    activatedAtS: state.timeS
  }
  let next: NightState = {
    ...state,
    activeFailures: { ...state.activeFailures, [id]: active }
  }
  if (failure.consequence === 'trip-workshop') {
    next = {
      ...next,
      circuits: {
        ...next.circuits,
        workshop: { ...next.circuits.workshop, tripped: true, powered: false }
      }
    }
  } else if (failure.consequence === 'disable-radio') {
    next = {
      ...next,
      circuits: {
        ...next.circuits,
        radio: { ...next.circuits.radio, tripped: true, powered: false }
      }
    }
  } else if (failure.consequence === 'damage-generator') {
    next = {
      ...next,
      generator: { ...next.generator, damage: clamp(next.generator.damage + 0.25 * active.severity, 0, 1) }
    }
  } else if (failure.consequence === 'overheat') {
    next = {
      ...next,
      generator: {
        ...next.generator,
        heat: Math.max(next.generator.heat, definition.rules.machinery.overheatThreshold)
      }
    }
  } else if (failure.consequence === 'lightning') {
    next = { ...next, integrity: clamp(next.integrity - 15 * active.severity, 0, 100) }
  }
  return next
}

function finishFailure(
  state: NightState,
  active: ActiveFailure,
  definition: NightDefinition
): NightState {
  const failure = definition.failures.find((candidate) => candidate.id === active.id)!
  const activeFailures = { ...state.activeFailures }
  delete activeFailures[active.id]
  let next: NightState = { ...state, activeFailures }

  if (failure.consequence === 'trip-workshop') {
    next = {
      ...next,
      circuits: {
        ...next.circuits,
        workshop: { ...next.circuits.workshop, tripped: false }
      }
    }
  } else if (failure.consequence === 'disable-radio') {
    next = {
      ...next,
      circuits: { ...next.circuits, radio: { ...next.circuits.radio, tripped: false } }
    }
  } else if (failure.consequence === 'damage-generator') {
    next = {
      ...next,
      generator: { ...next.generator, damage: clamp(next.generator.damage - 0.25 * active.severity, 0, 1) }
    }
  } else if (failure.consequence === 'overheat') {
    next = {
      ...next,
      generator: {
        ...next.generator,
        heat: Math.min(next.generator.heat, definition.rules.machinery.overheatThreshold - 0.2)
      }
    }
  }
  return completeCarriedItemUse(next, definition)
}

export function advanceRepairs(
  state: NightState,
  operate: boolean,
  dt: number,
  definition: NightDefinition
): NightState {
  if (!operate || !Number.isFinite(dt) || dt <= 0 || state.focus?.kind !== 'station') return state
  const station = definition.stations.find((candidate) => candidate.id === state.focus!.id)
  if (
    station === undefined ||
    station.floor !== state.keeper.floor ||
    Math.abs(station.x - state.keeper.x) > INTERACTION_DISTANCE
  ) return state

  const candidates = Object.values(state.activeFailures)
    .filter((active): active is ActiveFailure => active !== undefined)
    .filter((active) => {
      const failure = definition.failures.find((candidate) => candidate.id === active.id)!
      return failure.station === station.id && failure.requiredItem === state.keeper.carriedItem
    })
    .sort((left, right) => left.activatedAtS - right.activatedAtS || left.id.localeCompare(right.id))
  const active = candidates[0]
  if (active === undefined) return state

  const failure = definition.failures.find((candidate) => candidate.id === active.id)!
  const progressS = Math.min(failure.durationS, active.progressS + dt)
  if (progressS < failure.durationS) {
    return {
      ...state,
      activeFailures: {
        ...state.activeFailures,
        [active.id]: { ...active, progressS }
      }
    }
  }
  return finishFailure(state, active, definition)
}
