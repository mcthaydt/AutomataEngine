import { describe, expect, it } from 'vitest'
import type { SceneItem } from '../../src/model/types'
import { buildDrawModel } from '../../src/viewport2d/draw'
import { initialMapView } from '../../src/viewport2d/projection'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'

const size = { w: 800, h: 600 }
const cylinder: SceneItem = {
  id: 'c',
  kind: 'cylinder',
  transform: { position: { x: 2, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'cylinder', radius: 1, height: 1 },
  surface: { kind: 'color', value: '#abc' }
}
const marker: SceneItem = {
  id: 'm',
  kind: 'marker',
  transform: { position: { x: -1, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' },
  surface: { kind: 'color', value: '#0f0' }
}

describe('2D draw model', () => {
  it('emits a rect for a box, a circle for a cylinder, an icon for a marker', () => {
    const ops = buildDrawModel(fakeDefinition, [boxItem('b'), cylinder, marker], [], initialMapView, size)
    expect(ops.map((op) => op.shape)).toEqual(['rect', 'circle', 'icon'])
  })

  it('positions a box rect centered on its world position', () => {
    const [rect] = buildDrawModel(fakeDefinition, [boxItem('b', 0, 0)], [], initialMapView, size)
    expect(rect).toMatchObject({ x: 388, y: 288, w: 24, h: 24 })
  })

  it('marks selected items', () => {
    const ops = buildDrawModel(fakeDefinition, [boxItem('b')], ['b'], initialMapView, size)
    expect(ops[0]!.selected).toBe(true)
  })

  it('uses resolveSurface for the fill color', () => {
    const [rect] = buildDrawModel(fakeDefinition, [boxItem('b')], [], initialMapView, size)
    expect(rect!.color).toBe('#e0e0e0')
  })
})
