import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind, createNullRenderer, parseData, type PhysicsPort
} from '@automata/engine'
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

  it('buildWorld tags real renderable entities with editor IDs for 3D highlight', () => {
    const definition = createMonkeyBallDefinition(lib, tuning)
    const world = definition.buildWorld(level, createNullRenderer().port, nullPhysics())
    const ids = [...(world as unknown as EditorIdWorld).with('editorId')]
      .map((entity) => entity.editorId)
      .sort()
    expect(ids).toEqual(expect.arrayContaining(['geometry:0', 'marker:spawn', 'marker:goal']))
  })
})
