import type { NightDefinition } from '../data/schema'
import type { NightState, StormEvent } from '../state/night'
import { activateFailure } from './failures'
import type { SeededRng } from './rng'

export function createStormSchedule(
  definition: NightDefinition,
  rng: SeededRng
): StormEvent[] {
  const schedule: StormEvent[] = []
  for (const phase of definition.phases) {
    const eligible = definition.failures.filter((failure) => failure.eligiblePhases.includes(phase.id))
    const duration = phase.endS - phase.startS
    for (let index = 0; index < phase.eventBudget; index++) {
      schedule.push({
        id: `${phase.id}-${index + 1}`,
        kind: 'failure',
        timeS: phase.startS + duration * (index + 1) / (phase.eventBudget + 1),
        failureId: rng.choose(eligible).id,
        severity: phase.severity
      })
    }
  }
  schedule.push({
    id: 'final-blackout',
    kind: 'final-blackout',
    timeS: definition.storm.finalBlackoutS,
    failureId: null,
    severity: 1
  })
  return schedule.sort((left, right) => left.timeS - right.timeS || left.id.localeCompare(right.id))
}

export function initializeStormDirector(
  state: NightState,
  schedule: readonly StormEvent[]
): NightState {
  return { ...state, storm: { schedule: [...schedule], nextEventIndex: 0 } }
}

function applyFinalBlackout(state: NightState): NightState {
  return {
    ...state,
    circuits: {
      beacon: { ...state.circuits.beacon, tripped: true, powered: false },
      radio: { ...state.circuits.radio, tripped: true, powered: false },
      bilge: { ...state.circuits.bilge, tripped: true, powered: false },
      workshop: { ...state.circuits.workshop, tripped: true, powered: false }
    }
  }
}

export function advanceStormDirector(
  state: NightState,
  targetTimeS: number,
  definition: NightDefinition
): NightState {
  let index = state.storm.nextEventIndex
  if (state.storm.schedule[index]?.timeS === undefined || state.storm.schedule[index]!.timeS > targetTimeS) {
    return state
  }

  let next = state
  while (index < state.storm.schedule.length) {
    const event = state.storm.schedule[index]!
    if (event.timeS > targetTimeS) break

    if (event.kind === 'final-blackout') {
      next = applyFinalBlackout(next)
    } else if (
      event.failureId !== null &&
      Object.values(next.activeFailures).length < definition.storm.maxActiveFailures
    ) {
      const currentTimeS = next.timeS
      next = activateFailure({ ...next, timeS: event.timeS }, event.failureId, event.severity, definition)
      next = { ...next, timeS: currentTimeS }
    }
    index++
  }
  return { ...next, storm: { ...next.storm, nextEventIndex: index } }
}
