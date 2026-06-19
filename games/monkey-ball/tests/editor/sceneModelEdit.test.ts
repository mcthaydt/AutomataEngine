import { describe, expect, it } from 'vitest'
import { parseData } from '@automata/engine'
import type { SceneItem } from '@automata/editor'
import { levelKind } from '../../src/data/level'
import { levelSceneModel } from '../../src/editor/sceneModel'
import { readDataFile } from '../helpers/data'

const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

const boxItem: SceneItem = {
  id: 'box:9',
  kind: 'box',
  transform: { position: { x: 1, y: 0, z: 2 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'box', size: { x: 2, y: 0.5, z: 4 } },
  surface: { kind: 'color', value: '#abcabc' }
}
const archItem: SceneItem = {
  id: 'banana:9',
  kind: 'archetype',
  transform: { position: { x: 3, y: 0.6, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'archetype', name: 'banana' },
  surface: { kind: 'color', value: '#ffd23f' }
}

describe('level SceneModel edits', () => {
  it('addItem of a box appends a box geometry entry', () => {
    const next = levelSceneModel.apply(level, { type: 'addItem', item: boxItem })
    const added = next.geometry.at(-1)!
    expect(added).toMatchObject({ shape: 'box', size: [2, 0.5, 4], pos: [1, 0, 2], color: '#abcabc' })
  })

  it('addItem of an archetype appends an entity', () => {
    const next = levelSceneModel.apply(level, { type: 'addItem', item: archItem })
    expect(next.entities.at(-1)).toMatchObject({ archetype: 'banana', pos: [3, 0.6, 0] })
  })

  it('setItemField edits a geometry box size component', () => {
    const next = levelSceneModel.apply(level, { type: 'setItemField', id: 'geometry:0', path: 'size.y', value: 1.5 })
    expect(next.geometry[0]!.shape === 'box' && next.geometry[0]!.size[1]).toBe(1.5)
  })

  it('setItemField edits a geometry position component', () => {
    const next = levelSceneModel.apply(level, { type: 'setItemField', id: 'geometry:0', path: 'pos.x', value: 4 })
    expect(next.geometry[0]!.pos[0]).toBe(4)
  })

  it('round-trips: edited level still parses against levelKind', () => {
    const next = levelSceneModel.apply(level, { type: 'addItem', item: boxItem })
    expect(() => levelKind.schema.parse(next)).not.toThrow()
  })
})
