import { describe, expect, it } from 'vitest'
import { createEnemyAi, stepEnemyAi, stepToward } from '../src/enemyAiCore'
import type { EnemyDef } from '../src/config'

const enemy: EnemyDef = {
  id: 'enemy-1', name: 'Brute', post: { x: 0, z: 0 }, maxHealth: 3, attackDamage: 1,
  attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
}
const DT = 1 / 60

describe('enemyAiCore', () => {
  it('starts idle at its post', () => {
    expect(createEnemyAi(enemy)).toEqual({ position: { x: 0, z: 0 }, mode: 'idle' })
  })

  it('stays idle while the player is outside the aggro radius', () => {
    const state = createEnemyAi(enemy)
    expect(stepEnemyAi(state, enemy, { x: 5, z: 0 }, DT)).toEqual(state)
  })

  it('aggros and steps straight toward a player inside the aggro radius', () => {
    const next = stepEnemyAi(createEnemyAi(enemy), enemy, { x: 3, z: 0 }, DT)
    expect(next.mode).toBe('chase')
    expect(next.position.x).toBeCloseTo(3 * DT, 10)
    expect(next.position.z).toBe(0)
  })

  it('leashes home when the player is beyond leashRadius from the post', () => {
    const chasing = { position: { x: 3, z: 0 }, mode: 'chase' as const }
    const next = stepEnemyAi(chasing, enemy, { x: 8, z: 0 }, DT)
    expect(next.mode).toBe('return')
    expect(next.position.x).toBeLessThan(3)
  })

  it('return-mode arrival clamps exactly onto the post and goes idle', () => {
    const nearHome = { position: { x: 0.01, z: 0 }, mode: 'return' as const }
    const next = stepEnemyAi(nearHome, enemy, { x: 20, z: 20 }, DT)
    expect(next).toEqual({ position: { x: 0, z: 0 }, mode: 'idle' })
  })

  it('re-aggros mid-return when the player re-enters the aggro radius', () => {
    const returning = { position: { x: 2, z: 0 }, mode: 'return' as const }
    const next = stepEnemyAi(returning, enemy, { x: 3, z: 0 }, DT)
    expect(next.mode).toBe('chase')
  })

  it('is deterministic across identical tick sequences', () => {
    const run = (): ReturnType<typeof stepEnemyAi> => {
      let state = createEnemyAi(enemy)
      for (let i = 0; i < 240; i += 1) state = stepEnemyAi(state, enemy, { x: 3.5, z: 1 }, DT)
      return state
    }
    expect(run()).toEqual(run())
  })

  it('stepToward clamps to exact arrival without overshoot', () => {
    expect(stepToward({ x: 0, z: 0 }, { x: 0.01, z: 0 }, 3, DT)).toEqual({ x: 0.01, z: 0 })
  })
})
