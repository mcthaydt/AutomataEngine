import { describe, expect, it } from 'vitest'
import { createDocumentReducer, initialDocument } from '../../src/state/document'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const scene = fakeDefinition.scene
const reduce = createDocumentReducer<FakeDoc>(scene)
const start = () => initialDocument(scene)

describe('document slice', () => {
  it('rethrows a non-CommandError raised by apply', () => {
    const reduceThrow = createDocumentReducer<FakeDoc>({
      ...scene,
      apply: () => { throw new Error('boom') }
    })
    expect(() =>
      reduceThrow(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    ).toThrow('boom')
  })

  it('undo on empty history is a no-op', () => {
    const s = start()
    expect(reduce(s, { type: 'undo' })).toBe(s)
  })

  it('redo with no future is a no-op', () => {
    const s = start()
    expect(reduce(s, { type: 'redo' })).toBe(s)
  })

  it('applies a command, sets dirty, and records history', () => {
    const next = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(scene.listItems(next.doc)).toHaveLength(1)
    expect(next.dirty).toBe(true)
    expect(next.past).toHaveLength(1)
    expect(next.future).toEqual([])
  })

  it('undo restores the prior doc; redo re-applies', () => {
    let state = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    state = reduce(state, { type: 'undo' })
    expect(scene.listItems(state.doc)).toHaveLength(0)
    expect(state.future).toHaveLength(1)
    state = reduce(state, { type: 'redo' })
    expect(scene.listItems(state.doc)).toHaveLength(1)
  })

  it('a new command after undo clears the redo future', () => {
    let state = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    state = reduce(state, { type: 'undo' })
    state = reduce(state, { type: 'command', command: { type: 'addItem', item: boxItem('b') } })
    expect(state.future).toEqual([])
    expect(scene.listItems(state.doc)).toHaveLength(1)
  })

  it('ignores a command that throws CommandError (no history churn)', () => {
    const state = reduce(start(), { type: 'command', command: { type: 'setItemField', id: 'x', path: 'p', value: 1 } })
    expect(state.past).toEqual([])
    expect(state.dirty).toBe(false)
  })

  it('loadDoc replaces the doc and resets history + dirty', () => {
    let state = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    const loaded: FakeDoc = { title: 'x', items: [boxItem('z')] }
    state = reduce(state, { type: 'loadDoc', doc: loaded })
    expect(scene.listItems(state.doc).map((item) => item.id)).toEqual(['z'])
    expect(state.past).toEqual([])
    expect(state.future).toEqual([])
    expect(state.dirty).toBe(false)
  })

  it('caps the undo stack at UNDO_LIMIT', () => {
    let state = start()
    for (let i = 0; i < 250; i++) {
      state = reduce(state, { type: 'command', command: { type: 'addItem', item: boxItem(`i${i}`) } })
    }
    expect(state.past.length).toBeLessThanOrEqual(200)
  })
})
