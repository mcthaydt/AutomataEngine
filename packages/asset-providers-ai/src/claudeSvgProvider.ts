import Anthropic from '@anthropic-ai/sdk'
import type { AssetProvider, AssetRequirement } from '@automata/contracts'
import { sha256Hex, svgPaletteColors } from '@automata/asset-providers'

/**
 * The first AI provider adapter (Phase 5 cycle 4): Claude text→SVG behind the
 * standard AssetProvider seam. Network is touched only inside generate(),
 * which is reached only via explicit MCP asset-tool calls — never compose,
 * CI, or validation. Output is non-replayable, so provenance pins the bytes
 * by content hash; validation verifies the hash instead of regenerating.
 */
export const CLAUDE_SVG_MAX_BYTES = 65_536
const DEFAULT_MODEL = 'claude-opus-4-8'

export type AiProviderErrorCode = 'ai-auth-missing' | 'ai-refusal' | 'ai-malformed-output'

export class AiProviderError extends Error {
  constructor(readonly code: AiProviderErrorCode, message: string) {
    super(`${code}: ${message}`)
    this.name = 'AiProviderError'
  }
}

/** The narrow slice of the Anthropic SDK the provider uses; tests inject fakes. */
export interface MessagesClient {
  messages: {
    create(params: {
      model: string
      max_tokens: number
      system: string
      messages: Array<{ role: 'user'; content: string }>
    }): Promise<{ stop_reason: string | null; content: Array<{ type: string; text?: string }> }>
  }
}

export function buildSvgPrompt(
  requirement: AssetRequirement,
  allowedColors: readonly string[]
): { system: string; user: string } {
  return {
    system: [
      'You generate stylized SVG assets for a deterministic game asset pipeline.',
      'Respond with exactly one <svg> document and nothing else - no markdown fences, no prose.',
      'Every fill and stroke attribute must use one of these literal color strings',
      `(or "none"): ${allowedColors.join(', ')}.`,
      'Keep the document under 32 KB.',
      'Use only plain elements (rect, circle, ellipse, polygon, path, pattern, g);',
      'no scripts, no text, no external references.'
    ].join(' '),
    user: requirement.kind === 'texture'
      ? `Draw a seamless tileable 64x64 texture pattern: ${requirement.description} (viewBox "0 0 64 64", width 64, height 64).`
      : `Draw a 32x32 icon: ${requirement.description} (viewBox "0 0 32 32").`
  }
}

/** Strip an optional markdown fence and demand a complete <svg> document. */
export function extractSvg(raw: string): string {
  let text = raw.trim()
  const fence = text.match(/^```(?:svg|xml)?\s*\n([\s\S]*?)\n```$/)
  if (fence) text = fence[1]!.trim()
  if (!text.startsWith('<svg')) {
    throw new AiProviderError('ai-malformed-output', `response does not start with <svg (got "${text.slice(0, 60)}")`)
  }
  if (!text.endsWith('</svg>')) {
    throw new AiProviderError('ai-malformed-output', 'response does not end with </svg>')
  }
  return `${text}\n`
}

export function createClaudeSvgProvider(
  options: { client?: MessagesClient; model?: string } = {}
): AssetProvider {
  const model = options.model ?? DEFAULT_MODEL
  let client: MessagesClient | null = options.client ?? null
  // Lazy: constructing the SDK client requires no key, but deferring keeps
  // server startup key-free until the first actual generation call.
  const resolveClient = (): MessagesClient => {
    client ??= new Anthropic() as unknown as MessagesClient
    return client
  }
  return {
    id: 'claude-svg',
    version: '1.0.0',
    kinds: ['ui', 'texture'],
    fileExtension: () => 'svg',
    async generate(requirement, ctx) {
      const prompt = buildSvgPrompt(requirement, svgPaletteColors(ctx.style))
      let response: Awaited<ReturnType<MessagesClient['messages']['create']>>
      try {
        response = await resolveClient().messages.create({
          model,
          max_tokens: 4096,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }]
        })
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) {
          throw new AiProviderError('ai-auth-missing',
            'Anthropic authentication failed - set ANTHROPIC_API_KEY (or run `ant auth login`) and retry')
        }
        throw error
      }
      if (response.stop_reason === 'refusal') {
        throw new AiProviderError('ai-refusal', `Claude declined to generate asset "${requirement.id}"`)
      }
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
      const svg = extractSvg(text)
      const bytes = new TextEncoder().encode(svg)
      if (bytes.length > CLAUDE_SVG_MAX_BYTES) {
        throw new AiProviderError('ai-malformed-output',
          `generated SVG is ${bytes.length} bytes (max ${CLAUDE_SVG_MAX_BYTES})`)
      }
      return {
        bytes,
        provenance: {
          provider: 'claude-svg',
          providerVersion: '1.0.0',
          generator: model,
          sourceParams: { model, system: prompt.system, prompt: prompt.user },
          seed: ctx.seed,
          specVersion: ctx.specVersion,
          determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
          license: { kind: 'generated', notes: 'AI-generated via the Claude API.' }
        }
      }
    }
  }
}
