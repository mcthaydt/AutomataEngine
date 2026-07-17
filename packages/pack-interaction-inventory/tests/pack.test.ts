import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost, createPackEventBus, createPackStateRegistry, type PackBootContext } from '@automata/game-kit'
import { interactionInventoryPack } from '../src/pack'
import { fixtureConfig } from './fixtures'

function boot(config = fixtureConfig()) {
  const app = document.createElement('div')
  document.body.append(app)
  const render = createNullRenderer()
  const events = createPackEventBus()
  const state = createPackStateRegistry()
  const ctx: PackBootContext = { host: createGameHost(app), render: render.port, events, state }
  const handle = interactionInventoryPack.register(ctx, config)
  if (!handle) throw new Error('pack must return a runtime handle')
  return { ctx, render, handle, app, events, state }
}

describe('interaction-inventory pack (browser adapter)', () => {
  it('declares the capability id and validates config through its schema', () => {
    expect(interactionInventoryPack.id).toBe('interaction-inventory')
    expect(interactionInventoryPack.version).toBe('1.0.0')
    expect(() => interactionInventoryPack.configSchema!.parse({})).toThrow()
  })

  it('declares contract-v2 compatibility: owns the inventory slice, emits itemAcquired', () => {
    expect(interactionInventoryPack.compatibility.stateSlices.owns).toEqual(['inventory'])
    expect(interactionInventoryPack.compatibility.events.emits).toEqual(['itemAcquired'])
    expect(interactionInventoryPack.compatibility.requires).toEqual([])
  })

  it('registers the inventory slice and writes it on pickup', () => {
    const { handle, state } = boot()
    expect(state.get('inventory')).toEqual({ collected: [] })
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
    expect(state.get('inventory')).toEqual({ collected: ['cell-a'] })
  })

  it('emits itemAcquired with the item id on each pickup', () => {
    const { handle, events } = boot()
    const seen: unknown[] = []
    events.on('itemAcquired', (payload) => seen.push(payload))
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
    expect(seen).toEqual([{ packId: 'interaction-inventory', itemId: 'cell-a' }])
  })

  it('saveState/loadState round-trips and reconciles renderables + HUD', () => {
    const first = boot()
    first.handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
    const saved = first.handle.saveState!()
    const second = boot()
    second.handle.loadState!(saved)
    expect(second.render.calls.filter((call) => call.op === 'remove')).toHaveLength(1)
    expect(second.app.querySelector('.inventory-hud')?.textContent).toContain('1/2')
    expect(second.state.get('inventory')).toEqual({ collected: ['cell-a'] })
    second.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 4, z: -1 } })
    expect(second.handle.objectivesComplete!()).toBe(true)
  })

  it('loadState restores items collected after the saved snapshot', () => {
    const { handle, render, app, state } = boot()
    const saved = handle.saveState!()
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
    expect(render.port.objectCount).toBe(1)

    handle.loadState!(saved)

    expect(render.port.objectCount).toBe(2)
    expect(app.querySelector('.inventory-hud')?.textContent).toContain('0/2')
    expect(state.get('inventory')).toEqual({ collected: [] })
  })

  it('loadState rejects malformed saved state', () => {
    const { handle } = boot()
    expect(() => handle.loadState!({ collected: 42 })).toThrow()
  })

  it('adds one renderable per item and a HUD with icon + count', () => {
    const { render, app } = boot()
    const adds = render.calls.filter((call) => call.op === 'add')
    expect(adds).toHaveLength(2)
    const hud = app.querySelector('.inventory-hud')
    expect(hud?.textContent).toContain('0/2')
    expect(hud?.querySelector('img')?.getAttribute('src')).toBe('assets/item-icon.svg')
  })

  it('omits the icon img when iconPath is null', () => {
    const { app } = boot({ ...fixtureConfig(), iconPath: null })
    expect(app.querySelector('.inventory-hud img')).toBeNull()
  })

  it('collects on fixedUpdate, removes the renderable, updates the HUD, and gates completion', () => {
    const { render, handle, app } = boot()
    expect(handle.objectivesComplete!()).toBe(false)
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
    expect(render.calls.filter((call) => call.op === 'remove')).toHaveLength(1)
    expect(app.querySelector('.inventory-hud')?.textContent).toContain('1/2')
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: 4, z: -1 } })
    expect(app.querySelector('.inventory-hud')?.textContent).toContain('2/2')
    expect(handle.objectivesComplete!()).toBe(true)
  })

  it('leaves renderables and HUD unchanged when no item is in range', () => {
    const { render, handle, app } = boot()
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: 100, z: 100 } })
    expect(render.calls.filter((call) => call.op === 'remove')).toEqual([])
    expect(app.querySelector('.inventory-hud')?.textContent).toContain('0/2')
  })

  it('dispose removes remaining renderables and the HUD', () => {
    const { render, handle, app } = boot()
    handle.dispose!()
    expect(render.port.objectCount).toBe(0)
    expect(app.querySelector('.inventory-hud')).toBeNull()
  })
})
