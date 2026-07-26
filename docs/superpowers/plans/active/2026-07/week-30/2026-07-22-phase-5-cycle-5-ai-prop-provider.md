# Phase 5 Cycle 5 — AI 3D-Prop Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `claude-prop` — a Claude API text→`PropRecipe v1` provider for the `model` asset kind — behind the existing `AssetProvider` seam, and extend palette-membership validation to models so AI props get the same mechanical visual-family gate as SVG.

**Architecture:** Mirrors cycle 4's `claude-svg` exactly: a new `claudePropProvider.ts` in `@automata/asset-providers-ai`, pinned-by-content-hash determinism, injectable `MessagesClient`, reached only through the existing `generateAssets`/`regenerateAsset` MCP `provider` argument. Output is the engine's existing model format (a JSON prop recipe of 1–12 primitives), so no engine or compose change is needed. A shared `propRecipePaletteErrors` helper enforces palette membership at both generation and validation.

**Tech Stack:** TypeScript (npm workspaces monorepo), `@anthropic-ai/sdk`, zod v4 via `@automata/project`, vitest.

**Spec:** [`2026-07-22-phase-5-cycle-5-ai-prop-provider-design.md`](../../specs/active/2026-07/week-30/2026-07-22-phase-5-cycle-5-ai-prop-provider-design.md)
**Umbrella:** [`2026-07-14-phase-5-asset-pipeline-design.md`](../../specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md)
**Precedent:** [`2026-07-17-phase-5-cycle-4-ai-provider-design.md`](../../specs/active/2026-07/week-29/2026-07-17-phase-5-cycle-4-ai-provider-design.md)

## Global Constraints

- **Never import `zod` directly.** Import `z` from `@automata/project`.
- **Network only inside `generate()`.** Reached only via explicit MCP asset-tool calls — never `composeGame`, CI, or validation. `npm run ci` stays fully offline.
- **Pinned determinism.** AI output records `determinism: { kind: 'pinned', contentHash }`. `buildGeneratedAsset` already recomputes the hash over final (post-optimization) bytes for any provider — no change needed there.
- **`claude-svg` behavior is frozen.** The only edit to `claudeSvgProvider.ts` is adding `export` to `isAuthenticationError`. Its existing tests must stay green untouched.
- **first-light frozen.** No compose-path change; the new model-palette validation passes on procedural prop assets (procedural colors are `svgPaletteColors` members by construction). Verify at the gate.
- **Canonical recipe serialization.** Both providers write `${JSON.stringify(recipe, null, 2)}\n` so the on-disk model format is identical regardless of provider.
- **Verification:** `npm run ci` and `npm run verify:new-game` must pass before the cycle is claimed done. Per-package: `npm test -w <package>`.

---

### Task 1: Palette helper + model-palette validation

Add the shared `propRecipePaletteErrors` rule and wire it into the `model` branch of media validation. The procedural `propProvider` must keep passing.

**Files:**
- Modify: `packages/asset-providers/src/propRecipe.ts`
- Modify: `packages/asset-providers/src/validateMedia.ts:104-114` (the `model` branch)
- Test: `packages/asset-providers/tests/propRecipe.test.ts` (create), `packages/asset-providers/tests/validateMedia.test.ts` (add)

**Interfaces:**
- Produces: `propRecipePaletteErrors(recipe: PropRecipe, allowed: readonly string[]): string[]` (exported from `@automata/asset-providers` via the existing `export * from './propRecipe'`).

- [ ] **Step 1: Write the failing helper test**

Create `packages/asset-providers/tests/propRecipe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { propRecipePaletteErrors, type PropRecipe } from '../src/propRecipe'

const recipe = (color: string): PropRecipe => ({
  formatVersion: 1,
  parts: [{ primitive: 'box', size: { x: 1, y: 1, z: 1 }, offset: { x: 0, y: 0.5, z: 0 }, color }]
})

describe('propRecipePaletteErrors', () => {
  it('is empty when every part color is in the allowed palette', () => {
    expect(propRecipePaletteErrors(recipe('hsl(200 50% 50%)'), ['hsl(200 50% 50%)'])).toEqual([])
  })
  it('reports one message per off-palette part color', () => {
    const errors = propRecipePaletteErrors(recipe('#ff0000'), ['hsl(200 50% 50%)'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#ff0000')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/asset-providers -- propRecipe`
Expected: FAIL — `propRecipePaletteErrors` is not exported.

