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

  it('adds and removes non-entry scenes while rejecting duplicates and missing scenes', () => {
    const snapshot = baseSnapshot()
    const scene = { formatVersion: 1 as const, id: 'second', name: 'Second', entities: [] }
    const added = applyProjectCommand(definition, snapshot, {
      type: 'addScene', path: 'scenes/second.scene.json', scene
    })
    expect(added.scenes.second).toEqual(scene)
    expect(() => applyProjectCommand(definition, added, {
      type: 'addScene', path: 'scenes/duplicate.scene.json', scene
    })).toThrow(/duplicate/i)
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addScene', path: 'scenes/bad.scene.json', scene: { ...scene, id: '' }
    })).toThrow(ProjectCommandError)
    const removed = applyProjectCommand(definition, added, { type: 'removeScene', sceneId: 'second' })
    expect(removed.scenes.second).toBeUndefined()
    expect(() => applyProjectCommand(definition, removed, { type: 'removeScene', sceneId: 'second' })).toThrow(/unknown scene/i)
  })

  it('rejects duplicate entities, missing parents, malformed entities, and invalid initial components', () => {
    const snapshot = baseSnapshot()
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addEntity', sceneId: 'main',
      entity: { id: 'root', name: 'Duplicate', enabled: true, components: [] }
    })).toThrow(/duplicate/i)
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addEntity', sceneId: 'main',
      entity: { id: 'orphan', name: 'Orphan', parentId: 'missing', enabled: true, components: [] }
    })).toThrow(/parent/i)
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addEntity', sceneId: 'main',
      entity: { id: '', name: 'Bad', enabled: true, components: [] }
    })).toThrow(ProjectCommandError)
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addEntity', sceneId: 'main',
      entity: {
        id: 'bad-component', name: 'Bad', enabled: true,
        components: [{ id: 'spawn', typeId: 'fake.spawn', data: { team: 'green' } }]
      }
    })).toThrow(/invalid component/i)
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addEntity', sceneId: 'main',
      entity: {
        id: 'too-many', name: 'Too many', enabled: true,
        components: [
          { id: 'spawn-a', typeId: 'fake.spawn', data: { team: 'red' } },
          { id: 'spawn-b', typeId: 'fake.spawn', data: { team: 'blue' } }
        ]
      }
    })).toThrow(/cardinality/i)
  })

  it('handles empty removals and all reparenting guard branches', () => {
    const snapshot = applyProjectCommands(definition, baseSnapshot(), [
      { type: 'addEntity', sceneId: 'main', entity: { id: 'child', name: 'Child', parentId: 'root', enabled: true, components: [] } },
      { type: 'addEntity', sceneId: 'main', entity: { id: 'other', name: 'Other', enabled: true, components: [] } }
    ])
    expect(applyProjectCommand(definition, snapshot, { type: 'removeEntities', sceneId: 'main', entityIds: [] })).toBe(snapshot)
    expect(() => applyProjectCommand(definition, snapshot, { type: 'removeEntities', sceneId: 'main', entityIds: ['missing'] })).toThrow(/unknown entity/i)
    expect(() => applyProjectCommand(definition, snapshot, { type: 'reparentEntity', sceneId: 'main', entityId: 'child', parentId: 'child' })).toThrow(/cycle/i)
    expect(() => applyProjectCommand(definition, snapshot, { type: 'reparentEntity', sceneId: 'main', entityId: 'child', parentId: 'missing' })).toThrow(/parent/i)
    const detached = applyProjectCommand(definition, snapshot, { type: 'reparentEntity', sceneId: 'main', entityId: 'child' })
    expect(detached.scenes.main!.entities.find((entity) => entity.id === 'child')!.parentId).toBeUndefined()
    const reparented = applyProjectCommand(definition, detached, { type: 'reparentEntity', sceneId: 'main', entityId: 'child', parentId: 'other' })
    expect(reparented.scenes.main!.entities.find((entity) => entity.id === 'child')!.parentId).toBe('other')
  })

  it('removes components and enforces missing/minimum-cardinality rules', () => {
    const withSpawn = applyProjectCommand(definition, baseSnapshot(), {
      type: 'addComponent', sceneId: 'main', entityId: 'root',
      component: { id: 'spawn', typeId: 'fake.spawn', data: { team: 'red' } }
    })
    expect(() => applyProjectCommand(definition, withSpawn, {
      type: 'addComponent', sceneId: 'main', entityId: 'root',
      component: { id: 'spawn', typeId: 'unregistered', data: {} }
    })).toThrow(/duplicate component/i)
    expect(() => applyProjectCommand(definition, withSpawn, {
      type: 'removeComponent', sceneId: 'main', entityId: 'root', componentId: 'missing'
    })).toThrow(/unknown component/i)
    const removed = applyProjectCommand(definition, withSpawn, {
      type: 'removeComponent', sceneId: 'main', entityId: 'root', componentId: 'spawn'
    })
    expect(removed.scenes.main!.entities[0]!.components.some((component) => component.id === 'spawn')).toBe(false)

    const requiredDefinition: GameProjectDefinition<{ snapshot: ProjectSnapshot }> = {
      ...definition,
      components: [{ ...definition.components[0]!, cardinality: { min: 1, max: 1 } }]
    }
    expect(() => applyProjectCommand(requiredDefinition, withSpawn, {
      type: 'removeComponent', sceneId: 'main', entityId: 'root', componentId: 'spawn'
    })).toThrow(/minimum|cardinality/i)
  })

  it('covers resource creation, validation, singleton, and unreferenced removal', () => {
    const snapshot = baseSnapshot()
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addResource', path: 'resources/dup.resource.json',
      resource: { formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 1 } }
    })).toThrow(/duplicate/i)
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addResource', path: 'resources/second.resource.json',
      resource: { formatVersion: 1, id: 'second', typeId: 'fake.tuning', data: { speed: 1 } }
    })).toThrow(/singleton/i)
    expect(() => applyProjectCommand(definition, snapshot, {
      type: 'addResource', path: 'resources/bad.resource.json',
      resource: { formatVersion: 1, id: 'bad', typeId: 'fake.list', data: { items: 4 } }
    })).toThrow(/invalid resource/i)

    const withList = applyProjectCommand(definition, snapshot, {
      type: 'addResource', path: 'resources/list.resource.json',
      resource: { formatVersion: 1, id: 'list', typeId: 'fake.list', data: { items: [] } }
    })
    const removed = applyProjectCommand(definition, withList, { type: 'removeResource', resourceId: 'list' })
    expect(removed.resources.list).toBeUndefined()
    expect(() => applyProjectCommand(definition, removed, { type: 'removeResource', resourceId: 'missing' })).toThrow(/unknown resource/i)

    const unknown = applyProjectCommand(definition, snapshot, {
      type: 'addResource', path: 'resources/unknown.resource.json',
      resource: { formatVersion: 1, id: 'unknown', typeId: 'other.type', data: {} }
    })
    expect(unknown.resources.unknown).toBeDefined()
  })

  it('sets every target kind and reports missing component targets', () => {
    const snapshot = applyProjectCommand(definition, baseSnapshot(), {
      type: 'addComponent', sceneId: 'main', entityId: 'root',
      component: { id: 'spawn', typeId: 'fake.spawn', data: { team: 'red' } }
    })
    const manifest = applyProjectCommand(definition, snapshot, {
      type: 'setProperty', target: { kind: 'manifest' }, pointer: '/name', value: 'Renamed Project'
    })
    expect(manifest.manifest.name).toBe('Renamed Project')
    const scene = applyProjectCommand(definition, manifest, {
      type: 'setProperty', target: { kind: 'scene', sceneId: 'main' }, pointer: '/name', value: 'Renamed Scene'
    })
    expect(scene.scenes.main!.name).toBe('Renamed Scene')
    const component = applyProjectCommand(definition, scene, {
      type: 'setProperty',
      target: { kind: 'component', sceneId: 'main', entityId: 'root', componentId: 'spawn' },
      pointer: '/team', value: 'blue'
    })
    expect((component.scenes.main!.entities[0]!.components.find((entry) => entry.id === 'spawn')!.data as { team: string }).team).toBe('blue')
    expect(() => applyProjectCommand(definition, component, {
      type: 'setProperty',
      target: { kind: 'component', sceneId: 'main', entityId: 'root', componentId: 'missing' },
      pointer: '/team', value: 'red'
    })).toThrow(/unknown component/i)
  })

  it('removes array items, preserves no-op moves, and validates loaded snapshots', () => {
    const withList = applyProjectCommand(definition, baseSnapshot(), {
      type: 'addResource', path: 'resources/list.resource.json',
      resource: { formatVersion: 1, id: 'list', typeId: 'fake.list', data: { items: ['a', 'b'] } }
    })
    const removed = applyProjectCommand(definition, withList, {
      type: 'removeArrayItem', target: { kind: 'resource', resourceId: 'list' }, pointer: '/items', index: 0
    })
    expect((removed.resources.list!.data as { items: string[] }).items).toEqual(['b'])
    expect(applyProjectCommand(definition, removed, {
      type: 'moveArrayItem', target: { kind: 'resource', resourceId: 'list' }, pointer: '/items', from: 0, to: 0
    })).toBe(removed)
    expect(applyProjectCommand(definition, removed, { type: 'loadSnapshot', snapshot: removed })).toEqual(removed)
    expect(() => applyProjectCommand(definition, removed, {
      type: 'loadSnapshot', snapshot: { ...removed, manifest: { ...removed.manifest, id: '' } }
    })).toThrow(ProjectCommandError)
  })
})
