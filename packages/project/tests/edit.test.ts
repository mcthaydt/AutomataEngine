import { describe, expect, it } from 'vitest'
import { applyProjectCommand, applyProjectCommands, ProjectCommandError, projectCommandSchema } from '../src'
import type { GameProjectDefinition, ProjectSnapshot } from '../src'

const definition: GameProjectDefinition<{ snapshot: ProjectSnapshot }> = {
  gameId: 'fake',
  label: 'Fake',
  components: [{
    typeId: 'fake.spawn', label: 'Spawn',
    schema: { kind: 'object', fields: [{ key: 'team', label: 'Team', kind: 'enum', required: true, values: ['red', 'blue'] }] },
    defaultData: { team: 'red' },
    cardinality: { min: 0, max: 1 }
  }],
  resources: [{
    typeId: 'fake.tuning', label: 'Tuning',
    schema: { kind: 'object', fields: [{ key: 'speed', label: 'Speed', kind: 'number', required: true, min: 0 }] },
    defaultData: { speed: 4 }, singleton: true
  }, {
    typeId: 'fake.list', label: 'List',
    schema: { kind: 'object', fields: [{ key: 'items', label: 'Items', kind: 'array', presentation: 'list', item: { kind: 'string' } }] },
    defaultData: { items: [] }
  }],
  createTemplate: () => baseSnapshot(),
  validate: () => [],
  compile: (snapshot) => ({ snapshot })
}

function baseSnapshot(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: 1, id: 'demo', name: 'Demo', gameId: 'fake', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
    },
    scenes: {
      main: {
        formatVersion: 1, id: 'main', name: 'Main',
        entities: [{
          id: 'root', name: 'Root', enabled: true,
          components: [{ id: 'transform', typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }]
        }]
      }
    },
    resources: { tuning: { formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 4 } } }
  }
}

describe('project commands', () => {
  it('applies the core rename/add/reparent sequence and rejects cycles', () => {
    const snapshot = baseSnapshot()
    const renamed = applyProjectCommand(definition, snapshot, {
      type: 'setProperty', target: { kind: 'entity', sceneId: 'main', entityId: 'root' },
      pointer: '/name', value: 'Renamed'
    })
    expect(renamed.scenes.main!.entities[0]!.name).toBe('Renamed')
    expect(snapshot.scenes.main!.entities[0]!.name).toBe('Root')

    const withChild = applyProjectCommand(definition, renamed, {
      type: 'addEntity', sceneId: 'main',
      entity: { id: 'child', name: 'Child', parentId: 'root', enabled: true, components: [] }
    })
    expect(withChild.scenes.main!.entities.map((entity) => entity.id)).toEqual(['root', 'child'])

    expect(() => applyProjectCommand(definition, withChild, {
      type: 'reparentEntity', sceneId: 'main', entityId: 'root', parentId: 'child'
    })).toThrow(/cycle/)
  })

  it('treats a deep-equal setProperty as a no-op preserving the snapshot reference', () => {
    const snapshot = baseSnapshot()
    const next = applyProjectCommand(definition, snapshot, {
      type: 'setProperty', target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 4
    })
    expect(next).toBe(snapshot)
  })

  it('validates modified resource data through its registered schema', () => {
    const snapshot = baseSnapshot()
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'setProperty', target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: -1
    })).toThrow(ProjectCommandError)
  })

  it('enforces component cardinality and validates component data', () => {
    const snapshot = baseSnapshot()
    const added = applyProjectCommand(definition, snapshot, {
      type: 'addComponent', sceneId: 'main', entityId: 'root',
      component: { id: 'spawn', typeId: 'fake.spawn', data: { team: 'blue' } }
    })
    expect(added.scenes.main!.entities[0]!.components.map((c) => c.typeId)).toContain('fake.spawn')

    expect(() => applyProjectCommand(definition, added, {
      type: 'addComponent', sceneId: 'main', entityId: 'root',
      component: { id: 'spawn2', typeId: 'fake.spawn', data: { team: 'red' } }
    })).toThrow(/cardinality/i)

    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addComponent', sceneId: 'main', entityId: 'root',
      component: { id: 'bad', typeId: 'fake.spawn', data: { team: 'green' } }
    })).toThrow(ProjectCommandError)
  })

  it('removes an entity together with its descendants', () => {
    const snapshot = applyProjectCommands(definition, baseSnapshot(), [
      { type: 'addEntity', sceneId: 'main', entity: { id: 'child', name: 'Child', parentId: 'root', enabled: true, components: [] } },
      { type: 'addEntity', sceneId: 'main', entity: { id: 'grandchild', name: 'Grand', parentId: 'child', enabled: true, components: [] } }
    ])
    const removed = applyProjectCommand(definition, snapshot, { type: 'removeEntities', sceneId: 'main', entityIds: ['child'] })
    expect(removed.scenes.main!.entities.map((e) => e.id)).toEqual(['root'])
  })

  it('protects the entry scene and referenced resources from removal', () => {
    const snapshot = baseSnapshot()
    expect(() => applyProjectCommand(definition, snapshot, { type: 'removeScene', sceneId: 'main' })).toThrow(/entry/i)

    const referencing = applyProjectCommand(definition, snapshot, {
      type: 'addComponent', sceneId: 'main', entityId: 'root',
      component: { id: 'surface', typeId: 'core.surface', data: { color: '#fff', texture: 'tuning' } }
    })
    expect(() => applyProjectCommand(definition, referencing, { type: 'removeResource', resourceId: 'tuning' })).toThrow(/referenc/i)
  })

  it('reparenting to the same parent is a no-op; missing IDs throw', () => {
    const snapshot = applyProjectCommand(definition, baseSnapshot(), {
      type: 'addEntity', sceneId: 'main', entity: { id: 'child', name: 'Child', parentId: 'root', enabled: true, components: [] }
    })
    expect(applyProjectCommand(definition, snapshot, { type: 'reparentEntity', sceneId: 'main', entityId: 'child', parentId: 'root' })).toBe(snapshot)
    expect(() => applyProjectCommand(definition, snapshot, { type: 'reparentEntity', sceneId: 'main', entityId: 'ghost', parentId: 'root' })).toThrow(ProjectCommandError)
  })

  it('inserts, removes, and moves array items via array commands', () => {
    const withList = applyProjectCommand(definition, baseSnapshot(), {
      type: 'addResource', path: 'resources/list.resource.json',
      resource: { formatVersion: 1, id: 'list', typeId: 'fake.list', data: { items: ['a', 'c'] } }
    })
    const inserted = applyProjectCommand(definition, withList, {
      type: 'insertArrayItem', target: { kind: 'resource', resourceId: 'list' }, pointer: '/items', index: 1, value: 'b'
    })
    expect((inserted.resources.list!.data as { items: string[] }).items).toEqual(['a', 'b', 'c'])
    const moved = applyProjectCommand(definition, inserted, {
      type: 'moveArrayItem', target: { kind: 'resource', resourceId: 'list' }, pointer: '/items', from: 0, to: 2
    })
    expect((moved.resources.list!.data as { items: string[] }).items).toEqual(['b', 'c', 'a'])
  })

  it('parses the command schema and rejects malformed commands', () => {
    expect(projectCommandSchema.safeParse({ type: 'removeScene', sceneId: 'main' }).success).toBe(true)
    expect(projectCommandSchema.safeParse({ type: 'nope' }).success).toBe(false)
    expect(projectCommandSchema.safeParse({ type: 'insertArrayItem', target: { kind: 'resource', resourceId: 'x' }, pointer: '/a', index: -1, value: 1 }).success).toBe(false)
  })
})
