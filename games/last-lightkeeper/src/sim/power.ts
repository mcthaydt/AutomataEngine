import type { CircuitId } from '../data/schema'
import type { CircuitState, NightState } from '../state/night'

export const REDUCED_CAPACITY_THRESHOLD = 0.6
export const CRITICAL_CAPACITY_THRESHOLD = 0.75

export function effectiveGeneratorCapacity(generator: NightState['generator']): number {
  const pressure = Math.max(generator.heat, generator.damage)
  if (pressure >= CRITICAL_CAPACITY_THRESHOLD) return 1
  if (pressure >= REDUCED_CAPACITY_THRESHOLD) return 2
  return 3
}

export function resolvePower(state: NightState): NightState {
  const capacity = effectiveGeneratorCapacity(state.generator)
  let remaining = capacity
  const circuits = { ...state.circuits }

  for (const id of state.circuitPriority) {
    const circuit = state.circuits[id]
    const powered = circuit.requested && !circuit.tripped && remaining > 0
    circuits[id] = { ...circuit, powered }
    if (powered) remaining--
  }

  return {
    ...state,
    generator: { ...state.generator, capacity },
    circuits
  }
}

export function setCircuitRequested(
  state: NightState,
  circuitId: CircuitId,
  requested: boolean
): NightState {
  if (
    state.keeper.mode !== 'operate' ||
    state.focus?.kind !== 'station' ||
    state.focus.id !== 'breaker' ||
    state.circuits[circuitId].requested === requested
  ) return state

  const circuit: CircuitState = { ...state.circuits[circuitId], requested }
  return { ...state, circuits: { ...state.circuits, [circuitId]: circuit } }
}
