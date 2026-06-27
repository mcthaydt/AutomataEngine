import { describe, expect, it } from 'vitest'
import { diffDocs } from '../src/diff'
import { boxItem, fakeDefinition, type FakeDoc } from './fixtures/fakeDefinition'

describe('diffDocs', () => {
  it('classifies added, removed, and modified items', () => {
    const before: FakeDoc = { title: 't', items: [boxItem('keep'), boxItem('gone'), boxItem('move', 0, 0)] }
    const after: FakeDoc = { title: 't', items: [boxItem('keep'), boxItem('move', 5, 5), boxItem('new')] }
    const diff = diffDocs(fakeDefinition, before, after)
    expect(diff.addedCount).toBe(1)
    expect(diff.removedCount).toBe(1)
    expect(diff.modifiedCount).toBe(1)
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        { id: 'new', kind: 'added', label: 'box' },
        { id: 'gone', kind: 'removed', label: 'box' },
        { id: 'move', kind: 'modified', label: 'box' }
      ])
    )
  })

  it('reports no changes for identical docs', () => {
    const doc: FakeDoc = { title: 't', items: [boxItem('a')] }
    expect(diffDocs(fakeDefinition, doc, { title: 't', items: [boxItem('a')] }).changes).toHaveLength(0)
  })
})
