import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { sha256Hex, deriveStyleParams, svgPaletteColors } from '@automata/asset-providers'
import type { AssetRequirement } from '@automata/contracts'
import { buildPropPrompt, createClaudePropProvider, extractPropRecipe } from '../src/claudePropProvider'
import { AiProviderError, type MessagesClient } from '../src/claudeSvgProvider'

const style = deriveStyleParams({ visualStyle: 'neon dusk', audioStyle: 'calm' }, 42)
const palette = svgPaletteColors(style)
const requirement: AssetRequirement = { id: 'lamp-prop', kind: 'model', description: 'A street lamp.' }
const ctx = { seed: 7, style, specVersion: 3 }

const recipeJson = (color: string): string =>
  JSON.stringify({ formatVersion: 1, parts: [{ primitive: 'box', size: { x: 1, y: 1, z: 1 }, offset: { x: 0, y: 0.5, z: 0 }, color }] }, null, 2)

const GOOD = recipeJson(palette[0]!)

const clientReturning = (text: string, stopReason: string | null = 'end_turn'): MessagesClient => ({
  messages: { create: async () => ({ stop_reason: stopReason, content: [{ type: 'text', text }] }) }
})

describe('buildPropPrompt', () => {
  it('embeds every allowed palette color and the single-JSON instruction', () => {
    const prompt = buildPropPrompt(requirement, palette)
    for (const color of palette) expect(prompt.system).toContain(color)
    expect(prompt.system).toContain('exactly one JSON object')
    expect(prompt.system).toContain('formatVersion')
    expect(prompt.user).toContain(requirement.description)
  })
})

describe('extractPropRecipe', () => {
  it('parses a bare recipe and re-serializes canonically', () => {
    expect(extractPropRecipe(GOOD, palette)).toBe(`${GOOD}\n`)
  })

  it('strips a ```json fence', () => {
    expect(extractPropRecipe('```json\n' + GOOD + '\n```', palette)).toBe(`${GOOD}\n`)
  })

  it('throws ai-malformed-output for non-JSON', () => {
    expect(() => extractPropRecipe('Sure! here you go', palette)).toThrow(AiProviderError)
  })

  it('throws ai-malformed-output for a schema-invalid recipe', () => {
    expect(() => extractPropRecipe(recipeJson(palette[0]!).replace('"formatVersion": 1', '"formatVersion": 2'), palette))
      .toThrow(/ai-malformed-output/)
  })

  it('throws ai-malformed-output naming an off-palette color', () => {
    expect.assertions(2)
    try {
      extractPropRecipe(recipeJson('#ff0000'), palette)
    } catch (error) {
      expect((error as AiProviderError).code).toBe('ai-malformed-output')
      expect((error as Error).message).toContain('#ff0000')
    }
  })
})

describe('createClaudePropProvider', () => {
  it('declares the provider contract', () => {
    const provider = createClaudePropProvider({ client: clientReturning(GOOD) })
    expect(provider.id).toBe('claude-prop')
    expect(provider.cacheKey).toBe('claude-prop@1.0.0:model=claude-opus-4-8')
    expect(provider.kinds).toEqual(['model'])
    expect(provider.fileExtension(requirement)).toBe('prop.json')
  })

  it('generates bytes with pinned provenance whose hash matches the bytes', async () => {
    const provider = createClaudePropProvider({ client: clientReturning(GOOD) })
    const { bytes, provenance } = await provider.generate(requirement, ctx)
    expect(new TextDecoder().decode(bytes)).toBe(`${GOOD}\n`)
    expect(provenance.provider).toBe('claude-prop')
    expect(provenance.generator).toBe('claude-opus-4-8')
    expect(provenance.determinism).toEqual({ kind: 'pinned', contentHash: sha256Hex(bytes) })
    expect(provenance.license.kind).toBe('generated')
  })

  it('throws ai-refusal on a refusal stop reason', async () => {
    const provider = createClaudePropProvider({ client: clientReturning('', 'refusal') })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-refusal' })
  })

  it('maps the SDK missing-credentials error to ai-auth-missing', async () => {
    const client = new Anthropic({ apiKey: null, authToken: null }) as unknown as MessagesClient
    const provider = createClaudePropProvider({ client })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-auth-missing' })
  })

  it('throws ai-malformed-output for a recipe with too many parts', async () => {
    const thirteen = JSON.stringify({
      formatVersion: 1,
      parts: Array.from({ length: 13 }, () => ({
        primitive: 'box',
        size: { x: 1, y: 1, z: 1 },
        offset: { x: 0, y: 0, z: 0 },
        color: palette[0]!
      }))
    }, null, 2)
    const provider = createClaudePropProvider({ client: clientReturning(thirteen) })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-malformed-output' })
  })
})
