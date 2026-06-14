import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '../../src/render/null'
import { quat } from '../../src/math/quat'

describe('createNullRenderer', () => {
  it('implements RenderPort and records every call', () => {
    const renderer = createNullRenderer()
    const entity = { id: 'ball' }
    const stage = renderer.port.createGroup()
    renderer.port.add(entity, { primitive: 'sphere', radius: 0.5, color: '#fff' }, stage)
    renderer.port.setPose(entity, { x: 1, y: 2, z: 3 }, quat.identity())
    renderer.port.setGroupRotation(stage, { x: 0.1, y: 0, z: 0 })
    renderer.port.setCamera({ x: 0, y: 5, z: 5 }, { x: 0, y: 0, z: 0 })
    renderer.port.remove(entity)

    expect(renderer.calls.map((call) => call.op)).toEqual(
      ['createGroup', 'add', 'setPose', 'setGroupRotation', 'setCamera', 'remove'])
    expect(renderer.calls[2]).toMatchObject({ op: 'setPose', position: { x: 1, y: 2, z: 3 } })
    expect(renderer.port.objectCount).toBe(0)
  })

  it('tracks objectCount across add/remove/dispose', () => {
    const renderer = createNullRenderer()
    renderer.port.add({ a: 1 }, { primitive: 'sphere', radius: 1, color: '#fff' })
    renderer.port.add({ a: 2 }, { primitive: 'sphere', radius: 1, color: '#fff' })
    expect(renderer.port.objectCount).toBe(2)
    renderer.port.dispose()
    expect(renderer.port.objectCount).toBe(0)
  })

  it('records removeGroup', () => {
    const renderer = createNullRenderer()
    const stage = renderer.port.createGroup()
    renderer.port.removeGroup(stage)
    expect(renderer.calls.map((call) => call.op)).toEqual(['createGroup', 'removeGroup'])
    expect(renderer.calls[1]).toMatchObject({ op: 'removeGroup', group: stage })
  })
})
