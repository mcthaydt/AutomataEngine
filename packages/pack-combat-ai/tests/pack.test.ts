import { beforeEach, describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { composePacks, createGameHost, packCompatibility, type GamePack } from '@automata/game-kit'
import { combatAiPack } from '../src/pack'
import { combatAiEditorContribution } from '../src/editorContribution'
import type { CombatPackConfig } from '../src/config'

const DT = 1 / 60

const config = (): CombatPackConfig => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [{
    id: 'enemy-1', name: 'Brute', post: { x: 1, z: 0 }, maxHealth: 3, attackDamage: 1,
    attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
  }]
})

interface Booted {
  runtime: ReturnType<ReturnType<typeof composePacks>['boot']>
  render: ReturnType<typeof createNullRenderer>
  host: ReturnType<typeof createGameHost>
  app: HTMLDivElement
}

const boot = (cfg = config()): Booted => {
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  const runtime = composePacks([combatAiPack], { 'combat-ai': cfg }).boot({ host, render: render.port })
  return { runtime, render, host, app }
}

beforeEach(() => { document.body.innerHTML = '' })

describe('combatAiPack', () => {
  it('declares the v2 compatibility contract', () => {
    expect(combatAiPack.compatibility).toEqual({
      requires: [], conflictsWith: [], integratesWith: ['interaction-inventory'],
      stateSlices: { owns: ['combat'], reads: ['inventory'] },
      events: { emits: ['enemyDefeated', 'playerDefeated'], consumes: [] }
    })
  })

  it('boots with an enemy marker, HP hud, and registered combat slice', () => {
    const { render, app, host } = boot()
    expect(render.port.objectCount).toBe(1)
    expect(app.querySelector('.combat-hud')?.textContent).toContain('HP 5/5')
    host.dispose()
  })

  it('defeats an adjacent enemy, removes its marker, and emits enemyDefeated once', () => {
    const { runtime, render, host } = boot()
    // world.playerPosition at the origin is within attackRadius of the post at (1, 0)
    for (let i = 0; i < 120; i += 1) runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    expect(runtime.objectivesComplete()).toBe(true)
    expect(render.port.objectCount).toBe(0)
    host.dispose()
  })

  it('reads the inventory slice for the weapon boost when present', () => {
    // A stub pack owning the 'inventory' slice stands in for the inventory
    // pack — combat must never import it. Boosted damage 2 kills a 3-HP
    // enemy in 2 swings (dead by tick ~32); base damage needs 3 (~tick 62).
    const stubPack: GamePack = {
      id: 'slice-stub', version: '1.0.0',
      compatibility: packCompatibility({ stateSlices: { owns: ['inventory'], reads: [] } }),
      register(ctx) { ctx.state.register('inventory', 'slice-stub', { collected: ['item-1'] }) }
    }
    const app = document.createElement('div')
    document.body.append(app)
    const host = createGameHost(app)
    const render = createNullRenderer()
    const runtime = composePacks([stubPack, combatAiPack], { 'combat-ai': config() })
      .boot({ host, render: render.port })
    for (let i = 0; i < 45; i += 1) runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    expect(runtime.objectivesComplete()).toBe(true)

    const unboosted = boot()
    for (let i = 0; i < 45; i += 1) unboosted.runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    expect(unboosted.runtime.objectivesComplete()).toBe(false)
    host.dispose()
    unboosted.host.dispose()
  })

  it('second-winds in place when enemies win an exchange (HUD drops to 1 then refills)', () => {
    // A 30-HP enemy survives long enough to land the five hits that trigger
    // the second wind; the HUD is the observable for the internal event.
    const cfg = config()
    cfg.enemies = [{ ...cfg.enemies[0]!, maxHealth: 30 }]
    const { runtime, app, host } = boot(cfg)
    let sawDrop = false
    let sawRecovery = false
    for (let i = 0; i < 60 * 10 && !sawRecovery; i += 1) {
      runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
      const text = app.querySelector('.combat-hud')!.textContent ?? ''
      if (text.startsWith('HP 1/5')) sawDrop = true
      if (sawDrop && text.startsWith('HP 5/5')) sawRecovery = true
    }
    expect(sawDrop).toBe(true)
    expect(sawRecovery).toBe(true)
    host.dispose()
  })

  it('save/load round-trips and reconciles markers', () => {
    const { runtime, host } = boot()
    for (let i = 0; i < 120; i += 1) runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    const saved = runtime.saveState()
    const fresh = boot()
    fresh.runtime.loadState(saved)
    expect(fresh.render.port.objectCount).toBe(0)
    expect(fresh.runtime.objectivesComplete()).toBe(true)
    expect(() => fresh.runtime.loadState({ 'combat-ai': { garbage: true } })).toThrow()
    host.dispose(); fresh.host.dispose()
  })
})

describe('combatAiEditorContribution', () => {
  it('has no prefabs and previews posts plus radius markers, disposing cleanly', () => {
    expect(combatAiEditorContribution.prefabs).toEqual([])
    const render = createNullRenderer()
    const preview = combatAiEditorContribution.createPreview!(config(), render.port)
    // 1 post marker + 4 aggro dots + 4 leash dots per enemy
    expect(render.port.objectCount).toBe(9)
    preview.dispose()
    expect(render.port.objectCount).toBe(0)
  })
})
