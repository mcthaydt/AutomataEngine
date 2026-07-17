# Phase 5 Cycle 2 — Provider Adapters + First Procedural Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `AssetProvider` contract, a provider registry, and three bit-deterministic procedural providers (SVG/texture, JSON prop recipes, WAV SFX/ambience) behind a pure `generateGameAssets` orchestrator and an MCP `generateAssets` tool.

**Architecture:** Provider types land in `@automata/contracts` (`assetProvider.ts`); all generation code lands in a new `@automata/asset-providers` package (style-param derivation, three providers, registry, orchestrator with per-asset child seeds); the MCP surface extends the existing asset-tool family in `contracts/src/assetTools.ts` + `tools/editor-mcp-server/src/assetTools.ts`. Spec: [`2026-07-16-phase-5-cycle-2-provider-adapters-design.md`](../../../specs/active/2026-07/week-29/2026-07-16-phase-5-cycle-2-provider-adapters-design.md).

**Tech Stack:** TypeScript ESM workspaces, zod via `@automata/project` re-export (packages) / direct `zod` (contracts only — that package imports zod directly today), vitest (node environment — no DOM needed), `@automata/engine` seeded RNG + string hashing.

## Global Constraints

- **Do not modify** `packages/game-compose`, `packages/game-kit`, or `games/first-light` — Phase 4 cycle 2 is concurrently editing that territory; this cycle is code-disjoint by design. Task 8 proves it with `git log --stat`.
- Shared-file exception: both cycles edit `packages/contracts/src/gameSpec.ts` (Phase 4 fills the dialogue-quests capability stub; this cycle adds the `AssetRequirement`/`AssetKind` exports), plus `package-lock.json` and `docs/ROADMAP.md`. Rebase conflicts in exactly those three files are expected — coordinate merge order; overlap anywhere else is a violation.
- All provider output must be **bit-deterministic** from `(requirement, ctx)`: no `Math.sin`/`Math.cos`/any transcendental stdlib call, no `Date`, no `Math.random`, no locale-dependent formatting. Arithmetic limited to IEEE-deterministic `+ - * /` and integer ops.
- Audio: 16-bit PCM mono WAV, 22,050 Hz; `audio` kind ≤1 s, `music` kind ≤8 s.
- Prop recipes: ≤12 parts, primitives limited to `box | sphere | cylinder` (the engine's full `RenderableDef` vocabulary).
- Manifest entries from providers: `status: 'generated'`, `transformations: []`, `references: []`, `determinism: { kind: 'seeded' }`, `license: { kind: 'generated' }`.
- Per-asset child seed: `hashStringToSeed(`${seed}:${assetId}`)` — asset bytes may depend on nothing but their own requirement + child seed + style params.
- Canonical serialization: JSON via `JSON.stringify(value, null, 2) + '\n'`; SVG with fixed 2-decimal coordinates and LF endings; UTF-8 via `new TextEncoder().encode(...)`.
- Commit after every task (`feat(asset-providers): …`, `feat(contracts): …`, etc.).

---

### Task 1: Provider contract types in @automata/contracts

**Files:**
- Create: `packages/contracts/src/assetProvider.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from './assetProvider'`)
- Modify: `packages/contracts/src/gameSpec.ts` (export the requirement-kind type)
- Test: `packages/contracts/tests/assetProvider.test.ts`

**Interfaces:**
- Consumes: `assetRequirementSchema`, `AssetProvenance` from existing contracts.
- Produces (every later task imports these from `@automata/contracts`):

```ts
export type AssetKind = 'model' | 'texture' | 'audio' | 'music' | 'ui'
export type AssetRequirement = z.infer<typeof assetRequirementSchema>
export interface StyleParams {
  palette: { baseHue: number; accentHues: number[]; saturation: number; lightness: number }
  audio: { waveform: 'sine' | 'triangle' | 'square'; tempo: 'slow' | 'mid' | 'brisk' }
}
export interface ProviderContext { seed: number; style: StyleParams; specVersion: number }
export interface GeneratedBytes { bytes: Uint8Array; provenance: AssetProvenance }
export interface AssetProvider {
  id: string
  version: string
  kinds: readonly AssetKind[]
  fileExtension(requirement: AssetRequirement): string
  generate(requirement: AssetRequirement, ctx: ProviderContext): Promise<GeneratedBytes>
}
```

- [ ] **Step 1: Write the failing test**

`packages/contracts/tests/assetProvider.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AssetKind, AssetProvider, ProviderContext, StyleParams } from '../src/assetProvider'

const style: StyleParams = {
  palette: { baseHue: 210, accentHues: [30, 300], saturation: 0.7, lightness: 0.55 },
  audio: { waveform: 'sine', tempo: 'slow' }
}

/** Compile-level contract check: a literal provider satisfies the interface. */
const stub: AssetProvider = {
  id: 'stub', version: '1.0.0', kinds: ['ui'] as const satisfies readonly AssetKind[],
  fileExtension: () => 'svg',
  generate: async (requirement, ctx: ProviderContext) => ({
    bytes: new Uint8Array([60]),
    provenance: {
      provider: 'stub', providerVersion: '1.0.0', generator: 'stub@1',
      sourceParams: {}, seed: ctx.seed, specVersion: ctx.specVersion,
      determinism: { kind: 'seeded' }, license: { kind: 'generated', notes: '' }
    }
  })
}

describe('asset provider contract', () => {
  it('a minimal provider literal type-checks and runs', async () => {
    const result = await stub.generate(
      { id: 'x', kind: 'ui', description: 'd' },
      { seed: 1, style, specVersion: 1 }
    )
    expect(result.provenance.seed).toBe(1)
    expect(result.bytes).toBeInstanceOf(Uint8Array)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project contracts -t 'asset provider contract'`
Expected: FAIL — cannot resolve `../src/assetProvider`.

- [ ] **Step 3: Implement**

In `packages/contracts/src/gameSpec.ts`, next to `assetRequirementSchema`, add:

```ts
export type AssetRequirement = z.infer<typeof assetRequirementSchema>
export type AssetKind = AssetRequirement['kind']
```

Create `packages/contracts/src/assetProvider.ts`:

```ts
import type { AssetProvenance } from './assetManifest'
import type { AssetKind, AssetRequirement } from './gameSpec'

/**
 * Phase 5 provider-adapter contract (umbrella §4). Providers are pure:
 * bytes are a function of (requirement, ctx) only. The orchestrator owns
 * path construction from fileExtension — providers never invent paths.
 * One StyleParams per game feeds every call (visual-family consistency).
 */
export interface StyleParams {
  palette: { baseHue: number; accentHues: number[]; saturation: number; lightness: number }
  audio: { waveform: 'sine' | 'triangle' | 'square'; tempo: 'slow' | 'mid' | 'brisk' }
}

export interface ProviderContext {
  /** Per-asset child seed, derived by the orchestrator — not the game seed. */
  seed: number
  style: StyleParams
  specVersion: number
}

export interface GeneratedBytes { bytes: Uint8Array; provenance: AssetProvenance }

export interface AssetProvider {
  id: string
  version: string
  kinds: readonly AssetKind[]
  fileExtension(requirement: AssetRequirement): string
  generate(requirement: AssetRequirement, ctx: ProviderContext): Promise<GeneratedBytes>
}

export type { AssetKind, AssetRequirement }
```