- [ ] **Step 3: Implement the helper**

In `packages/asset-providers/src/propRecipe.ts`, add at the end (after `recipeToRenderables`):

```ts
/** One message per part whose color is not in the allowed palette (empty when all comply). */
export function propRecipePaletteErrors(recipe: PropRecipe, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed)
  const errors: string[] = []
  recipe.parts.forEach((part, index) => {
    if (!allowedSet.has(part.color)) errors.push(`part ${index + 1} uses off-palette color "${part.color}"`)
  })
  return errors
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npm test -w @automata/asset-providers -- propRecipe`
Expected: PASS

- [ ] **Step 5: Write the failing validation test**

Add to `packages/asset-providers/tests/validateMedia.test.ts`:

```ts
import { propProvider } from '../src/propProvider'
import { deriveStyleParams } from '../src/styleParams'
import { svgPaletteColors } from '../src/svgProvider'
import { validateAssetMedia } from '../src/validateMedia'

const modelEntry = (bytes: Uint8Array, provenance: unknown) => ({
  id: 'prop-1',
  requirement: { id: 'prop-1', kind: 'model' as const, description: 'A prop.' },
  path: 'assets/prop-1.prop.json',
  provenance: provenance as never,
  transformations: [],
  status: 'generated' as const,
  references: []
})

it('flags an off-palette prop recipe under the model branch', () => {
  const style = deriveStyleParams({ visualStyle: 'x', audioStyle: 'y' }, 5)
  const bad = `${JSON.stringify({ formatVersion: 1, parts: [{ primitive: 'box', size: { x: 1, y: 1, z: 1 }, offset: { x: 0, y: 0.5, z: 0 }, color: '#ff0000' }] }, null, 2)}\n`
  const bytes = new TextEncoder().encode(bad)
  const issues = validateAssetMedia(modelEntry(bytes, { determinism: { kind: 'seeded' } }), bytes, style)
  expect(issues.some((issue) => issue.message.includes('off-palette'))).toBe(true)
})

it('passes a procedurally generated prop recipe under the same style', async () => {
  const style = deriveStyleParams({ visualStyle: 'x', audioStyle: 'y' }, 5)
  const { bytes, provenance } = await propProvider.generate(
    { id: 'prop-1', kind: 'model', description: 'A prop.' },
    { seed: 3, style, specVersion: 1 }
  )
  const issues = validateAssetMedia(modelEntry(bytes, provenance), bytes, style)
  expect(issues.some((issue) => issue.message.includes('off-palette'))).toBe(false)
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -w @automata/asset-providers -- validateMedia`
Expected: FAIL — the off-palette test finds no such issue (model branch has no palette check yet).

- [ ] **Step 7: Wire the palette check into the model branch**

In `packages/asset-providers/src/validateMedia.ts`, add `propRecipePaletteErrors` to the `./propRecipe` import:

```ts
import { propRecipePaletteErrors, propRecipeSchema, recipeToRenderables } from './propRecipe'
```

Then replace the `if (kind === 'model') { … }` block (lines ~104-114) with:

```ts
  if (kind === 'model') {
    if (bytes.length > MEDIA_BUDGETS.propMaxBytes) {
      budget(`Prop recipe "${entry.id}" is ${bytes.length} bytes (max ${MEDIA_BUDGETS.propMaxBytes})`)
    }
    let recipe: ReturnType<typeof propRecipeSchema.parse> | null = null
    try {
      recipe = propRecipeSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
      recipeToRenderables(recipe)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      invalid(`Prop recipe "${entry.id}" invalid: ${detail}`.slice(0, 400))
    }
    if (recipe && style) {
      for (const message of propRecipePaletteErrors(recipe, svgPaletteColors(style))) {
        invalid(`Prop recipe "${entry.id}" ${message}`)
      }
    }
    return issues
  }
```

- [ ] **Step 8: Run the validation tests + the full package to verify no regression**

Run: `npm test -w @automata/asset-providers`
Expected: PASS (new palette tests + all existing `asset-providers` tests, including `generate` byte-identical pins).

- [ ] **Step 9: Commit**

```bash
git add packages/asset-providers/src packages/asset-providers/tests
git commit -m "feat(asset-providers): palette-membership validation for prop recipes"
```

---

### Task 2: The `claude-prop` provider

New AI provider mirroring `claude-svg`, generating a `PropRecipe v1` JSON for the `model` kind.

