import type { InputVector } from '@automata/engine'
import { nightDefinition } from '../data/night'
import type { NightDefinition } from '../data/schema'
import type { NightState } from '../state/night'
import { advanceStormDirector, createStormSchedule, initializeStormDirector } from './director'
import { advanceRepairs, getFailureConditions } from './failures'
import { applyCarryIntent, findFocusedInteraction } from './interactions'
import { advanceMachinery, type MachineryConditions } from './machinery'
import { moveKeeper } from './movement'
import { cycleCircuitPriority, resolvePower } from './power'
import { advanceBeaconGuidance, advanceRadioCalls } from './rescue'
import { createRng } from './rng'
import { calculateScoreBreakdown } from './score'
import { evaluateTerminal } from './terminal'

export interface NightIntents {
  movement: InputVector
  operate: boolean
  carryPressed: boolean
  interactPressed?: boolean
}

export interface NightStepServices {
  playing: boolean
  definition?: NightDefinition
  machineryConditions?: MachineryConditions
}

export function stepNight(
  state: NightState,
  intents: NightIntents,
  dt: number,
  services: NightStepServices
): NightState {
  if (!services.playing || state.outcome !== null || !Number.isFinite(dt) || dt <= 0) return state

  const definition = services.definition ?? nightDefinition
  const keeper = moveKeeper(
    state.keeper,
    { movement: intents.movement, operate: false },
    dt,
    { playing: true, definition }
  )
  let next: NightState = { ...state, keeper, focus: null }
  next = { ...next, focus: findFocusedInteraction(next, definition) }

  if (intents.carryPressed) {
    next = applyCarryIntent(next, definition)
    next = { ...next, focus: findFocusedInteraction(next, definition) }
  }

  if (intents.operate && next.focus?.kind === 'station' && next.keeper.mode !== 'climb') {
    next = { ...next, keeper: { ...next.keeper, mode: 'operate' } }
  }
  if (intents.interactPressed) next = cycleCircuitPriority(next)
  next = advanceRepairs(next, intents.operate, dt, definition)
  next = resolvePower(next)
  const failureConditions = getFailureConditions(next)
  next = advanceMachinery(
    next,
    dt,
    services.machineryConditions ?? {
      pumpJammed: failureConditions.pumpJammed,
      brokenWindows: failureConditions.brokenWindows,
      beaconDisabled: failureConditions.beaconDisabled
    },
    definition.rules.machinery
  )
  if (next.storm.schedule.length === 0) {
    next = initializeStormDirector(next, createStormSchedule(definition, createRng(next.seed)))
  }
  const targetTimeS = next.timeS + dt
  next = { ...next, timeS: targetTimeS }
  next = advanceRadioCalls(
    next,
    intents.operate,
    dt,
    { radioDisabled: failureConditions.radioDisabled },
    definition
  )
  next = advanceBeaconGuidance(
    next,
    intents.movement.y,
    intents.operate,
    dt,
    { beaconDisabled: failureConditions.beaconDisabled, radioDisabled: failureConditions.radioDisabled },
    definition
  )
  next = advanceStormDirector(next, targetTimeS, definition)
  next = evaluateTerminal(next, definition)
  if (next.outcome !== null) {
    next = { ...next, score: calculateScoreBreakdown(next, definition).total }
  }
  return next
}
