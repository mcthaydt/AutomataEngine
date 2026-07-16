import { describe, expect, it } from 'vitest'
import { createPackStateRegistry } from '../src/packState'

describe('createPackStateRegistry (pack contract v2)', () => {
  it('registers a slice with an owner and initial value, readable by anyone', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', { collected: [] })
    expect(state.has('inventory')).toBe(true)
    expect(state.get('inventory')).toEqual({ collected: [] })
  })

  it('only the owning pack may write', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', { collected: [] })
    state.set('inventory', 'interaction-inventory', { collected: ['item-1'] })
    expect(state.get('inventory')).toEqual({ collected: ['item-1'] })
    expect(() => state.set('inventory', 'dialogue-quests', { collected: [] }))
      .toThrow(/cannot write slice "inventory"/)
  })

  it('rejects double registration and unknown slices', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', null)
    expect(() => state.register('inventory', 'other-pack', null))
      .toThrow(/already owned by "interaction-inventory"/)
    expect(() => state.get('wallet')).toThrow(/Unknown state slice "wallet"/)
    expect(() => state.set('wallet', 'economy-progression', 0)).toThrow(/Unknown state slice "wallet"/)
    expect(state.has('wallet')).toBe(false)
  })

  it('snapshot returns every slice keyed by slice id', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', { collected: ['item-1'] })
    state.register('questLog', 'dialogue-quests', { active: [] })
    expect(state.snapshot()).toEqual({ inventory: { collected: ['item-1'] }, questLog: { active: [] } })
  })
})
