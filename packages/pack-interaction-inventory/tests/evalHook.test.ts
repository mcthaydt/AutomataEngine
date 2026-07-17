import { describe, expect, it } from 'vitest'
import { createInventoryEvalHook } from '../src/evalHook'
import { fixtureConfig } from './fixtures'

describe('inventory eval hook slices', () => {
  it('publishes the inventory slice from eval state', () => {
    const config = fixtureConfig()
    const hook = createInventoryEvalHook(config)
    let state = hook.createState()
    expect(hook.publishSlices!(state)).toEqual({ inventory: { collected: [] } })
    const item = config.items[0]!
    state = hook.step(state, item.position)
    expect(hook.publishSlices!(state)).toEqual({ inventory: { collected: [item.id] } })
  })
})
