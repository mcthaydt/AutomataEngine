import { describe, expect, it } from 'vitest'
import { applyPlayerDamage, createHealth, tickInvuln } from '../src/healthCore'
import type { PlayerCombatConfig } from '../src/config'

const player: PlayerCombatConfig = {
  maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2
}

describe('healthCore', () => {
  it('starts at full health with no invulnerability', () => {
    expect(createHealth(player)).toEqual({ hp: 5, invulnSeconds: 0 })
  })

  it('subtracts damage without reaching zero', () => {
    const hit = applyPlayerDamage(createHealth(player), 2, player)
    expect(hit).toEqual({ state: { hp: 3, invulnSeconds: 0 }, defeated: false })
  })

  it('second wind: damage reaching zero refills to max and opens the invulnerability window', () => {
    const low = { hp: 1, invulnSeconds: 0 }
    const hit = applyPlayerDamage(low, 1, player)
    expect(hit).toEqual({ state: { hp: 5, invulnSeconds: 2 }, defeated: true })
  })

  it('overkill damage also triggers exactly one second wind', () => {
    const hit = applyPlayerDamage({ hp: 2, invulnSeconds: 0 }, 9, player)
    expect(hit).toEqual({ state: { hp: 5, invulnSeconds: 2 }, defeated: true })
  })

  it('ignores damage while invulnerable', () => {
    const shielded = { hp: 5, invulnSeconds: 1.5 }
    expect(applyPlayerDamage(shielded, 3, player)).toEqual({ state: shielded, defeated: false })
  })

  it('drains the invulnerability window with fixed dt and clamps at zero', () => {
    let state = { hp: 5, invulnSeconds: 0.05 }
    state = tickInvuln(state, 1 / 60)
    expect(state.invulnSeconds).toBeCloseTo(0.05 - 1 / 60, 10)
    for (let i = 0; i < 10; i += 1) state = tickInvuln(state, 1 / 60)
    expect(state.invulnSeconds).toBe(0)
    expect(tickInvuln(state, 1 / 60)).toBe(state)
  })
})
