import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost, type PackBootContext } from '@automata/game-kit'
import { interactionInventoryPack } from '../src/pack'
import { fixtureConfig } from './fixtures'

function boot(config = fixtureConfig()) {
  const app = document.createElement('div')
  document.body.append(app)
  const render = createNullRenderer()
  const ctx: PackBootContext = { host: createGameHost(app), render: render.port }
  const handle = interactionInventoryPack.register(ctx, config)
  if (!handle) throw new Error('pack must return a runtime handle')
  return { ctx, render, handle, app }
}

describe('interaction-inventory pack (browser adapter)', () => {
  it('declares the capability id and validates config through its schema', () => {
    expect(interactionInventoryPack.id).toBe('interaction-inventory')
    expect(interactionInventoryPack.version).toBe('1.0.0')
    expect(() => interactionInventoryPack.configSchema!.parse({})).toThrow()
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

  it('dispose removes remaining renderables and the HUD', () => {
    const { render, handle, app } = boot()
    handle.dispose!()
    expect(render.port.objectCount).toBe(0)
    expect(app.querySelector('.inventory-hud')).toBeNull()
  })
})
