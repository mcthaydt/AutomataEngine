import { describe, expect, it } from 'vitest'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'

describe('generic SceneModel (fake registration)', () => {
  const { scene } = fakeDefinition

  it('adds, moves, and deletes items purely', () => {
    let doc = scene.emptyDoc()
    doc = scene.apply(doc, { type: 'addItem', item: boxItem('a', 1, 1) })
    doc = scene.apply(doc, { type: 'moveSelected', ids: ['a'], delta: { x: 2, y: 0, z: 0 } })
    expect(scene.listItems(doc)[0]!.transform.position).toEqual({ x: 3, y: 0, z: 1 })
    doc = scene.apply(doc, { type: 'deleteItems', ids: ['a'] })
    expect(scene.listItems(doc)).toEqual([])
  })

  it('edits metadata and surfaces', () => {
    let doc = scene.apply(scene.emptyDoc(), { type: 'addItem', item: boxItem('a') })
    doc = scene.apply(doc, { type: 'setMetadata', path: 'title', value: 'Hi' })
    doc = scene.apply(doc, { type: 'setSurface', id: 'a', surface: { kind: 'color', value: '#000' } })
    expect(scene.metadataFields(doc)[0]).toMatchObject({ path: 'title', value: 'Hi' })
    expect(scene.getSurface(doc, 'a')).toEqual({ kind: 'color', value: '#000' })
  })

  it('declares a singleton marker brush', () => {
    expect(fakeDefinition.palette.markers[0]!.cardinality).toEqual({ min: 1, max: 1 })
  })
})
