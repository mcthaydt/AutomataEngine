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

  it('generateAssets and regenerateAsset accept an optional provider id', () => {
    expect(assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game', provider: 'claude-svg' }))
      .toMatchObject({ provider: 'claude-svg' })
    expect(assetToolArgSchemas.regenerateAsset.parse({ gameId: 'demo-game', assetId: 'relic-icon', provider: 'claude-svg' }))
      .toMatchObject({ provider: 'claude-svg' })
    // provider stays optional — existing callers unchanged
    expect(assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game' }))
      .not.toHaveProperty('provider')
  })

  it('rejects empty and oversized provider ids', () => {
    expect(() => assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game', provider: '' })).toThrow()
    expect(() => assetToolArgSchemas.regenerateAsset.parse({ gameId: 'demo-game', assetId: 'a', provider: 'x'.repeat(61) })).toThrow()
  })
})
