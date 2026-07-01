import type { Reducer } from '@automata/engine'
import type { CircuitId, FloorId, ItemId } from '../data/schema'
import type { Action } from './actions'

export type KeeperMode = 'idle' | 'run' | 'climb' | 'carry' | 'operate'
export type NightOutcome = 'victory' | 'defeat' | null

export interface KeeperState {
  floor: FloorId
  x: number
  y: number
  mode: KeeperMode
  facing: -1 | 1
  carriedItem: ItemId | null
}

export interface CircuitState {
  requested: boolean
  powered: boolean
  tripped: boolean
}

export interface NightState {
  runId: number
  seed: number
  timeS: number
  keeper: KeeperState
  circuits: Record<CircuitId, CircuitState>
  circuitPriority: CircuitId[]
  generator: { heat: number; damage: number; capacity: number }
  integrity: number
  flooding: number
  darknessS: number
  rescues: number
  losses: number
  activeCallId: string | null
  beaconBearingDeg: number
  beaconLockS: number
  outcome: NightOutcome
  terminalReason: string | null
  score: number
}

export function createInitialNight(runId: number, seed: number): NightState {
  return {
    runId,
    seed: seed >>> 0,
    timeS: 0,
    keeper: {
      floor: 'quarters',
      x: 0,
      y: 120,
      mode: 'idle',
      facing: 1,
      carriedItem: null
    },
    circuits: {
      beacon: { requested: true, powered: true, tripped: false },
      radio: { requested: true, powered: true, tripped: false },
      bilge: { requested: true, powered: true, tripped: false },
      workshop: { requested: false, powered: false, tripped: false }
    },
    circuitPriority: ['beacon', 'radio', 'bilge', 'workshop'],
    generator: { heat: 0, damage: 0, capacity: 3 },
    integrity: 100,
    flooding: 0,
    darknessS: 0,
    rescues: 0,
    losses: 0,
    activeCallId: null,
    beaconBearingDeg: 0,
    beaconLockS: 0,
    outcome: null,
    terminalReason: null,
    score: 0
  }
}

export function createNightReducer(): Reducer<NightState, Action> {
  return (state, action) => action.type === 'nightAdvanced' ? action.night : state
}
