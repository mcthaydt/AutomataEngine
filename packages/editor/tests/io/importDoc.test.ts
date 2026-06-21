import { describe, expect, it } from 'vitest'
import { importDoc } from '../../src/io/importDoc'
import { boxItem, renderDefinition } from '../fixtures/fakeDefinition'

describe('importDoc', () => {
  it('imports a valid JSON document', () => {
    const json = JSON.stringify({ title: 'x', items: [boxItem('a')] })
    const result = importDoc(renderDefinition, json)

    expect(result.ok).toBe(true)
    if (result.ok) expect(renderDefinition.scene.listItems(result.doc)).toHaveLength(1)
  })

  it('rejects unparseable input with an issue', () => {
    const result = importDoc(renderDefinition, '{ not json')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toHaveLength(1)
  })

  it('reports non-Error parse failures', () => {
    const result = importDoc({
      ...renderDefinition,
      scene: { ...renderDefinition.scene, parse: () => { throw 'bad doc' } }
    }, '{}')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toEqual(['bad doc'])
  })
})
