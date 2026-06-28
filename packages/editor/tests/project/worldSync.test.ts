import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createProjectWorldSync } from '../../src/project/worldSync'
import type { SpatialItem } from '../../src/project/spatial'

const item = (entityId: string, x: number, color = '#fff'): SpatialItem => ({
  entityId, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  renderable: { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color }, color,
  bounds: { kind: 'box', half: { x: 0.5, y: 0.5, z: 0.5 } }, gizmo: false
})

describe('project world sync', () => {
  it('adds, changes, and removes entities by stable ID and applies highlight', () => {
    const renderer = createNullRenderer()
    const sync = createProjectWorldSync(renderer.port)

    sync.syncNow([item('a', 0), item('b', 1)], new Set(['a']))
    expect(renderer.calls.filter((call) => call.op === 'add')).toHaveLength(2)
    const highlights = renderer.calls.filter((call) => call.op === 'setHighlight')
    expect(highlights.some((call) => call.on === true)).toBe(true)

    // Changing 'a' (new color) removes and re-adds only 'a'; 'b' stays.
    renderer.calls.length = 0
    sync.syncNow([item('a', 0, '#000'), item('b', 1)], new Set())
    expect(renderer.calls.filter((call) => call.op === 'add')).toHaveLength(1)
    expect(renderer.calls.filter((call) => call.op === 'remove')).toHaveLength(1)

    // Removing 'b' removes one entity.
    renderer.calls.length = 0
    sync.syncNow([item('a', 0, '#000')], new Set())
    expect(renderer.calls.filter((call) => call.op === 'remove')).toHaveLength(1)

    sync.render(1)
    expect(renderer.calls.some((call) => call.op === 'setPose')).toBe(true)

    sync.dispose()
    expect(renderer.calls.some((call) => call.op === 'removeGroup')).toBe(true)
  })
})
