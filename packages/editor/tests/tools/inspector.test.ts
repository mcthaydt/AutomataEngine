import { describe, expect, it } from 'vitest'
import { fieldCommand, inspectorFields } from '../../src/tools/inspector'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('inspector', () => {
  it('shows metadata fields when nothing is selected', () => {
    const doc: FakeDoc = { title: 'Hi', items: [] }
    expect(inspectorFields(fakeDefinition, doc, []).map((field) => field.path)).toEqual(['title'])
  })

  it('shows the selected box position and size fields', () => {
    const doc: FakeDoc = { title: 'x', items: [boxItem('a', 2, 3)] }
    const fields = inspectorFields(fakeDefinition, doc, ['a'])
    expect(fields.map((field) => field.path)).toEqual(['pos.x', 'pos.y', 'pos.z', 'size.x', 'size.y', 'size.z'])
    expect(fields[0]).toMatchObject({ value: 2 })
    expect(fields[2]).toMatchObject({ value: 3 })
    expect(fields.find((field) => field.path === 'size.y')).toMatchObject({ value: 1 })
  })

  it('builds a setMetadata command for a metadata field', () => {
    expect(fieldCommand([], { path: 'title', label: 'Title', type: 'text', value: '' }, 'New'))
      .toEqual({ type: 'setMetadata', path: 'title', value: 'New' })
  })

  it('builds a setItemField command for selected item fields', () => {
    expect(fieldCommand(['a'], { path: 'size.x', label: 'Width', type: 'number', value: 1 }, 5))
      .toEqual({ type: 'setItemField', id: 'a', path: 'size.x', value: 5 })
  })
})
