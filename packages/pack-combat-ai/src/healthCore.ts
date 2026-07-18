import type { PlayerCombatConfig } from './config'

/** Pure player HP with the second-wind recovery; no wall clock, fixed dt only. */
export interface HealthState { hp: number; invulnSeconds: number }

export function createHealth(player: PlayerCombatConfig): HealthState {
  return { hp: player.maxHealth, invulnSeconds: 0 }
}

/**
 * Damage while invulnerable is ignored. Damage that would reach zero triggers
 * the second wind instead: refill in place plus an invulnerability window.
 * The player never actually dies — packs cannot teleport the player (logged
 * capability gap), and enemies never heal, so progress stays monotonic.
 */
export function applyPlayerDamage(
  state: HealthState, amount: number, player: PlayerCombatConfig
): { state: HealthState; defeated: boolean } {
  if (state.invulnSeconds > 0) return { state, defeated: false }
  const hp = state.hp - amount
  if (hp <= 0) {
    return { state: { hp: player.maxHealth, invulnSeconds: player.secondWindSeconds }, defeated: true }
  }
  return { state: { hp, invulnSeconds: 0 }, defeated: false }
}

export function tickInvuln(state: HealthState, dt: number): HealthState {
  if (state.invulnSeconds <= 0) return state
  return { hp: state.hp, invulnSeconds: Math.max(0, state.invulnSeconds - dt) }
}