**Files:**
- Modify: `packages/asset-providers-ai/src/claudeSvgProvider.ts` (export `isAuthenticationError`)
- Create: `packages/asset-providers-ai/src/claudePropProvider.ts`
- Modify: `packages/asset-providers-ai/src/index.ts`
- Test: `packages/asset-providers-ai/tests/claudePropProvider.test.ts`

**Interfaces:**
- Consumes: `AiProviderError`, `MessagesClient`, `isAuthenticationError` from `./claudeSvgProvider`; `sha256Hex`, `svgPaletteColors`, `propRecipeSchema`, `propRecipePaletteErrors`, `MEDIA_BUDGETS` from `@automata/asset-providers`.
- Produces: `createClaudePropProvider(options?: { client?: MessagesClient; model?: string }): AssetProvider`, `buildPropPrompt`, `extractPropRecipe`, `CLAUDE_PROP_MAX_BYTES`.

- [ ] **Step 1: Export the shared auth helper**

In `packages/asset-providers-ai/src/claudeSvgProvider.ts`, change the `isAuthenticationError` declaration to be exported:

```ts
/** The SDK uses AuthenticationError for rejected credentials, but a plain Error when none resolve. */
export function isAuthenticationError(error: unknown): boolean {
  return error instanceof Anthropic.AuthenticationError ||
    (error instanceof Error && error.message.startsWith('Could not resolve authentication method.'))
}
```

- [ ] **Step 2: Write the failing provider test**

Create `packages/asset-providers-ai/tests/claudePropProvider.test.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { sha256Hex, deriveStyleParams, svgPaletteColors } from '@automata/asset-providers'
import type { AssetRequirement } from '@automata/contracts'
import {
  buildPropPrompt, createClaudePropProvider, extractPropRecipe, CLAUDE_PROP_MAX_BYTES
} from '../src/claudePropProvider'
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
    try { extractPropRecipe(recipeJson('#ff0000'), palette) } catch (error) {
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
  it('throws ai-malformed-output when the recipe exceeds the byte cap', async () => {
    const huge = JSON.stringify({ formatVersion: 1, parts: Array.from({ length: 12 }, () => ({ primitive: 'box', size: { x: 1, y: 1, z: 1 }, offset: { x: 0, y: 0, z: 0 }, color: palette[0]! + ' '.repeat(CLAUDE_PROP_MAX_BYTES) })) }, null, 2)
    const provider = createClaudePropProvider({ client: clientReturning(huge) })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-malformed-output' })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w @automata/asset-providers-ai -- claudePropProvider`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `claudePropProvider.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { AssetProvider, AssetRequirement } from '@automata/contracts'
import {
  MEDIA_BUDGETS, propRecipePaletteErrors, propRecipeSchema, sha256Hex, svgPaletteColors
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
```

- [ ] **Step 5: Export from the package index**

In `packages/asset-providers-ai/src/index.ts`:

```ts
export * from './claudeSvgProvider'
export * from './claudePropProvider'
```

- [ ] **Step 6: Run the provider tests + the SVG tests (frozen) to verify**

Run: `npm test -w @automata/asset-providers-ai`
Expected: PASS — new `claudePropProvider` tests green; existing `claudeSvgProvider` tests untouched and green.

- [ ] **Step 7: Commit**

```bash
git add packages/asset-providers-ai/src packages/asset-providers-ai/tests
git commit -m "feat(asset-providers-ai): claude-prop text->PropRecipe provider for the model kind"
```

---

### Task 3: MCP injection + routing test

Inject `claude-prop` into the server's `namedProviders` and prove `model` routing + kind-mismatch through the asset tools.

**Files:**
- Modify: `tools/editor-mcp-server/src/sessionHost.ts:3,62`
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts` (add)

**Interfaces:**
- Consumes: `createClaudePropProvider` from `@automata/asset-providers-ai`.
- Produces: server injects `{ 'claude-svg': …, 'claude-prop': createClaudePropProvider() }`.

- [ ] **Step 1: Write the failing routing test**

Add to `tools/editor-mcp-server/tests/assetTools.test.ts` (next to the existing `provider override` describe block; reuse its `setupWithSpec`, `svgPaletteColors`, `sha256Hex` imports and `UI_ONLY_ASSETS` pattern):

```ts
const MODEL_ONLY_ASSETS = [{ id: 'lamp-prop', kind: 'model', description: 'A street lamp.' }]

