import type { NightDefinition } from '../data/schema'
import type { FeedbackEvent, NightState } from '../state/night'

export interface MachineryConditions {
  pumpJammed: boolean
  brokenWindows: number
}

export type MachineryRates = NightDefinition['rules']['machinery']

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function crossingEvent(
  previous: number,
  next: number,
  threshold: number,
  type: FeedbackEvent['type'],
  timeS: number
): FeedbackEvent[] {
  return previous < threshold && next >= threshold ? [{ type, timeS }] : []
}

export function advanceMachinery(
  state: NightState,
  dt: number,
  conditions: MachineryConditions,
  rates: MachineryRates
): NightState {
  if (!Number.isFinite(dt) || dt <= 0) return state

  const poweredCount = Object.values(state.circuits).filter((circuit) => circuit.powered).length
  const heatDelta = poweredCount >= 2
    ? poweredCount * rates.heatPerPoweredCircuitS * dt
    : -rates.coolingPerS * dt
  const heat = clamp(state.generator.heat + heatDelta, 0, 1)
  const damage = clamp(
    state.generator.damage + (heat >= rates.overheatThreshold ? rates.overheatDamagePerS * dt : 0),
    0,
    1
  )

  const pumpWorking = state.circuits.bilge.powered && !conditions.pumpJammed
  const ingress = rates.floodIngressPerS +
    Math.max(0, conditions.brokenWindows) * rates.brokenWindowIngressPerS
  const flooding = clamp(
    state.flooding + (pumpWorking ? ingress - rates.pumpDrainPerS : ingress) * dt,
    0,
    100
  )
  const integrity = clamp(
    state.integrity - (flooding >= rates.highWaterThreshold ? rates.highWaterDamagePerS * dt : 0),
    0,
    100
  )
  const darknessS = state.circuits.beacon.powered ? 0 : state.darknessS + dt

  const feedback = [
    ...state.feedback,
    ...crossingEvent(state.generator.heat, heat, rates.overheatThreshold, 'generator-overheat', state.timeS),
    ...crossingEvent(state.flooding, flooding, rates.highWaterThreshold, 'high-water', state.timeS),
    ...crossingEvent(state.darknessS, darknessS, rates.darknessWarningS, 'darkness-warning', state.timeS)
  ]

  return {
    ...state,
    generator: { ...state.generator, heat, damage },
    flooding,
    integrity,
    darknessS,
    feedback
  }
}
