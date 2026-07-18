import { describe, expect, it } from 'vitest'
import type { AssetRequirement } from '@automata/contracts'
import { generateGameAssets } from '../src/generate'
import { sha256Hex } from '../src/hash'
import { deriveStyleParams } from '../src/styleParams'
import { MEDIA_BUDGETS, readWavInfo, validateAssetMedia } from '../src/validateMedia'

const direction = { visualStyle: 'soft neon dusk', audioStyle: 'warm hum' }
const style = deriveStyleParams(direction, 7)
const requirements: AssetRequirement[] = [
  { id: 'icon-a', kind: 'ui', description: 'emblem' },
  { id: 'crate-a', kind: 'model', description: 'crate' },
  { id: 'blip-a', kind: 'audio', description: 'pickup blip' }
]

async function generated() {
  return generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
}

describe('validateAssetMedia', () => {
  it('passes every provider-generated asset', async () => {
    for (const asset of await generated()) {
      expect(validateAssetMedia(asset.entry, asset.bytes, style)).toEqual([])
    }
  })

  it('flags malformed bytes per kind as asset-media-invalid', async () => {
    const [svg, prop, wav] = await generated()
    const junk = new TextEncoder().encode('not media')
    for (const asset of [svg!, prop!, wav!]) {
      const issues = validateAssetMedia(asset.entry, junk, style)
      expect(issues.some((issue) => issue.code === 'asset-media-invalid')).toBe(true)
    }
  })

  it('rejects malformed SVG markup even when SVG markers are present', async () => {
    const [svg] = await generated()
    const malformed = new TextEncoder().encode('<svg><path></svg>')
    expect(validateAssetMedia(svg!.entry, malformed, style))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'asset-media-invalid' })]))
  })

  it('flags an off-palette SVG color', async () => {
    const [svg] = await generated()
    const text = new TextDecoder().decode(svg!.bytes).replace(/fill="[^"]+"/, 'fill="#123456"')
    const issues = validateAssetMedia(svg!.entry, new TextEncoder().encode(text), style)
    expect(issues.some((issue) => issue.code === 'asset-media-invalid' && /palette/i.test(issue.message))).toBe(true)
  })

  it('flags budget breaches as asset-media-budget', async () => {
    const [svg] = await generated()
    const padded = new Uint8Array(MEDIA_BUDGETS.svgMaxBytes + 1)
    padded.set(svg!.bytes)
    const issues = validateAssetMedia(svg!.entry, padded, style)
    expect(issues.some((issue) => issue.code === 'asset-media-budget')).toBe(true)
  })

  it('reads WAV info and enforces duration by kind', async () => {
    const assets = await generated()
    const wav = assets.find((asset) => asset.entry.requirement.kind === 'audio')!
    const info = readWavInfo(wav.bytes)
    expect(info).toMatchObject({ sampleRate: 22050, channels: 1, bitsPerSample: 16 })
    expect(info.sampleCount / info.sampleRate).toBeLessThanOrEqual(MEDIA_BUDGETS.sfxMaxSeconds)
    const asMusic = { ...wav.entry, requirement: { ...wav.entry.requirement, kind: 'music' as const } }
    expect(validateAssetMedia(asMusic, wav.bytes, style)).toEqual([])
  })

  it('rejects a non-PCM WAV header with otherwise matching dimensions', async () => {
    const assets = await generated()
    const wav = assets.find((asset) => asset.entry.requirement.kind === 'audio')!
    const altered = new Uint8Array(wav.bytes)
    new DataView(altered.buffer).setUint16(20, 3, true)
    expect(validateAssetMedia(wav.entry, altered, style))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'asset-media-invalid' })]))
  })
})

describe('pinned-hash verification', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" fill="none"/></svg>\n'
  const bytes = new TextEncoder().encode(SVG)
  const pinnedEntry = (contentHash: string) => ({
    id: 'pin-icon',
    requirement: { id: 'pin-icon', kind: 'ui' as const, description: 'Pinned icon.' },
    path: 'assets/pin-icon.svg',
    provenance: {
      provider: 'claude-svg', providerVersion: '1.0.0', generator: 'claude-opus-4-8',
      sourceParams: {}, seed: 1, specVersion: 1,
      determinism: { kind: 'pinned' as const, contentHash },
      license: { kind: 'generated' as const, notes: 'test' }
    },
    transformations: [],
    status: 'generated' as const,
    references: ['public/project/composition.json']
  })
  const style = deriveStyleParams({ visualStyle: 'test', audioStyle: 'test' }, 1)

  it('passes when bytes match the pinned contentHash', () => {
    const issues = validateAssetMedia(pinnedEntry(sha256Hex(bytes)), bytes, style)
    expect(issues.filter((issue) => issue.code === 'asset-hash-mismatch')).toEqual([])
  })

  it('fails with asset-hash-mismatch when bytes are tampered or stale', () => {
    const issues = validateAssetMedia(pinnedEntry(sha256Hex(new TextEncoder().encode('other'))), bytes, style)
    expect(issues.some((issue) => issue.code === 'asset-hash-mismatch' && issue.severity === 'error')).toBe(true)
  })

  it('never hash-checks seeded entries', () => {
    const entry = { ...pinnedEntry(''), provenance: { ...pinnedEntry('').provenance, determinism: { kind: 'seeded' as const } } }
    const issues = validateAssetMedia(entry, bytes, style)
    expect(issues.some((issue) => issue.code === 'asset-hash-mismatch')).toBe(false)
  })
})