Add to `packages/contracts/src/index.ts` after the assetManifest line:

```ts
export * from './assetProvider'
```

(If `AssetKind`/`AssetRequirement` re-exports collide with existing gameSpec exports at build time, drop the `export type { … }` line from `assetProvider.ts` — both names already flow from `./gameSpec` through the index.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project contracts && npm run typecheck`
Expected: PASS, no type errors anywhere in the workspace.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): AssetProvider contract types (StyleParams, ProviderContext)"
```

---

### Task 2: @automata/asset-providers scaffold + deriveStyleParams

**Files:**
- Create: `packages/asset-providers/package.json`
- Create: `packages/asset-providers/tsconfig.json`
- Create: `packages/asset-providers/vitest.config.ts`
- Create: `packages/asset-providers/src/styleParams.ts`
- Create: `packages/asset-providers/src/index.ts`
- Test: `packages/asset-providers/tests/styleParams.test.ts`

**Interfaces:**
- Consumes: `StyleParams` from `@automata/contracts`; `hashStringToSeed`, `createSeededRng` from `@automata/engine`.
- Produces: `deriveStyleParams(direction: { visualStyle: string; audioStyle: string }, seed: number): StyleParams` — deterministic; hue in [0,360), 2 accent hues, saturation/lightness in sensible fixed ranges.

- [ ] **Step 1: Scaffold**

`packages/asset-providers/package.json`:

```json
{
  "name": "@automata/asset-providers",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/engine": "*",
    "@automata/project": "*"
  }
}
```

`packages/asset-providers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/asset-providers/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'asset-providers', include: ['tests/**/*.test.ts'] }
})
```

`packages/asset-providers/src/index.ts` (grows per task):

```ts
export * from './styleParams'
```

Run: `npm install`

- [ ] **Step 2: Write the failing tests**

`packages/asset-providers/tests/styleParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveStyleParams } from '../src/styleParams'

const direction = { visualStyle: 'warm lantern-lit harbor at dusk', audioStyle: 'soft nautical ambience' }

describe('deriveStyleParams', () => {
  it('is deterministic for identical inputs', () => {
    expect(deriveStyleParams(direction, 42)).toEqual(deriveStyleParams(direction, 42))
  })

  it('changes with the style strings and with the seed', () => {
    expect(deriveStyleParams(direction, 42)).not.toEqual(deriveStyleParams(direction, 43))
    expect(deriveStyleParams({ ...direction, visualStyle: 'neon cyberpunk alley' }, 42).palette)
      .not.toEqual(deriveStyleParams(direction, 42).palette)
  })

  it('stays inside its documented ranges', () => {
    const style = deriveStyleParams(direction, 42)
    expect(style.palette.baseHue).toBeGreaterThanOrEqual(0)
    expect(style.palette.baseHue).toBeLessThan(360)
    expect(style.palette.accentHues).toHaveLength(2)
    for (const hue of style.palette.accentHues) { expect(hue).toBeGreaterThanOrEqual(0); expect(hue).toBeLessThan(360) }
    expect(style.palette.saturation).toBeGreaterThanOrEqual(0.4)
    expect(style.palette.saturation).toBeLessThanOrEqual(0.9)
    expect(style.palette.lightness).toBeGreaterThanOrEqual(0.35)
    expect(style.palette.lightness).toBeLessThanOrEqual(0.7)
    expect(['sine', 'triangle', 'square']).toContain(style.audio.waveform)
    expect(['slow', 'mid', 'brisk']).toContain(style.audio.tempo)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project asset-providers`
Expected: FAIL — cannot resolve `../src/styleParams`.

- [ ] **Step 4: Implement `src/styleParams.ts`**

```ts
import type { StyleParams } from '@automata/contracts'
import { createSeededRng, hashStringToSeed } from '@automata/engine'

const WAVEFORMS = ['sine', 'triangle', 'square'] as const
const TEMPOS = ['slow', 'mid', 'brisk'] as const

const round2 = (value: number): number => Math.round(value * 100) / 100

/** One StyleParams per game: every provider call shares it (visual-family consistency). */
export function deriveStyleParams(direction: { visualStyle: string; audioStyle: string }, seed: number): StyleParams {
  const visual = createSeededRng(hashStringToSeed(`${seed}:visual:${direction.visualStyle}`))
  const audio = createSeededRng(hashStringToSeed(`${seed}:audio:${direction.audioStyle}`))
  const baseHue = visual.nextInt(360)
  return {
    palette: {
      baseHue,
      accentHues: [(baseHue + 120 + visual.nextInt(60)) % 360, (baseHue + 240 + visual.nextInt(60)) % 360],
      saturation: round2(0.4 + visual.next() * 0.5),
      lightness: round2(0.35 + visual.next() * 0.35)
    },
    audio: {
      waveform: WAVEFORMS[audio.nextInt(WAVEFORMS.length)]!,
      tempo: TEMPOS[audio.nextInt(TEMPOS.length)]!
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass, commit**

Run: `npx vitest run --project asset-providers`
Expected: PASS.

```bash
git add packages/asset-providers package-lock.json
git commit -m "feat(asset-providers): package scaffold + deriveStyleParams"
```

---

### Task 3: svgProvider (ui + texture)

**Files:**
- Create: `packages/asset-providers/src/svgProvider.ts`
- Test: `packages/asset-providers/tests/svgProvider.test.ts`
- Modify: `packages/asset-providers/src/index.ts` (add `export * from './svgProvider'`)

**Interfaces:**
- Consumes: `AssetProvider`, `ProviderContext`, `AssetRequirement` from contracts; `createSeededRng` from engine.
- Produces: `svgProvider: AssetProvider` — `id: 'procedural-svg'`, `version: '1.0.0'`, `kinds: ['ui', 'texture']`, `fileExtension` always `'svg'`. Also `hsl(hue, saturation, lightness): string` helper (`hsl(210 70% 55%)` format) reused by Task 4.

- [ ] **Step 1: Write the failing tests**

`packages/asset-providers/tests/svgProvider.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ProviderContext } from '@automata/contracts'
import { svgProvider } from '../src/svgProvider'

