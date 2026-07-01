import { nightDefinition } from '../data/night'
import type { FloorId, NightDefinition, StationId } from '../data/schema'
import { createInitialNight, type NightState } from '../state/night'
import { activateFailure } from './failures'
import { KEEPER_CLIMB_SPEED, KEEPER_MOVE_SPEED } from './movement'
import { resolvePower, setCircuitRequested } from './power'
import { stepNight, type NightIntents } from './step'

export type HeadlessMode = 'victory' | 'failure'

export interface HeadlessTrace {
  movement: boolean
  carrying: boolean
  radio: boolean
  powerRouting: boolean
  repair: boolean
  beacon: boolean
  timeAdvanced: boolean
}

export interface HeadlessSnapshot {
  timeS: number
  floor: FloorId
  x: number
  flooding: number
  rescues: number
  outcome: NightState['outcome']
}

export interface HeadlessResult {
  state: NightState
  trace: HeadlessTrace
  snapshots: HeadlessSnapshot[]
}

const IDLE_INTENTS: NightIntents = {
  movement: { x: 0, y: 0 },
  operate: false,
  carryPressed: false
}

function calmDefinition(floodIngressPerS = 0): NightDefinition {
  return {
    ...nightDefinition,
    phases: nightDefinition.phases.map((phase) => ({ ...phase, eventBudget: 0 })),
    storm: { ...nightDefinition.storm, finalBlackoutS: 10_000 },
    rules: {
      ...nightDefinition.rules,
      machinery: {
        ...nightDefinition.rules.machinery,
        heatPerPoweredCircuitS: 0.000_001,
        floodIngressPerS
      }
    }
  }
}

function createRunner(initial: NightState, definition: NightDefinition) {
  let state = initial
  const trace: HeadlessTrace = {
    movement: false,
    carrying: false,
    radio: false,
    powerRouting: false,
    repair: false,
    beacon: false,
    timeAdvanced: false
  }
  const snapshots: HeadlessSnapshot[] = []

  const record = () => snapshots.push({
    timeS: state.timeS,
    floor: state.keeper.floor,
    x: state.keeper.x,
    flooding: state.flooding,
    rescues: state.rescues,
    outcome: state.outcome
  })

  const tick = (intents: NightIntents, dt: number) => {
    const before = state
    const failureCount = Object.values(before.activeFailures).length
    state = stepNight(state, intents, dt, { playing: true, definition })
    trace.movement ||= before.keeper.x !== state.keeper.x || before.keeper.floor !== state.keeper.floor
    trace.carrying ||= state.keeper.carriedItem !== null
    trace.radio ||= Object.values(state.calls).some((call) => call.status !== 'pending')
    trace.repair ||= Object.values(state.activeFailures).length < failureCount
    trace.beacon ||= state.beaconBearingDeg !== before.beaconBearingDeg || state.rescues > before.rescues
    trace.timeAdvanced ||= state.timeS > before.timeS
    record()
  }

  const horizontalTo = (x: number) => {
    while (Math.abs(state.keeper.x - x) > 0.000_001 && state.outcome === null) {
      const distance = x - state.keeper.x
      tick(
        { ...IDLE_INTENTS, movement: { x: Math.sign(distance), y: 0 } },
        Math.min(0.25, Math.abs(distance) / KEEPER_MOVE_SPEED)
      )
    }
  }

  const floorIndex = (floor: FloorId) => definition.floors.findIndex((candidate) => candidate.id === floor)
  const moveToFloor = (target: FloorId) => {
    while (state.keeper.floor !== target && state.outcome === null) {
      const currentIndex = floorIndex(state.keeper.floor)
      const targetIndex = floorIndex(target)
      const nextFloor = definition.floors[currentIndex + Math.sign(targetIndex - currentIndex)]!
      const ladder = definition.ladders.find((candidate) =>
        (candidate.from === state.keeper.floor && candidate.to === nextFloor.id) ||
        (candidate.to === state.keeper.floor && candidate.from === nextFloor.id)
      )!
      horizontalTo(ladder.x)
      const vertical = Math.sign(nextFloor.y - state.keeper.y)
      tick(
        { ...IDLE_INTENTS, movement: { x: 0, y: vertical } },
        Math.abs(nextFloor.y - state.keeper.y) / KEEPER_CLIMB_SPEED
      )
    }
  }

  const moveToStation = (id: StationId) => {
    const station = definition.stations.find((candidate) => candidate.id === id)!
    moveToFloor(station.floor)
    horizontalTo(station.x)
  }

  const advanceTo = (targetTimeS: number) => {
    while (state.timeS < targetTimeS && state.outcome === null) {
      tick(IDLE_INTENTS, Math.min(1, targetTimeS - state.timeS))
    }
  }

  const routeWorkshopPower = () => {
    moveToStation('breaker')
    tick({ ...IDLE_INTENTS, operate: true }, 1 / 60)
    const requested = setCircuitRequested(state, 'workshop', true)
    trace.powerRouting ||= requested !== state
    state = resolvePower(requested)
    record()
  }

  return {
    get state() { return state },
    trace,
    snapshots,
    tick,
    horizontalTo,
    moveToFloor,
    moveToStation,
    advanceTo,
    routeWorkshopPower
  }
}

function runVictory(): HeadlessResult {
  const definition = calmDefinition()
  const failed = activateFailure(createInitialNight(1, 42), 'jammed-pump', 1, definition)
  const runner = createRunner(failed, definition)

  runner.moveToFloor('workshop')
  runner.horizontalTo(0)
  runner.tick({ ...IDLE_INTENTS, carryPressed: true }, 1 / 60)
  runner.moveToStation('pump')
  const repairS = definition.failures.find((failure) => failure.id === 'jammed-pump')!.durationS
  runner.tick({ ...IDLE_INTENTS, operate: true }, repairS)
  runner.routeWorkshopPower()

  for (const call of definition.calls.slice(0, definition.rules.rescueTarget)) {
    runner.moveToStation('radio')
    runner.advanceTo(call.arrivalS)
    runner.tick({ ...IDLE_INTENTS, operate: true }, 1 / 60)
    runner.tick({ ...IDLE_INTENTS, operate: true }, call.identifyS)

    runner.moveToStation('beacon')
    runner.advanceTo(call.windowStartS)
    const aimDelta = call.bearingDeg - runner.state.beaconBearingDeg
    if (aimDelta !== 0) {
      runner.tick(
        { ...IDLE_INTENTS, movement: { x: 0, y: Math.sign(aimDelta) }, operate: true },
        Math.abs(aimDelta) / definition.rules.rescue.aimSpeedDegS
      )
    }
    runner.tick({ ...IDLE_INTENTS, operate: true }, call.holdS)
  }

  runner.advanceTo(definition.rules.durationS)
  return { state: runner.state, trace: runner.trace, snapshots: runner.snapshots }
}

function runFailure(): HeadlessResult {
  const definition = calmDefinition(1)
  const initial = createInitialNight(2, 7)
  initial.flooding = 99
  initial.circuits.bilge = { ...initial.circuits.bilge, requested: false, powered: false }
  const runner = createRunner(initial, definition)
  runner.tick(IDLE_INTENTS, 2)
  return { state: runner.state, trace: runner.trace, snapshots: runner.snapshots }
}

export function runHeadlessScenario(mode: HeadlessMode): HeadlessResult {
  return mode === 'victory' ? runVictory() : runFailure()
}
