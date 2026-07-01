import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import {
  applyCarryIntent,
  completeCarriedItemUse,
  findFocusedInteraction
} from '../../src/sim/interactions'
import { createInitialNight } from '../../src/state/night'

function atWorkshop(x: number) {
  const night = createInitialNight(1, 42)
  return {
    ...night,
    keeper: { ...night.keeper, floor: 'workshop' as const, x, y: 72 }
  }
}

describe('focused interactions', () => {
  it('selects the nearest interactable and emits exactly one prompt', () => {
    const night = createInitialNight(1, 42)
    const state = {
      ...night,
      keeper: { ...night.keeper, floor: 'navigation' as const, x: 30, y: 168 }
    }

    expect(findFocusedInteraction(state, nightDefinition)).toEqual({
      kind: 'station',
      id: 'chart',
      prompt: 'Operate Bearing Chart',
      distance: 4
    })
  })

  it('uses interaction priority as a stable tie-break at equal distance', () => {
    const state = atWorkshop(4)
    expect(findFocusedInteraction(state, nightDefinition)).toMatchObject({
      kind: 'station',
      id: 'workbench',
      distance: 4
    })
  })

  it('takes the focused rack item and records its carried lifecycle', () => {
    const state = atWorkshop(0)
    const next = applyCarryIntent(state, nightDefinition)

    expect(next.keeper.carriedItem).toBe('pump-handle')
    expect(next.items['pump-handle']).toBe('carried')
    expect(next.keeper.mode).toBe('carry')
  })

  it('enforces one-item capacity by dropping before another item can be taken', () => {
    const carrying = applyCarryIntent(atWorkshop(0), nightDefinition)
    const nearFuse = {
      ...carrying,
      keeper: { ...carrying.keeper, x: -24 }
    }

    const dropped = applyCarryIntent(nearFuse, nightDefinition)
    expect(dropped.keeper.carriedItem).toBeNull()
    expect(dropped.items['pump-handle']).toBe('racked')
    expect(dropped.items.fuse).toBe('racked')

    const tookFuse = applyCarryIntent(dropped, nightDefinition)
    expect(tookFuse.keeper.carriedItem).toBe('fuse')
    expect(tookFuse.items.fuse).toBe('carried')
  })

  it('restores reusable tools to their rack after use', () => {
    const carrying = applyCarryIntent(atWorkshop(-48), nightDefinition)
    const completed = completeCarriedItemUse(carrying, nightDefinition)

    expect(completed.keeper.carriedItem).toBeNull()
    expect(completed.items.wrench).toBe('racked')
  })

  it('marks supplies consumed after use so they cannot be focused again', () => {
    const carrying = applyCarryIntent(atWorkshop(-24), nightDefinition)
    const completed = completeCarriedItemUse(carrying, nightDefinition)

    expect(completed.keeper.carriedItem).toBeNull()
    expect(completed.items.fuse).toBe('consumed')
    expect(findFocusedInteraction(completed, nightDefinition)).toBeNull()
  })

  it('does nothing when no item is in range', () => {
    const state = createInitialNight(1, 42)
    const next = applyCarryIntent(state, nightDefinition)
    expect(next).toBe(state)
  })
})
