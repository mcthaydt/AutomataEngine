import { describe, expect, it } from 'vitest'
import type { SceneItem } from '../../src/model/types'
import { placementCommand } from '../../src/tools/place'
import { fakeDefinition } from '../fixtures/fakeDefinition'

const boxBrush = fakeDefinition.palette.geometry[0]!
const markerBrush = fakeDefinition.palette.markers[0]!
const existingMarker: SceneItem = {
  id: 'marker:start',
  kind: 'marker',
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' },
  surface: { kind: 'color', value: '#0f0' }
}

describe('placement command', () => {
  it('adds a snapped item for an unbounded brush', () => {
    const cmd = placementCommand(fakeDefinition, [], boxBrush, { x: 1.2, y: 0, z: -0.3 }, 0.5)
    expect(cmd?.type).toBe('addItem')
    if (cmd?.type === 'addItem') expect(cmd.item.transform.position).toEqual({ x: 1, y: 0, z: -0.5 })
  })

  it('moves an existing singleton marker instead of adding a second', () => {
    const cmd = placementCommand(fakeDefinition, [existingMarker], markerBrush, { x: 2, y: 0, z: 2 }, 1)
    expect(cmd).toMatchObject({ type: 'moveSelected', ids: ['marker:start'] })
    if (cmd?.type === 'moveSelected') expect(cmd.delta).toEqual({ x: 2, y: 0, z: 2 })
  })

  it('adds the first marker when none exists yet', () => {
    const cmd = placementCommand(fakeDefinition, [], markerBrush, { x: 0, y: 0, z: 0 }, 1)
    expect(cmd?.type).toBe('addItem')
  })
})
