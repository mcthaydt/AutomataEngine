import { describe, expect, it } from 'vitest'
import { buildProjectDrawModel } from '../../src/viewport2d/projectDraw'
import { hitTestProjectMap } from '../../src/viewport2d/projectHit'
import type { SpatialItem } from '../../src/project/spatial'

const view = { panX: 0, panZ: 0, pixelsPerUnit: 10 }
const size = { w: 200, h: 200 }

const boxItem: SpatialItem = {
  entityId: 'box', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  renderable: { primitive: 'box', size: { x: 2, y: 1, z: 4 }, color: '#fff' }, color: '#fff',
  bounds: { kind: 'box', half: { x: 1, y: 0.5, z: 2 } }, gizmo: false
}
const zoneItem: SpatialItem = {
  entityId: 'zone', position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  renderable: { primitive: 'cylinder', radius: 3, height: 1, color: '#0f0' }, color: '#0f0',
  bounds: { kind: 'cylinder', radius: 3, halfHeight: 0.5 }, gizmo: true
}

describe('project draw model and hit testing', () => {
  it('builds draw ops keyed by entity ID with selection and gizmo flags', () => {
    const ops = buildProjectDrawModel([boxItem, zoneItem], ['zone'], view, size)
    expect(ops.map((op) => op.id)).toEqual(['box', 'zone'])
    // Box footprint uses x/z world dimensions: w=2*ppu, h=4*ppu, centered at screen center.
    expect(ops[0]).toMatchObject({ id: 'box', shape: 'rect', w: 20, h: 40, x: 100 - 10, y: 100 - 20, selected: false })
    expect(ops[1]).toMatchObject({ id: 'zone', shape: 'circle', r: 30, selected: true, gizmo: true })
  })

  it('hit-tests by entity ID using the topmost item under the cursor', () => {
    expect(hitTestProjectMap([boxItem, zoneItem], view, size, { x: 100, y: 100 })).toBe('box')
    expect(hitTestProjectMap([boxItem, zoneItem], view, size, { x: 150, y: 100 })).toBe('zone')
    expect(hitTestProjectMap([boxItem, zoneItem], view, size, { x: 5, y: 5 })).toBeNull()
  })
})
