import { describe, expect, it } from 'vitest'
import { nextSurface } from '../../src/tools/surfaceCycle'

const palette = [
  { kind: 'color', value: '#a' },
  { kind: 'color', value: '#b' },
  { kind: 'color', value: '#c' }
] as const

describe('surface cycle', () => {
  it('advances to the next palette entry', () => {
    expect(nextSurface([...palette], { kind: 'color', value: '#a' })).toEqual({ kind: 'color', value: '#b' })
  })

  it('wraps around and defaults unknown to the first', () => {
    expect(nextSurface([...palette], { kind: 'color', value: '#c' })).toEqual({ kind: 'color', value: '#a' })
    expect(nextSurface([...palette], { kind: 'color', value: '#z' })).toEqual({ kind: 'color', value: '#a' })
  })

  it('cycles between distinct textures by textureId', () => {
    const textures = [
      { kind: 'texture', textureId: 'grass' },
      { kind: 'texture', textureId: 'stone' }
    ] as const
    expect(nextSurface([...textures], { kind: 'texture', textureId: 'stone' }))
      .toEqual({ kind: 'texture', textureId: 'grass' })
  })

  it('treats surfaces of different kinds as unequal', () => {
    const mixed = [
      { kind: 'color', value: '#a' },
      { kind: 'texture', textureId: 'grass' }
    ] as const
    expect(nextSurface([...mixed], { kind: 'texture', textureId: 'grass' }))
      .toEqual({ kind: 'color', value: '#a' })
  })
})
