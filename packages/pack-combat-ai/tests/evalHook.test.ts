import { describe, expect, it } from 'vitest'
import { EVAL_TICK_DT, createCombatAiEvalHook } from '../src/evalHook'
import { createCombatState, isWeaponHeld, stepCombat } from '../src/combatCore'
import type { CombatPackConfig } from '../src/config'

const config = (): CombatPackConfig => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [{
    id: 'enemy-1', name: 'Brute', post: { x: 6, z: 0 }, maxHealth: 3, attackDamage: 1,
    attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
  }]
})

describe('combat-ai eval hook', () => {
  it('targets the nearest alive enemy at its current position, null when all are down', () => {
    const hook = createCombatAiEvalHook(config())
    let state = hook.createState()
    expect(hook.nextTarget(state, { x: 0, z: 0 })).toEqual({ x: 6, z: 0 })
    for (let i = 0; i < 240; i += 1) state = hook.step(state, { x: 6, z: 0 }, {})
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, { x: 0, z: 0 })).toBeNull()
  })

  it('completes headlessly by walking onto the enemy, without the inventory slice', () => {
    const hook = createCombatAiEvalHook(config())
    let state = hook.createState()
    for (let i = 0; i < 400 && !hook.complete(state); i += 1) {
      state = hook.step(state, { x: 6, z: 0 }, undefined)
    }
    expect(hook.complete(state)).toBe(true)
  })

  it('publishes the combat slice in the runtime shape', () => {
    const hook = createCombatAiEvalHook(config())
    expect(hook.publishSlices!(hook.createState())).toEqual({
      combat: { playerHp: 5, invulnSeconds: 0, enemies: { 'enemy-1': { hp: 3, mode: 'idle' } } }
    })
  })

  it('weapon-boost parity: eval slice view and runtime slice read produce identical combat state', () => {
    const cfg = config()
    const slices = { inventory: { collected: ['item-1'] } }
    // Eval path
    const hook = createCombatAiEvalHook(cfg)
    let evalState = hook.createState()
    for (let i = 0; i < 90; i += 1) evalState = hook.step(evalState, { x: 6, z: 0 }, slices)
    // Runtime path: same core, same weapon-held computation the adapter uses
    let runtimeState = createCombatState(cfg)
    const held = isWeaponHeld(cfg, slices.inventory.collected)
    for (let i = 0; i < 90; i += 1) {
      runtimeState = stepCombat(runtimeState, { x: 6, z: 0 }, cfg, EVAL_TICK_DT, held).state
    }
    expect((evalState as { combat: unknown }).combat).toEqual(runtimeState)
  })

  it('boosted headless run defeats the enemy in fewer ticks than unboosted', () => {
    const run = (slices?: Record<string, unknown>): number => {
      const hook = createCombatAiEvalHook(config())
      let state = hook.createState()
      for (let i = 1; i <= 400; i += 1) {
        state = hook.step(state, { x: 6, z: 0 }, slices)
        if (hook.complete(state)) return i
      }
      return Infinity
    }
    expect(run({ inventory: { collected: ['item-1'] } })).toBeLessThan(run(undefined))
  })
})