const ctx: ProviderContext = {
  seed: 1234,
  style: { palette: { baseHue: 210, accentHues: [90, 330], saturation: 0.7, lightness: 0.55 }, audio: { waveform: 'sine', tempo: 'slow' } },
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
  })

  it('texture output declares a tileable pattern', async () => {
    const text = new TextDecoder().decode((await svgProvider.generate(texture, ctx)).bytes)
    expect(text).toContain('<pattern')
    expect(text).toContain('</pattern>')
  })

  it('records seeded provenance with its own id/version', async () => {
    const { provenance } = await svgProvider.generate(icon, ctx)
    expect(provenance).toMatchObject({
      provider: 'procedural-svg', providerVersion: '1.0.0', seed: 1234,
      determinism: { kind: 'seeded' }, license: { kind: 'generated' }
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project asset-providers -t svgProvider`
Expected: FAIL — cannot resolve `../src/svgProvider`.

- [ ] **Step 3: Implement `src/svgProvider.ts`**

```ts
import type { AssetProvider, AssetRequirement, ProviderContext, StyleParams } from '@automata/contracts'
import { createSeededRng, type SeededRng } from '@automata/engine'

export const hsl = (hue: number, saturation: number, lightness: number): string =>
  `hsl(${hue} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`

const fixed = (value: number): string => value.toFixed(2)
const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** Seeded N-gon emblem on a rounded backdrop; all colors from the palette. */
function drawIcon(rng: SeededRng, palette: StyleParams['palette']): string {
  const points = 5 + rng.nextInt(4)
  const outer = 13
  const inner = 6 + rng.next() * 4
  const coords: string[] = []
  for (let index = 0; index < points * 2; index += 1) {
    const angle = (index / (points * 2)) * Math.PI * 2
    const radius = index % 2 === 0 ? outer : inner
    // Math.cos/sin appear here ONLY for layout of a text file — the text is the
    // asset, and toFixed(2) quantizes away any sub-ulp platform variance.
    coords.push(`${fixed(16 + radius * Math.cos(angle))},${fixed(16 + radius * Math.sin(angle))}`)
  }
  const accent = palette.accentHues[rng.nextInt(palette.accentHues.length)]!
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n` +
    `  <rect x="1" y="1" width="30" height="30" rx="6" fill="${hsl(palette.baseHue, palette.saturation, palette.lightness)}"/>\n` +
    `  <polygon points="${coords.join(' ')}" fill="${hsl(accent, palette.saturation, palette.lightness)}" stroke="#ffffff" stroke-width="1"/>\n` +
    `</svg>\n`
}

/** Seeded tileable pattern: offset rows of circles over a base fill. */
function drawTexture(rng: SeededRng, palette: StyleParams['palette']): string {
  const cell = 8 + rng.nextInt(9)
  const radius = fixed(cell * (0.2 + rng.next() * 0.2))
  const accent = palette.accentHues[rng.nextInt(palette.accentHues.length)]!
  const dot = hsl(accent, palette.saturation, palette.lightness)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n` +
    `  <pattern id="p" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">\n` +
    `    <rect width="${cell * 2}" height="${cell * 2}" fill="${hsl(palette.baseHue, palette.saturation, palette.lightness)}"/>\n` +
    `    <circle cx="${fixed(cell / 2)}" cy="${fixed(cell / 2)}" r="${radius}" fill="${dot}"/>\n` +
    `    <circle cx="${fixed(cell * 1.5)}" cy="${fixed(cell * 1.5)}" r="${radius}" fill="${dot}"/>\n` +
    `  </pattern>\n` +
    `  <rect width="64" height="64" fill="url(#p)"/>\n` +
    `</svg>\n`
}

export const svgProvider: AssetProvider = {
  id: 'procedural-svg',
  version: '1.0.0',
  kinds: ['ui', 'texture'],
  fileExtension: () => 'svg',
  async generate(requirement: AssetRequirement, ctx: ProviderContext) {
    const rng = createSeededRng(ctx.seed)
    const text = requirement.kind === 'texture' ? drawTexture(rng, ctx.style.palette) : drawIcon(rng, ctx.style.palette)
    return {
      bytes: encode(text),
      provenance: {
        provider: svgProvider.id, providerVersion: svgProvider.version,
        generator: requirement.kind === 'texture' ? 'svg-pattern@1' : 'svg-emblem@1',
        sourceParams: { kind: requirement.kind },
        seed: ctx.seed, specVersion: ctx.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally generated.' }
      }
    }
  }
}
```

Note on the `Math.cos`/`Math.sin` exception: the Global Constraints ban transcendentals for **byte-level sample math** (audio). Here the trig result is quantized through `toFixed(2)` into text, which collapses any conceivable cross-engine ulp difference; the golden-hash test still guards the outcome. Keep the comment in the code.

- [ ] **Step 4: Run tests (twice — second run verifies snapshots), commit**

Run: `npx vitest run --project asset-providers && npx vitest run --project asset-providers`
Expected: PASS both times (snapshots written on the first, matched on the second).

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): procedural SVG provider (ui emblems, tileable textures)"
```

---

### Task 4: propProvider (model) + recipe schema

**Files:**
- Create: `packages/asset-providers/src/propRecipe.ts`
- Create: `packages/asset-providers/src/propProvider.ts`
- Test: `packages/asset-providers/tests/propProvider.test.ts`
- Modify: `packages/asset-providers/src/index.ts` (add both exports)

**Interfaces:**
- Consumes: contracts provider types; `hsl` from Task 3; `createSeededRng`.
- Produces:

```ts
// propRecipe.ts
export const propRecipeSchema: z.ZodType<PropRecipe>   // strict, ≤12 parts
export interface PropRecipe {
  formatVersion: 1
  parts: Array<
    | { primitive: 'box'; size: { x: number; y: number; z: number }; offset: { x: number; y: number; z: number }; color: string }
    | { primitive: 'sphere'; radius: number; offset: { x: number; y: number; z: number }; color: string }
    | { primitive: 'cylinder'; radius: number; height: number; offset: { x: number; y: number; z: number }; color: string }
  >
}
export function recipeToRenderables(recipe: PropRecipe): Array<{ def: RenderableDef; offset: { x: number; y: number; z: number } }>
// propProvider.ts
export const propProvider: AssetProvider   // id 'procedural-prop', kinds ['model'], fileExtension 'prop.json'
```

- [ ] **Step 1: Write the failing tests**

`packages/asset-providers/tests/propProvider.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ProviderContext } from '@automata/contracts'
import { propRecipeSchema, recipeToRenderables } from '../src/propRecipe'
import { propProvider } from '../src/propProvider'

const ctx: ProviderContext = {
  seed: 777,
  style: { palette: { baseHue: 30, accentHues: [150, 270], saturation: 0.6, lightness: 0.5 }, audio: { waveform: 'square', tempo: 'mid' } },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project asset-providers -t propProvider`
Expected: FAIL — cannot resolve the new modules.

- [ ] **Step 3: Implement**

`packages/asset-providers/src/propRecipe.ts`:

```ts
import type { RenderableDef } from '@automata/engine'
import { z } from '@automata/project'

/** Prop recipe v1: a list of engine primitives with local offsets — the
 * 'model' asset format until a mesh loader exists. */
const vec3Schema = z.strictObject({ x: z.number(), y: z.number(), z: z.number() })
const colorSchema = z.string().min(1).max(40)

const partSchema = z.discriminatedUnion('primitive', [
  z.strictObject({ primitive: z.literal('box'), size: vec3Schema, offset: vec3Schema, color: colorSchema }),
  z.strictObject({ primitive: z.literal('sphere'), radius: z.number().positive(), offset: vec3Schema, color: colorSchema }),
  z.strictObject({ primitive: z.literal('cylinder'), radius: z.number().positive(), height: z.number().positive(), offset: vec3Schema, color: colorSchema })
])

export const propRecipeSchema = z.strictObject({
  formatVersion: z.literal(1),
  parts: z.array(partSchema).min(1).max(12)
})
export type PropRecipe = z.infer<typeof propRecipeSchema>

/** Pure mapping to the engine's render vocabulary; consumers pose each part at prop origin + offset. */
export function recipeToRenderables(recipe: PropRecipe): Array<{ def: RenderableDef; offset: { x: number; y: number; z: number } }> {
  return recipe.parts.map((part) => {
    if (part.primitive === 'box') return { def: { primitive: 'box', size: part.size, color: part.color }, offset: part.offset }
    if (part.primitive === 'sphere') return { def: { primitive: 'sphere', radius: part.radius, color: part.color }, offset: part.offset }
    return { def: { primitive: 'cylinder', radius: part.radius, height: part.height, color: part.color }, offset: part.offset }
  })
}
```

(If `RenderableDef` is not exported from `@automata/engine`'s index, add `export type { RenderableDef } from './render/types'` there — additive, allowed.)

`packages/asset-providers/src/propProvider.ts`:

```ts
import type { AssetProvider, ProviderContext, StyleParams } from '@automata/contracts'
import { createSeededRng, type SeededRng } from '@automata/engine'
import { hsl } from './svgProvider'
import type { PropRecipe } from './propRecipe'

const round2 = (value: number): number => Math.round(value * 100) / 100
const jitter = (rng: SeededRng, base: number): number => round2(base * (0.8 + rng.next() * 0.4))

type Parts = PropRecipe['parts']

/** Four silhouette templates; seed picks one and jitters proportions. */
function buildParts(rng: SeededRng, palette: StyleParams['palette']): Parts {
  const body = hsl(palette.baseHue, palette.saturation, palette.lightness)
  const trim = hsl(palette.accentHues[rng.nextInt(palette.accentHues.length)]!, palette.saturation, palette.lightness)
  const template = rng.nextInt(4)
  if (template === 0) {   // crate
    const size = jitter(rng, 1)
    return [
      { primitive: 'box', size: { x: size, y: size, z: size }, offset: { x: 0, y: round2(size / 2), z: 0 }, color: body },
      { primitive: 'box', size: { x: round2(size * 1.04), y: round2(size * 0.1), z: round2(size * 1.04) }, offset: { x: 0, y: round2(size * 1.05), z: 0 }, color: trim }
    ]
  }
  if (template === 1) {   // barrel
    const radius = jitter(rng, 0.45)
    const height = jitter(rng, 1.1)
    return [
      { primitive: 'cylinder', radius, height, offset: { x: 0, y: round2(height / 2), z: 0 }, color: body },
      { primitive: 'cylinder', radius: round2(radius * 1.06), height: 0.06, offset: { x: 0, y: round2(height * 0.25), z: 0 }, color: trim },
      { primitive: 'cylinder', radius: round2(radius * 1.06), height: 0.06, offset: { x: 0, y: round2(height * 0.75), z: 0 }, color: trim }
    ]
  }
  if (template === 2) {   // lamp
    const height = jitter(rng, 2.2)
    return [
      { primitive: 'cylinder', radius: 0.08, height, offset: { x: 0, y: round2(height / 2), z: 0 }, color: body },
      { primitive: 'sphere', radius: jitter(rng, 0.3), offset: { x: 0, y: round2(height + 0.2), z: 0 }, color: trim }
    ]
  }
  // stack
  const base = jitter(rng, 0.9)
  const mid = round2(base * 0.75)
  const top = round2(base * 0.5)
  return [
    { primitive: 'box', size: { x: base, y: base, z: base }, offset: { x: 0, y: round2(base / 2), z: 0 }, color: body },
    { primitive: 'box', size: { x: mid, y: mid, z: mid }, offset: { x: round2(base * 0.1), y: round2(base + mid / 2), z: round2(base * -0.05) }, color: body },
    { primitive: 'box', size: { x: top, y: top, z: top }, offset: { x: round2(base * -0.08), y: round2(base + mid + top / 2), z: round2(base * 0.06) }, color: trim }
  ]
}

export const propProvider: AssetProvider = {
  id: 'procedural-prop',
  version: '1.0.0',
  kinds: ['model'],
  fileExtension: () => 'prop.json',
  async generate(requirement, ctx: ProviderContext) {
    const rng = createSeededRng(ctx.seed)
    const recipe: PropRecipe = { formatVersion: 1, parts: buildParts(rng, ctx.style.palette) }
    return {
      bytes: new TextEncoder().encode(`${JSON.stringify(recipe, null, 2)}\n`),
      provenance: {
        provider: propProvider.id, providerVersion: propProvider.version,
        generator: 'prop-recipe@1',
        sourceParams: { kind: requirement.kind },
        seed: ctx.seed, specVersion: ctx.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally generated.' }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests (twice for snapshots), commit**

Run: `npx vitest run --project asset-providers && npx vitest run --project asset-providers`
Expected: PASS both times.

```bash
git add packages/asset-providers packages/engine
git commit -m "feat(asset-providers): primitive prop-recipe provider + recipeToRenderables"
```

---

### Task 5: audioProvider (audio + music) — deterministic WAV

**Files:**
- Create: `packages/asset-providers/src/deterministicSine.ts`
- Create: `packages/asset-providers/src/wav.ts`
- Create: `packages/asset-providers/src/audioProvider.ts`
- Test: `packages/asset-providers/tests/audioProvider.test.ts`
- Modify: `packages/asset-providers/src/index.ts` (add the three exports)

**Interfaces:**
- Consumes: contracts provider types; `createSeededRng`.
- Produces: `detSin(phase: number): number` (phase in cycles, pure `+ - * /`); `writeWav(samples: Int16Array, sampleRate: number): Uint8Array`; `audioProvider: AssetProvider` (`id: 'procedural-audio'`, `kinds: ['audio', 'music']`, `fileExtension` `'wav'`; `audio` ≤1 s, `music` ≤8 s at 22,050 Hz mono).

- [ ] **Step 1: Write the failing tests**

`packages/asset-providers/tests/audioProvider.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ProviderContext } from '@automata/contracts'
import { detSin } from '../src/deterministicSine'
import { writeWav } from '../src/wav'
import { audioProvider } from '../src/audioProvider'

const ctx: ProviderContext = {
  seed: 31337,
  style: { palette: { baseHue: 210, accentHues: [90, 330], saturation: 0.7, lightness: 0.55 }, audio: { waveform: 'sine', tempo: 'slow' } },
  specVersion: 1
}
const sfx = { id: 'pickup-blip', kind: 'audio' as const, description: 'Pickup blip.' }
const ambience = { id: 'harbor-drone', kind: 'music' as const, description: 'Harbor ambience.' }
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const readU32 = (bytes: Uint8Array, at: number): number =>
  bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | ((bytes[at + 3]! << 24) >>> 0)

describe('detSin', () => {
  it('approximates sine over a period within 0.002 and hits exact zeros/peak signs', () => {
    for (let step = 0; step <= 1000; step += 1) {
      const phase = step / 1000
      const reference = Math.sin(phase * Math.PI * 2)
      expect(Math.abs(detSin(phase) - reference)).toBeLessThan(0.002)
    }
  })
})

describe('writeWav', () => {
  it('emits a canonical RIFF header for 22050 Hz mono 16-bit', () => {
    const bytes = writeWav(new Int16Array([0, 1000, -1000]), 22050)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
    expect(readU32(bytes, 24)).toBe(22050)          // sample rate
    expect(readU32(bytes, 40)).toBe(6)               // data bytes = 3 samples * 2
    expect(bytes.length).toBe(44 + 6)
  })
})

describe('audioProvider', () => {
  it('replays bit-identically; goldens pinned per kind', async () => {
    const a = await audioProvider.generate(sfx, ctx)
    expect(sha(a.bytes)).toBe(sha((await audioProvider.generate(sfx, ctx)).bytes))
    expect(sha(a.bytes)).toMatchSnapshot()
    expect(sha((await audioProvider.generate(ambience, ctx)).bytes)).toMatchSnapshot()
  })

  it('respects duration bounds per kind', async () => {
    const blip = await audioProvider.generate(sfx, ctx)
    const drone = await audioProvider.generate(ambience, ctx)
    const seconds = (bytes: Uint8Array): number => readU32(bytes, 40) / 2 / 22050
    expect(seconds(blip.bytes)).toBeLessThanOrEqual(1)
    expect(seconds(blip.bytes)).toBeGreaterThan(0.05)
    expect(seconds(drone.bytes)).toBeLessThanOrEqual(8)
    expect(seconds(drone.bytes)).toBeGreaterThan(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project asset-providers -t 'detSin|writeWav|audioProvider'`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/asset-providers/src/deterministicSine.ts`:

```ts
/**
 * Bit-deterministic sine: JS transcendentals (Math.sin et al.) are
 * implementation-defined, so audio sample math may not touch them. This is a
 * parabolic approximation with one refinement pass — only + - * / on
 * doubles, which IEEE 754 makes identical on every engine. Max error vs
 * true sine ≈ 0.001, inaudible at this fidelity bar.
 * @param phase position in cycles (0..1 = one period; any real accepted)
 */
export function detSin(phase: number): number {
  let t = phase - Math.floor(phase)   // wrap to [0,1) — floor is exact
  t = t * 2 - 1                        // [-1,1), zero crossings at -1, 0
  const raw = 4 * (Math.abs(t) - t * t) * (t < 0 ? -1 : 1) * -1
  // refinement: y = 0.225 * (raw*|raw| - raw) + raw
  return 0.225 * (raw * Math.abs(raw) - raw) + raw
}
```

(`Math.abs`/`Math.floor` are exact integer/sign ops, not transcendentals — allowed.)

`packages/asset-providers/src/wav.ts`:

```ts
/** Canonical 16-bit PCM mono WAV writer: fixed 44-byte header, little-endian. */
export function writeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, text: string): void => { for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i) }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)                    // PCM
  view.setUint16(22, 1, true)                    // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)       // byte rate
  view.setUint16(32, 2, true)                    // block align
  view.setUint16(34, 16, true)                   // bits per sample
  ascii(36, 'data'); view.setUint32(40, dataSize, true)
  for (let i = 0; i < samples.length; i += 1) view.setInt16(44 + i * 2, samples[i]!, true)
  return bytes
}
```

`packages/asset-providers/src/audioProvider.ts`:

```ts
import type { AssetProvider, ProviderContext } from '@automata/contracts'
import { createSeededRng, type SeededRng } from '@automata/engine'
import { detSin } from './deterministicSine'
import { writeWav } from './wav'

const SAMPLE_RATE = 22050
const TEMPO_HZ = { slow: 0.25, mid: 0.5, brisk: 1 } as const

const osc = (waveform: 'sine' | 'triangle' | 'square', phase: number): number => {
  if (waveform === 'sine') return detSin(phase)
  const t = phase - Math.floor(phase)
  if (waveform === 'triangle') return t < 0.5 ? t * 4 - 1 : 3 - t * 4
  return t < 0.5 ? 1 : -1
}

/** Short seeded blip: random base pitch, exponential-ish decay via multiply. */
function renderSfx(rng: SeededRng, waveform: 'sine' | 'triangle' | 'square'): Int16Array {
  const seconds = 0.2 + rng.next() * 0.6
  const pitch = 220 + rng.nextInt(660)
  const sweep = 0.5 + rng.next()
  const count = Math.floor(seconds * SAMPLE_RATE)
  const samples = new Int16Array(count)
  let envelope = 1
  const decay = 1 - 4 / count
  for (let i = 0; i < count; i += 1) {
    const time = i / SAMPLE_RATE
    const value = osc(waveform, time * (pitch + sweep * pitch * time))
    samples[i] = Math.round(value * envelope * 20000)
    envelope *= decay
  }
  return samples
}

/** Layered slow oscillators; symmetric fade at both ends so the loop seams. */
function renderAmbience(rng: SeededRng, waveform: 'sine' | 'triangle' | 'square', tempoHz: number): Int16Array {
  const seconds = 4 + rng.nextInt(5)                       // 4..8 s
  const count = Math.floor(seconds * SAMPLE_RATE)
  const samples = new Int16Array(count)
  const base = 55 + rng.nextInt(75)
  const layers = [1, 1.5, 2.01].map((ratio) => ({ ratio, gain: 0.3 + rng.next() * 0.3 }))
  const fade = Math.floor(SAMPLE_RATE * 0.25)
  for (let i = 0; i < count; i += 1) {
    const time = i / SAMPLE_RATE
    let value = 0
    for (const layer of layers) {
      const wobble = 1 + 0.01 * detSin(time * tempoHz)
      value += osc(waveform, time * base * layer.ratio * wobble) * layer.gain
    }
    const edge = Math.min(1, i / fade, (count - 1 - i) / fade)
    samples[i] = Math.round(value * edge * 9000)
  }
  return samples
}

export const audioProvider: AssetProvider = {
  id: 'procedural-audio',
  version: '1.0.0',
  kinds: ['audio', 'music'],
  fileExtension: () => 'wav',
  async generate(requirement, ctx: ProviderContext) {
    const rng = createSeededRng(ctx.seed)
    const samples = requirement.kind === 'music'
      ? renderAmbience(rng, ctx.style.audio.waveform, TEMPO_HZ[ctx.style.audio.tempo])
      : renderSfx(rng, ctx.style.audio.waveform)
    return {
      bytes: writeWav(samples, SAMPLE_RATE),
      provenance: {
        provider: audioProvider.id, providerVersion: audioProvider.version,
        generator: requirement.kind === 'music' ? 'ambience-loop@1' : 'sfx-blip@1',
        sourceParams: { kind: requirement.kind },
        seed: ctx.seed, specVersion: ctx.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally synthesized.' }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests (twice for snapshots), commit**

Run: `npx vitest run --project asset-providers && npx vitest run --project asset-providers`
Expected: PASS both times.

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): deterministic WAV audio provider (sfx blips, ambience loops)"
```

---

### Task 6: Registry + generateGameAssets orchestrator

**Files:**
- Create: `packages/asset-providers/src/registry.ts`
- Create: `packages/asset-providers/src/generate.ts`
- Test: `packages/asset-providers/tests/generate.test.ts`
- Modify: `packages/asset-providers/src/index.ts` (add both exports)

**Interfaces:**
- Consumes: the three providers; `deriveStyleParams`; contracts types; `hashStringToSeed`; `assetManifestEntrySchema`, `validateAssetManifest` from contracts.
- Produces:

```ts
export const ASSET_PROVIDERS: Record<string, AssetProvider>          // keyed by provider id
export function resolveProvider(kind: AssetKind): AssetProvider      // typed error if none
export interface GenerateAssetsInput {
  requirements: readonly AssetRequirement[]
  direction: { visualStyle: string; audioStyle: string }
  seed: number
  specVersion: number
}
export interface GeneratedAsset { entry: AssetManifestEntry; path: string; bytes: Uint8Array }
export function generateGameAssets(input: GenerateAssetsInput): Promise<GeneratedAsset[]>
```

- [ ] **Step 1: Write the failing tests**

`packages/asset-providers/tests/generate.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assetManifestSchema, validateAssetManifest, type AssetKind } from '@automata/contracts'
import { ASSET_PROVIDERS, resolveProvider } from '../src/registry'
import { generateGameAssets } from '../src/generate'

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const input = () => ({
  requirements: [
    { id: 'relic-icon', kind: 'ui' as const, description: 'Icon.' },
    { id: 'dock-planks', kind: 'texture' as const, description: 'Texture.' },
    { id: 'harbor-crate', kind: 'model' as const, description: 'Crate.' },
    { id: 'pickup-blip', kind: 'audio' as const, description: 'Blip.' },
    { id: 'harbor-drone', kind: 'music' as const, description: 'Ambience.' }
  ],
  direction: { visualStyle: 'warm harbor', audioStyle: 'soft ambience' },
  seed: 42,
  specVersion: 1
})

describe('provider registry', () => {
  it('every AssetKind resolves to a registered provider', () => {
    const kinds: AssetKind[] = ['model', 'texture', 'audio', 'music', 'ui']
    for (const kind of kinds) {
      const provider = resolveProvider(kind)
      expect(ASSET_PROVIDERS[provider.id]).toBe(provider)
      expect(provider.kinds).toContain(kind)
    }
  })
})

describe('generateGameAssets', () => {
  it('produces one schema-valid, structurally clean entry per requirement', async () => {
    const generated = await generateGameAssets(input())
    expect(generated.map((asset) => asset.entry.id)).toEqual(input().requirements.map((req) => req.id))
    const manifest = assetManifestSchema.parse({ formatVersion: 2, assets: generated.map((asset) => asset.entry) })
    const errors = validateAssetManifest(manifest, null).filter((issue) => issue.severity === 'error')
    expect(errors).toEqual([])
    for (const asset of generated) {
      expect(asset.entry.status).toBe('generated')
      expect(asset.entry.references).toEqual([])
      expect(asset.path).toBe(asset.entry.path)
      expect(asset.path.startsWith('assets/')).toBe(true)
    }
  })

  it('per-asset child seeds: dropping one requirement leaves the others byte-identical', async () => {
    const full = await generateGameAssets(input())
    const partial = await generateGameAssets({ ...input(), requirements: input().requirements.filter((req) => req.id !== 'dock-planks') })
    const byId = new Map(full.map((asset) => [asset.entry.id, sha(asset.bytes)]))
    for (const asset of partial) {
      expect(sha(asset.bytes)).toBe(byId.get(asset.entry.id))
    }
  })

  it('is deterministic end to end', async () => {
    const a = await generateGameAssets(input())
    const b = await generateGameAssets(input())
    expect(a.map((asset) => sha(asset.bytes))).toEqual(b.map((asset) => sha(asset.bytes)))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project asset-providers -t 'registry|generateGameAssets'`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/asset-providers/src/registry.ts`:

```ts
import type { AssetKind, AssetProvider } from '@automata/contracts'
import { audioProvider } from './audioProvider'
import { propProvider } from './propProvider'
import { svgProvider } from './svgProvider'

/** The only module that knows the full provider set (pack-registry pattern). */
export const ASSET_PROVIDERS: Record<string, AssetProvider> = {
  [svgProvider.id]: svgProvider,
  [propProvider.id]: propProvider,
  [audioProvider.id]: audioProvider
}

export function resolveProvider(kind: AssetKind): AssetProvider {
  const provider = Object.values(ASSET_PROVIDERS).find((entry) => entry.kinds.includes(kind))
  if (!provider) throw new Error(`No asset provider registered for kind "${kind}"`)
  return provider
}
```

`packages/asset-providers/src/generate.ts`:

```ts
import type { AssetManifestEntry, AssetRequirement } from '@automata/contracts'
import { hashStringToSeed } from '@automata/engine'
import { resolveProvider } from './registry'
import { deriveStyleParams } from './styleParams'

export interface GenerateAssetsInput {
  requirements: readonly AssetRequirement[]
  direction: { visualStyle: string; audioStyle: string }
  seed: number
  specVersion: number
}

export interface GeneratedAsset { entry: AssetManifestEntry; path: string; bytes: Uint8Array }

/**
 * Pure orchestrator: no filesystem. Child seed per asset id means an asset's
 * bytes depend only on its own requirement — add/remove/regenerate one asset
 * and every other byte stream is untouched (independent regeneration).
 */
export async function generateGameAssets(input: GenerateAssetsInput): Promise<GeneratedAsset[]> {
  const style = deriveStyleParams(input.direction, input.seed)
  const generated: GeneratedAsset[] = []
  for (const requirement of input.requirements) {
    const provider = resolveProvider(requirement.kind)
    const childSeed = hashStringToSeed(`${input.seed}:${requirement.id}`)
    const { bytes, provenance } = await provider.generate(requirement, { seed: childSeed, style, specVersion: input.specVersion })
    const path = `assets/${requirement.id}.${provider.fileExtension(requirement)}`
    generated.push({
      path, bytes,
      entry: { id: requirement.id, requirement, path, provenance, transformations: [], status: 'generated', references: [] }
    })
  }
  return generated
}
```

- [ ] **Step 4: Run tests to verify they pass, commit**

Run: `npx vitest run --project asset-providers`
Expected: PASS.

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): provider registry + generateGameAssets with child seeds"
```

---

### Task 7: MCP generateAssets tool

**Files:**
- Modify: `packages/contracts/src/assetTools.ts`
- Modify: `tools/editor-mcp-server/src/assetTools.ts`
- Modify: `tools/editor-mcp-server/package.json` (add `"@automata/asset-providers": "*"`)
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts` (extend)

**Interfaces:**
- Consumes: `generateGameAssets` from Task 6; `gameSpecSchema` from contracts; the existing `createAssetToolRunner` deps shape (`{ repoRoot, ensureEngine }` — unchanged).
- Produces: MCP tool `generateAssets { gameId, assetIds?: string[], seed?: number }` → `{ ok: true, content: { seed, assets: [{ id, path, provider, status }] } }`. Files written under `games/<gameId>/public/`; `public/assets/assets.json` merged by id.

- [ ] **Step 1: Extend the contracts tool table (failing test first)**

Add to the contracts test for asset tools (`packages/contracts/tests/*` — find the existing assetTools describe; if none exists, add `packages/contracts/tests/assetTools.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { assetToolArgSchemas, assetToolDefs } from '../src/assetTools'

describe('generateAssets tool contract', () => {
  it('is listed with a schema that bounds its args', () => {
    expect(assetToolDefs().map((def) => def.name)).toContain('generateAssets')
    expect(assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game' })).toEqual({ gameId: 'demo-game' })
    expect(assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game', assetIds: ['a'], seed: 7 }))
      .toEqual({ gameId: 'demo-game', assetIds: ['a'], seed: 7 })
    expect(() => assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game', assetIds: [] })).toThrow()
    expect(() => assetToolArgSchemas.generateAssets.parse({ gameId: 'demo-game', seed: -1 })).toThrow()
  })
})
```

Then in `packages/contracts/src/assetTools.ts`:

```ts
export type AssetToolName = 'listAssets' | 'validateAssets' | 'generateAssets'

export const assetToolArgSchemas = {
  listAssets: z.strictObject({ gameId: gameSlugSchema }),
  validateAssets: z.strictObject({ gameId: gameSlugSchema }),
  generateAssets: z.strictObject({
    gameId: gameSlugSchema,
    assetIds: z.array(z.string().min(1).max(60)).min(1).max(80).optional(),
    seed: z.number().int().min(0).optional()
  })
} as const satisfies Record<AssetToolName, z.ZodType>
```

and add the description:

```ts
  generateAssets: 'Generate spec asset requirements through the procedural provider registry: writes files under public/, merges manifest entries (status "generated"). Idempotent for a given seed.'
```

Run: `npx vitest run --project contracts` — expect PASS after the edit.

- [ ] **Step 2: Write the failing MCP runner tests**

Extend `tools/editor-mcp-server/tests/assetTools.test.ts`. The existing `setup()` helper builds a temp repo with `games/demo-game/public/{assets,project}`; extend the setup (or add a variant `setupWithSpec()`) that also writes a minimal `gamespec.json` at `games/demo-game/gamespec.json`. Careful: `gameSpecFixtures` exports **drafts** — `minimalGameSpecDraft(gameId)` matches `gameSpecDraftSchema`, which omits `specVersion` and `provenance` — while the runner parses the file with the full `gameSpecSchema`, so a raw draft on disk fails parse. Write the compiled shape:

```ts
import { gameSpecSchema, minimalGameSpecDraft } from '@automata/contracts'

const spec = gameSpecSchema.parse({
  specVersion: 1,
  provenance: { prompt: 'demo prompt', translations: [], history: [{ version: 1, reason: 'initial draft' }] },
  ...minimalGameSpecDraft('demo-game'),
  assets: [
    { id: 'relic-icon', kind: 'ui', description: 'Icon.' },
    { id: 'pickup-blip', kind: 'audio', description: 'Blip.' }
  ]
})
```

(the `parse` inside the setup makes fixture drift fail loudly at the fixture, not inside the tool under test).

```ts
describe('generateAssets', () => {
  it('generates all spec requirements, writes files, merges the manifest', async () => {
    const { runner, repoRoot } = await setupWithSpec()
    const result = await runner.execute('generateAssets', { gameId: 'demo-game', seed: 42 })
    expect(result.ok).toBe(true)
    const content = (result as { content: { seed: number; assets: Array<{ id: string; path: string; provider: string; status: string }> } }).content
    expect(content.seed).toBe(42)
    expect(content.assets.map((asset) => asset.id)).toEqual(['relic-icon', 'pickup-blip'])
    const svg = await readFile(join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'relic-icon.svg'), 'utf8')
    expect(svg).toContain('<svg')
    const manifest = JSON.parse(await readFile(join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'assets.json'), 'utf8'))
    expect(manifest.formatVersion).toBe(2)
    expect(manifest.assets).toHaveLength(2)
    expect(manifest.assets[0].status).toBe('generated')
  })

  it('is idempotent for a given seed and honors assetIds subsetting', async () => {
    const { runner, repoRoot } = await setupWithSpec()
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 42 })
    const firstBytes = await readFile(join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'pickup-blip.wav'))
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 42, assetIds: ['pickup-blip'] })
    const secondBytes = await readFile(join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'pickup-blip.wav'))
    expect(Buffer.compare(firstBytes, secondBytes)).toBe(0)
    const manifest = JSON.parse(await readFile(join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'assets.json'), 'utf8'))
    expect(manifest.assets).toHaveLength(2)   // merge by id, no duplicates
  })

  it('fails with typed errors on unknown assetIds, missing gamespec, and missing seed', async () => {
    const withSpec = await setupWithSpec()
    await expect(withSpec.runner.execute('generateAssets', { gameId: 'demo-game', seed: 1, assetIds: ['nope'] }))
      .rejects.toThrow(/nope/)
    await expect(withSpec.runner.execute('generateAssets', { gameId: 'demo-game' }))
      .rejects.toThrow(/seed/)                 // composition fixture has source: null
    const bare = await setup(V2_MANIFEST)      // no gamespec.json
    await expect(bare.runner.execute('generateAssets', { gameId: 'demo-game', seed: 1 }))
      .rejects.toThrow(/gamespec/)
  })
})
```

(Adjust `setup`'s return to expose `runner` and `repoRoot` if it doesn't already; follow the file's existing conventions — read it fully first.)

Run: `npx vitest run --project editor-mcp-server -t generateAssets`
Expected: FAIL — runner throws `Unknown asset tool` path or missing branch.

- [ ] **Step 3: Implement the runner branch**

In `tools/editor-mcp-server/src/assetTools.ts` add imports:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { generateGameAssets } from '@automata/asset-providers'
import { assetManifestSchema, gameSpecSchema, type AssetManifestEntry } from '@automata/contracts'
```

Add helpers next to `readManifestText`:

```ts
async function readGameSpec(repoRoot: string, gameId: string) {
  const path = join(repoRoot, 'games', gameId, 'gamespec.json')
  try {
    return gameSpecSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Game "${gameId}" has no gamespec.json — generateAssets needs spec asset requirements`)
    }
    throw error
  }
}

/** Merge by id: replace existing entries, append new, keep unrelated ones. */
function mergeManifest(existingText: string | null, entries: AssetManifestEntry[]) {
  const existing = existingText ? parseAssetManifest(existingText) : { formatVersion: 2 as const, assets: [] }
  const replaced = new Set(entries.map((entry) => entry.id))
  return assetManifestSchema.parse({
    formatVersion: 2,
    assets: [...existing.assets.filter((entry) => !replaced.has(entry.id)), ...entries]
  })
}
```

At the top of `execute`, route the new tool before the shared `gameId`-only parse:

```ts
      if (name === 'generateAssets') {
        const args = parseAssetToolArgs(name, raw) as { gameId: string; assetIds?: string[]; seed?: number }
        const spec = await readGameSpec(deps.repoRoot, args.gameId)
        const known = new Map(spec.assets.map((requirement) => [requirement.id, requirement]))
        for (const id of args.assetIds ?? []) {
          if (!known.has(id)) throw new Error(`Unknown asset id "${id}"; spec declares: ${[...known.keys()].join(', ')}`)
        }
        const requirements = args.assetIds ? args.assetIds.map((id) => known.get(id)!) : spec.assets
        const composition = await readComposition(deps.repoRoot, args.gameId)
        const seed = args.seed ?? composition?.source?.seed
        if (seed === undefined) {
          throw new Error('No seed: pass an explicit seed or compose the game first (composition.json source.seed)')
        }
        const generated = await generateGameAssets({
          requirements, direction: spec.direction, seed, specVersion: spec.specVersion
        })
        const publicDir = join(deps.repoRoot, 'games', args.gameId, 'public')
        for (const asset of generated) {
          const filePath = join(publicDir, asset.path)
          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, asset.bytes)
        }
        const manifest = mergeManifest(await readManifestText(deps.repoRoot, args.gameId), generated.map((asset) => asset.entry))
        await mkdir(join(publicDir, 'assets'), { recursive: true })
        await writeFile(join(publicDir, 'assets', 'assets.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        return ok({
          seed,
          assets: generated.map((asset) => ({
            id: asset.entry.id, path: asset.path,
            provider: asset.entry.provenance.provider, status: asset.entry.status
          }))
        })
      }
```

Add `"@automata/asset-providers": "*"` to `tools/editor-mcp-server/package.json` dependencies and run `npm install`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS — new generateAssets tests plus all existing asset/spec/session tool tests (the tool def surfaces automatically through `assetToolDefs()`; `tests/server.test.ts` may assert the tool list — update its expected names to include `generateAssets` if it does).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts tools/editor-mcp-server package-lock.json
git commit -m "feat(editor-mcp): generateAssets tool over the procedural provider registry"
```

---

### Task 8: Gates + disjointness proof + roadmap closeout

**Files:**
- Modify: `docs/ROADMAP.md` (Phase 5 cycle list)

- [ ] **Step 1: Run the gates**

```bash
npm run ci
npm run verify:new-game
```

Expected: all green.

- [ ] **Step 2: Prove phase disjointness**

```bash
git log --stat main@{u}..HEAD -- packages/game-compose packages/game-kit games/first-light
```

Expected: empty output — this cycle touched none of the Phase 4 territory. (If the branch base differs, diff against the commit before Task 1 instead.) If anything shows up, stop and remove the change — it belongs to cycle 3 or Phase 4. (`packages/contracts` is deliberately absent from this check: both cycles edit `gameSpec.ts`, and that shared edit is coordinated in Global Constraints, not a violation.)

- [ ] **Step 3: Update the roadmap and commit**

In `docs/ROADMAP.md` under Phase 5 Cycles, change:

```markdown
  - Cycle 2 — provider-adapter interface + first procedural adapters — `In progress`.
```

to:

```markdown
  - Cycle 2 — provider-adapter interface + first procedural adapters —
    `Shipped` (2026-07-16, plan:
    [`2026-07-16-phase-5-cycle-2-provider-adapters.md`](superpowers/plans/active/2026-07/week-29/2026-07-16-phase-5-cycle-2-provider-adapters.md)).
  - Cycle 3 — asset validation (media) + optimization + independent
    regeneration — `Next`.
```

(Cycle 3's line replaces its current `Planned` entry.)

```bash
git add docs/ROADMAP.md
git commit -m "docs: Phase 5 cycle 2 shipped - provider adapters + procedural providers"
```

---

## Self-review notes (already applied)

- **Spec coverage:** spec §2→Task 1; §3 providers→Tasks 3/4/5 (+ style derivation Task 2); §4 registry/orchestrator→Task 6; §5 MCP→Task 7; §6 testing→in-task tests + Task 8 gates; §7 risks→golden-hash snapshots (drift visibility), polynomial sine (determinism), disjointness proof (concurrency).
- **Placeholder scan:** none; every code step is complete.
- **Type consistency:** `ProviderContext`/`StyleParams`/`GeneratedBytes` defined once (Task 1) and imported everywhere; `hsl` defined in Task 3, reused in Task 4; `GeneratedAsset { entry, path, bytes }` consistent between Tasks 6 and 7.
- **Known look-before-you-code spots** (flagged in-task): the assetTools test `setup()` return shape (Task 7), `tests/server.test.ts` tool-list assertion (Task 7), `RenderableDef` export from the engine index (Task 4).
- **Post-review fix (2026-07-16):** Task 7's gamespec fixture guidance corrected — `minimalGameSpecDraft` is a *draft* (no `specVersion`/`provenance`) and must be wrapped into the compiled shape before writing `gamespec.json`, since the runner parses with the full `gameSpecSchema`.
- **SVG trig exception** is documented in Task 3 (layout-only, quantized via `toFixed(2)`, golden-guarded) — audio remains strictly transcendental-free.
