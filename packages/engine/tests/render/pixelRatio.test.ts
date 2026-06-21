import { describe, expect, it } from 'vitest'
import { MAX_PIXEL_RATIO, cappedPixelRatio } from '../../src/render/pixelRatio'

describe('cappedPixelRatio', () => {
  it('caps at MAX_PIXEL_RATIO', () => {
    expect(cappedPixelRatio(3)).toBe(MAX_PIXEL_RATIO)
    expect(cappedPixelRatio(1.5)).toBe(1.5)
  })

  it('respects an explicit cap and a floor of 1', () => {
    expect(cappedPixelRatio(4, 1)).toBe(1)
    expect(cappedPixelRatio(0.5)).toBe(1)
  })
})
