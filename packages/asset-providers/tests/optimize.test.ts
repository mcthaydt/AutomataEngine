import { describe, expect, it } from 'vitest'
import type { AssetRequirement } from '@automata/contracts'
import { generateGameAssets } from '../src/generate'
import { optimizeAssetBytes, WAV_NORMALIZE_PEAK } from '../src/optimize'
import { deriveStyleParams } from '../src/styleParams'
import { readWavInfo, validateAssetMedia } from '../src/validateMedia'

const direction = { visualStyle: 'soft neon dusk', audioStyle: 'warm hum' }
const requirements: AssetRequirement[] = [
  { id: 'icon-a', kind: 'ui', description: 'emblem' },
  { id: 'crate-a', kind: 'model', description: 'crate' },
  { id: 'blip-a', kind: 'audio', description: 'pickup blip' }
]

describe('optimizeAssetBytes', () => {
  it('is deterministic and idempotent for every kind', async () => {
    const assets = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    for (const asset of assets) {
      expect(optimizeAssetBytes(asset.entry.requirement.kind, asset.bytes)).toBeNull()
    }
  })

  it('normalizes WAV peaks to the fixed target and records the transformation', async () => {
    const assets = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    const wav = assets.find((asset) => asset.entry.requirement.kind === 'audio')!
    expect(readWavInfo(wav.bytes).peak).toBe(WAV_NORMALIZE_PEAK)
    expect(wav.entry.transformations.map((step) => step.tool)).toContain('wav-normalize')
  })

  it('keeps optimized assets valid', async () => {
    const style = deriveStyleParams(direction, 7)
    const assets = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    for (const asset of assets) {
      expect(validateAssetMedia(asset.entry, asset.bytes, style)).toEqual([])
    }
  })

  it('same seed still means byte-identical output after the optimize stage', async () => {
    const a = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    const b = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    expect(a.map((asset) => Buffer.from(asset.bytes).toString('hex')))
      .toEqual(b.map((asset) => Buffer.from(asset.bytes).toString('hex')))
  })
})
