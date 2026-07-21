import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { sha256Hex, deriveStyleParams, svgPaletteColors } from '@automata/asset-providers'
import type { AssetRequirement } from '@automata/contracts'
import {
  AiProviderError, CLAUDE_SVG_MAX_BYTES, buildSvgPrompt, createClaudeSvgProvider, extractSvg,
  type MessagesClient
} from '../src/claudeSvgProvider'

const style = deriveStyleParams({ visualStyle: 'neon dusk', audioStyle: 'calm' }, 42)
const requirement: AssetRequirement = { id: 'relic-icon', kind: 'ui', description: 'A glowing relic icon.' }
const ctx = { seed: 7, style, specVersion: 3 }

const palette = svgPaletteColors(style)
const GOOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="6" fill="${palette[0]}"/></svg>`

const clientReturning = (text: string, stopReason: string | null = 'end_turn'): MessagesClient => ({
  messages: {
    create: async () => ({ stop_reason: stopReason, content: [{ type: 'text', text }] })
  }
})

describe('buildSvgPrompt', () => {
  it('embeds every allowed palette color string and the single-document instruction', () => {
    const prompt = buildSvgPrompt(requirement, palette)
    for (const color of palette) expect(prompt.system).toContain(color)
    expect(prompt.system).toContain('exactly one <svg> document')
    expect(prompt.user).toContain(requirement.description)
  })

  it('asks for a tileable pattern for textures and an icon for ui', () => {
    expect(buildSvgPrompt({ ...requirement, kind: 'texture' }, palette).user).toContain('tileable')
    expect(buildSvgPrompt(requirement, palette).user).toContain('icon')
  })
})

describe('extractSvg', () => {
  it('accepts a bare svg document and normalizes the trailing newline', () => {
    expect(extractSvg(GOOD_SVG)).toBe(`${GOOD_SVG}\n`)
  })

  it('strips markdown code fences', () => {
    expect(extractSvg('```svg\n' + GOOD_SVG + '\n```')).toBe(`${GOOD_SVG}\n`)
    expect(extractSvg('```\n' + GOOD_SVG + '\n```')).toBe(`${GOOD_SVG}\n`)
  })

  it('throws ai-malformed-output for prose or truncated documents', () => {
    expect(() => extractSvg('Sure! Here is your icon.')).toThrow(AiProviderError)
    expect(() => extractSvg('<svg viewBox="0 0 32 32"><rect')).toThrow(/ai-malformed-output|<\/svg>/)
    try {
      extractSvg('nope')
    } catch (error) {
      expect((error as AiProviderError).code).toBe('ai-malformed-output')
    }
  })
})

describe('createClaudeSvgProvider', () => {
  it('declares the provider contract', () => {
    const provider = createClaudeSvgProvider({ client: clientReturning(GOOD_SVG) })
    expect(provider.id).toBe('claude-svg')
    expect(provider.kinds).toEqual(['ui', 'texture'])
    expect(provider.fileExtension(requirement)).toBe('svg')
  })

  it('generates bytes with pinned provenance whose hash matches the bytes', async () => {
    const provider = createClaudeSvgProvider({ client: clientReturning(GOOD_SVG) })
    const { bytes, provenance } = await provider.generate(requirement, ctx)
    expect(new TextDecoder().decode(bytes)).toBe(`${GOOD_SVG}\n`)
    expect(provenance.provider).toBe('claude-svg')
    expect(provenance.generator).toBe('claude-opus-4-8')
    expect(provenance.seed).toBe(7)
    expect(provenance.specVersion).toBe(3)
    expect(provenance.determinism).toEqual({ kind: 'pinned', contentHash: sha256Hex(bytes) })
    expect(provenance.license.kind).toBe('generated')
    expect(provenance.sourceParams).toMatchObject({ model: 'claude-opus-4-8' })
  })

  it('records a model override in generator and sourceParams', async () => {
    const provider = createClaudeSvgProvider({ client: clientReturning(GOOD_SVG), model: 'claude-sonnet-5' })
    const { provenance } = await provider.generate(requirement, ctx)
    expect(provenance.generator).toBe('claude-sonnet-5')
  })

  it('throws ai-refusal on a refusal stop reason', async () => {
    const provider = createClaudeSvgProvider({ client: clientReturning('', 'refusal') })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-refusal' })
  })

  it('maps the SDK missing-credentials error to ai-auth-missing', async () => {
    const client = new Anthropic({ apiKey: null, authToken: null }) as unknown as MessagesClient
    const provider = createClaudeSvgProvider({ client })

    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-auth-missing' })
  })

  it('throws ai-malformed-output when the response exceeds the byte cap', async () => {
    const huge = `<svg>${'x'.repeat(CLAUDE_SVG_MAX_BYTES)}</svg>`
    const provider = createClaudeSvgProvider({ client: clientReturning(huge) })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-malformed-output' })
  })

  it.each([
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['event handler', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect fill="none"/></svg>'],
    ['external reference', '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://example.com/p.svg#x)"/></svg>']
  ])('rejects unsafe %s output before returning bytes', async (_label, text) => {
    const provider = createClaudeSvgProvider({ client: clientReturning(text) })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-malformed-output' })
  })
})
