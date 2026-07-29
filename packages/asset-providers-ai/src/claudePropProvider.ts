import Anthropic from '@anthropic-ai/sdk'
import type { AssetProvider, AssetRequirement } from '@automata/contracts'
import {
  MEDIA_BUDGETS,
  propRecipePaletteErrors,
  propRecipeSchema,
  sha256Hex,
  svgPaletteColors
} from '@automata/asset-providers'
import { AiProviderError, isAuthenticationError, type MessagesClient } from './claudeSvgProvider'

/**
 * The second AI provider adapter (Phase 5 cycle 5): Claude text→PropRecipe v1
 * for the `model` kind. Same seam, error taxonomy, and pinned-by-hash
 * determinism as claude-svg. Output is the engine's model format, so no
 * compose or engine change is needed; palette membership is enforced at
 * generation and again at validation.
 */
export const CLAUDE_PROP_MAX_BYTES = MEDIA_BUDGETS.propMaxBytes
// Mirrors claude-svg deliberately: both AI providers must move models together
// so a cacheKey change is one reviewed decision, not a per-module drift.
const DEFAULT_MODEL = 'claude-opus-4-8'

export function buildPropPrompt(
  requirement: AssetRequirement,
  allowedColors: readonly string[]
): { system: string; user: string } {
  return {
    system: [
      'You generate compact stylized 3D prop recipes for a deterministic game asset pipeline.',
      'Respond with exactly one JSON object and nothing else - no markdown fences, no prose.',
      'Schema: { "formatVersion": 1, "parts": [ ... ] } with 1 to 12 parts.',
      'Each part is one of:',
      '{ "primitive": "box", "size": {"x","y","z"}, "offset": {"x","y","z"}, "color" },',
      '{ "primitive": "sphere", "radius", "offset": {"x","y","z"}, "color" },',
      '{ "primitive": "cylinder", "radius", "height", "offset": {"x","y","z"}, "color" }.',
      'Sizes, radii, and heights are small positive numbers; the prop is about 1 to 2 units',
      'tall, centered at the origin and resting on the ground (every offset.y >= 0).',
      `Every "color" must be one of these literal strings: ${allowedColors.join(', ')}.`
    ].join(' '),
    user: `Design a stylized prop: ${requirement.description}.`
  }
}

/** Strip an optional markdown fence, parse + validate the recipe, re-serialize canonically. */
export function extractPropRecipe(raw: string, allowedColors: readonly string[]): string {
  let text = raw.trim()
  const fence = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  if (fence) text = fence[1]!.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AiProviderError('ai-malformed-output', `response is not valid JSON (got "${text.slice(0, 60)}")`)
  }
  const result = propRecipeSchema.safeParse(parsed)
  if (!result.success) {
    throw new AiProviderError('ai-malformed-output', `recipe invalid: ${result.error.message}`.slice(0, 200))
  }
  const paletteErrors = propRecipePaletteErrors(result.data, allowedColors)
  if (paletteErrors.length > 0) {
    throw new AiProviderError('ai-malformed-output', `recipe ${paletteErrors[0]}`)
  }
  return `${JSON.stringify(result.data, null, 2)}\n`
}

export function createClaudePropProvider(
  options: { client?: MessagesClient; model?: string } = {}
): AssetProvider {
  const model = options.model ?? DEFAULT_MODEL
  let client: MessagesClient | null = options.client ?? null
  // Lazy: defer SDK construction so server startup stays key-free until the first call.
  const resolveClient = (): MessagesClient => {
    client ??= new Anthropic() as unknown as MessagesClient
    return client
  }
  return {
    id: 'claude-prop',
    version: '1.0.0',
    cacheKey: `claude-prop@1.0.0:model=${model}`,
    kinds: ['model'],
    fileExtension: () => 'prop.json',
    async generate(requirement, ctx) {
      const allowedColors = svgPaletteColors(ctx.style)
      const prompt = buildPropPrompt(requirement, allowedColors)
      let response: Awaited<ReturnType<MessagesClient['messages']['create']>>
      try {
        response = await resolveClient().messages.create({
          model,
          max_tokens: 4096,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }]
        })
      } catch (error) {
        if (isAuthenticationError(error)) {
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
      const recipe = extractPropRecipe(text, allowedColors)
      const bytes = new TextEncoder().encode(recipe)
      // Defense-in-depth only: PropRecipe v1 caps parts at 12 and colors at 40
      // chars, so a schema-valid recipe cannot reach 16 KB. Kept so a future
      // schema widening fails typed at generation rather than at validation;
      // deliberately left without a unit test (it is unreachable today).
      if (bytes.length > CLAUDE_PROP_MAX_BYTES) {
        throw new AiProviderError('ai-malformed-output',
          `generated recipe is ${bytes.length} bytes (max ${CLAUDE_PROP_MAX_BYTES})`)
      }
      return {
        bytes,
        provenance: {
          provider: 'claude-prop',
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
