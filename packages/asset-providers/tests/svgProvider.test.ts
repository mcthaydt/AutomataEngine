import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { ProviderContext } from '@automata/contracts'
import { svgProvider } from '../src/svgProvider'

const ctx: ProviderContext = {
  seed: 1234,
  style: {
    palette: {
      baseHue: 210,
      accentHues: [90, 330],
      saturation: 0.7,
      lightness: 0.55
    },
    audio: { waveform: 'sine', tempo: 'slow' }
  },
  specVersion: 1
}
const icon = { id: 'relic-icon', kind: 'ui' as const, description: 'Relic icon.' }
const texture = { id: 'dock-planks', kind: 'texture' as const, description: 'Plank texture.' }
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

describe('svgProvider', () => {
  it('replays bit-identically and differs across seeds', async () => {
    const a = await svgProvider.generate(icon, ctx)
    const b = await svgProvider.generate(icon, ctx)
    expect(sha(a.bytes)).toBe(sha(b.bytes))
    const c = await svgProvider.generate(icon, { ...ctx, seed: 99 })
    expect(sha(c.bytes)).not.toBe(sha(a.bytes))
  })

  it('golden hashes stay stable (regenerate deliberately with a version bump)', async () => {
    expect(sha((await svgProvider.generate(icon, ctx)).bytes)).toMatchSnapshot()
    expect(sha((await svgProvider.generate(texture, ctx)).bytes)).toMatchSnapshot()
  })

  it('emits well-formed SVG using only palette-derived colors', async () => {
    const text = new TextDecoder().decode((await svgProvider.generate(icon, ctx)).bytes)
    expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(text.trimEnd().endsWith('</svg>')).toBe(true)
    const hues = [...text.matchAll(/hsl\((\d+) /g)].map((match) => Number(match[1]))
    expect(hues.length).toBeGreaterThan(0)
    for (const hue of hues) expect([210, 90, 330]).toContain(hue)
    const colors = [...text.matchAll(/(?:fill|stroke)="(?!url\()([^"]+)"/g)]
      .map((match) => match[1])
    const paletteColors = new Set([
      'hsl(210 70% 55%)',
      'hsl(90 70% 55%)',
      'hsl(330 70% 55%)'
    ])
    expect(colors.length).toBeGreaterThan(0)
    for (const color of colors) expect(paletteColors).toContain(color)
  })

  it('does not use implementation-dependent trigonometric functions', async () => {
    const source = await readFile(new URL('../src/svgProvider.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/Math\.(?:sin|cos)/)
  })

  it('texture output declares a tileable pattern', async () => {
    const text = new TextDecoder().decode((await svgProvider.generate(texture, ctx)).bytes)
    expect(text).toContain('<pattern')
    expect(text).toContain('</pattern>')
  })

  it('records seeded provenance with its own id/version', async () => {
    const { provenance } = await svgProvider.generate(icon, ctx)
    expect(provenance).toMatchObject({
      provider: 'procedural-svg',
      providerVersion: '1.0.1',
      seed: 1234,
      determinism: { kind: 'seeded' },
      license: { kind: 'generated' }
    })
  })
})
