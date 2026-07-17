import { describe, expect, it } from 'vitest'
import { deriveStyleParams } from '../src/styleParams'

const direction = {
  visualStyle: 'warm lantern-lit harbor at dusk',
  audioStyle: 'soft nautical ambience'
}

describe('deriveStyleParams', () => {
  it('is deterministic for identical inputs', () => {
    expect(deriveStyleParams(direction, 42)).toEqual(deriveStyleParams(direction, 42))
  })

  it('changes with the style strings and with the seed', () => {
    expect(deriveStyleParams(direction, 42)).not.toEqual(deriveStyleParams(direction, 43))
    expect(deriveStyleParams({ ...direction, visualStyle: 'neon cyberpunk alley' }, 42).palette)
      .not.toEqual(deriveStyleParams(direction, 42).palette)
  })

  it('stays inside its documented ranges', () => {
    const style = deriveStyleParams(direction, 42)
    expect(style.palette.baseHue).toBeGreaterThanOrEqual(0)
    expect(style.palette.baseHue).toBeLessThan(360)
    expect(style.palette.accentHues).toHaveLength(2)
    for (const hue of style.palette.accentHues) {
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
    expect(style.palette.saturation).toBeGreaterThanOrEqual(0.4)
    expect(style.palette.saturation).toBeLessThanOrEqual(0.9)
    expect(style.palette.lightness).toBeGreaterThanOrEqual(0.35)
    expect(style.palette.lightness).toBeLessThanOrEqual(0.7)
    expect(['sine', 'triangle', 'square']).toContain(style.audio.waveform)
    expect(['slow', 'mid', 'brisk']).toContain(style.audio.tempo)
  })
})
