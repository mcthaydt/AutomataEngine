import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  assetManifestSchema,
  validateAssetManifest,
  type AssetKind,
  type AssetProvider
} from '@automata/contracts'
import { ASSET_PROVIDERS, resolveProvider } from '../src/registry'
import { buildGeneratedAsset, generateGameAssets } from '../src/generate'
import { sha256Hex } from '../src/hash'
import { deriveStyleParams } from '../src/styleParams'

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

describe('sha256Hex', () => {
  it('hashes bytes to lowercase hex, stable across calls', () => {
    const bytes = new TextEncoder().encode('abc')
    expect(sha256Hex(bytes)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex(bytes)).toBe(sha256Hex(new TextEncoder().encode('abc')))
  })
})

describe('buildGeneratedAsset pinned-hash recompute', () => {
  // Un-minified SVG: the optimizer WILL rewrite these bytes, so a hash
  // computed by the provider goes stale unless the helper recomputes it.
  const RAW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  <rect x="1" y="1" width="30" height="30"/>\n</svg>\n'
  const pinnedProvider: AssetProvider = {
    id: 'pinned-fake', version: '1.0.0', kinds: ['ui'],
    fileExtension: () => 'svg',
    async generate(requirement, ctx) {
      const bytes = new TextEncoder().encode(RAW_SVG)
      return {
        bytes,
        provenance: {
          provider: 'pinned-fake', providerVersion: '1.0.0', generator: 'fake-model',
          sourceParams: {}, seed: ctx.seed, specVersion: ctx.specVersion,
          determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
          license: { kind: 'generated', notes: 'test' }
        }
      }
    }
  }
  const requirement = { id: 'pin-icon', kind: 'ui' as const, description: 'Pinned icon.' }
  const style = deriveStyleParams({ visualStyle: 'test', audioStyle: 'test' }, 1)

  it('recomputes the pinned contentHash over the final optimized bytes', async () => {
    const asset = await buildGeneratedAsset(requirement, pinnedProvider, { seed: 7, style, specVersion: 1 })
    expect(asset.entry.transformations).toHaveLength(1) // optimizer fired
    const determinism = asset.entry.provenance.determinism
    expect(determinism.kind).toBe('pinned')
    if (determinism.kind === 'pinned') {
      expect(determinism.contentHash).toBe(sha256Hex(asset.bytes))
      expect(determinism.contentHash).not.toBe(sha256Hex(new TextEncoder().encode(RAW_SVG)))
    }
  })

  it('records an optional root style seed without replacing provider source params', async () => {
    const asset = await buildGeneratedAsset(requirement, pinnedProvider, {
      seed: 7,
      style,
      styleSeed: 42,
      specVersion: 1
    })
    expect(asset.entry.provenance.sourceParams).toEqual({ styleSeed: 42 })
  })

  it('leaves seeded provenance untouched and keeps the entry shape', async () => {
    const asset = await buildGeneratedAsset(requirement, pinnedProvider, { seed: 7, style, specVersion: 1 })
    expect(asset.path).toBe('assets/pin-icon.svg')
    expect(asset.entry.status).toBe('generated')
    expect(asset.entry.references).toEqual([])
  })
})
