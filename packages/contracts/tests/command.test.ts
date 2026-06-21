import { describe, it, expect } from 'vitest'
import { sceneCommandSchema, type SceneCommand } from '../src/command'

describe('sceneCommandSchema', () => {
  it('parses an addItem command', () => {
    const cmd: SceneCommand = {
      type: 'addItem',
      item: {
        id: 'box:0',
        kind: 'box',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
        surface: { kind: 'color', value: '#7ec850' }
      }
    }
    expect(sceneCommandSchema.parse(cmd)).toEqual(cmd)
  })

  it('parses a moveSelected command', () => {
    const cmd = { type: 'moveSelected', ids: ['a', 'b'], delta: { x: 1, y: 0, z: -2 } }
    expect(sceneCommandSchema.parse(cmd)).toEqual(cmd)
  })

  it('parses a setSurface command with a texture surface', () => {
    const cmd = { type: 'setSurface', id: 'g:0', surface: { kind: 'texture', textureId: 't1' } }
    expect(sceneCommandSchema.parse(cmd)).toEqual(cmd)
  })

  it('rejects an unknown command type', () => {
    expect(() => sceneCommandSchema.parse({ type: 'nope' })).toThrow()
  })

  it('rejects moveSelected with a non-numeric delta', () => {
    expect(() => sceneCommandSchema.parse({ type: 'moveSelected', ids: [], delta: { x: 'a', y: 0, z: 0 } })).toThrow()
  })
})
