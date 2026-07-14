import { describe, expect, it } from 'vitest'
import {
  assetManifestSchema,
  compositionManifestSchema,
  emptyComposition,
  findingSourceSchema,
  parseCompositionManifest
} from '../src'

const manifest = {
  formatVersion: 1,
  gameId: 'first-light',
  source: { specVersion: 1, specHash: 'abc123', seed: 7 },
  packs: [{ id: 'interaction-inventory', version: '1.0.0', config: { interactRadius: 1.5 } }],
  assets: [{ id: 'item-icon', path: 'assets/item-icon.svg' }]
}

describe('composition manifest', () => {
  it('accepts a composed manifest and the empty scaffold shape', () => {
    expect(compositionManifestSchema.safeParse(manifest).success).toBe(true)
    expect(emptyComposition('probe')).toEqual({
      formatVersion: 1, gameId: 'probe', source: null, packs: [], assets: []
    })
    expect(compositionManifestSchema.safeParse(emptyComposition('probe')).success).toBe(true)
  })

  it('round-trips through parseCompositionManifest and rejects malformed text', () => {
    expect(parseCompositionManifest(JSON.stringify(manifest))).toEqual(manifest)
    expect(() => parseCompositionManifest('{"formatVersion":2}')).toThrow()
    expect(() => parseCompositionManifest('not json')).toThrow()
  })

  it('rejects unknown keys, bad formatVersion, and oversized pack lists', () => {
    expect(compositionManifestSchema.safeParse({ ...manifest, extra: true }).success).toBe(false)
    expect(compositionManifestSchema.safeParse({ ...manifest, formatVersion: 2 }).success).toBe(false)
    const packs = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, version: '1.0.0', config: {} }))
    expect(compositionManifestSchema.safeParse({ ...manifest, packs }).success).toBe(false)
  })
})

describe('asset manifest stub', () => {
  const entry = {
    id: 'item-icon',
    requirement: { id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' },
    path: 'assets/item-icon.svg',
    provenance: { provider: 'stub-generator', generator: 'svg-icon@1', specVersion: 1, seed: 7 },
    validation: { status: 'placeholder' }
  }

  it('accepts a placeholder entry with provenance', () => {
    expect(assetManifestSchema.safeParse({ formatVersion: 1, assets: [entry] }).success).toBe(true)
  })

  it('rejects unknown providers and unknown validation states', () => {
    const badProvider = { ...entry, provenance: { ...entry.provenance, provider: 'midjourney' } }
    expect(assetManifestSchema.safeParse({ formatVersion: 1, assets: [badProvider] }).success).toBe(false)
    const badStatus = { ...entry, validation: { status: 'shipped' } }
    expect(assetManifestSchema.safeParse({ formatVersion: 1, assets: [badStatus] }).success).toBe(false)
  })
})

describe('finding sources', () => {
  it("accepts 'compose'", () => {
    expect(findingSourceSchema.safeParse('compose').success).toBe(true)
  })
})
