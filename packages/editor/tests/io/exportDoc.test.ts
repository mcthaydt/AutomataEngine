import { describe, expect, it } from 'vitest'
import { exportDoc } from '../../src/io/exportDoc'
import { boxItem, renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const startMarker = {
  id: 'marker:start',
  kind: 'marker' as const,
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker' as const, markerId: 'start' },
  surface: { kind: 'color' as const, value: '#0f0' }
}

describe('exportDoc', () => {
  it('refuses to export an invalid document', () => {
    const result = exportDoc(renderDefinition, { title: 'x', items: [boxItem('a')] })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((issue) => issue.includes('Start'))).toBe(true)
  })

  it('exports a valid document as JSON that round-trips', () => {
    const doc: FakeDoc = { title: 'x', items: [boxItem('a'), startMarker] }
    const result = exportDoc(renderDefinition, doc)

    expect(result.ok).toBe(true)
    if (result.ok) expect(renderDefinition.scene.parse(JSON.parse(result.json))).toEqual(doc)
  })
})
