import { describe, expect, it } from 'vitest'
import { initialRun, runReducer } from '../../src/state/run'
import { PLAYER, UPGRADE_STEP } from '../../src/config'
import type { UpgradeId } from '../../src/sim/upgrades'

describe('runReducer', () => {
  it('starts from base stats and full health', () => {
    expect(initialRun).toMatchObject({
      wave: 1,
      score: 0,
      health: PLAYER.startHealth,
      maxHealth: PLAYER.startHealth,
      damage: PLAYER.baseDamage,
      fireRate: PLAYER.baseFireRate,
      moveSpeed: PLAYER.baseMoveSpeed,
      choices: []
    })
  })

  it('runStarted resets a dirty run and bumps the runId', () => {
    const dirty = { ...initialRun, runId: 4, wave: 3, score: 900, health: 12, damage: 99 }
    const next = runReducer(dirty, { type: 'runStarted' })
    expect(next.runId).toBe(5)
    expect(next.wave).toBe(1)
    expect(next.score).toBe(0)
    expect(next.health).toBe(PLAYER.startHealth)
    expect(next.damage).toBe(PLAYER.baseDamage)
  })

  it('retried resets stats and bumps the runId', () => {
    const dirty = { ...initialRun, runId: 1, score: 500, health: 3 }
    const next = runReducer(dirty, { type: 'retried' })
    expect(next.runId).toBe(2)
    expect(next.score).toBe(0)
    expect(next.health).toBe(PLAYER.startHealth)
  })

  it('applies player damage and clamps health at zero', () => {
    const hurt = runReducer(initialRun, { type: 'playerDamaged', amount: 30 })
    expect(hurt.health).toBe(PLAYER.startHealth - 30)
    const dead = runReducer({ ...initialRun, health: 20 }, { type: 'playerDamaged', amount: 50 })
    expect(dead.health).toBe(0)
  })

  it('accumulates score on enemy kills', () => {
    const a = runReducer(initialRun, { type: 'enemyKilled', value: 100 })
    const b = runReducer(a, { type: 'enemyKilled', value: 150 })
    expect(b.score).toBe(250)
  })

  it('stores offered choices when a wave is cleared', () => {
    const next = runReducer(initialRun, { type: 'waveCleared', choices: ['damage', 'moveSpeed', 'maxHealth'] })
    expect(next.choices).toEqual(['damage', 'moveSpeed', 'maxHealth'])
  })

  it('upgradeChosen damage raises damage, advances the wave, clears choices', () => {
    const start = { ...initialRun, choices: ['damage'] as UpgradeId[] }
    const next = runReducer(start, { type: 'upgradeChosen', id: 'damage' })
    expect(next.damage).toBe(PLAYER.baseDamage + UPGRADE_STEP.damage)
    expect(next.wave).toBe(2)
    expect(next.choices).toEqual([])
  })

  it('upgradeChosen fireRate raises fire rate', () => {
    const next = runReducer(initialRun, { type: 'upgradeChosen', id: 'fireRate' })
    expect(next.fireRate).toBe(PLAYER.baseFireRate + UPGRADE_STEP.fireRate)
  })

  it('upgradeChosen moveSpeed raises move speed', () => {
    const next = runReducer(initialRun, { type: 'upgradeChosen', id: 'moveSpeed' })
    expect(next.moveSpeed).toBe(PLAYER.baseMoveSpeed + UPGRADE_STEP.moveSpeed)
  })

  it('upgradeChosen maxHealth raises max and heals by the same amount', () => {
    const start = { ...initialRun, health: 40 }
    const next = runReducer(start, { type: 'upgradeChosen', id: 'maxHealth' })
    expect(next.maxHealth).toBe(PLAYER.startHealth + UPGRADE_STEP.maxHealth)
    expect(next.health).toBe(40 + UPGRADE_STEP.maxHealth)
  })

  it('returns the same reference for unrelated actions', () => {
    expect(runReducer(initialRun, { type: 'paused' })).toBe(initialRun)
  })
})
