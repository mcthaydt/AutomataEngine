# Phase 5 Cycle 4 — First AI Provider Adapter (claude-svg) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@automata/asset-providers-ai` — a Claude API text→SVG provider (`claude-svg`) behind the existing `AssetProvider` seam, exercised through the MCP asset tools with pinned-by-content-hash determinism — per the approved spec
`docs/superpowers/specs/active/2026-07/week-29/2026-07-17-phase-5-cycle-4-ai-provider-design.md`.

**Architecture:** A new leaf package holds the provider and the `@anthropic-ai/sdk` dependency; `asset-providers` stays procedural and network-free (a shared `buildGeneratedAsset` helper is extracted so both paths build entries identically, recomputing pinned hashes over final post-optimization bytes). The MCP server injects the provider into the asset-tool runner, which resolves an optional `provider` argument on `generateAssets`/`regenerateAsset`. `validateAssetMedia` gains the pinned-hash check (`asset-hash-mismatch`). `composeGame` is untouched.

**Tech Stack:** TypeScript ESM workspaces, `@anthropic-ai/sdk` (TypeScript SDK), zod, vitest (happy-dom), `node:crypto` sha256.

**Implementation progress:** 85% (56/66 task and verification steps complete)

**Review-hardening progress:** 60% (15/25 steps complete)

## Global Constraints

- Model: `claude-opus-4-8` (default; recorded per asset in `provenance.generator`). Credentials from the environment (`ANTHROPIC_API_KEY` or `ant auth login` profile) — never hardcoded, never stored.
- Network only inside the AI provider's `generate()`, reached only via explicit MCP tool calls with `provider` set. Nothing in `composeGame`, CI, or validation ever calls the network.
- The asset pipeline's `@anthropic-ai/sdk` dependency is owned by `@automata/asset-providers-ai`; procedural `@automata/asset-providers`, `@automata/game-compose`, and the MCP server do not depend on the SDK directly. (`@automata/agent-core` retains its pre-existing independent SDK dependency.)
- `generateGameAssets` output must stay **byte-identical** (existing snapshot tests must pass with no snapshot updates); `games/first-light` stays untouched.
- Pinned `contentHash` always covers the **final written bytes** (post-optimization).
- AI SVG byte-size cap: 65 536 bytes (`CLAUDE_SVG_MAX_BYTES`); prompt targets the existing 32 KB media budget.
- Live smoke test must be skipped when `ANTHROPIC_API_KEY` is unset (`npm run ci` stays offline).
- Run tests from the repo root with `npx vitest run <path>`; full gates are `npm run ci` and `npm run verify:new-game`.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- iCloud caveat: before each commit, check `git status` for duplicate `" 2"` files and delete them.

---

### Task 1: Contracts — `asset-hash-mismatch` issue code + `provider` tool argument

**Files:**
- Modify: `packages/contracts/src/assetValidation.ts:11-21` (the `AssetIssue['code']` union)
- Modify: `packages/contracts/src/assetTools.ts` (arg schemas + descriptions)
- Test: `packages/contracts/tests/assetTools.test.ts`

**Interfaces:**
- Produces: `AssetIssue` accepts `code: 'asset-hash-mismatch'` (used by Task 3). `assetToolArgSchemas.generateAssets` / `.regenerateAsset` accept optional `provider: string` (1–60 chars; used by Task 6).

- [x] **Step 1: Write the failing tests**

Append inside the existing describe block of `packages/contracts/tests/assetTools.test.ts` — the file imports `assetToolArgSchemas` and `assetToolDefs` (not `parseAssetToolArgs`); keep that convention:

```ts
  it('generateAssets and regenerateAsset accept an optional provider id', () => {
    expect(assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game', provider: 'claude-svg' }))
      .toMatchObject({ provider: 'claude-svg' })
    expect(assetToolArgSchemas.regenerateAsset.parse({ gameId: 'demo-game', assetId: 'relic-icon', provider: 'claude-svg' }))
      .toMatchObject({ provider: 'claude-svg' })
    // provider stays optional — existing callers unchanged
    expect(assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game' }))
      .not.toHaveProperty('provider')
  })

  it('rejects empty and oversized provider ids', () => {
    expect(() => assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game', provider: '' })).toThrow()
    expect(() => assetToolArgSchemas.regenerateAsset.parse({ gameId: 'demo-game', assetId: 'a', provider: 'x'.repeat(61) })).toThrow()
  })
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/contracts/tests/assetTools.test.ts`
Expected: FAIL — `provider` is rejected by the strict object schemas.

- [x] **Step 3: Implement**

In `packages/contracts/src/assetValidation.ts`, extend the `AssetIssue` code union (after `'asset-media-budget'`):

```ts
    | 'asset-media-budget'
    | 'asset-hash-mismatch'
```

In `packages/contracts/src/assetTools.ts`, add to the `generateAssets` strict object (after `seed`):

```ts
    provider: z.string().min(1).max(60).optional()
```

and to the `regenerateAsset` strict object (after `seed`):

```ts
    provider: z.string().min(1).max(60).optional()
```

Update the two descriptions in `DESCRIPTIONS`:

