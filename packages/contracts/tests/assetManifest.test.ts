import { describe, expect, it } from 'vitest'
import { assetManifestSchema, migrateAssetManifest, parseAssetManifest } from '../src/assetManifest'

const v1Manifest = {
  formatVersion: 1,
  assets: [{
    id: 'item-icon',
    requirement: { id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD.' },
    path: 'assets/item-icon.svg',
    provenance: { provider: 'stub-generator', generator: 'svg-icon@1', specVersion: 1, seed: 933489342 },
    validation: { status: 'placeholder' }
  }]
}

const v2Entry = {
  id: 'item-icon',
  requirement: { id: 'item-icon', kind: 'ui' as const, description: 'Light-cell icon for the inventory HUD.' },
  path: 'assets/item-icon.svg',
  provenance: {
    provider: 'stub-generator',
    providerVersion: '1.0.0',
    generator: 'svg-icon@1',
    sourceParams: {},
    seed: 933489342,
    specVersion: 1,
    determinism: { kind: 'seeded' as const },
    license: { kind: 'generated' as const, notes: 'Procedurally generated placeholder.' }
  },
  transformations: [],
  status: 'placeholder' as const,
  references: ['public/project/composition.json']
}

describe('asset manifest v2', () => {
  it('accepts a valid v2 manifest', () => {
    const parsed = assetManifestSchema.parse({ formatVersion: 2, assets: [v2Entry] })
    expect(parsed.assets[0]!.provenance.determinism).toEqual({ kind: 'seeded' })
  })

  it('pinned determinism requires a contentHash', () => {
    const pinned = { ...v2Entry, provenance: { ...v2Entry.provenance, determinism: { kind: 'pinned', contentHash: 'abc123' } } }
    expect(assetManifestSchema.parse({ formatVersion: 2, assets: [pinned] }).assets[0]!.provenance.determinism)
      .toEqual({ kind: 'pinned', contentHash: 'abc123' })
    const broken = { ...v2Entry, provenance: { ...v2Entry.provenance, determinism: { kind: 'pinned' } } }
    expect(() => assetManifestSchema.parse({ formatVersion: 2, assets: [broken] })).toThrow()
  })

  it('rejects unknown status values and unknown keys', () => {
    expect(() => assetManifestSchema.parse({ formatVersion: 2, assets: [{ ...v2Entry, status: 'shiny' }] })).toThrow()
    expect(() => assetManifestSchema.parse({ formatVersion: 2, assets: [{ ...v2Entry, extra: true }] })).toThrow()
  })

  it('migrates a v1 stub manifest to v2', () => {
    const migrated = migrateAssetManifest(v1Manifest as never)
    expect(migrated).toEqual({ formatVersion: 2, assets: [v2Entry] })
  })

  it('migration maps v1 validated status through, everything else to placeholder', () => {
    const validated = { ...v1Manifest, assets: [{ ...v1Manifest.assets[0]!, validation: { status: 'validated' } }] }
    expect(migrateAssetManifest(validated as never).assets[0]!.status).toBe('validated')
  })

  it('parseAssetManifest handles v1 (migrating), v2 (validating), and rejects others', () => {
    expect(parseAssetManifest(JSON.stringify(v1Manifest)).formatVersion).toBe(2)
    expect(parseAssetManifest(JSON.stringify({ formatVersion: 2, assets: [v2Entry] })).assets).toHaveLength(1)
    expect(() => parseAssetManifest(JSON.stringify({ formatVersion: 3, assets: [] }))).toThrow(/Unsupported asset manifest formatVersion/)
  })
})
