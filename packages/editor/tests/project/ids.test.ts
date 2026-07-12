import { describe, expect, it } from 'vitest'
import type { SceneDocument } from '@automata/project'
import { uniqueComponentId, uniqueEntityId } from '../../src/project/ids'

const scene = (ids: string[]): SceneDocument => ({
  id: 'main', name: 'Main',
  entities: ids.map((id) => ({ id, name: id, enabled: true, components: [] }))
})

describe('uniqueEntityId', () => {
  it('numbers from 1 and skips taken ids', () => {
    expect(uniqueEntityId(scene([]), 'wall')).toBe('wall-1')
    expect(uniqueEntityId(scene(['wall-1', 'wall-2']), 'wall')).toBe('wall-3')
  })

  it('is pure in scene state (no hidden counter drift across calls)', () => {
    const snapshot = scene(['wall-1'])
    expect(uniqueEntityId(snapshot, 'wall')).toBe('wall-2')
    expect(uniqueEntityId(snapshot, 'wall')).toBe('wall-2')
  })

  it('reuses the lowest free suffix after a deletion', () => {
    expect(uniqueEntityId(scene(['wall-2']), 'wall')).toBe('wall-1')
  })
})

describe('uniqueComponentId', () => {
  it('returns the bare base when free, then suffixes', () => {
    expect(uniqueComponentId([], 'transform')).toBe('transform')
    expect(uniqueComponentId(['transform'], 'transform')).toBe('transform-2')
    expect(uniqueComponentId(['transform', 'transform-2'], 'transform')).toBe('transform-3')
  })
})
