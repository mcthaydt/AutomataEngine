import { describe, expect, it } from 'vitest'
import {
  assetManifestSchema,
  compositionManifestSchema,
  emptyComposition,
  findingSourceSchema,
  parseComposeToolArgs,
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

describe('asset manifest v2', () => {
  const entry = {
    id: 'item-icon',
    requirement: { id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' },
    path: 'assets/item-icon.svg',
    provenance: {
      provider: 'stub-generator', providerVersion: '1.0.0', generator: 'svg-icon@1', sourceParams: {},
      specVersion: 1, seed: 7, determinism: { kind: 'seeded' }, license: { kind: 'generated', notes: '' }
    },
    transformations: [],
    status: 'placeholder',
    references: ['public/project/composition.json']
  }

  it('accepts a placeholder entry with provenance', () => {
    expect(assetManifestSchema.safeParse({ formatVersion: 2, assets: [entry] }).success).toBe(true)
  })

  it('rejects unknown statuses and unknown entry keys', () => {
    expect(assetManifestSchema.safeParse({ formatVersion: 2, assets: [{ ...entry, status: 'shipped' }] }).success).toBe(false)
    expect(assetManifestSchema.safeParse({ formatVersion: 2, assets: [{ ...entry, extra: true }] }).success).toBe(false)
  })
})

describe('finding sources', () => {
  it("accepts 'compose'", () => {
    expect(findingSourceSchema.safeParse('compose').success).toBe(true)
  })
})

describe('compose tool contracts', () => {
  it('rejects unknown compose tool arguments', () => {
    expect(() => parseComposeToolArgs('composeGame', { gameId: 'probe', extra: true })).toThrow()
    expect(() => parseComposeToolArgs('renderSliceReport', { gameId: 'probe', extra: true })).toThrow()
    expect(() => parseComposeToolArgs('recordSliceDecision', {
      gameId: 'probe', decision: 'approve', reason: 'green', extra: true
    })).toThrow()
  })
})
