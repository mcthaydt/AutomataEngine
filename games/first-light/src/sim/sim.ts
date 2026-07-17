/** Authored movement/goal tuning compiled from the project's tuning resource. */
export interface SimTuning {
  arenaHalf: number
  moveSpeed: number
  goal: { x: number; z: number }
  goalRadius: number
  timeLimitS: number
}

/** Move intent; magnitudes above 1 are scaled down, never up. */
export interface SimControl {
  x: number
  z: number
}

export interface SimState {
  position: { x: number; z: number }
  elapsedS: number
  status: 'running' | 'succeeded' | 'failed'
}

export function createInitialState(spawn: { x: number; z: number }): SimState {
  return { position: { x: spawn.x, z: spawn.z }, elapsedS: 0, status: 'running' }
}

const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value))

/** Advance one fixed step. Pure and deterministic: no clocks, RNG, or DOM. */
export function step(state: SimState, control: SimControl, dt: number, tuning: SimTuning): SimState {
  if (state.status !== 'running') return state
  const magnitude = Math.hypot(control.x, control.z)
  const speed = magnitude > 1 ? tuning.moveSpeed / magnitude : tuning.moveSpeed
  const position = {
    x: clamp(state.position.x + control.x * speed * dt, tuning.arenaHalf),
    z: clamp(state.position.z + control.z * speed * dt, tuning.arenaHalf)
  }
  const elapsedS = state.elapsedS + dt
  const distance = Math.hypot(tuning.goal.x - position.x, tuning.goal.z - position.z)
  const status = distance <= tuning.goalRadius ? 'succeeded' : elapsedS >= tuning.timeLimitS ? 'failed' : 'running'
  return { position, elapsedS, status }
}

/** Scripted control that walks straight at the goal; drives headless evaluation. */
export function seekGoal(state: SimState, tuning: SimTuning): SimControl {
  const dx = tuning.goal.x - state.position.x
  const dz = tuning.goal.z - state.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1e-9) return { x: 0, z: 0 }
  return { x: dx / distance, z: dz / distance }
}
