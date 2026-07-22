import { describe, expect, it } from 'vitest'
import {
  combatSliceValue, createCombatState, deserializeCombatState, enemiesDefeated,
  isWeaponHeld, playerDamage, serializeCombatState, stepCombat
} from '../src/combatCore'
import type { CombatPackConfig } from '../src/config'

const DT = 1 / 60

const config = (): CombatPackConfig => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [
    {
      id: 'enemy-1', name: 'Brute', post: { x: 1, z: 0 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    },
    {
      id: 'enemy-2', name: 'Stalker', post: { x: 9, z: 9 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    }
  ]
})

/** Drive ticks with the player parked at the origin, next to enemy-1's post. */
const drive = (ticks: number, weapon = false): ReturnType<typeof stepCombat> => {
  const cfg = config()
  let result: ReturnType<typeof stepCombat> = {
    state: createCombatState(cfg), defeatedEnemyIds: [], playerDefeated: false
  }
  for (let i = 0; i < ticks; i += 1) {
    result = stepCombat(result.state, { x: 0, z: 0 }, cfg, DT, weapon)
  }
  return result
}

describe('combatCore', () => {
  it('initial state: full health, ready cooldowns, enemies at their posts', () => {
    const state = createCombatState(config())
    expect(state.player).toEqual({ hp: 5, invulnSeconds: 0 })
    expect(state.playerCooldown).toBe(0)
    expect(state.enemies['enemy-1']).toEqual({
      hp: 3, cooldown: 0, ai: { position: { x: 1, z: 0 }, mode: 'idle' }
    })
  })

  it('auto-attacks the nearest alive enemy in radius and respects the cooldown', () => {
    const cfg = config()
    const first = stepCombat(createCombatState(cfg), { x: 0, z: 0 }, cfg, DT, false)
    expect(first.state.enemies['enemy-1']!.hp).toBe(2)
    expect(first.state.playerCooldown).toBeCloseTo(0.5, 10)
    const second = stepCombat(first.state, { x: 0, z: 0 }, cfg, DT, false)
    expect(second.state.enemies['enemy-1']!.hp).toBe(2)
  })

  it('breaks equal-distance target ties by enemy id instead of config order', () => {
    const cfg = config()
    cfg.enemies = [
      { ...cfg.enemies[0]!, id: 'zeta', post: { x: -1, z: 0 } },
      { ...cfg.enemies[1]!, id: 'alpha', post: { x: 1, z: 0 } }
    ]

    const result = stepCombat(createCombatState(cfg), { x: 0, z: 0 }, cfg, DT, false)

    expect(result.state.enemies.alpha!.hp).toBe(2)
    expect(result.state.enemies.zeta!.hp).toBe(3)
  })

  it('defeats an engaged enemy over time and reports it exactly once', () => {
    const outcome = drive(120)
    expect(outcome.state.enemies['enemy-1']!.hp).toBe(0)
    const all: string[] = []
    const cfg = config()
    let result: ReturnType<typeof stepCombat> = {
      state: createCombatState(cfg), defeatedEnemyIds: [], playerDefeated: false
    }
    for (let i = 0; i < 120; i += 1) {
      result = stepCombat(result.state, { x: 0, z: 0 }, cfg, DT, false)
      all.push(...result.defeatedEnemyIds)
    }
    expect(all).toEqual(['enemy-1'])
  })

  it('weapon boost doubles player damage only when held', () => {
    const cfg = config()
    expect(playerDamage(cfg, false)).toBe(1)
    expect(playerDamage(cfg, true)).toBe(2)
    expect(isWeaponHeld(cfg, ['item-1'])).toBe(true)
    expect(isWeaponHeld(cfg, [])).toBe(false)
    expect(isWeaponHeld({ ...cfg, weapon: { itemId: null, damageMultiplier: 2 } }, ['item-1'])).toBe(false)
  })

  it('enemy attacks trigger the second wind and report playerDefeated', () => {
    // A 30-HP enemy survives long enough to land the five hits that would
    // reach zero (the default 3-HP enemy dies before the player does).
    const cfg = config()
    cfg.enemies = [{ ...cfg.enemies[0]!, maxHealth: 30 }]
    let result: ReturnType<typeof stepCombat> = {
      state: createCombatState(cfg), defeatedEnemyIds: [], playerDefeated: false
    }
    let defeated = false
    for (let i = 0; i < 60 * 10 && !defeated; i += 1) {
      result = stepCombat(result.state, { x: 0, z: 0 }, cfg, DT, false)
      defeated = result.playerDefeated
    }
    expect(defeated).toBe(true)
    expect(result.state.player.hp).toBe(5)
    expect(result.state.player.invulnSeconds).toBeGreaterThan(0)
  })

  it('does not consume an enemy attack cooldown while the player is invulnerable', () => {
    const cfg = config()
    cfg.player.attackRadius = 0.5
    cfg.enemies = [{ ...cfg.enemies[0]!, attackRadius: 1.2 }]
    const state = createCombatState(cfg)
    state.player.invulnSeconds = 1

    const result = stepCombat(state, { x: 0, z: 0 }, cfg, DT, false)

    expect(result.state.player.hp).toBe(5)
    expect(result.state.enemies['enemy-1']!.cooldown).toBe(0)
  })

  it('completion gate: all enemies at zero, vacuously true with no enemies', () => {
    const cfg = config()
    expect(enemiesDefeated(createCombatState(cfg), cfg)).toBe(false)
    const empty = { ...cfg, enemies: [] }
    expect(enemiesDefeated(createCombatState(empty), empty)).toBe(true)
  })

  it('slice value exposes player hp, invulnerability, and per-enemy hp/mode', () => {
    const cfg = config()
    expect(combatSliceValue(createCombatState(cfg), cfg)).toEqual({
      playerHp: 5, invulnSeconds: 0,
      enemies: { 'enemy-1': { hp: 3, mode: 'idle' }, 'enemy-2': { hp: 3, mode: 'idle' } }
    })
  })

  it('persistence round-trips hp and rebuilds enemies at their posts', () => {
    const cfg = config()
    const fought = drive(120).state
    const restored = deserializeCombatState(serializeCombatState(fought), cfg)
    expect(restored.player.hp).toBe(fought.player.hp)
    expect(restored.player.invulnSeconds).toBe(0)
    expect(restored.enemies['enemy-1']!.hp).toBe(0)
    expect(restored.enemies['enemy-2']).toEqual({
      hp: 3, cooldown: 0, ai: { position: { x: 9, z: 9 }, mode: 'idle' }
    })
  })

  it('persistence round-trips fractional hp produced by schema-valid damage', () => {
    const cfg = config()
    cfg.player.attackDamage = 1.5
    cfg.enemies = [{ ...cfg.enemies[0]!, attackDamage: 1.5 }]
    const fought = stepCombat(createCombatState(cfg), { x: 0, z: 0 }, cfg, DT, false).state

    const restored = deserializeCombatState(serializeCombatState(fought), cfg)

    expect(restored.player.hp).toBe(3.5)
    expect(restored.enemies['enemy-1']!.hp).toBe(1.5)
  })

  it('rejects duplicate enemy ids in saved state instead of taking the last value', () => {
    const cfg = config()
    expect(() => deserializeCombatState({
      player: { hp: 5 },
      enemies: [
        { id: 'enemy-1', hp: 2 },
        { id: 'enemy-1', hp: 1 },
        { id: 'enemy-2', hp: 3 }
      ]
    }, cfg)).toThrow(/duplicate enemy "enemy-1"/)
  })

  it('rejects malformed and mismatched saved state', () => {
    const cfg = config()
    expect(() => deserializeCombatState({ nope: true }, cfg)).toThrow()
    expect(() => deserializeCombatState(
      { player: { hp: 5 }, enemies: [{ id: 'ghost', hp: 1 }] }, cfg
    )).toThrow(/unknown enemy "ghost"/)
    expect(() => deserializeCombatState(
      { player: { hp: 5 }, enemies: [{ id: 'enemy-1', hp: 1 }] }, cfg
    )).toThrow(/missing enemy "enemy-2"/)
    expect(() => deserializeCombatState(
      { player: { hp: 20 }, enemies: [{ id: 'enemy-1', hp: 1 }, { id: 'enemy-2', hp: 3 }] }, cfg
    )).toThrow(/hp 20 above maxHealth/)
  })

  it('is deterministic across identical tick sequences', () => {
    expect(drive(300)).toEqual(drive(300))
  })
})
