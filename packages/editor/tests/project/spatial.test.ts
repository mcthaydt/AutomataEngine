import { describe, expect, it } from 'vitest'
import { CORE_COMPONENTS, type ComponentTypeRegistration, type SceneDocument } from '@automata/project'
import { buildProjectSpatialItems } from '../../src/project/spatial'

const tag: ComponentTypeRegistration = {
  typeId: 'fake.tag', label: 'Tag',
  schema: { kind: 'object', fields: [] }, defaultData: {}, cardinality: { min: 0, max: 1 }
}
const spawn: ComponentTypeRegistration = {
  typeId: 'fake.spawn', label: 'Spawn',
  schema: { kind: 'object', fields: [] }, defaultData: {}, cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', size: 0.5, color: '#ffd166' }
}
const componentTypes = [...CORE_COMPONENTS, tag, spawn]

const transform = (position: { x: number; y: number; z: number }) => ({
  id: 't', typeId: 'core.transform', data: { position, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
})

function scene(entities: SceneDocument['entities']): SceneDocument {
  return { formatVersion: 1, id: 's', name: 'S', entities }
}

describe('project spatial projection', () => {
  it('projects transform+primitive+surface to a solid box item', () => {
    const items = buildProjectSpatialItems(scene([{
      id: 'b', name: 'Box', enabled: true,
      components: [transform({ x: 2, y: 0, z: 3 }), { id: 'p', typeId: 'core.primitive', data: { shape: 'box', size: { x: 2, y: 1, z: 4 } } }, { id: 's', typeId: 'core.surface', data: { color: '#abcdef' } }]
    }]), componentTypes)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      entityId: 'b', gizmo: false, color: '#abcdef',
      position: { x: 2, y: 0, z: 3 },
      renderable: { primitive: 'box', size: { x: 2, y: 1, z: 4 }, color: '#abcdef' },
      bounds: { kind: 'box', half: { x: 1, y: 0.5, z: 2 } }
    })
  })

  it('projects a core.zone circle to a translucent gizmo even without a primitive', () => {
    const items = buildProjectSpatialItems(scene([{
      id: 'z', name: 'Zone', enabled: true,
      components: [transform({ x: 0, y: 0, z: 0 }), { id: 'zo', typeId: 'core.zone', data: { shape: 'circle', size: { x: 3, y: 2, z: 3 }, color: '#00ff00' } }]
    }]), componentTypes)
    expect(items[0]).toMatchObject({ entityId: 'z', gizmo: true, color: '#00ff00', bounds: { kind: 'cylinder', radius: 3, halfHeight: 1 } })
  })

  it('omits entities with only non-gizmo game components but keeps gizmo ones', () => {
    const items = buildProjectSpatialItems(scene([
      { id: 'g', name: 'Plain', enabled: true, components: [transform({ x: 0, y: 0, z: 0 }), { id: 'tg', typeId: 'fake.tag', data: {} }] },
      { id: 'p', name: 'Point', enabled: true, components: [transform({ x: 1, y: 0, z: 1 }), { id: 'sp', typeId: 'fake.spawn', data: {} }] }
    ]), componentTypes)
    expect(items.map((item) => item.entityId)).toEqual(['p'])
    expect(items[0]).toMatchObject({ gizmo: true, bounds: { kind: 'point', half: 0.5 } })
  })

  it('resolves nested world positions through the parent', () => {
    const items = buildProjectSpatialItems(scene([
      { id: 'par', name: 'Parent', enabled: true, components: [transform({ x: 10, y: 0, z: 0 })] },
      { id: 'ch', name: 'Child', parentId: 'par', enabled: true, components: [transform({ x: 1, y: 0, z: 0 }), { id: 'p', typeId: 'core.primitive', data: { shape: 'box', size: { x: 1, y: 1, z: 1 } } }] }
    ]), componentTypes)
    expect(items.map((item) => item.entityId)).toEqual(['ch'])
    expect(items[0]!.position).toEqual({ x: 11, y: 0, z: 0 })
  })
})
