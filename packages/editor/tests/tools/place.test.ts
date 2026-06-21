import { describe, expect, it } from 'vitest'
import type { Brush, SceneItem } from '../../src/model/types'
import { newItemId, placementCommand } from '../../src/tools/place'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'

const boxBrush = fakeDefinition.palette.geometry[0]!
const markerBrush = fakeDefinition.palette.markers[0]!
const cylinderBrush: Brush = {
  id: 'cyl', label: 'Cyl', kind: 'cylinder', place: 'point',
  cardinality: { min: 0, max: Number.POSITIVE_INFINITY }
}
const archetypeBrush: Brush = {
  id: 'banana', label: 'Banana', kind: 'archetype', place: 'point', ref: 'banana',
  cardinality: { min: 0, max: Number.POSITIVE_INFINITY }
}
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

  it('places a cylinder shape for a cylinder brush', () => {
    const cmd = placementCommand(fakeDefinition, [], cylinderBrush, { x: 0, y: 0, z: 0 }, 1)
    expect(cmd?.type).toBe('addItem')
    if (cmd?.type === 'addItem') expect(cmd.item.shape).toEqual({ type: 'cylinder', radius: 0.5, height: 1 })
  })

  it('places an archetype shape carrying the brush ref name', () => {
    const cmd = placementCommand(fakeDefinition, [], archetypeBrush, { x: 0, y: 0, z: 0 }, 1)
    if (cmd?.type === 'addItem') expect(cmd.item.shape).toEqual({ type: 'archetype', name: 'banana' })
  })

  it('generates a fresh id that skips taken ones', () => {
    expect(newItemId(boxBrush, [boxItem('box:1')])).toBe('box:2')
  })
})
