import { SLOT_COUNT } from './config'

/** Pure fixed-dt slot clock: no wall clock or Date, so the headless twin is identical. */
export interface ClockState { slot: number; elapsedInSlot: number }

/** Absorbs accumulated binary tick-rounding at an otherwise exact slot boundary. */
const SLOT_BOUNDARY_EPSILON = 1e-9

export function createClock(): ClockState {
  return { slot: 0, elapsedInSlot: 0 }
}

export function stepClock(state: ClockState, dt: number, slotSeconds: number): { state: ClockState; slotChanged: boolean } {
  let slot = state.slot
  let elapsed = state.elapsedInSlot + dt
  let slotChanged = false
  while (elapsed + SLOT_BOUNDARY_EPSILON >= slotSeconds) {
    elapsed -= slotSeconds
    if (Math.abs(elapsed) < SLOT_BOUNDARY_EPSILON) elapsed = 0
    slot = (slot + 1) % SLOT_COUNT
    slotChanged = true
  }
  return { state: { slot, elapsedInSlot: elapsed }, slotChanged }
}
