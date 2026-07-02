import { createRecordingSpriteRenderer } from '@automata/engine'
import { describe, expect, it } from 'vitest'
import manifest from '../../assets/manifest.json'
import { createWorldPresentation, WORLD_SPRITE_COUNT } from '../../src/render/world'
import { activateFailure } from '../../src/sim/failures'
import { createInitialNight } from '../../src/state/night'
import { nightDefinition } from '../../src/data/night'

describe('world sprite presentation', () => {
  it('adds the complete stable layer stack and removes it on dispose', () => {
    const renderer = createRecordingSpriteRenderer()
    const world = createWorldPresentation(renderer.port, manifest)
    world.update(createInitialNight(1, 42), 1)

    expect(renderer.port.objectCount).toBe(WORLD_SPRITE_COUNT)
    const layers = ['sky', 'sea', 'rocks', 'tower', 'station:beacon', 'item:wrench', 'water', 'keeper', 'ship:cutter', 'effects']
      .map((id) => renderer.getSprite(world.entity(id))?.pose?.layer)
    expect(layers).toEqual([...layers].sort((left, right) => left! - right!))

    world.dispose()
    expect(renderer.port.objectCount).toBe(0)
  })

  it('updates station damage frames, item/carry visibility, water, ships, and effects without changing count', () => {
    const renderer = createRecordingSpriteRenderer()
    const world = createWorldPresentation(renderer.port, manifest)
    let state = createInitialNight(1, 42)
    world.update(state, 1)
    const count = renderer.port.objectCount
    const pump = world.entity('station:pump')
    expect(renderer.getSprite(pump)?.frame).toEqual({ x: 0, y: 192, width: 64, height: 64 })

    state = activateFailure(state, 'jammed-pump', 1, nightDefinition)
    state = {
      ...state,
      flooding: 50,
      items: { ...state.items, wrench: 'carried' },
      keeper: { ...state.keeper, carriedItem: 'wrench' },
      activeCallId: 'mercy-bell',
      calls: { ...state.calls, 'mercy-bell': { ...state.calls['mercy-bell']!, status: 'guiding' } },
      feedback: [...state.feedback, { type: 'ship-rescued', timeS: 1 }]
    }
    world.update(state, 1)

    expect(renderer.getSprite(pump)?.frame).toEqual({ x: 64, y: 192, width: 64, height: 64 })
    expect(renderer.getSprite(world.entity('item:wrench'))?.visible).toBe(false)
    expect(renderer.getSprite(world.entity('carried-item'))?.visible).toBe(true)
    expect(renderer.getSprite(world.entity('water'))?.pose?.scaleY).toBeCloseTo(0.5)
    expect(renderer.getSprite(world.entity('ship:cutter'))?.visible).toBe(true)
    expect(renderer.getSprite(world.entity('effects'))?.visible).toBe(true)
    expect(renderer.port.objectCount).toBe(count)
  })

  it('interpolates keeper position from the previous state with render alpha', () => {
    const renderer = createRecordingSpriteRenderer()
    const world = createWorldPresentation(renderer.port, manifest)
    const initial = createInitialNight(1, 42)
    world.update(initial, 1)
    world.update({ ...initial, keeper: { ...initial.keeper, x: 48 } }, 0.5)

    expect(renderer.getSprite(world.entity('keeper'))?.pose?.x).toBe(24)
    expect(renderer.getSprite(world.entity('keeper'))?.pose?.y).toBe(140)
  })
})
