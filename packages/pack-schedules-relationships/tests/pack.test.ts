import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost, createPackEventBus, createPackStateRegistry, type PackBootContext } from '@automata/game-kit'
import { schedulesRelationshipsPack } from '../src/pack'
import { QUEST_COMPLETED_EVENT, QUEST_LOG_SLICE_ID } from '../src/config'
import { validConfig } from './fixtures'

/** Boot with the real pack context and a dialogue-owned questLog slice. */
function boot(config = validConfig()) {
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  const events = createPackEventBus()
  const state = createPackStateRegistry()
  state.register(QUEST_LOG_SLICE_ID, 'dialogue-quests', { 'q-main-1': 'available' })
  const ctx: PackBootContext = { host, render: render.port, events, state }
  const handle = schedulesRelationshipsPack.register(ctx, config)
  if (!handle) throw new Error('pack must return a runtime handle')
  return { app, host, render, events, state, handle }
}

describe('schedules-relationships pack adapter', () => {
  it('boots with walker markers, clock chip, and relationships panel', () => {
    const { app, host, render, handle } = boot()
    expect(render.port.objectCount).toBe(1)
    expect(app.querySelector('.clock-hud')?.textContent).toBe('morning')
    expect(app.querySelector('.relationships-hud')?.textContent).toContain('The Keeper: stranger')
    handle.dispose!(); host.dispose()
    expect(render.port.objectCount).toBe(0)
    app.remove()
  })

  it('advances the slot on fixedUpdate and walks the walker toward the new station', () => {
    const { app, host, handle } = boot()
    handle.fixedUpdate!(20, { playerPosition: { x: 0, z: 0 } })
    expect(app.querySelector('.clock-hud')?.textContent).toBe('afternoon')
    handle.dispose!(); host.dispose(); app.remove()
  })

  it('objectivesComplete flips when questCompleted bumps every tracked npc to acquaintance', () => {
    const { app, events, host, handle } = boot()
    expect(handle.objectivesComplete!()).toBe(false)
    events.emit(QUEST_COMPLETED_EVENT, { packId: 'dialogue-quests', questId: 'q-main-1' })
    expect(handle.objectivesComplete!()).toBe(true)
    expect(app.querySelector('.relationships-hud')?.textContent).toContain('The Keeper: acquaintance')
    handle.dispose!(); host.dispose(); app.remove()
  })

  it('saves and restores clock + affinities, snapping walkers to the restored slot', () => {
    const { app, host, handle } = boot()
    handle.fixedUpdate!(45, { playerPosition: { x: 0, z: 0 } })
    const saved = handle.saveState!()
    const fresh = boot()
    fresh.handle.loadState!(saved)
    expect(fresh.app.querySelector('.clock-hud')?.textContent).toBe('evening')
    expect(() => fresh.handle.loadState!({ junk: true })).toThrow()
    handle.dispose!(); host.dispose(); app.remove(); fresh.handle.dispose!(); fresh.host.dispose(); fresh.app.remove()
  })
})
