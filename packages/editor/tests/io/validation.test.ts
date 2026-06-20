import { describe, expect, it } from 'vitest'
import { validateDoc } from '../../src/io/validation'
import type { GameDefinition } from '../../src/model/gameDefinition'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const withParse = (parse: (input: unknown) => FakeDoc): GameDefinition<FakeDoc> => ({
  ...fakeDefinition,
  scene: { ...fakeDefinition.scene, parse }
})

describe('validateDoc', () => {
  it('surfaces an Error thrown by parse and blocks export', () => {
    const def = withParse(() => { throw new Error('bad schema') })
    const result = validateDoc(def, { title: 'x', items: [] })
    expect(result.exportable).toBe(false)
    expect(result.issues).toContain('bad schema')
  })

  it('stringifies a non-Error thrown by parse', () => {
    const def = withParse(() => { throw 'kaput' })
    const result = validateDoc(def, { title: 'x', items: [] })
    expect(result.issues).toContain('kaput')
  })

  it('flags a missing required marker and blocks export', () => {
    const doc: FakeDoc = { title: 'x', items: [boxItem('a')] }
    const result = validateDoc(fakeDefinition, doc)
    expect(result.exportable).toBe(false)
    expect(result.issues.some((issue) => issue.includes('Start'))).toBe(true)
  })

  it('is exportable when all required markers are present', () => {
    const doc: FakeDoc = {
      title: 'x',
      items: [
        boxItem('a'),
        {
          id: 'marker:start',
          kind: 'marker',
          transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
          shape: { type: 'marker', markerId: 'start' },
          surface: { kind: 'color', value: '#0f0' }
        }
      ]
    }
    expect(validateDoc(fakeDefinition, doc)).toEqual({ issues: [], exportable: true })
  })
})
