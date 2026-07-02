import { describe, expect, it } from 'vitest'
import { parseAssetManifest } from '../../src/assets/schema'
import { completeManifestFixture } from './fixture'

describe('PixelLab asset manifest', () => {
  it('accepts complete local production coverage', () => {
    const parsed = parseAssetManifest(completeManifestFixture())
    expect(parsed.generator).toBe('PixelLab')
    expect(parsed.assets.length).toBeGreaterThan(30)
  })

  it('rejects duplicate ids and remote or non-PNG files', () => {
    const duplicate = completeManifestFixture()
    duplicate.assets[1]!.id = duplicate.assets[0]!.id
    expect(() => parseAssetManifest(duplicate)).toThrow(/unique|duplicate/i)

    const remote = completeManifestFixture()
    remote.assets[0]!.file = 'https://pixellab.example/keeper.png'
    expect(() => parseAssetManifest(remote)).toThrow(/local|png|path/i)
    const jpeg = completeManifestFixture()
    jpeg.assets[0]!.file = 'assets/keeper/keeper.jpg'
    expect(() => parseAssetManifest(jpeg)).toThrow(/png/i)
  })

  it('rejects frame geometry and animation ranges outside the image', () => {
    const frames = completeManifestFixture()
    frames.assets[0]!.frame = { width: 64, height: 64, columns: 2, rows: 1, count: 2 }
    expect(() => parseAssetManifest(frames)).toThrow(/frame|bound|dimension/i)

    const animation = completeManifestFixture()
    animation.assets[0]!.animations[0] = {
      ...animation.assets[0]!.animations[0]!, start: 1, count: 1
    }
    expect(() => parseAssetManifest(animation)).toThrow(/animation|frame/i)
  })

  it('retains crop origins and rejects cropped frames outside the source image', () => {
    const cropped = completeManifestFixture()
    cropped.assets[0]!.frame = {
      x: 8, y: 4, width: 48, height: 56, columns: 1, rows: 1, count: 1
    }
    expect(parseAssetManifest(cropped).assets[0]?.frame).toMatchObject({ x: 8, y: 4 })

    cropped.assets[0]!.frame.x = 17
    expect(() => parseAssetManifest(cropped)).toThrow(/frame|bound|dimension/i)
  })

  it('requires the five keeper groups and every production state family', () => {
    const keeper = completeManifestFixture()
    keeper.assets[0]!.animations.pop()
    expect(() => parseAssetManifest(keeper)).toThrow(/operate-repair/i)

    for (const tag of [
      'station:pump', 'state:damaged', 'item:coolant', 'ship:steamer',
      'environment:storm-cloud', 'environment:dawn', 'effect:rescue-flare',
      'floor:machinery', 'lighthouse:ladder'
    ]) {
      const manifest = completeManifestFixture()
      manifest.assets = manifest.assets.filter((entry) => !entry.tags.includes(tag))
      expect(() => parseAssetManifest(manifest), tag).toThrow(new RegExp(tag.split(':').at(-1)!, 'i'))
    }
  })

  it('requires active and damaged coverage for every station', () => {
    const manifest = completeManifestFixture()
    manifest.assets = manifest.assets.filter((asset) => asset.id !== 'pump-damaged')
    expect(() => parseAssetManifest(manifest)).toThrow(/pump.*damaged|damaged.*pump/i)
  })

  it('requires PixelLab mappings, source prompts, and state tags', () => {
    const manifest = completeManifestFixture()
    manifest.assets[0]!.pixelLab.resourceId = ''
    expect(() => parseAssetManifest(manifest)).toThrow(/pixellab|resource/i)
    const prompt = completeManifestFixture()
    prompt.assets[0]!.promptKey = ''
    expect(() => parseAssetManifest(prompt)).toThrow(/prompt/i)
    const tags = completeManifestFixture()
    tags.assets[0]!.tags = []
    expect(() => parseAssetManifest(tags)).toThrow(/tag/i)
  })
})
