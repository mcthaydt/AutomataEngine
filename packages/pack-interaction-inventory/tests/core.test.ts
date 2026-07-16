import { describe, expect, it } from 'vitest'
import {
  createInventoryState, deserializeInventory, inventoryComplete, nextItemTarget, packConfigSchema,
  serializeInventory, stepInventory, INVENTORY_SLICE_ID, ITEM_ACQUIRED_EVENT
} from '../src/core'
import { createInventoryEvalHook } from '../src/evalHook'
import { fixtureConfig } from './fixtures'

describe('inventory core', () => {
  const config = fixtureConfig()

  it('collects an item only within the interact radius, exactly once', () => {
    let state = createInventoryState()
    state = stepInventory(state, { x: 10, z: 10 }, config)
    expect(state.collected).toEqual([])
    state = stepInventory(state, { x: -2.5, z: 3.5 }, config)
    expect(state.collected).toEqual(['cell-a'])
    state = stepInventory(state, { x: -2.5, z: 3.5 }, config)
    expect(state.collected).toEqual(['cell-a'])
  })

  it('is complete exactly when every item is collected', () => {
    let state = createInventoryState()
    expect(inventoryComplete(state, config)).toBe(false)
    state = stepInventory(state, { x: -2, z: 3 }, config)
    state = stepInventory(state, { x: 4, z: -1 }, config)
    expect(state.collected).toEqual(['cell-a', 'cell-b'])
    expect(inventoryComplete(state, config)).toBe(true)
  })

  it('targets the nearest uncollected item, then null when done', () => {
    let state = createInventoryState()
    expect(nextItemTarget(state, { x: 4, z: 0 }, config)).toEqual({ x: 4, z: -1 })
    state = stepInventory(state, { x: 4, z: -1 }, config)
    expect(nextItemTarget(state, { x: 4, z: 0 }, config)).toEqual({ x: -2, z: 3 })
    state = stepInventory(state, { x: -2, z: 3 }, config)
    expect(nextItemTarget(state, { x: 0, z: 0 }, config)).toBeNull()
  })

  it('bounds the config schema', () => {
    expect(packConfigSchema.safeParse(config).success).toBe(true)
    expect(packConfigSchema.safeParse({ ...config, interactRadius: 0.1 }).success).toBe(false)
    expect(packConfigSchema.safeParse({ ...config, items: [] }).success).toBe(false)
    expect(packConfigSchema.safeParse({ ...config, extra: 1 }).success).toBe(false)
  })
})

describe('inventory eval hook', () => {
  it('walks the scripted evaluator through every item then reports complete', () => {
    const config = fixtureConfig()
    const hook = createInventoryEvalHook(config)
    let state = hook.createState()
    let player = { x: 0, z: 0 }
    for (let guard = 0; guard < 10 && !hook.complete(state); guard += 1) {
      const target = hook.nextTarget(state, player)
      expect(target).not.toBeNull()
      player = target!
      state = hook.step(state, player)
    }
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, player)).toBeNull()
    expect(hook.packId).toBe('interaction-inventory')
  })
})

describe('inventory persistence (contract v2 slot)', () => {
  it('exports the slice and event contract names', () => {
    expect(INVENTORY_SLICE_ID).toBe('inventory')
    expect(ITEM_ACQUIRED_EVENT).toBe('itemAcquired')
  })

  it('round-trips state through serialize/deserialize', () => {
    const state = { collected: ['item-1', 'item-2'] as readonly string[] }
    expect(deserializeInventory(serializeInventory(state))).toEqual({ collected: ['item-1', 'item-2'] })
  })

  it('rejects malformed saved state', () => {
    expect(() => deserializeInventory({ collected: 'item-1' })).toThrow()
    expect(() => deserializeInventory(null)).toThrow()
  })
})
