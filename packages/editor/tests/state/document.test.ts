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

  it('preserves the document state when a single command has no effect', () => {
    const before = start()
    const reduceSame = createDocumentReducer<FakeDoc>({ ...scene, apply: (doc) => doc })

    expect(reduceSame(before, {
      type: 'command',
      command: { type: 'setMetadata', path: 'title', value: before.doc.title }
    })).toBe(before)
  })

  it('undo restores the prior doc; redo re-applies', () => {
    let state = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    state = reduce(state, { type: 'undo' })
    expect(scene.listItems(state.doc)).toHaveLength(0)
    expect(state.future).toHaveLength(1)
    state = reduce(state, { type: 'redo' })
    expect(scene.listItems(state.doc)).toHaveLength(1)
  })

  it('clears dirty when undo returns to the saved doc, and re-dirties on redo', () => {
    let state = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(state.dirty).toBe(true)
    state = reduce(state, { type: 'undo' })
    expect(state.dirty).toBe(false)
    state = reduce(state, { type: 'redo' })
    expect(state.dirty).toBe(true)
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

  it('applies a command batch as a single undo step', () => {
    const next = reduce(start(), {
      type: 'commandBatch',
      commands: [
        { type: 'addItem', item: boxItem('a') },
        { type: 'addItem', item: boxItem('b') }
      ]
    })
    expect(scene.listItems(next.doc)).toHaveLength(2)
    expect(next.past).toHaveLength(1)
  })

  it('aborts a command batch when any command fails', () => {
    const before = start()
    const next = reduce(before, {
      type: 'commandBatch',
      commands: [
        { type: 'addItem', item: boxItem('a') },
        { type: 'setItemField', id: 'a', path: 'pos.x', value: 1 }
      ]
    })
    expect(next).toBe(before)
  })

  it('rethrows a non-CommandError raised by a command batch', () => {
    const reduceThrow = createDocumentReducer<FakeDoc>({
      ...scene,
      apply: () => { throw new Error('boom') }
    })
    expect(() =>
      reduceThrow(start(), { type: 'commandBatch', commands: [{ type: 'addItem', item: boxItem('a') }] })
    ).toThrow('boom')
  })

  it('is a no-op when a command batch is empty or returns the same doc', () => {
    const before = start()
    expect(reduce(before, { type: 'commandBatch', commands: [] })).toBe(before)

    const reduceSame = createDocumentReducer<FakeDoc>({ ...scene, apply: (doc) => doc })
    expect(reduceSame(before, { type: 'commandBatch', commands: [{ type: 'addItem', item: boxItem('a') }] })).toBe(before)
  })

  it('undo reverts an entire command batch in one step', () => {
    const applied = reduce(start(), {
      type: 'commandBatch',
      commands: [
        { type: 'addItem', item: boxItem('a') },
        { type: 'addItem', item: boxItem('b') }
      ]
    })
    expect(scene.listItems(reduce(applied, { type: 'undo' }).doc)).toHaveLength(0)
  })
})
