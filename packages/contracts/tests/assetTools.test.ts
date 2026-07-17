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

  it('rejects duplicate assetIds before generation', () => {
    const definition = assetToolDefs().find((entry) => entry.name === 'generateAssets')!
    const assetIdsSchema = (definition.schema as {
      properties: { assetIds: { uniqueItems?: boolean } }
    }).properties.assetIds
    expect(assetIdsSchema.uniqueItems).toBe(true)
    expect(() => assetToolArgSchemas.generateAssets.parse({
      gameId: 'demo-game',
      assetIds: ['relic-icon', 'relic-icon'],
      seed: 7
    })).toThrow(/duplicate/i)
  })
})
