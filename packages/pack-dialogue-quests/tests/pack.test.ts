import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost, createPackEventBus, createPackStateRegistry, type PackBootContext } from '@automata/game-kit'
import { validConfig } from './fixtures'
import { dialogueQuestsPack } from '../src/pack'

/** Boot with the real pack context and a stub owner for the read-only inventory slice. */
function boot(config = validConfig(), collected: string[] = []) {
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  const events = createPackEventBus()
  const state = createPackStateRegistry()
  state.register('inventory', 'inventory-stub', { collected })
  const ctx: PackBootContext = { host, render: render.port, events, state }
  const handle = dialogueQuestsPack.register(ctx, config)
  if (!handle) throw new Error('pack must return a runtime handle')
  const step = (x: number, z: number): void => handle.fixedUpdate!(1 / 60, { playerPosition: { x, z } })
  const key = (digit: string): void => window.dispatchEvent(new KeyboardEvent('keydown', { key: digit }))
  return { app, host, render, handle, step, key, events, state }
}

const NPC = { x: 5, z: 5 }

describe('dialogue-quests pack (browser adapter)', () => {
  it('renders NPC markers and a quest HUD on boot', () => {
    const { app, render, host, handle } = boot()
    expect(render.port.objectCount).toBe(1)
    expect(app.querySelector('.quest-hud')?.textContent).toContain('Fetch the relic')
    expect(app.querySelector('.quest-hud')?.textContent).toContain('0/1')
    handle.dispose!()
    host.dispose()
    expect(render.port.objectCount).toBe(0)
    app.remove()
  })

  it('opens the overlay in radius, closes past 1.5x radius', () => {
    const { app, step, host, handle } = boot()
    step(NPC.x - 1, NPC.z)
    expect(app.querySelector('.dialogue-overlay')).not.toBeNull()
    step(NPC.x - 1.4, NPC.z)
    expect(app.querySelector('.dialogue-overlay')).not.toBeNull()
    step(NPC.x - 4, NPC.z)
    expect(app.querySelector('.dialogue-overlay')).toBeNull()
    handle.dispose!(); host.dispose(); app.remove()
  })

  it('accepts a quest via number key, filters choices by inventory, completes on a return visit', () => {
    const withItem = boot(validConfig(), ['item-1'])
    withItem.step(NPC.x - 1, NPC.z)
    const choices = [...withItem.app.querySelectorAll('.dialogue-overlay li')].map((item) => item.textContent)
    expect(choices).toEqual(['I will help.', 'Bye.'])
    withItem.key('1')
    expect(withItem.app.querySelector('.dialogue-text')?.textContent).toContain('Thanks.')
    withItem.key('1')
    expect(withItem.app.querySelector('.dialogue-overlay')).toBeNull()
    withItem.step(NPC.x - 4, NPC.z)
    withItem.step(NPC.x - 1, NPC.z)
    expect([...withItem.app.querySelectorAll('.dialogue-overlay li')][0]!.textContent).toBe('Hand it over.')
    withItem.key('1')
    expect(withItem.handle.objectivesComplete!()).toBe(true)
    expect(withItem.app.querySelector('.quest-hud')?.textContent).toContain('1/1')
    withItem.handle.dispose!(); withItem.host.dispose(); withItem.app.remove()
  })

  it('ignores number keys while the overlay is closed', () => {
    const { app, key, handle, host } = boot()
    key('1')
    expect(handle.objectivesComplete!()).toBe(false)
    expect(app.querySelector('.dialogue-overlay')).toBeNull()
    handle.dispose!(); host.dispose(); app.remove()
  })

  it('save/load round-trips the quest log and closes any open dialogue', () => {
    const { app, step, key, handle, host } = boot(validConfig(), ['item-1'])
    const fresh = handle.saveState!()
    step(NPC.x - 1, NPC.z); key('1')
    const accepted = handle.saveState!()
    expect(accepted).toEqual({ 'q-1': 'active' })
    handle.loadState!(fresh)
    expect(app.querySelector('.dialogue-overlay')).toBeNull()
    expect(app.querySelector('.quest-hud')?.textContent).toContain('0/1')
    handle.loadState!(accepted)
    expect(() => handle.loadState!({ 'q-1': 'winning' })).toThrow()
    handle.dispose!(); host.dispose(); app.remove()
  })
})
