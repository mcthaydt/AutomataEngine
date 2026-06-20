import { describe, expect, it } from 'vitest'
import type { SceneItem } from '../../src/model/types'
import { canDelete, canPlace, countForBrush, missingRequired } from '../../src/tools/cardinality'
import { archetypeItem, boxItem, cylinderItem, fakeDefinition } from '../fixtures/fakeDefinition'

const startMarker = (id: string): SceneItem => ({
  id,
  kind: 'marker',
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' },
  surface: { kind: 'color', value: '#0f0' }
})
const boxBrush = fakeDefinition.palette.geometry[0]!
const markerBrush = fakeDefinition.palette.markers[0]!

describe('cardinality', () => {
  it('counts items per brush', () => {
    expect(countForBrush(fakeDefinition, [boxItem('a'), boxItem('b')], boxBrush)).toBe(2)
  })

  it('allows unbounded geometry placement', () => {
    expect(canPlace(fakeDefinition, [boxItem('a')], boxBrush)).toBe(true)
  })

  it('blocks placing a singleton marker that already exists', () => {
    expect(canPlace(fakeDefinition, [startMarker('marker:start')], markerBrush)).toBe(false)
  })

  it('guards deletion of a required marker at its minimum', () => {
    expect(canDelete(fakeDefinition, [startMarker('marker:start')], 'marker:start')).toBe(false)
    expect(canDelete(fakeDefinition, [boxItem('a')], 'a')).toBe(true)
  })

  it('reports required brushes that are missing', () => {
    expect(missingRequired(fakeDefinition, [])).toEqual(['Start'])
    expect(missingRequired(fakeDefinition, [startMarker('marker:start')])).toEqual([])
  })

  it('resolves an archetype ref when matching brushes', () => {
    expect(countForBrush(fakeDefinition, [archetypeItem('a')], boxBrush)).toBe(0)
  })

  it('treats an item with no matching brush as freely deletable', () => {
    expect(canDelete(fakeDefinition, [cylinderItem('c')], 'c')).toBe(true)
  })

  it('cannot delete an id that is not present', () => {
    expect(canDelete(fakeDefinition, [], 'ghost')).toBe(false)
  })
})
