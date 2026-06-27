import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind, createNullRenderer, parseData, type PhysicsPort
} from '@automata/engine'
import { CommandError } from '@automata/editor'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { levelKind } from '../../src/data/level'
import { createMonkeyBallDefinition } from '../../src/editor/registration'
import { levelSceneModel } from '../../src/editor/sceneModel'
import { readDataFile } from '../helpers/data'

const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')
const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const nullPhysics = (): PhysicsPort => ({
  addBody() {},
  removeBody() {},
  setGravity() {},
  step: () => [],
  readPose: () => null,
  readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }),
  applyImpulse() {},
  setKinematicTarget() {},
  get bodyCount() { return 0 },
  dispose() {}
}) as PhysicsPort

interface EditorIdWorld {
  with(key: 'editorId'): Iterable<{ editorId?: string }>
}

describe('monkey-ball level SceneModel', () => {
  it('rejects commands that target missing or duplicate ids', () => {
    const doc = levelSceneModel.emptyDoc()
    const existing = levelSceneModel.listItems(doc).find((item) => item.id === 'geometry:0')!

    expect(() => levelSceneModel.apply(doc, {
      type: 'setSurface',
      id: 'missing',
      surface: { kind: 'color', value: '#fff' }
    })).toThrow(CommandError)
    expect(() => levelSceneModel.apply(doc, {
      type: 'addItem',
      item: existing
    })).toThrow(CommandError)
  })

  it('returns the original document for an effective no-op', () => {
    const doc = levelSceneModel.emptyDoc()

    expect(levelSceneModel.apply(doc, {
      type: 'setMetadata',
      path: 'name',
      value: doc.name
    })).toBe(doc)
  })

  it('lists geometry, entities, and synthesized spawn + goal markers', () => {
    const items = levelSceneModel.listItems(level)
    const kinds = items.map((item) => item.kind)
    expect(kinds).toContain('box')
    expect(kinds).toContain('archetype')
    const markers = items.filter((item) => item.kind === 'marker')
    expect(markers.map((marker) => (marker.shape as { markerId: string }).markerId).sort()).toEqual(['goal', 'spawn'])
  })

  it('places the spawn marker at the level spawn', () => {
    const spawn = levelSceneModel.listItems(level).find(
      (item) => item.kind === 'marker' && (item.shape as { markerId: string }).markerId === 'spawn')!
    expect(spawn.transform.position).toEqual({ x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] })
  })

  it('moving the spawn marker writes back to the level spawn field', () => {
    const next = levelSceneModel.apply(level, {
      type: 'moveSelected',
      ids: ['marker:spawn'],
      delta: { x: 1, y: 0, z: -2 }
    })
    expect(next.spawn).toEqual([level.spawn[0] + 1, level.spawn[1], level.spawn[2] - 2])
  })

  it('moving the goal marker writes back to goal.pos', () => {
    const next = levelSceneModel.apply(level, {
      type: 'moveSelected',
      ids: ['marker:goal'],
      delta: { x: 0, y: 0, z: 3 }
    })
    expect(next.goal.pos).toEqual([level.goal.pos[0], level.goal.pos[1], level.goal.pos[2] + 3])
  })

  it('setSurface on a geometry item updates its color in the level', () => {
    const boxId = levelSceneModel.listItems(level).find((item) => item.kind === 'box')!.id
    const next = levelSceneModel.apply(level, {
      type: 'setSurface',
      id: boxId,
      surface: { kind: 'color', value: '#123456' }
    })
    const index = Number(boxId.replace('geometry:', ''))
    expect(next.geometry[index]!.color).toBe('#123456')
  })

  it('exposes scalar metadata fields (name, timeLimitS, fallY) only', () => {
    expect(levelSceneModel.metadataFields(level).map((field) => field.path).sort())
      .toEqual(['fallY', 'name', 'timeLimitS'])
  })

  it('keeps geometry identity stable across a mid-list delete', () => {
    const doc = levelSceneModel.parse({
      id: 'x', name: 'X', timeLimitS: 60, fallY: -10,
      spawn: [0, 1, 6], goal: { pos: [0, 0, -6] },
      geometry: [
        { shape: 'box', size: [1, 1, 1], pos: [0, 0, 0], color: '#111' },
        { shape: 'box', size: [1, 1, 1], pos: [5, 0, 0], color: '#222' },
        { shape: 'box', size: [1, 1, 1], pos: [9, 0, 0], color: '#333' }
      ],
      entities: []
    })
    const items = levelSceneModel.listItems(doc)
    const firstId = items.find((item) => item.transform.position.x === 0)!.id
    const thirdId = items.find((item) => item.transform.position.x === 9)!.id
    const next = levelSceneModel.apply(doc, { type: 'deleteItems', ids: [firstId] })
    const third = levelSceneModel.listItems(next).find((item) => item.transform.position.x === 9)!
    expect(third.id).toBe(thirdId)
  })

  it('assigns a fresh, non-colliding id when adding after a delete', () => {
    let doc = levelSceneModel.parse({
      id: 'x', name: 'X', timeLimitS: 60, fallY: -10,
      spawn: [0, 1, 6], goal: { pos: [0, 0, -6] },
      geometry: [
        { shape: 'box', size: [1, 1, 1], pos: [0, 0, 0], color: '#111' },
        { shape: 'box', size: [1, 1, 1], pos: [5, 0, 0], color: '#222' }
      ],
      entities: []
    })
    const firstId = levelSceneModel.listItems(doc).find((item) => item.transform.position.x === 0)!.id
    doc = levelSceneModel.apply(doc, { type: 'deleteItems', ids: [firstId] })
    doc = levelSceneModel.apply(doc, {
      type: 'addItem',
      item: {
        id: 'ignored', kind: 'box',
        transform: { position: { x: 2, y: 0, z: 2 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
        surface: { kind: 'color', value: '#444' }
      }
    })
    const boxIds = levelSceneModel.listItems(doc).filter((item) => item.kind === 'box').map((item) => item.id)
    expect(new Set(boxIds).size).toBe(boxIds.length)
  })

  it('adds cylinder and archetype items but rejects additional markers', () => {
    let doc = levelSceneModel.emptyDoc()
    doc = levelSceneModel.apply(doc, {
      type: 'addItem',
      item: {
        id: 'cylinder:1',
        kind: 'cylinder',
        transform: { position: { x: 2, y: 1, z: 3 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'cylinder', radius: 2, height: 4 },
        surface: { kind: 'color', value: '#abcdef' }
      }
    })
    doc = levelSceneModel.apply(doc, {
      type: 'addItem',
      item: {
        id: 'entity:1',
        kind: 'archetype',
        transform: { position: { x: 4, y: 0, z: 5 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'archetype', name: 'banana' },
        surface: { kind: 'color', value: '#ffffff' }
      }
    })

    expect(doc.geometry.at(-1)).toMatchObject({ shape: 'cylinder', radius: 2, height: 4 })
    expect(doc.entities.at(-1)).toMatchObject({ archetype: 'banana', uid: 'entity:1' })
    expect(() => levelSceneModel.apply(doc, {
      type: 'addItem',
      item: {
        id: 'marker:extra',
        kind: 'marker',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'marker', markerId: 'extra' },
        surface: { kind: 'color', value: '#ffffff' }
      }
    })).toThrow('markers are singletons')
  })

  it('edits box axes and cylinder dimensions', () => {
    let doc = levelSceneModel.emptyDoc()
    doc = levelSceneModel.apply(doc, {
      type: 'addItem',
      item: {
        id: 'cylinder:1',
        kind: 'cylinder',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'cylinder', radius: 1, height: 2 },
        surface: { kind: 'color', value: '#ffffff' }
      }
    })
    doc = levelSceneModel.apply(doc, {
      type: 'setItemField', id: 'geometry:0', path: 'pos.x', value: 4
    })
    doc = levelSceneModel.apply(doc, {
      type: 'setItemField', id: 'geometry:0', path: 'size.z', value: 20
    })
    doc = levelSceneModel.apply(doc, {
      type: 'setItemField', id: 'cylinder:1', path: 'radius', value: 3
    })
    doc = levelSceneModel.apply(doc, {
      type: 'setItemField', id: 'cylinder:1', path: 'height', value: 6
    })

    expect(doc.geometry[0]).toMatchObject({ pos: [4, -0.25, 0], size: [8, 0.5, 20] })
    expect(doc.geometry[1]).toMatchObject({ radius: 3, height: 6 })
  })

  it('parses a serialized document through loadDoc', () => {
    const loaded = levelSceneModel.apply(levelSceneModel.emptyDoc(), {
      type: 'loadDoc',
      doc: JSON.stringify(level)
    })

    expect(loaded.id).toBe(level.id)
    expect(loaded.geometry.every((geometry) => typeof geometry.uid === 'string')).toBe(true)
  })

  it('preserves authored ids, avoids collisions, and lists rotated cylinders', () => {
    const doc = levelSceneModel.parse({
      id: 'ids', name: 'IDs', timeLimitS: 60, fallY: -10,
      spawn: [0, 1, 6], goal: { pos: [0, 0, -6] },
      geometry: [
        {
          shape: 'cylinder', uid: 'geometry:0', radius: 1, height: 2,
          pos: [0, 0, 0], rot: [0, 45, 0], color: '#111', friction: 0.6
        },
        { shape: 'box', size: [1, 1, 1], pos: [2, 0, 0], color: '#222', friction: 0.6 }
      ],
      entities: [
        { archetype: 'banana', uid: 'entity:0', pos: [0, 0, 0] },
        { archetype: 'bumper', pos: [2, 0, 0] }
      ]
    })
    const items = levelSceneModel.listItems(doc)

    expect(doc.geometry.map((geometry) => geometry.uid)).toEqual(['geometry:0', 'geometry:1'])
    expect(doc.entities.map((entity) => entity.uid)).toEqual(['entity:0', 'entity:1'])
    expect(items.find((item) => item.id === 'geometry:0')).toMatchObject({
      kind: 'cylinder',
      shape: { type: 'cylinder', radius: 1, height: 2 },
      transform: { rotationEuler: { x: 0, y: 45, z: 0 } }
    })
  })

  it('handles command no-ops and unsupported targets without cloning', () => {
    const doc = levelSceneModel.emptyDoc()
    const surface = levelSceneModel.getSurface(doc, 'geometry:0')

    expect(surface).toEqual({ kind: 'color', value: '#7ec850' })
    expect(levelSceneModel.getSurface(doc, 'missing')).toEqual({ kind: 'color', value: '#ffffff' })
    expect(levelSceneModel.apply(doc, { type: 'moveSelected', ids: [], delta: { x: 1, y: 0, z: 0 } })).toBe(doc)
    expect(levelSceneModel.apply(doc, {
      type: 'moveSelected', ids: ['geometry:0'], delta: { x: 0, y: 0, z: 0 }
    })).toBe(doc)
    expect(levelSceneModel.apply(doc, {
      type: 'setSurface', id: 'geometry:0', surface
    })).toBe(doc)
    expect(levelSceneModel.apply(doc, { type: 'deleteItems', ids: [] })).toBe(doc)
    expect(() => levelSceneModel.apply(doc, {
      type: 'setSurface', id: 'geometry:0', surface: { kind: 'texture', textureId: 'stone' }
    })).toThrow('only color surfaces supported')
    expect(() => levelSceneModel.apply(doc, {
      type: 'setSurface', id: 'marker:spawn', surface: { kind: 'color', value: '#000000' }
    })).toThrow('surface edit unsupported')
    expect(() => levelSceneModel.apply(doc, {
      type: 'deleteItems', ids: ['marker:goal']
    })).toThrow('cannot delete')
    expect(() => levelSceneModel.apply(doc, {
      type: 'setItemField', id: 'marker:goal', path: 'pos.x', value: 0
    })).toThrow('field edit unsupported')
  })

  it('updates and no-ops each metadata field while rejecting unknown metadata', () => {
    const doc = levelSceneModel.emptyDoc()
    const timed = levelSceneModel.apply(doc, { type: 'setMetadata', path: 'timeLimitS', value: 90 })
    const fallen = levelSceneModel.apply(timed, { type: 'setMetadata', path: 'fallY', value: -20 })

    expect(timed.timeLimitS).toBe(90)
    expect(fallen.fallY).toBe(-20)
    expect(levelSceneModel.apply(timed, {
      type: 'setMetadata', path: 'timeLimitS', value: 90
    })).toBe(timed)
    expect(levelSceneModel.apply(fallen, {
      type: 'setMetadata', path: 'fallY', value: -20
    })).toBe(fallen)
    expect(() => levelSceneModel.apply(doc, {
      type: 'setMetadata', path: 'unknown', value: 1
    })).toThrow('unknown metadata')
  })

  it('moves and deletes archetypes and rejects unsupported geometry fields', () => {
    let doc = levelSceneModel.parse(level)
    const entity = levelSceneModel.listItems(doc).find((item) => item.kind === 'archetype')!
    const beforeX = entity.transform.position.x
    doc = levelSceneModel.apply(doc, {
      type: 'moveSelected', ids: [entity.id], delta: { x: 2, y: 0, z: 0 }
    })
    expect(levelSceneModel.listItems(doc).find((item) => item.id === entity.id)!.transform.position.x)
      .toBe(beforeX + 2)
    doc = levelSceneModel.apply(doc, { type: 'deleteItems', ids: [entity.id] })
    expect(levelSceneModel.listItems(doc).some((item) => item.id === entity.id)).toBe(false)

    doc = levelSceneModel.apply(doc, {
      type: 'addItem',
      item: {
        id: 'texture-box',
        kind: 'box',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
        surface: { kind: 'texture', textureId: 'stone' }
      }
    })
    expect(doc.geometry.at(-1)!.color).toBe('#ffffff')
    doc = levelSceneModel.apply(doc, {
      type: 'setSurface', id: 'texture-box', surface: { kind: 'color', value: '#010203' }
    })
    expect(doc.geometry.at(-1)!.color).toBe('#010203')
    expect(() => levelSceneModel.apply(doc, {
      type: 'setItemField', id: 'texture-box', path: 'radius', value: 2
    })).toThrow('unsupported field radius')
  })

  it('buildWorld tags real renderable entities with editor IDs for 3D highlight', () => {
    const definition = createMonkeyBallDefinition(lib, tuning)
    const world = definition.buildWorld(level, createNullRenderer().port, nullPhysics())
    const ids = [...(world as unknown as EditorIdWorld).with('editorId')]
      .map((entity) => entity.editorId)
      .sort()
    expect(ids).toEqual(expect.arrayContaining(['geometry:0', 'marker:spawn', 'marker:goal']))
  })
})