const fakePropProvider: AssetProvider = {
  id: 'fake-prop', version: '1.0.0', kinds: ['model'],
  fileExtension: () => 'prop.json',
  async generate(requirement, ctx) {
    const color = svgPaletteColors(ctx.style)[0]!
    const bytes = new TextEncoder().encode(
      `${JSON.stringify({ formatVersion: 1, parts: [{ primitive: 'box', size: { x: 1, y: 1, z: 1 }, offset: { x: 0, y: 0.5, z: 0 }, color }] }, null, 2)}\n`
    )
    return {
      bytes,
      provenance: {
        provider: 'fake-prop', providerVersion: '1.0.0', generator: 'fake-model',
        sourceParams: { prompt: 'fake' }, seed: ctx.seed, specVersion: ctx.specVersion,
        determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
        license: { kind: 'generated', notes: 'test' }
      }
    }
  }
}

describe('model provider override', () => {
  it('routes a model requirement through the injected prop provider and validates', async () => {
    const { runner, manifestPath } = await setupWithSpec(MODEL_ONLY_ASSETS, { 'fake-prop': fakePropProvider })
    const result = await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'fake-prop' })
    expect(result.ok).toBe(true)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const entry = manifest.assets.find((candidate: { id: string }) => candidate.id === 'lamp-prop')
    expect(entry.provenance.provider).toBe('fake-prop')
    expect(entry.path.endsWith('.prop.json')).toBe(true)
    expect(entry.provenance.determinism.kind).toBe('pinned')
    const validated = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect((validated.content as { statuses: Record<string, string> }).statuses['lamp-prop']).toBe('validated')
  })

  it('rejects a non-model requirement routed to a model-only provider', async () => {
    const { runner } = await setupWithSpec(UI_ONLY_ASSETS, { 'fake-prop': fakePropProvider })
    await expect(runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'fake-prop' }))
      .rejects.toThrow(/kind|model/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- assetTools`
Expected: PASS already for these two (they use an injected fake and the existing routing/kind-mismatch code from cycle 4). If both pass, the test is a regression pin for the routing this cycle relies on — proceed. If the kind-mismatch test does not throw, note the actual behavior and adjust the matcher to the real message before moving on.

> This task's server change (Step 3) wires the *real* provider; the fake-provider tests above prove the model routing path independently of the network. There is no unit test that boots the real SDK — that is the opt-in live smoke (Task 4).

- [ ] **Step 3: Inject the real provider into the server**

In `tools/editor-mcp-server/src/sessionHost.ts`, extend the import (line 3):

```ts
import { createClaudePropProvider, createClaudeSvgProvider } from '@automata/asset-providers-ai'
```

and the injected map (line 62):

```ts
    namedProviders: { 'claude-svg': createClaudeSvgProvider(), 'claude-prop': createClaudePropProvider() },
```

- [ ] **Step 4: Run the server package tests + commit**

Run: `npm test -w @automata/editor-mcp-server -- assetTools`
Expected: PASS

```bash
git add tools/editor-mcp-server/src/sessionHost.ts tools/editor-mcp-server/tests/assetTools.test.ts
git commit -m "feat(editor-mcp-server): inject claude-prop provider; test model routing"
```

---

### Task 4: Opt-in live smoke test

One real generation, skipped unless `ANTHROPIC_API_KEY` is set.

**Files:**
- Modify: `packages/asset-providers-ai/tests/live.test.ts`

**Interfaces:** none (test-only).

- [ ] **Step 1: Add the live smoke case**

Append to `packages/asset-providers-ai/tests/live.test.ts` (mirror the existing SVG live-smoke `describe.skipIf` block):

```ts
import { createClaudePropProvider } from '../src/claudePropProvider'
import { propRecipeSchema, propRecipePaletteErrors, sha256Hex, svgPaletteColors, deriveStyleParams } from '@automata/asset-providers'

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('claude-prop live smoke', () => {
  it('generates a schema-valid, palette-clean prop with a matching pinned hash', async () => {
    const style = deriveStyleParams({ visualStyle: 'neon dusk', audioStyle: 'calm' }, 42)
    const provider = createClaudePropProvider()
    const { bytes, provenance } = await provider.generate(
      { id: 'lamp-prop', kind: 'model', description: 'A stylized street lamp.' },
      { seed: 7, style, specVersion: 1 }
    )
    const recipe = propRecipeSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
    expect(propRecipePaletteErrors(recipe, svgPaletteColors(style))).toEqual([])
    expect(provenance.determinism).toEqual({ kind: 'pinned', contentHash: sha256Hex(bytes) })
  }, 30_000)
})
```

> If `live.test.ts` already imports some of these symbols at the top, fold the new imports into the existing import statements rather than duplicating them.

- [ ] **Step 2: Verify it is skipped offline + commit**

Run: `npm test -w @automata/asset-providers-ai -- live`
Expected: the new `claude-prop live smoke` is skipped (no `ANTHROPIC_API_KEY`).

```bash
git add packages/asset-providers-ai/tests/live.test.ts
git commit -m "test(asset-providers-ai): opt-in claude-prop live smoke"
```

---

### Task 5: Full gates + documentation

- [ ] **Step 1: Run the full CI suite**

Run: `npm run ci`
Expected: PASS (typecheck + lint + all package tests, offline). Fix any cross-package type/lint fallout inline.

- [ ] **Step 2: Prove first-light is untouched and its model assets still validate**

Run: `npm run verify:new-game`
Expected: PASS. Then confirm first-light is unchanged:

```bash
git status --porcelain games/first-light
```

Expected: no output. (The new model-palette validation passes on first-light's procedural prop assets — their colors are `svgPaletteColors` members by construction, proven by Task 1's procedural-recipe test.)

- [ ] **Step 3: Update the roadmap**

In `docs/ROADMAP.md` §3 Phase 5, add a cycle 5 bullet under the cycle list and flip the phase status note as cycle 4 did:

```markdown
  - Cycle 5 — second AI provider adapter (claude-prop, text→PropRecipe for the
    `model` kind; pinned-hash determinism; model-palette validation) —
    `Shipped` (2026-07-26, plan:
    [`2026-07-22-phase-5-cycle-5-ai-prop-provider.md`](superpowers/plans/active/2026-07/week-30/2026-07-22-phase-5-cycle-5-ai-prop-provider.md)).
```

- [ ] **Step 4: Update the decomposition status counters**

In `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`:
- §3 Phase-map Phase 5 row: change `4 cycles completed (2026-07-20)` to `5 cycles completed (2026-07-26)`.
- §5 Phase 5 list: add item 5 (`Second AI provider adapter (claude-prop, model kind)` — completed).

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/superpowers/specs
git commit -m "docs: mark Phase 5 cycle 5 (claude-prop) shipped"
```

---

## Self-Review

**Spec coverage:**
- §1 Claude text→prop-recipe provider → Task 2.
- §1 mirror `claude-svg` / shared primitives (export `isAuthenticationError`) → Task 2 Steps 1, 4.
- §1 explicit MCP step only → Task 3 (injection; no compose change).
- §1 pinned determinism (hash-after-optimize already handled) → Task 2 provenance + `buildGeneratedAsset` (unchanged, noted in Global Constraints).
- §1 palette enforcement extended to models → Task 1.
- §1 mocked SDK + opt-in live smoke → Task 2 (fake client) + Task 4.
- §2 provider contract (id/kinds/fileExtension/cacheKey/prompt/extract/generate) → Task 2.
- §3 `propRecipePaletteErrors` shared helper → Task 1.
- §4 model palette validation → Task 1 Step 7.
- §5 MCP injection (sessionHost) → Task 3 Step 3.
- §6 testing/gates → per-task tests + Task 5.
- §7 first-light regression → Task 1 procedural test + Task 5 Step 2.

**Placeholder scan:** none. Every code step carries complete, copy-paste-runnable code and matches the shipped `claude-svg` idioms (top-level `import Anthropic`, lazy `resolveClient`). Task 3 Step 2 flags that the routing tests may already pass against cycle-4 code (they pin the path this cycle depends on) and tells the implementer exactly how to react.

**Type consistency:** `MessagesClient`, `AiProviderError`, `isAuthenticationError` are defined in `claudeSvgProvider.ts` (Task 2 Step 1 exports the last) and imported identically in `claudePropProvider.ts` and its tests. `propRecipePaletteErrors(recipe, allowed): string[]` has the same signature in Task 1 (definition), Task 2 (generation call), and Task 4 (live smoke). `createClaudePropProvider` options `{ client?, model? }` match the `claude-svg` shape. The provider `id` `'claude-prop'`, `kinds: ['model']`, and `fileExtension` `'prop.json'` are consistent across Tasks 2, 3, and 5.
