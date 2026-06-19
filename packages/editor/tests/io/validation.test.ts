import { describe, expect, it } from 'vitest'
import { validateDoc } from '../../src/io/validation'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('validateDoc', () => {
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
