import { describe, expect, it } from 'vitest'
import { createRunReducer, initialRun as createInitialRun } from '../../src/state/run'
import { defaultPulsebreakCompiledProject as config } from '../../src/project/template'
import type { UpgradeId } from '../../src/sim/upgrades'

const initialRun = createInitialRun(config)
const runReducer = createRunReducer(config)

describe('runReducer', () => {
  it('starts from base stats and full health', () => {
    expect(initialRun).toMatchObject({
      wave: 1,
      score: 0,
      health: config.player.startHealth,
      maxHealth: config.player.startHealth,
      damage: config.player.baseDamage,
      fireRate: config.player.baseFireRate,
      moveSpeed: config.player.baseMoveSpeed,
      choices: []
    })
  })

  it('runStarted resets a dirty run and bumps the runId', () => {
    const dirty = { ...initialRun, runId: 4, wave: 3, score: 900, health: 12, damage: 99 }
    const next = runReducer(dirty, { type: 'runStarted' })
    expect(next.runId).toBe(5)
    expect(next.wave).toBe(1)
    expect(next.score).toBe(0)
    expect(next.health).toBe(config.player.startHealth)
    expect(next.damage).toBe(config.player.baseDamage)
  })

  it('retried resets stats and bumps the runId', () => {
    const dirty = { ...initialRun, runId: 1, score: 500, health: 3 }
    const next = runReducer(dirty, { type: 'retried' })
    expect(next.runId).toBe(2)
    expect(next.score).toBe(0)
    expect(next.health).toBe(config.player.startHealth)
  })

  it('applies player damage and clamps health at zero', () => {
    const hurt = runReducer(initialRun, { type: 'playerDamaged', amount: 30 })
    expect(hurt.health).toBe(config.player.startHealth - 30)
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
    expect(next.damage).toBe(config.player.baseDamage + config.upgradeStep.damage)
    expect(next.wave).toBe(2)
    expect(next.choices).toEqual([])
  })

  it('upgradeChosen fireRate raises fire rate', () => {
    const next = runReducer(initialRun, { type: 'upgradeChosen', id: 'fireRate' })
    expect(next.fireRate).toBe(config.player.baseFireRate + config.upgradeStep.fireRate)
  })

  it('upgradeChosen moveSpeed raises move speed', () => {
    const next = runReducer(initialRun, { type: 'upgradeChosen', id: 'moveSpeed' })
    expect(next.moveSpeed).toBe(config.player.baseMoveSpeed + config.upgradeStep.moveSpeed)
  })

  it('upgradeChosen maxHealth raises max and heals by the same amount', () => {
    const start = { ...initialRun, health: 40 }
    const next = runReducer(start, { type: 'upgradeChosen', id: 'maxHealth' })
    expect(next.maxHealth).toBe(config.player.startHealth + config.upgradeStep.maxHealth)
    expect(next.health).toBe(40 + config.upgradeStep.maxHealth)
  })

  it('returns the same reference for unrelated actions', () => {
    expect(runReducer(initialRun, { type: 'paused' })).toBe(initialRun)
  })
})
