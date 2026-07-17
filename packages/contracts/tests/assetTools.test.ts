import { describe, expect, it } from 'vitest'
import { assetToolArgSchemas, assetToolDefs } from '../src/assetTools'

describe('generateAssets tool contract', () => {
  it('is listed with a schema that bounds its args', () => {
    expect(assetToolDefs().map((definition) => definition.name)).toContain('generateAssets')
    expect(assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game' }))
      .toEqual({ gameId: 'demo-game' })
    expect(assetToolArgSchemas.generateAssets.parse({
      gameId: 'demo-game',
      assetIds: ['a'],
      seed: 7
    })).toEqual({ gameId: 'demo-game', assetIds: ['a'], seed: 7 })
    expect(() => assetToolArgSchemas.generateAssets.parse({
      gameId: 'demo-game',
      assetIds: []
    })).toThrow()
    expect(() => assetToolArgSchemas.generateAssets.parse({
      gameId: 'demo-game',
      seed: -1
    })).toThrow()
  })
})