```ts
  generateAssets: 'Generate spec asset requirements through the procedural provider registry: writes files under public/, merges manifest entries (status "generated"). Idempotent for a given seed. Pass provider to route through a named non-default provider (e.g. the AI provider "claude-svg"; result is pinned by content hash and needs network + credentials).',
  regenerateAsset: 'Re-run exactly one asset\'s provider behind its stable logical id (hash-guarded, seeded). Resets it to status "generated" with fresh provenance; other assets are untouched. Pass provider to route through a named non-default provider (e.g. "claude-svg"). Follow with validateAssets.'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/contracts`
Expected: PASS (all — including untouched existing tool tests).

- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): asset-hash-mismatch issue code and provider arg on asset tools"
```

---

### Task 2: `asset-providers` — `sha256Hex` + `buildGeneratedAsset` extraction with pinned-hash recompute

**Files:**
- Create: `packages/asset-providers/src/hash.ts`
- Modify: `packages/asset-providers/src/generate.ts`
- Modify: `packages/asset-providers/src/index.ts` (add `export * from './hash'`)
- Test: `packages/asset-providers/tests/generate.test.ts` (additive)

**Interfaces:**
- Consumes: existing `optimizeAssetBytes`, `deriveStyleParams`, `resolveProvider`, `hashStringToSeed`.
- Produces (used by Tasks 3, 4, 6): `sha256Hex(bytes: Uint8Array): string`; `buildGeneratedAsset(requirement: AssetRequirement, provider: AssetProvider, input: { seed: number; style: StyleParams; specVersion: number }): Promise<GeneratedAsset>`. `generateGameAssets` behavior unchanged.

- [x] **Step 1: Write the failing tests**

Append to `packages/asset-providers/tests/generate.test.ts` (match its existing imports; add `buildGeneratedAsset` to the `../src/generate` import, new imports for `sha256Hex` from `../src/hash` and `deriveStyleParams` from `../src/styleParams`, and the `AssetProvider` type from `@automata/contracts`):

```ts
describe('sha256Hex', () => {
  it('hashes bytes to lowercase hex, stable across calls', () => {
    const bytes = new TextEncoder().encode('abc')
    expect(sha256Hex(bytes)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex(bytes)).toBe(sha256Hex(new TextEncoder().encode('abc')))
  })
})

