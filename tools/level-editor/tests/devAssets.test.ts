import { describe, expect, it } from 'vitest'
import { resolveGameAssetPath } from '../src/dev-assets'

const root = '/repo'

describe('resolveGameAssetPath', () => {
  it('maps a game-scoped public URL to that game\'s public dir', () => {
    expect(resolveGameAssetPath(root, '/games/pulsebreak/public/project/automata.project.json'))
      .toBe('/repo/games/pulsebreak/public/project/automata.project.json')
  })

  it('privileges no single game', () => {
    expect(resolveGameAssetPath(root, '/games/monkey-ball/public/data/archetypes/standard.yaml'))
      .toBe('/repo/games/monkey-ball/public/data/archetypes/standard.yaml')
  })

  it('ignores query strings', () => {
    expect(resolveGameAssetPath(root, '/games/pulsebreak/public/project/scenes/arena.scene.json?t=1'))
      .toBe('/repo/games/pulsebreak/public/project/scenes/arena.scene.json')
  })

  it('returns null for non game-scoped paths', () => {
    expect(resolveGameAssetPath(root, '/project/automata.project.json')).toBeNull()
    expect(resolveGameAssetPath(root, '/index.html')).toBeNull()
  })

  it('rejects path traversal outside the game public dir', () => {
    expect(resolveGameAssetPath(root, '/games/monkey-ball/public/../../secret.json')).toBeNull()
  })
})
