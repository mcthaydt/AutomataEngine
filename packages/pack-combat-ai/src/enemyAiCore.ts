import type { EnemyDef } from './config'

/** Pure idle/chase/return enemy movement; straight lines only, no pathfinding. */
export type EnemyMode = 'idle' | 'chase' | 'return'
export interface EnemyAiState { position: { x: number; z: number }; mode: EnemyMode }

export function createEnemyAi(enemy: EnemyDef): EnemyAiState {
  return { position: { ...enemy.post }, mode: 'idle' }
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

export function stepToward(
  position: { x: number; z: number }, target: { x: number; z: number }, speed: number, dt: number
): { x: number; z: number } {
  const dx = target.x - position.x
  const dz = target.z - position.z
  const dist = Math.hypot(dx, dz)
  const stride = speed * dt
  if (dist <= stride) return { x: target.x, z: target.z }
  return { x: position.x + (dx / dist) * stride, z: position.z + (dz / dist) * stride }
}

/**
 * Transition precedence: a chasing enemy leashes only on the player leaving
 * leashRadius-from-post; idle and returning enemies (re-)aggro on the player
 * entering aggroRadius-from-enemy. Callers must not step defeated enemies.
 */
export function stepEnemyAi(
  state: EnemyAiState, enemy: EnemyDef, player: { x: number; z: number }, dt: number
): EnemyAiState {
  let mode = state.mode
  if (mode === 'chase') {
    if (distance(player, enemy.post) > enemy.leashRadius) mode = 'return'
  } else if (distance(player, state.position) <= enemy.aggroRadius) {
    mode = 'chase'
  }
  if (mode === 'chase') {
    return { position: stepToward(state.position, player, enemy.speed, dt), mode }
  }
  if (mode === 'return') {
    const position = stepToward(state.position, enemy.post, enemy.speed, dt)
    const arrived = position.x === enemy.post.x && position.z === enemy.post.z
    return { position, mode: arrived ? 'idle' : 'return' }
  }
  return state
}
