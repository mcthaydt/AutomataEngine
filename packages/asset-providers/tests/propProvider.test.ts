import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ProviderContext } from '@automata/contracts'
import { propRecipeSchema, recipeToRenderables } from '../src/propRecipe'
import { propProvider } from '../src/propProvider'

const ctx: ProviderContext = {
  seed: 777,
  style: {
    palette: {
      baseHue: 30,
      accentHues: [150, 270],
      saturation: 0.6,
      lightness: 0.5
    },
    audio: { waveform: 'square', tempo: 'mid' }
  },
  specVersion: 1
}
const req = { id: 'harbor-crate', kind: 'model' as const, description: 'A crate.' }
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

describe('propProvider', () => {
  it('replays bit-identically; golden hash pinned', async () => {
    const a = await propProvider.generate(req, ctx)
    expect(sha(a.bytes)).toBe(sha((await propProvider.generate(req, ctx)).bytes))
    expect(sha(a.bytes)).toMatchSnapshot()
  })

  it('emits a schema-valid recipe of at most 12 parts with canonical JSON', async () => {
    const text = new TextDecoder().decode((await propProvider.generate(req, ctx)).bytes)
    expect(text.endsWith('\n')).toBe(true)
    const recipe = propRecipeSchema.parse(JSON.parse(text))
    expect(recipe.parts.length).toBeGreaterThan(0)
    expect(recipe.parts.length).toBeLessThanOrEqual(12)
  })

  it('different asset ids under different seeds pick varying silhouettes eventually', async () => {
    const hashes = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      hashes.add(sha((await propProvider.generate(req, { ...ctx, seed })).bytes))
    }
    expect(hashes.size).toBeGreaterThan(4)
  })

  it('recipeToRenderables maps every part to an engine renderable + offset', async () => {
    const text = new TextDecoder().decode((await propProvider.generate(req, ctx)).bytes)
    const recipe = propRecipeSchema.parse(JSON.parse(text))
    const renderables = recipeToRenderables(recipe)
    expect(renderables).toHaveLength(recipe.parts.length)
    for (const { def, offset } of renderables) {
      expect(['box', 'sphere', 'cylinder']).toContain(def.primitive)
      expect(typeof offset.y).toBe('number')
    }
  })
})
