import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import manifest from '../../assets/manifest.json'
import { createAssetCatalog } from '../../src/assets/load'
import { completeManifestFixture } from './fixture'

describe('asset catalog loading', () => {
  it('loads every checked production PNG with its decoded dimensions', () => {
    const publicDirectory = resolve(process.cwd(), 'games/last-lightkeeper/public')
    const images = new Map(manifest.assets.map((asset) => {
      const bytes = readFileSync(resolve(publicDirectory, asset.file))
      expect(bytes.subarray(1, 4).toString()).toBe('PNG')
      return [asset.file, { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }]
    }))

    expect(createAssetCatalog(manifest, images).byId.size).toBe(manifest.assets.length)
  })

  it('returns id and file lookups when every PNG has matching dimensions', () => {
    const manifest = completeManifestFixture()
    const images = new Map(manifest.assets.map((asset) => [asset.file, {
      width: asset.width, height: asset.height
    }]))
    const catalog = createAssetCatalog(manifest, images)
    expect(catalog.byId.get('keeper')?.file).toBe('assets/keeper/keeper.png')
    expect(catalog.byFile.size).toBe(manifest.assets.length)
  })

  it('reports every missing image with an actionable local path', () => {
    const manifest = completeManifestFixture()
    expect(() => createAssetCatalog(manifest, new Map())).toThrow(/missing.*assets\/keeper\/keeper\.png/i)
  })

  it('rejects decoded image dimensions that disagree with the manifest', () => {
    const manifest = completeManifestFixture()
    const images = new Map(manifest.assets.map((asset) => [asset.file, {
      width: asset.width, height: asset.height
    }]))
    images.set('assets/keeper/keeper.png', { width: 32, height: 64 })
    expect(() => createAssetCatalog(manifest, images)).toThrow(/keeper.*32x64.*64x64/i)
  })
})