describe('buildGeneratedAsset pinned-hash recompute', () => {
  // Un-minified SVG: the optimizer WILL rewrite these bytes, so a hash
  // computed by the provider goes stale unless the helper recomputes it.
  const RAW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  <rect x="1" y="1" width="30" height="30"/>\n</svg>\n'
  const pinnedProvider: AssetProvider = {
    id: 'pinned-fake', version: '1.0.0', kinds: ['ui'],
    fileExtension: () => 'svg',
    async generate(requirement, ctx) {
      const bytes = new TextEncoder().encode(RAW_SVG)
      return {
        bytes,
        provenance: {
          provider: 'pinned-fake', providerVersion: '1.0.0', generator: 'fake-model',
          sourceParams: {}, seed: ctx.seed, specVersion: ctx.specVersion,
          determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
          license: { kind: 'generated', notes: 'test' }
        }
      }
    }
  }
  const requirement = { id: 'pin-icon', kind: 'ui' as const, description: 'Pinned icon.' }
  const style = deriveStyleParams({ visualStyle: 'test', audioStyle: 'test' }, 1)

  it('recomputes the pinned contentHash over the final optimized bytes', async () => {
    const asset = await buildGeneratedAsset(requirement, pinnedProvider, { seed: 7, style, specVersion: 1 })
    expect(asset.entry.transformations).toHaveLength(1) // optimizer fired
    const determinism = asset.entry.provenance.determinism
    expect(determinism.kind).toBe('pinned')
    if (determinism.kind === 'pinned') {
      expect(determinism.contentHash).toBe(sha256Hex(asset.bytes))
      expect(determinism.contentHash).not.toBe(sha256Hex(new TextEncoder().encode(RAW_SVG)))
    }
  })

  it('leaves seeded provenance untouched and keeps the entry shape', async () => {
    const asset = await buildGeneratedAsset(requirement, pinnedProvider, { seed: 7, style, specVersion: 1 })
    expect(asset.path).toBe('assets/pin-icon.svg')
    expect(asset.entry.status).toBe('generated')
    expect(asset.entry.references).toEqual([])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/asset-providers/tests/generate.test.ts`
Expected: FAIL — `sha256Hex` / `buildGeneratedAsset` not exported.

- [x] **Step 3: Implement**

`packages/asset-providers/src/hash.ts`:

```ts
import { createHash } from 'node:crypto'

/** Canonical content hash for pinned-determinism provenance and its verification. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
```

Rewrite `packages/asset-providers/src/generate.ts` as:

```ts
import type { AssetManifestEntry, AssetProvider, AssetRequirement, StyleParams } from '@automata/contracts'
import { hashStringToSeed } from '@automata/engine'
import { resolveProvider } from './registry'
import { deriveStyleParams } from './styleParams'
import { optimizeAssetBytes } from './optimize'
import { sha256Hex } from './hash'

export interface GenerateAssetsInput {
  requirements: readonly AssetRequirement[]
  direction: { visualStyle: string; audioStyle: string }
  seed: number
  specVersion: number
}

export interface GeneratedAsset {
  entry: AssetManifestEntry
  path: string
  bytes: Uint8Array
}

export interface BuildAssetInput {
  seed: number
  style: StyleParams
  specVersion: number
}

/**
 * One requirement through one provider: generate, optimize, build the entry.
 * Pinned contentHash always covers the FINAL written bytes — optimization can
 * rewrite provider output, so a provider-computed hash is recomputed here.
 */
export async function buildGeneratedAsset(
  requirement: AssetRequirement,
  provider: AssetProvider,
  input: BuildAssetInput
): Promise<GeneratedAsset> {
  const { bytes, provenance } = await provider.generate(requirement, {
    seed: input.seed,
    style: input.style,
    specVersion: input.specVersion
  })
  const optimized = optimizeAssetBytes(requirement.kind, bytes)
  const finalBytes = optimized?.bytes ?? bytes
  const transformations = optimized ? [optimized.transformation] : []
  const finalProvenance = provenance.determinism.kind === 'pinned'
    ? { ...provenance, determinism: { kind: 'pinned' as const, contentHash: sha256Hex(finalBytes) } }
    : provenance
  const path = `assets/${requirement.id}.${provider.fileExtension(requirement)}`
  return {
    path,
    bytes: finalBytes,
    entry: {
      id: requirement.id,
      requirement,
      path,
      provenance: finalProvenance,
      transformations,
      status: 'generated',
      references: []
    }
  }
}

/**
 * Pure orchestration with no filesystem access. Each provider receives a
 * child seed derived from the game seed and asset id, so adding, removing,
 * or regenerating one requirement cannot perturb any other byte stream.
 */
export async function generateGameAssets(
  input: GenerateAssetsInput
): Promise<GeneratedAsset[]> {
  const style = deriveStyleParams(input.direction, input.seed)
  const generated: GeneratedAsset[] = []
  for (const requirement of input.requirements) {
    const provider = resolveProvider(requirement.kind)
    const childSeed = hashStringToSeed(`${input.seed}:${requirement.id}`)
    generated.push(await buildGeneratedAsset(requirement, provider, {
      seed: childSeed,
      style,
      specVersion: input.specVersion
    }))
  }
  return generated
}
```

Add to `packages/asset-providers/src/index.ts`: `export * from './hash'`

- [x] **Step 4: Run the full package suite — the regression pin**

Run: `npx vitest run packages/asset-providers && npx vitest run packages/game-compose`
Expected: PASS with **zero snapshot updates** — `generateGameAssets` output is byte-identical to before the refactor. If a snapshot changes, the refactor altered behavior; fix the code, never the snapshot.

- [x] **Step 5: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): sha256Hex + buildGeneratedAsset with pinned-hash recompute"
```

---

### Task 3: `asset-providers` — pinned-hash check in `validateAssetMedia`

**Files:**
- Modify: `packages/asset-providers/src/validateMedia.ts:94-99` (top of `validateAssetMedia`)
- Test: `packages/asset-providers/tests/validateMedia.test.ts` (additive)

**Interfaces:**
- Consumes: Task 1's `'asset-hash-mismatch'` code; Task 2's `sha256Hex`.
- Produces: `validateAssetMedia` reports `asset-hash-mismatch` for pinned entries whose bytes don't hash to `contentHash` (exercised end-to-end in Task 6).

- [x] **Step 1: Write the failing tests**

Append to `packages/asset-providers/tests/validateMedia.test.ts` (reuse the file's existing entry-fixture helper if one exists — read the file first; otherwise this self-contained block works, matching the manifest-entry shape from cycle 1):

```ts
describe('pinned-hash verification', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" fill="none"/></svg>\n'
  const bytes = new TextEncoder().encode(SVG)
  const pinnedEntry = (contentHash: string) => ({
    id: 'pin-icon',
    requirement: { id: 'pin-icon', kind: 'ui' as const, description: 'Pinned icon.' },
    path: 'assets/pin-icon.svg',
    provenance: {
      provider: 'claude-svg', providerVersion: '1.0.0', generator: 'claude-opus-4-8',
      sourceParams: {}, seed: 1, specVersion: 1,
      determinism: { kind: 'pinned' as const, contentHash },
      license: { kind: 'generated' as const, notes: 'test' }
    },
    transformations: [],
    status: 'generated' as const,
    references: ['public/project/composition.json']
  })
  const style = deriveStyleParams({ visualStyle: 'test', audioStyle: 'test' }, 1)

  it('passes when bytes match the pinned contentHash', () => {
    const issues = validateAssetMedia(pinnedEntry(sha256Hex(bytes)), bytes, style)
    expect(issues.filter((issue) => issue.code === 'asset-hash-mismatch')).toEqual([])
  })

  it('fails with asset-hash-mismatch when bytes are tampered or stale', () => {
    const issues = validateAssetMedia(pinnedEntry(sha256Hex(new TextEncoder().encode('other'))), bytes, style)
    expect(issues.some((issue) => issue.code === 'asset-hash-mismatch' && issue.severity === 'error')).toBe(true)
  })

  it('never hash-checks seeded entries', () => {
    const entry = { ...pinnedEntry(''), provenance: { ...pinnedEntry('').provenance, determinism: { kind: 'seeded' as const } } }
    const issues = validateAssetMedia(entry, bytes, style)
    expect(issues.some((issue) => issue.code === 'asset-hash-mismatch')).toBe(false)
  })
})
```

(If `deriveStyleParams` / `sha256Hex` / `validateAssetMedia` are not yet imported at the top of the test file, add them to the existing `../src/...` import lines.)

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/asset-providers/tests/validateMedia.test.ts`
Expected: FAIL — the mismatch case reports no `asset-hash-mismatch` issue.

- [x] **Step 3: Implement**

In `packages/asset-providers/src/validateMedia.ts`, add the import:

```ts
import { sha256Hex } from './hash'
```

and insert at the top of `validateAssetMedia` (immediately after the `issues` / `invalid` / `budget` declarations, before the `kind` branches):

```ts
  if (entry.provenance.determinism.kind === 'pinned') {
    const hash = sha256Hex(bytes)
    if (hash !== entry.provenance.determinism.contentHash) {
      issues.push(issueFor(entry, 'asset-hash-mismatch',
        `Asset "${entry.id}" bytes (sha256 ${hash.slice(0, 12)}…) do not match the pinned contentHash — regenerate or restore the pinned bytes`))
    }
  }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/asset-providers`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): verify pinned contentHash in media validation"
```

---

### Task 4: `@automata/asset-providers-ai` — package scaffold + `claude-svg` provider

**Files:**
- Create: `packages/asset-providers-ai/package.json`
- Create: `packages/asset-providers-ai/tsconfig.json`
- Create: `packages/asset-providers-ai/vitest.config.ts`
- Create: `packages/asset-providers-ai/src/claudeSvgProvider.ts`
- Create: `packages/asset-providers-ai/src/index.ts`
- Test: `packages/asset-providers-ai/tests/claudeSvgProvider.test.ts`

**Interfaces:**
- Consumes: `AssetProvider`, `AssetRequirement`, `ProviderContext` from `@automata/contracts`; `sha256Hex`, `svgPaletteColors` from `@automata/asset-providers`.
- Produces (used by Tasks 5, 6): `createClaudeSvgProvider(options?: { client?: MessagesClient; model?: string }): AssetProvider` (id `'claude-svg'`); `MessagesClient` interface; `AiProviderError` with `code: 'ai-auth-missing' | 'ai-refusal' | 'ai-malformed-output'`; `buildSvgPrompt`; `extractSvg`; `CLAUDE_SVG_MAX_BYTES = 65_536`.

- [x] **Step 1: Scaffold the package**

`packages/asset-providers-ai/package.json`:

```json
{
  "name": "@automata/asset-providers-ai",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.110.0",
    "@automata/asset-providers": "*",
    "@automata/contracts": "*"
  }
}
```

(If npm cannot resolve `^0.110.0`, use the current latest `@anthropic-ai/sdk` 0.x instead — the provider touches only `messages.create` and `AuthenticationError`, both stable across recent releases.)

`packages/asset-providers-ai/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/asset-providers-ai/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'asset-providers-ai', environment: 'node', include: ['tests/**/*.test.ts'] }
})
```

`packages/asset-providers-ai/src/index.ts`:

```ts
export * from './claudeSvgProvider'
```

Then run `npm install` at the repo root (links the workspace and fetches the SDK).

- [x] **Step 2: Write the failing tests**

`packages/asset-providers-ai/tests/claudeSvgProvider.test.ts`:

```ts
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

  it('throws ai-malformed-output when the response exceeds the byte cap', async () => {
    const huge = `<svg>${'x'.repeat(CLAUDE_SVG_MAX_BYTES)}</svg>`
    const provider = createClaudeSvgProvider({ client: clientReturning(huge) })
    await expect(provider.generate(requirement, ctx)).rejects.toMatchObject({ code: 'ai-malformed-output' })
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/asset-providers-ai`
Expected: FAIL — `../src/claudeSvgProvider` does not exist.

- [x] **Step 4: Implement `src/claudeSvgProvider.ts`**

```ts
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
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/asset-providers-ai`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/asset-providers-ai package-lock.json
git commit -m "feat(asset-providers-ai): claude-svg provider with pinned-hash provenance"
```

---

### Task 5: Opt-in live smoke test

**Files:**
- Create: `packages/asset-providers-ai/tests/live.test.ts`

**Interfaces:**
- Consumes: Task 4's `createClaudeSvgProvider` (real default client); `validateAssetMedia`, `deriveStyleParams`, `sha256Hex` from `@automata/asset-providers`.

- [x] **Step 1: Write the test (it must pass immediately by being skipped)**

`packages/asset-providers-ai/tests/live.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveStyleParams, sha256Hex, validateAssetMedia } from '@automata/asset-providers'
import type { AssetManifestEntry, AssetRequirement } from '@automata/contracts'
import { createClaudeSvgProvider } from '../src/claudeSvgProvider'

/**
 * Live smoke: proves the real network path (auth, request shape, SVG
 * extraction, pinned hash). Runs only when ANTHROPIC_API_KEY is set —
 * npm run ci stays offline-deterministic without it.
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('claude-svg live smoke', () => {
  it('generates a well-formed, hash-pinned ui icon', { timeout: 120_000 }, async () => {
    const provider = createClaudeSvgProvider()
    const style = deriveStyleParams({ visualStyle: 'warm lantern-lit dusk', audioStyle: 'calm' }, 42)
    const requirement: AssetRequirement = { id: 'live-icon', kind: 'ui', description: 'A small lantern icon.' }
    const { bytes, provenance } = await provider.generate(requirement, { seed: 7, style, specVersion: 1 })

    const text = new TextDecoder().decode(bytes)
    expect(text.trimStart().startsWith('<svg')).toBe(true)
    expect(provenance.determinism).toEqual({ kind: 'pinned', contentHash: sha256Hex(bytes) })

    // Full media validation may fail on palette compliance — that is the
    // pipeline's gate doing its job, not a smoke failure. Assert only the
    // structural half here and log the rest for observability.
    const entry: AssetManifestEntry = {
      id: requirement.id, requirement, path: 'assets/live-icon.svg',
      provenance, transformations: [], status: 'generated',
      references: ['public/project/composition.json']
    }
    const issues = validateAssetMedia(entry, bytes, style)
    expect(issues.filter((issue) => issue.code === 'asset-hash-mismatch')).toEqual([])
    expect(issues.filter((issue) => issue.code === 'asset-media-invalid' && issue.message.includes('does not parse'))).toEqual([])
    if (issues.length > 0) console.warn('live smoke: non-structural findings', issues)
  })
})
```

- [x] **Step 2: Verify the skip path (no key)**

Run: `env -u ANTHROPIC_API_KEY npx vitest run packages/asset-providers-ai/tests/live.test.ts`
Expected: the suite reports **skipped**, exit code 0.

- [x] **Step 3: Run the live path if a key is available (optional, not a gate)**

Run: `npx vitest run packages/asset-providers-ai/tests/live.test.ts`
Expected: PASS when `ANTHROPIC_API_KEY` is set; skipped otherwise. Do not wire this into any CI script.

- [x] **Step 4: Commit**

```bash
git add packages/asset-providers-ai
git commit -m "test(asset-providers-ai): opt-in live smoke gated on ANTHROPIC_API_KEY"
```

---

### Task 6: MCP asset tools — provider override + server wiring

**Files:**
- Modify: `tools/editor-mcp-server/src/assetTools.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts:48` (runner construction)
- Modify: `tools/editor-mcp-server/package.json` (add `"@automata/asset-providers-ai": "*"` to dependencies)
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts` (additive)

**Interfaces:**
- Consumes: Task 1's `provider` args; Task 2's `buildGeneratedAsset`; Task 4's `createClaudeSvgProvider`; existing `deriveStyleParams`, `hashStringToSeed`.
- Produces: `AssetToolDeps.namedProviders?: Record<string, AssetProvider>`; `generateAssets`/`regenerateAsset` route through a named provider when `provider` is passed; the regenerate guarded-step input includes the provider id.

- [x] **Step 1: Write the failing tests**

Append to `tools/editor-mcp-server/tests/assetTools.test.ts`. The file's fixtures are `setup(manifest)` (builds the runner via `createAssetToolRunner`) and `setupWithSpec(assets = [{ id: 'relic-icon', kind: 'ui', ... }, { id: 'pickup-blip', kind: 'audio', ... }])` (writes `gamespec.json` from `minimalGameSpecDraft('demo-game')` and returns `setup(null)`'s context). Thread the provider map through both — one optional trailing parameter each, forwarded into `createAssetToolRunner`:

```ts
async function setup(manifest: unknown | null, namedProviders?: Record<string, AssetProvider>) {
  // ...existing body unchanged, except the runner construction gains the field:
  const runner = createAssetToolRunner({
    repoRoot,
    ensureEngine: async () => engine,
    snapshotContent: async () => ({ hash: await readFile(manifestPath, 'utf8') }),
    namedProviders
  })
  // ...
}

async function setupWithSpec(
  assets: unknown[] = [
    { id: 'relic-icon', kind: 'ui', description: 'Icon.' },
    { id: 'pickup-blip', kind: 'audio', description: 'Blip.' }
  ],
  namedProviders?: Record<string, AssetProvider>
) {
  const context = await setup(null, namedProviders)
  // ...existing spec-writing body unchanged
}
```

Add these imports at the top: `sha256Hex` from `@automata/asset-providers`, `type AssetProvider` from `@automata/contracts`. Note the default spec declares **`relic-icon` (ui) and `pickup-blip` (audio)** — the AI-path tests below pass an explicit ui-only assets array (or explicit `assetIds`) because the fake AI provider supports only `ui`/`texture`, and the audio requirement is exactly what the kind-mismatch test exploits. Then:

```ts
const FAKE_AI_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" fill="none"/></svg>\n'
const fakeAiProvider: AssetProvider = {
  id: 'ai-fake', version: '1.0.0', kinds: ['ui', 'texture'],
  fileExtension: () => 'svg',
  async generate(requirement, ctx) {
    const bytes = new TextEncoder().encode(FAKE_AI_SVG)
    return {
      bytes,
      provenance: {
        provider: 'ai-fake', providerVersion: '1.0.0', generator: 'fake-model',
        sourceParams: { prompt: 'fake' }, seed: ctx.seed, specVersion: ctx.specVersion,
        determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
        license: { kind: 'generated', notes: 'test' }
      }
    }
  }
}

const UI_ONLY_ASSETS = [{ id: 'relic-icon', kind: 'ui', description: 'Icon.' }]

describe('provider override', () => {
  it('generateAssets with provider routes through the injected provider and pins the entry', async () => {
    const { runner, manifestPath } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    const result = await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' })
    expect(result.ok).toBe(true)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const entry = manifest.assets.find((candidate: { id: string }) => candidate.id === 'relic-icon')
    expect(entry.provenance.provider).toBe('ai-fake')
    expect(entry.provenance.determinism.kind).toBe('pinned')
    expect(entry.status).toBe('generated')
  })

  it('regenerateAsset with provider preserves the flow and re-guards under the provider key', async () => {
    const { runner } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    const procedural = await runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: 'relic-icon', seed: 7 })
    const viaAi = await runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: 'relic-icon', seed: 7, provider: 'ai-fake' })
    // Different guarded-step inputs: the AI regeneration must NOT be served
    // from the procedural step's cache.
    expect(viaAi.ok).toBe(true)
    expect((viaAi.content as { cached: boolean }).cached).toBe(false)
    expect((procedural.content as { id: string }).id).toBe('relic-icon')
  })

  it('rejects an unknown provider id, listing known providers', async () => {
    const { runner } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    await expect(runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'nope' }))
      .rejects.toThrow(/Unknown provider "nope".*ai-fake/)
  })

  it('rejects a provider that does not support a requirement kind', async () => {
    // Default spec assets include pickup-blip (audio); the fake provider is ui/texture only.
    const { runner } = await setupWithSpec(undefined, { 'ai-fake': fakeAiProvider })
    await expect(runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' }))
      .rejects.toThrow(/does not support kind "audio"/)
  })

  it('validateAssets flips a matching pinned entry to validated and a tampered one to failed', async () => {
    const { runner, repoRoot } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' })
    const clean = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect((clean.content as { statuses: Record<string, string> }).statuses['relic-icon']).toBe('validated')

    // Tamper with the pinned bytes on disk (keep it valid on-palette SVG so only the hash trips)
    await writeFile(join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'relic-icon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" fill="none"/></svg>\n')
    const tampered = await runner.execute('validateAssets', { gameId: 'demo-game' })
    const content = tampered.content as { statuses: Record<string, string>; issues: Array<{ code: string }> }
    expect(content.statuses['relic-icon']).toBe('failed')
    expect(content.issues.some((issue) => issue.code === 'asset-hash-mismatch')).toBe(true)
  })
})
```

Note the validate tests assert per-entry `statuses` and issue codes, **not** the overall `passed` flag — the fixture's composition still references `item-icon`, so structural `asset-missing`/`asset-orphaned` findings are expected alongside and don't affect per-entry status flips.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/editor-mcp-server/tests/assetTools.test.ts`
Expected: FAIL — `namedProviders` is not an accepted dep and `provider` is unused.

- [x] **Step 3: Implement the override in `assetTools.ts`**

Add imports:

```ts
import { buildGeneratedAsset, deriveStyleParams, generateGameAssets, validateAssetMedia } from '@automata/asset-providers'
import { hashStringToSeed } from '@automata/engine'
import type { AssetProvider, GameSpec } from '@automata/contracts'
```

(keep the existing named imports; only `buildGeneratedAsset`, `hashStringToSeed`, and the two types are new — `deriveStyleParams`, `generateGameAssets`, `validateAssetMedia` are already imported.)

Extend the deps interface:

```ts
export interface AssetToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
  snapshotContent(gameId: string): Promise<{ hash: string }>
  /** Non-default providers addressable via the tools' optional `provider` arg. */
  namedProviders?: Record<string, AssetProvider>
}
```

Add a module-level helper (below `mergeManifest`):

```ts
/** Route requirements through a named injected provider (the AI path). */
async function generateWithNamedProvider(
  deps: AssetToolDeps,
  spec: GameSpec,
  requirements: readonly GameSpec['assets'][number][],
  seed: number,
  providerId: string
) {
  const provider = deps.namedProviders?.[providerId]
  if (!provider) {
    const known = Object.keys(deps.namedProviders ?? {}).join(', ') || '(none)'
    throw new Error(`Unknown provider "${providerId}"; known providers: ${known}`)
  }
  const style = deriveStyleParams(spec.direction, seed)
  const generated = []
  for (const requirement of requirements) {
    if (!provider.kinds.includes(requirement.kind)) {
      throw new Error(`Provider "${providerId}" does not support kind "${requirement.kind}" (supports: ${provider.kinds.join(', ')})`)
    }
    generated.push(await buildGeneratedAsset(requirement, provider, {
      seed: hashStringToSeed(`${seed}:${requirement.id}`),
      style,
      specVersion: spec.specVersion
    }))
  }
  return generated
}
```

In the `regenerateAsset` branch: widen the args cast to
`{ gameId: string; assetId: string; seed?: number; provider?: string }`,
change the guarded-step input from
`{ assetId: args.assetId, seed, specVersion: spec.specVersion }` to
`{ assetId: args.assetId, seed, specVersion: spec.specVersion, provider: args.provider ?? null }`,
and replace the callback's generation call:

```ts
          async () => {
            const [generated] = args.provider
              ? await generateWithNamedProvider(deps, spec, [requirement], seed, args.provider)
              : await generateGameAssets({
                  requirements: [requirement], direction: spec.direction, seed, specVersion: spec.specVersion
                })
            return {
              ok: true,
              output: {
                path: generated!.path,
                entry: generated!.entry,
                bytesBase64: Buffer.from(generated!.bytes).toString('base64')
              }
            }
          }
```

In the `generateAssets` branch: widen the args cast to include `provider?: string`, and replace the generation call:

```ts
        const generated = args.provider
          ? await generateWithNamedProvider(deps, spec, requirements, seed, args.provider)
          : await generateGameAssets({
              requirements,
              direction: spec.direction,
              seed,
              specVersion: spec.specVersion
            })
```

Everything downstream (file writes, manifest merge, reference preservation, result shape) is unchanged.

- [x] **Step 4: Wire the real provider in `sessionHost.ts`**

Add `"@automata/asset-providers-ai": "*",` to `tools/editor-mcp-server/package.json` dependencies and run `npm install`. In `sessionHost.ts`, add the import and thread the provider map:

```ts
import { createClaudeSvgProvider } from '@automata/asset-providers-ai'
```

```ts
  const assetTools = createAssetToolRunner({
    repoRoot,
    ensureEngine,
    snapshotContent: contentSnapshot,
    namedProviders: { 'claude-svg': createClaudeSvgProvider() }
  })
```

(`createClaudeSvgProvider` constructs its SDK client lazily — server startup needs no key.)

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tools/editor-mcp-server`
Expected: PASS — new provider-override tests green, all existing assetTools tests untouched and green (the no-`provider` path is byte-identical).

- [x] **Step 6: Commit**

```bash
git add tools/editor-mcp-server package-lock.json
git commit -m "feat(editor-mcp-server): provider override on asset tools; wire claude-svg"
```

---

### Task 7: Gates and docs

**Files:**
- Modify: `docs/ROADMAP.md` (Phase 5 section)
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` (phase-map row, line ~91)

- [x] **Step 1: Full gates**

Run: `npm run ci`
Expected: lint, typecheck, and all workspace tests PASS (live smoke skipped — verify the output shows it as skipped, not failed).

Run: `npm run verify:new-game`
Expected: PASS.

Run: `git status --porcelain games/first-light`
Expected: empty output.

- [x] **Step 2: Update the roadmap**

In `docs/ROADMAP.md`, Phase 5 section: flip the phase heading from
`In progress (extension cycle)` back to `Shipped`, and replace cycle 4's
entry (currently a multi-line `Next` item carrying spec + plan links) with
a `Shipped` line keeping the plan link:

```markdown
  - Cycle 4 — first AI provider adapter (claude-svg, pinned-hash
    determinism; extension beyond the original three-cycle scope) —
    `Shipped` (<ship date>, plan:
    [`2026-07-17-phase-5-cycle-4-ai-provider.md`](superpowers/plans/active/2026-07/week-29/2026-07-17-phase-5-cycle-4-ai-provider.md)).
```

In the week-28 phase-map table, replace the Phase 5 row's status cell
(currently `4 (3 completed 2026-07-17; extension cycle 4 specced + planned 2026-07-17)`)
with `4 completed (<ship date>)`.

- [x] **Step 3: Commit**

```bash
git add docs/ROADMAP.md \
  docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md
git commit -m "docs: Phase 5 cycle 4 shipped - first AI provider adapter"
```

---

## Verification checklist (all must be true before calling the cycle done)

- [x] `npx vitest run packages/asset-providers-ai` — unit tests green, live smoke skipped without a key
- [x] `npx vitest run packages/asset-providers packages/game-compose` — green with zero snapshot updates (procedural path byte-identical)
- [x] `npx vitest run tools/editor-mcp-server` — provider override + pinned validation round-trip green
- [x] `npm run ci` green offline; `npm run verify:new-game` green
- [x] `git status --porcelain games/first-light` empty
- [x] Asset-pipeline SDK boundary: `@automata/asset-providers-ai` owns SDK 0.110.x; procedural providers, compose, and MCP server have no direct SDK dependency (pre-existing `@automata/agent-core` 0.69.x unchanged)
- [x] ROADMAP cycle 4 line + phase-map row updated

---

## Review-hardening appendix (2026-07-20)

Approved remediation design:
[`2026-07-18-phase-5-cycle-4-ai-provider-review-hardening-design.md`](../../../../specs/active/2026-07/week-29/2026-07-18-phase-5-cycle-4-ai-provider-review-hardening-design.md).
This appendix reopens Cycle 4 until the security, integrity, persistence, cache,
error, and concurrency regressions below are green.

### Task 8: Strict shared SVG safety boundary

**Files:**
- Create: `packages/asset-providers/src/validateSvg.ts`
- Modify: `packages/asset-providers/src/validateMedia.ts`
- Modify: `packages/asset-providers/src/index.ts`
- Modify: `packages/asset-providers/package.json`
- Modify: `packages/asset-providers-ai/src/claudeSvgProvider.ts`
- Test: `packages/asset-providers/tests/validateMedia.test.ts`
- Test: `packages/asset-providers-ai/tests/claudeSvgProvider.test.ts`

**Interfaces:**
- Produce `validateSvgDocument(text: string, allowedColors?: readonly string[]): string[]`.
- Use `saxes@^6.0.0` for XML well-formedness and event parsing.
- Accept only the approved element/attribute subset, local fragment references,
  and `none`, literal palette colors, or local paint references.

- [x] **Step 1:** Add regressions for scripts, handlers, declarations, unknown markup,
  external references, multiple roots, and single-quoted off-palette paint.
- [x] **Step 2:** Run `npx vitest run packages/asset-providers/tests/validateMedia.test.ts packages/asset-providers-ai/tests/claudeSvgProvider.test.ts`; verify the new cases fail for the unsafe behavior.
- [x] **Step 3:** Install `saxes`, implement/export `validateSvgDocument`, route disk validation through it, and map Claude-side failures to `ai-malformed-output` before bytes return.
- [x] **Step 4:** Re-run the two focused files and `npx vitest run packages/asset-providers packages/asset-providers-ai`; verify green with the live smoke skipped when no key is present.
- [x] **Step 5:** Commit the strict SVG boundary.

### Task 9: Integrity, style seed, preflight, and manifest merge

**Files:**
- Modify: `packages/asset-providers/src/generate.ts`
- Modify: `tools/editor-mcp-server/src/assetTools.ts`
- Test: `packages/asset-providers/tests/generate.test.ts`
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts`

**Interfaces:**
- Extend `BuildAssetInput` with `styleSeed?: number`; when supplied, merge it into
  `provenance.sourceParams` without changing procedural output.
- Always call `validateAssetMedia`; pass per-entry style reconstructed from
  `sourceParams.styleSeed`, composition seed, or zero only when a spec exists.
- Parse existing manifests and preflight all selected kinds before provider work.
- Replace entries in place while preserving their manifest-owned `references`.

- [x] **Step 1:** Add regressions for no-spec pinned tampering, explicit style seed,
  retained references, zero calls on unsupported kinds, and zero calls/mutations for malformed manifests.
- [x] **Step 2:** Run the focused generate and asset-tool tests; verify each new regression fails for the observed reason.
- [x] **Step 3:** Implement optional `styleSeed`, unconditional integrity/media validation,
  preflight-before-generation, and stable reference-preserving manifest merge.
- [x] **Step 4:** Re-run `npx vitest run packages/asset-providers tools/editor-mcp-server/tests/assetTools.test.ts`; verify green and procedural golden hashes unchanged.
- [x] **Step 5:** Commit integrity and preflight hardening.

### Task 10: Atomic asset persistence and same-game serialization

**Files:**
- Modify: `tools/editor-mcp-server/src/assetTools.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts`
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts`

**Interfaces:**
- Add `AssetToolDeps.writeFiles?: typeof writeComposedFiles`; default to the existing
  contained transactional writer.
- Persist asset binaries first and `public/assets/assets.json` last in one staged operation.
- Serialize `generateAssets`, `regenerateAsset`, and `validateAssets` per game and
  acquire the durable session engine before mutation.

- [x] **Step 1:** Add regressions for rollback/temporary-file cleanup, manifest-last
  ordering, and concurrent disjoint generation retaining both entries.
- [x] **Step 2:** Run the focused asset-tool tests; verify the new persistence and concurrency cases fail.
- [x] **Step 3:** Route both generation paths through staged transactional writes and
  add a per-game mutation queue that continues after failed operations.
- [x] **Step 4:** Re-run `npx vitest run tools/editor-mcp-server`; verify green with no staging debris.
- [x] **Step 5:** Commit atomic persistence and serialization.

### Task 11: Provider fingerprint, typed errors, and replay descriptions

**Files:**
- Modify: `packages/contracts/src/assetProvider.ts`
- Modify: `packages/contracts/src/assetTools.ts`
- Modify: `packages/contracts/tests/assetTools.test.ts`
- Modify: `packages/asset-providers-ai/src/claudeSvgProvider.ts`
- Modify: `packages/asset-providers-ai/tests/claudeSvgProvider.test.ts`
- Modify: `tools/editor-mcp-server/src/assetTools.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts`
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts`
- Test: `tools/editor-mcp-server/tests/sessionHost.test.ts`

**Interfaces:**
- Add optional `AssetProvider.cacheKey`; Claude uses
  `claude-svg@1.0.0:model=<model>`, other named providers fall back to `id@version`.
- Provider-selection errors expose `asset-provider-unknown` and
  `asset-provider-kind-unsupported`; session results preserve `{ code, message }`.
- Descriptions explicitly separate seeded procedural replay from pinned named output.

- [ ] **Step 1:** Add regressions for model/version cache invalidation, typed host
  content, prototype-looking provider ids, and corrected tool descriptions.
- [ ] **Step 2:** Run the focused contracts, AI-provider, asset-tool, and session-host tests; verify red.
- [ ] **Step 3:** Implement cache fingerprints, own-property provider lookup, typed
  provider errors, coded host error preservation, and accurate descriptions.
- [ ] **Step 4:** Re-run the affected package suites and verify green.
- [ ] **Step 5:** Commit provider cache and error contracts.

### Task 12: Full gates and shipped-state restoration

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`
- Modify: this plan

- [ ] **Step 1:** Run `npx vitest run packages/contracts packages/asset-providers packages/asset-providers-ai tools/editor-mcp-server` and verify the live smoke is skipped without `ANTHROPIC_API_KEY`.
- [ ] **Step 2:** Run `npm run ci`; verify lint, typecheck, and every offline workspace test pass.
- [ ] **Step 3:** Run `npm run verify:new-game` and `git status --porcelain games/first-light`; verify scaffold acceptance passes and first-light is untouched.
- [ ] **Step 4:** Restore Phase 5/Cycle 4 to `Shipped`, set review-hardening and overall progress to 100%, and check every appendix step.
- [ ] **Step 5:** Commit the verified documentation closeout.
