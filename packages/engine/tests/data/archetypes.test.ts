import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind, spawnFromArchetype, UnknownArchetypeError
} from '../../src/data/archetypes'
import { parseData } from '../../src/data/registry'

const lib = parseData(archetypeLibraryKind, [
  'banana:',
  '  collectible: { value: 1 }',
  '  renderable: { primitive: sphere, radius: 0.25, color: "#ffd23f" }',
  'bumper:',
  '  bumper: { impulseStrength: 8 }'
].join('\n'), 'standard.yaml')

function fakeWorld() {
  const added: object[] = []
  return { added, add: <E extends object>(entity: E): E => { added.push(entity); return entity } }
}

describe('spawnFromArchetype', () => {
  it('adds an entity with the archetype components (copied, not shared)', () => {
    const world = fakeWorld()
    const entity = spawnFromArchetype(world, lib, 'banana') as Record<string, unknown>
    expect(entity).toEqual({
      collectible: { value: 1 },
      renderable: { primitive: 'sphere', radius: 0.25, color: '#ffd23f' }
    })
    expect(world.added).toHaveLength(1)
    expect(entity.collectible).not.toBe(lib.banana!.collectible)
  })

  it('shallow-merges overrides per component', () => {
    const world = fakeWorld()
    const entity = spawnFromArchetype(world, lib, 'banana', {
      collectible: { value: 5 },
      transform: { position: { x: 1, y: 2, z: 3 } }
    }) as Record<string, unknown>
    expect(entity.collectible).toEqual({ value: 5 })
    expect(entity.transform).toEqual({ position: { x: 1, y: 2, z: 3 } })
    expect(entity.renderable).toEqual({ primitive: 'sphere', radius: 0.25, color: '#ffd23f' })
  })

  it('throws UnknownArchetypeError listing available names', () => {
    let caught: unknown
    try { spawnFromArchetype(fakeWorld(), lib, 'durian') } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(UnknownArchetypeError)
    expect((caught as Error).message).toContain('durian')
    expect((caught as Error).message).toContain('banana')
  })
})
