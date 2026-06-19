import { describe, expect, it } from 'vitest'
import { hitTestMap } from '../../src/viewport2d/hit'
import { initialMapView } from '../../src/viewport2d/projection'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'

const size = { w: 800, h: 600 }

describe('2D hit-testing', () => {
  it('hits a box at its center', () => {
    const id = hitTestMap(fakeDefinition, [boxItem('b', 0, 0)], initialMapView, size, { x: 400, y: 300 })
    expect(id).toBe('b')
  })

  it('misses outside any item', () => {
    const id = hitTestMap(fakeDefinition, [boxItem('b', 0, 0)], initialMapView, size, { x: 10, y: 10 })
    expect(id).toBeNull()
  })

  it('returns the topmost (last-drawn) item when overlapping', () => {
    const id = hitTestMap(fakeDefinition, [boxItem('a', 0, 0), boxItem('b', 0, 0)], initialMapView, size, { x: 400, y: 300 })
    expect(id).toBe('b')
  })
})
