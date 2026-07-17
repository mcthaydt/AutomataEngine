import { describe, expect, it } from 'vitest'
import type { AssetRequirement } from '@automata/contracts'
import { generateGameAssets } from '../src/generate'
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
})
