import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  assetManifestSchema,
  validateAssetManifest,
  type AssetKind
} from '@automata/contracts'
import { ASSET_PROVIDERS, resolveProvider } from '../src/registry'
import { generateGameAssets } from '../src/generate'

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const input = () => ({
  requirements: [
    { id: 'relic-icon', kind: 'ui' as const, description: 'Icon.' },
    { id: 'dock-planks', kind: 'texture' as const, description: 'Texture.' },
    { id: 'harbor-crate', kind: 'model' as const, description: 'Crate.' },
    { id: 'pickup-blip', kind: 'audio' as const, description: 'Blip.' },
    { id: 'harbor-drone', kind: 'music' as const, description: 'Ambience.' }
  ],
  direction: { visualStyle: 'warm harbor', audioStyle: 'soft ambience' },
  seed: 42,
  specVersion: 1
})

describe('provider registry', () => {
  it('every AssetKind resolves to a registered provider', () => {
    const kinds: AssetKind[] = ['model', 'texture', 'audio', 'music', 'ui']
    for (const kind of kinds) {
      const provider = resolveProvider(kind)
      expect(ASSET_PROVIDERS[provider.id]).toBe(provider)
      expect(provider.kinds).toContain(kind)
    }
  })
})

describe('generateGameAssets', () => {
  it('produces one schema-valid, structurally clean entry per requirement', async () => {
    const generated = await generateGameAssets(input())
    expect(generated.map((asset) => asset.entry.id))
      .toEqual(input().requirements.map((requirement) => requirement.id))
    const manifest = assetManifestSchema.parse({
      formatVersion: 2,
      assets: generated.map((asset) => asset.entry)
    })
    const errors = validateAssetManifest(manifest, null)
      .filter((issue) => issue.severity === 'error')
    expect(errors).toEqual([])
    for (const asset of generated) {
      expect(asset.entry.status).toBe('generated')
      expect(asset.entry.references).toEqual([])
      expect(asset.path).toBe(asset.entry.path)
      expect(asset.path.startsWith('assets/')).toBe(true)
    }
  })

  it('per-asset child seeds: dropping one requirement leaves the others byte-identical', async () => {
    const full = await generateGameAssets(input())
    const partial = await generateGameAssets({
      ...input(),
      requirements: input().requirements.filter((requirement) => requirement.id !== 'dock-planks')
    })
    const byId = new Map(full.map((asset) => [asset.entry.id, sha(asset.bytes)]))
    for (const asset of partial) {
      expect(sha(asset.bytes)).toBe(byId.get(asset.entry.id))
    }
  })

  it('is deterministic end to end', async () => {
    const a = await generateGameAssets(input())
    const b = await generateGameAssets(input())
    expect(a.map((asset) => sha(asset.bytes))).toEqual(b.map((asset) => sha(asset.bytes)))
  })
})
