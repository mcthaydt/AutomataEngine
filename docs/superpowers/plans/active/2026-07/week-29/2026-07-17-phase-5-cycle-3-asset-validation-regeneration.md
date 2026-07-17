# Phase 5 Cycle 3 — Asset Validation, Optimization & Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the asset pipeline: per-kind media validation flips `generated → validated`/`failed` as a real gate, deterministic optimization steps land in `transformations`, `regenerateAsset(id)` regenerates one asset in isolation, and `composeGame` consumes the cycle-2 providers so assets stop being unconsumed.

**Architecture:** Media validation and optimization are pure functions in `@automata/asset-providers` (the package that knows the formats); the contracts leaf gains only issue codes and the `asset` slice-gate kind. The MCP `validateAssets` tool grows the media pass, status write-back, and a hash-guarded `check:assets` step that becomes the release gate in the slice evidence. `regenerateAsset` rides `engine.runGuarded` behind the stable logical id. Compose wiring replaces the stub SVG path in `composeGame` with `generateGameAssets` and adds binary composed files. Spec: [`2026-07-17-phase-5-cycle-3-asset-validation-regeneration-design.md`](../../../specs/active/2026-07/week-29/2026-07-17-phase-5-cycle-3-asset-validation-regeneration-design.md).

**Tech Stack:** TypeScript ESM workspaces, zod (direct `zod` import is correct in `contracts`/`asset-providers` — the `@automata/project` re-export rule applies to packs only), vitest, `@automata/build-session` guarded steps.

**Implementation progress:** 0% (0/37 steps complete).

## Global Constraints

- Determinism is bit-level: every optimization and validation decision must be a pure function of bytes + entry + style; no wall clocks, no `Math.random`, no transcendental stdlib calls in sample math (cycle-2 rule).
- Optimization is idempotent: a second run over already-optimized bytes appends nothing (a step producing identical bytes is skipped).
- Only the asset evaluator flips status to `validated` or `failed`; providers/orchestrator emit `generated`. `placeholder` never validates (existing structural rule).
- Golden-hash updates (provider/orchestrator fixtures) are a reviewed act in the task that causes them, never a drive-by.
- Gates for cycle completion: `npm run ci`, `npm run verify:new-game`, first-light recompose baseline reviewed and committed, release (`asset`) gate proven to hard-fail a `failed` fixture.
- Commit after every task (`feat(asset-providers): …`, `feat(editor-mcp-server): …`, etc.).
- Cross-plan coordination: Phase 4 cycle 3 runs in parallel and owns `packages/game-compose/src/compose.ts` until its **cycle close (Task 12)** lands — not just its Task 11 compose wiring. Task 12's first-light recompose proof requires bit-identical output, which this plan's Task 6 makes impossible (stub assets replaced, `composeGame` async). **Do not start Task 6 (compose wiring) before Phase 4 cycle 3 Task 12 lands**; rebase over it. Expected shared-file rebases: `package-lock.json`, `docs/ROADMAP.md`. Overlap anywhere else means a territory violation.
- Tasks 1–5 must not touch `game-compose`, `game-kit`, or any `pack-*` package.

---

### Task 1: Contracts — media issue codes + `asset` slice-gate kind

**Files:**
- Modify: `packages/contracts/src/assetValidation.ts` (extend the `AssetIssue['code']` union)
- Modify: `packages/contracts/src/sliceReport.ts` (extend `SliceGateKind`)
- Test: `packages/contracts/tests/assetValidation.test.ts` (extend existing file in its style)

**Interfaces:**
- Produces (consumed by Tasks 2–5):

```ts
// assetValidation.ts — two new codes in the AssetIssue union:
//   'asset-media-invalid'   (malformed/unparseable/off-contract media)
//   'asset-media-budget'    (size/duration/part-count/peak budget exceeded)
// sliceReport.ts:
export type SliceGateKind = 'build' | 'test' | 'browser' | 'evaluate' | 'asset'
```

- [ ] **Step 1: Write the failing test**

Append to `packages/contracts/tests/assetValidation.test.ts`:

```ts
it('admits media issue codes in the AssetIssue union', () => {
  const issue: AssetIssue = {
    severity: 'error', code: 'asset-media-invalid', assetId: 'x', message: 'bad bytes'
  }
  const budget: AssetIssue = {
    severity: 'error', code: 'asset-media-budget', assetId: 'x', message: 'too big'
  }
  expect([issue.code, budget.code]).toEqual(['asset-media-invalid', 'asset-media-budget'])
})
```

(This is a compile-time contract test — it fails typecheck until the union grows.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project contracts -t 'media issue codes'`
Expected: FAIL (TS error: codes not assignable).

- [ ] **Step 3: Implement**

In `packages/contracts/src/assetValidation.ts` add to the `code` union:

```ts
    | 'asset-media-invalid'
    | 'asset-media-budget'
```

In `packages/contracts/src/sliceReport.ts`:

```ts
export type SliceGateKind = 'build' | 'test' | 'browser' | 'evaluate' | 'asset'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project contracts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): media asset-issue codes + asset slice-gate kind"
```

---

### Task 2: Media validation core (`asset-providers/src/validateMedia.ts`)

**Files:**
- Create: `packages/asset-providers/src/validateMedia.ts`
- Modify: `packages/asset-providers/src/svgProvider.ts` (export the palette-color helper)
- Modify: `packages/asset-providers/src/index.ts` (add `export * from './validateMedia'`)
- Test: `packages/asset-providers/tests/validateMedia.test.ts`

**Interfaces:**
- Consumes: `AssetManifestEntry`, `AssetIssue` from `@automata/contracts`; `StyleParams`, `propRecipeSchema`, `recipeToRenderables` from this package.
- Produces:

```ts
export const MEDIA_BUDGETS = {
  svgMaxBytes: 32_768, propMaxBytes: 16_384, wavMaxBytes: 400_000,
  sfxMaxSeconds: 1, ambienceMaxSeconds: 8, wavPeakMax: 32_000
} as const
export function validateAssetMedia(entry: AssetManifestEntry, bytes: Uint8Array, style: StyleParams): AssetIssue[]
export interface WavInfo { sampleRate: number; channels: number; bitsPerSample: number; sampleCount: number; peak: number }
export function readWavInfo(bytes: Uint8Array): WavInfo   // throws on malformed RIFF/fmt/data
// svgProvider.ts additionally exports:
export function svgPaletteColors(style: StyleParams): string[]   // exact color strings the provider emits
```

Checks per kind: `ui`/`texture` — parses as an `<svg>` document, every `fill`/`stroke` color ∈ `svgPaletteColors(style)`, size ≤ `svgMaxBytes`; `model` — parses under `propRecipeSchema`, every part maps via `recipeToRenderables`, size ≤ `propMaxBytes`; `audio`/`music` — `readWavInfo` succeeds, 22 050 Hz mono 16-bit, duration within kind bound, `peak ≤ wavPeakMax`, size ≤ `wavMaxBytes`. Malformed → `asset-media-invalid`; budget breaches → `asset-media-budget`. All issues `severity: 'error'`.

- [ ] **Step 1: Extract `svgPaletteColors` from the SVG provider**

READ `packages/asset-providers/src/svgProvider.ts` first. Locate where it builds its color strings from `StyleParams.palette` (base hue + accent hues + saturation/lightness). Move that construction into an exported `svgPaletteColors(style: StyleParams): string[]` returning every color string the provider can emit (including any fixed stroke/background colors it uses), and refactor the provider to draw from this function. Byte-stability check: run the provider golden-hash tests after the refactor —

Run: `npx vitest run --project asset-providers -t svg`
Expected: PASS with unchanged goldens (pure refactor).

- [ ] **Step 2: Write the failing tests**

`packages/asset-providers/tests/validateMedia.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveStyleParams } from '../src/styleParams'
import { generateGameAssets } from '../src/generate'
import { validateAssetMedia, readWavInfo, MEDIA_BUDGETS } from '../src/validateMedia'
import type { AssetRequirement } from '@automata/contracts'

const direction = { visualStyle: 'soft neon dusk', audioStyle: 'warm hum' }
const style = deriveStyleParams(direction, 7)
const requirements: AssetRequirement[] = [
  { id: 'icon-a', kind: 'ui', description: 'emblem' },
  { id: 'crate-a', kind: 'model', description: 'crate' },
  { id: 'blip-a', kind: 'audio', description: 'pickup blip' }
]

async function generated() {
  return generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
}

describe('validateAssetMedia', () => {
  it('passes every provider-generated asset', async () => {
    for (const asset of await generated()) {
      expect(validateAssetMedia(asset.entry, asset.bytes, style)).toEqual([])
    }
  })

  it('flags malformed bytes per kind as asset-media-invalid', async () => {
    const [svg, prop, wav] = await generated()
    const junk = new TextEncoder().encode('not media')
    for (const asset of [svg!, prop!, wav!]) {
      const issues = validateAssetMedia(asset.entry, junk, style)
      expect(issues.some((issue) => issue.code === 'asset-media-invalid')).toBe(true)
    }
  })

  it('flags an off-palette SVG color', async () => {
    const [svg] = await generated()
    const text = new TextDecoder().decode(svg!.bytes).replace(/fill="[^"]+"/, 'fill="#123456"')
    const issues = validateAssetMedia(svg!.entry, new TextEncoder().encode(text), style)
    expect(issues.some((issue) => issue.code === 'asset-media-invalid' && /palette/i.test(issue.message))).toBe(true)
  })

  it('flags budget breaches as asset-media-budget', async () => {
    const [svg] = await generated()
    const padded = new Uint8Array(MEDIA_BUDGETS.svgMaxBytes + 1)
    padded.set(svg!.bytes)
    const issues = validateAssetMedia(svg!.entry, padded, style)
    expect(issues.some((issue) => issue.code === 'asset-media-budget')).toBe(true)
  })

  it('reads WAV info and enforces duration by kind', async () => {
    const assets = await generated()
    const wav = assets.find((asset) => asset.entry.requirement.kind === 'audio')!
    const info = readWavInfo(wav.bytes)
    expect(info).toMatchObject({ sampleRate: 22050, channels: 1, bitsPerSample: 16 })
    expect(info.sampleCount / info.sampleRate).toBeLessThanOrEqual(MEDIA_BUDGETS.sfxMaxSeconds)
    // music-kind bound: relabel the entry as music and confirm the 8 s bound applies
    const asMusic = { ...wav.entry, requirement: { ...wav.entry.requirement, kind: 'music' as const } }
    expect(validateAssetMedia(asMusic, wav.bytes, style)).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project asset-providers -t validateAssetMedia`
Expected: FAIL — cannot resolve `../src/validateMedia`.

- [ ] **Step 4: Implement `src/validateMedia.ts`**

```ts
import type { AssetIssue, AssetManifestEntry, StyleParams } from '@automata/contracts'
import { propRecipeSchema, recipeToRenderables } from './propRecipe'
import { svgPaletteColors } from './svgProvider'

/**
 * Media slice of the Phase 5 asset evaluator: pure byte-level checks per kind.
 * Structural manifest validation stays in @automata/contracts; this layer
 * answers "are these bytes a well-formed, on-budget, on-style asset".
 */
export const MEDIA_BUDGETS = {
  svgMaxBytes: 32_768,
  propMaxBytes: 16_384,
  wavMaxBytes: 400_000,
  sfxMaxSeconds: 1,
  ambienceMaxSeconds: 8,
  wavPeakMax: 32_000
} as const

export interface WavInfo { sampleRate: number; channels: number; bitsPerSample: number; sampleCount: number; peak: number }

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length))

/** Minimal RIFF/fmt/data reader for the pipeline's own PCM WAVs. Throws on malformed input. */
export function readWavInfo(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file')
  }
  let offset = 12
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number } | null = null
  let data: { start: number; length: number } | null = null
  while (offset + 8 <= bytes.length) {
    const chunkId = ascii(bytes, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (chunkId === 'fmt ') {
      fmt = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true)
      }
    } else if (chunkId === 'data') {
      data = { start: body, length: chunkSize }
    }
    offset = body + chunkSize + (chunkSize % 2)
  }
  if (!fmt || !data || data.start + data.length > bytes.length) throw new Error('missing or truncated fmt/data chunk')
  const sampleCount = data.length / 2
  let peak = 0
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.abs(view.getInt16(data.start + index * 2, true))
    if (sample > peak) peak = sample
  }
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, sampleCount, peak }
}

const issueFor = (entry: AssetManifestEntry, code: AssetIssue['code'], message: string): AssetIssue =>
  ({ severity: 'error', code, assetId: entry.id, message })

const SVG_COLOR_ATTR = /(?:fill|stroke)="([^"]+)"/g

export function validateAssetMedia(entry: AssetManifestEntry, bytes: Uint8Array, style: StyleParams): AssetIssue[] {
  const issues: AssetIssue[] = []
  const kind = entry.requirement.kind
  const invalid = (message: string): void => { issues.push(issueFor(entry, 'asset-media-invalid', message)) }
  const budget = (message: string): void => { issues.push(issueFor(entry, 'asset-media-budget', message)) }

  if (kind === 'ui' || kind === 'texture') {
    if (bytes.length > MEDIA_BUDGETS.svgMaxBytes) budget(`SVG "${entry.id}" is ${bytes.length} bytes (max ${MEDIA_BUDGETS.svgMaxBytes})`)
    const text = new TextDecoder().decode(bytes)
    if (!text.trimStart().startsWith('<svg') || !text.includes('</svg>')) {
      invalid(`SVG "${entry.id}" does not parse as an <svg> document`)
      return issues
    }
    const allowed = new Set([...svgPaletteColors(style), 'none'])
    for (const match of text.matchAll(SVG_COLOR_ATTR)) {
      if (!allowed.has(match[1]!)) invalid(`SVG "${entry.id}" uses off-palette color "${match[1]}"`)
    }
    return issues
  }

  if (kind === 'model') {
    if (bytes.length > MEDIA_BUDGETS.propMaxBytes) budget(`Prop recipe "${entry.id}" is ${bytes.length} bytes (max ${MEDIA_BUDGETS.propMaxBytes})`)
    try {
      const recipe = propRecipeSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
      recipeToRenderables(recipe)
    } catch (error) {
      invalid(`Prop recipe "${entry.id}" invalid: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400))
    }
    return issues
  }

  // audio | music
  if (bytes.length > MEDIA_BUDGETS.wavMaxBytes) budget(`WAV "${entry.id}" is ${bytes.length} bytes (max ${MEDIA_BUDGETS.wavMaxBytes})`)
  let info: WavInfo
  try {
    info = readWavInfo(bytes)
  } catch (error) {
    invalid(`WAV "${entry.id}" invalid: ${error instanceof Error ? error.message : String(error)}`)
    return issues
  }
  if (info.sampleRate !== 22_050 || info.channels !== 1 || info.bitsPerSample !== 16) {
    invalid(`WAV "${entry.id}" must be 22050 Hz mono 16-bit (got ${info.sampleRate} Hz, ${info.channels}ch, ${info.bitsPerSample}-bit)`)
  }
  const seconds = info.sampleCount / info.sampleRate
  const maxSeconds = kind === 'audio' ? MEDIA_BUDGETS.sfxMaxSeconds : MEDIA_BUDGETS.ambienceMaxSeconds
  if (seconds > maxSeconds) budget(`WAV "${entry.id}" is ${seconds.toFixed(2)}s (max ${maxSeconds}s for ${kind})`)
  if (info.peak > MEDIA_BUDGETS.wavPeakMax) budget(`WAV "${entry.id}" peak ${info.peak} exceeds ${MEDIA_BUDGETS.wavPeakMax}`)
  return issues
}
```

Note: `StyleParams` is exported from `@automata/contracts` (cycle-2 contract). If the local `styleParams.ts` re-exports it, import from there instead — match the package's existing convention (read `src/index.ts`).

Add to `src/index.ts`:

```ts
export * from './validateMedia'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project asset-providers`
Expected: PASS (new + existing goldens).

- [ ] **Step 6: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): per-kind media validation core"
```

---

### Task 3: Deterministic optimization + orchestrator stage

**Files:**
- Create: `packages/asset-providers/src/optimize.ts`
- Modify: `packages/asset-providers/src/generate.ts` (optimize stage after provider generate)
- Modify: `packages/asset-providers/src/index.ts` (add `export * from './optimize'`)
- Test: `packages/asset-providers/tests/optimize.test.ts`

**Interfaces:**
- Produces:

```ts
export interface OptimizationResult {
  bytes: Uint8Array
  transformation: { tool: string; toolVersion: string; params: Record<string, unknown> }
}
/** Returns null when the bytes are already optimal (idempotence by construction). */
export function optimizeAssetBytes(kind: AssetKind, bytes: Uint8Array): OptimizationResult | null
export const WAV_NORMALIZE_PEAK = 29_491   // ≈ 0.9 × 32767, below MEDIA_BUDGETS.wavPeakMax
```

Steps: SVG/`ui`/`texture` — canonical whitespace collapse between tags (`tool: 'svg-minify'`); `model` — canonical re-serialization via the repo's `JSON.stringify(value, null, 2) + '\n'` after schema parse (`tool: 'prop-canonicalize'`); `audio`/`music` — integer peak-normalization to `WAV_NORMALIZE_PEAK` (`tool: 'wav-normalize'`, params `{ peakBefore, peakAfter }`). `generateGameAssets` applies the stage: bytes are replaced and the transformation appended to the entry; goldens update in this task as the reviewed act.

- [ ] **Step 1: Write the failing tests**

`packages/asset-providers/tests/optimize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateGameAssets } from '../src/generate'
import { optimizeAssetBytes, WAV_NORMALIZE_PEAK } from '../src/optimize'
import { readWavInfo, validateAssetMedia, MEDIA_BUDGETS } from '../src/validateMedia'
import { deriveStyleParams } from '../src/styleParams'
import type { AssetRequirement } from '@automata/contracts'

const direction = { visualStyle: 'soft neon dusk', audioStyle: 'warm hum' }
const requirements: AssetRequirement[] = [
  { id: 'icon-a', kind: 'ui', description: 'emblem' },
  { id: 'crate-a', kind: 'model', description: 'crate' },
  { id: 'blip-a', kind: 'audio', description: 'pickup blip' }
]

describe('optimizeAssetBytes', () => {
  it('is deterministic and idempotent for every kind', async () => {
    const assets = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    for (const asset of assets) {
      // generate.ts already ran the stage: a second pass must be a no-op
      expect(optimizeAssetBytes(asset.entry.requirement.kind, asset.bytes)).toBeNull()
    }
  })

  it('normalizes WAV peaks to the fixed target and records the transformation', async () => {
    const assets = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    const wav = assets.find((asset) => asset.entry.requirement.kind === 'audio')!
    expect(readWavInfo(wav.bytes).peak).toBe(WAV_NORMALIZE_PEAK)
    expect(wav.entry.transformations.map((step) => step.tool)).toContain('wav-normalize')
  })

  it('keeps optimized assets valid', async () => {
    const style = deriveStyleParams(direction, 7)
    const assets = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    for (const asset of assets) {
      expect(validateAssetMedia(asset.entry, asset.bytes, style)).toEqual([])
    }
  })

  it('same seed still means byte-identical output after the optimize stage', async () => {
    const a = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    const b = await generateGameAssets({ requirements, direction, seed: 7, specVersion: 1 })
    expect(a.map((asset) => Buffer.from(asset.bytes).toString('hex')))
      .toEqual(b.map((asset) => Buffer.from(asset.bytes).toString('hex')))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project asset-providers -t optimizeAssetBytes`
Expected: FAIL — cannot resolve `../src/optimize`.

- [ ] **Step 3: Implement `src/optimize.ts`**

```ts
import type { AssetKind } from '@automata/contracts'
import { propRecipeSchema } from './propRecipe'
import { readWavInfo } from './validateMedia'

/**
 * Deterministic, idempotent optimization steps. Each step is a pure byte
 * transform recorded in the manifest's transformations; a step that would
 * produce identical bytes returns null and is skipped.
 */
export interface OptimizationResult {
  bytes: Uint8Array
  transformation: { tool: string; toolVersion: string; params: Record<string, unknown> }
}

export const WAV_NORMALIZE_PEAK = 29_491

const TOOL_VERSION = '1.0.0'

function optimizeSvg(bytes: Uint8Array): OptimizationResult | null {
  const text = new TextDecoder().decode(bytes)
  const minified = `${text.replace(/>\s+</g, '><').trim()}\n`
  if (minified === text) return null
  return {
    bytes: new TextEncoder().encode(minified),
    transformation: { tool: 'svg-minify', toolVersion: TOOL_VERSION, params: {} }
  }
}

function optimizeProp(bytes: Uint8Array): OptimizationResult | null {
  const text = new TextDecoder().decode(bytes)
  const canonical = `${JSON.stringify(propRecipeSchema.parse(JSON.parse(text)), null, 2)}\n`
  if (canonical === text) return null
  return {
    bytes: new TextEncoder().encode(canonical),
    transformation: { tool: 'prop-canonicalize', toolVersion: TOOL_VERSION, params: {} }
  }
}

function optimizeWav(bytes: Uint8Array): OptimizationResult | null {
  const info = readWavInfo(bytes)
  if (info.peak === 0 || info.peak === WAV_NORMALIZE_PEAK) return null
  const out = new Uint8Array(bytes)   // copy; header untouched, samples rescaled in place
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  // data chunk offset: re-scan like readWavInfo (samples start after the 'data' header)
  let offset = 12
  let dataStart = -1
  while (offset + 8 <= out.length) {
    const id = String.fromCharCode(...out.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    if (id === 'data') { dataStart = offset + 8; break }
    offset = offset + 8 + size + (size % 2)
  }
  for (let index = 0; index < info.sampleCount; index += 1) {
    const at = dataStart + index * 2
    const sample = view.getInt16(at, true)
    // Integer-only rescale: floor toward zero keeps determinism across engines.
    view.setInt16(at, Math.trunc((sample * WAV_NORMALIZE_PEAK) / info.peak), true)
  }
  return {
    bytes: out,
    transformation: {
      tool: 'wav-normalize', toolVersion: TOOL_VERSION,
      params: { peakBefore: info.peak, peakAfter: WAV_NORMALIZE_PEAK }
    }
  }
}

export function optimizeAssetBytes(kind: AssetKind, bytes: Uint8Array): OptimizationResult | null {
  if (kind === 'ui' || kind === 'texture') return optimizeSvg(bytes)
  if (kind === 'model') return optimizeProp(bytes)
  return optimizeWav(bytes)
}
```

In `src/generate.ts`, after the provider call and before pushing the result, apply the stage:

```ts
    const optimized = optimizeAssetBytes(requirement.kind, bytes)
    const finalBytes = optimized?.bytes ?? bytes
    const transformations = optimized ? [optimized.transformation] : []
```

…and use `finalBytes`/`transformations` in the pushed `GeneratedAsset` (`entry.transformations: transformations`). Add the import at the top.

Add to `src/index.ts`:

```ts
export * from './optimize'
```

- [ ] **Step 4: Update golden hashes (reviewed act)**

Run: `npx vitest run --project asset-providers`
Expected: orchestrator-level golden/hash fixtures FAIL because bytes changed (per-provider goldens test `provider.generate` directly and stay green). Inspect each diff, confirm it is exactly the optimize stage, regenerate the affected fixtures per the test file's documented procedure, and rerun to green. Provider `version` fields do NOT bump (providers unchanged); the transformation record carries the tool version.

- [ ] **Step 5: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): deterministic optimization stage in the orchestrator"
```

---

### Task 4: validateAssets media pass, status write-back, `check:assets` step

**Files:**
- Modify: `tools/editor-mcp-server/src/assetTools.ts`
- Modify: `tools/editor-mcp-server/src/server.ts` (thread the new `snapshotContent` dep — read how composeTools receives it and mirror)
- Modify: `packages/contracts/src/assetTools.ts` (tool description mentions media + statuses)
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts` (extend existing file in its style)

**Interfaces:**
- Consumes: `validateAssetMedia`, `deriveStyleParams` from `@automata/asset-providers`; `engine.runGuarded` from `@automata/build-session`.
- Produces: `validateAssets` now (1) runs structural + media validation, (2) rewrites `public/assets/assets.json` flipping per-entry status — no media errors and status `generated` → `validated`; any media error → `failed`; `placeholder`/`validated` unchanged, (3) records a hash-guarded `check:assets` step whose result is `{ passed: boolean; contentHash: string }` where `passed` = zero errors AND every entry `validated`, (4) response gains `statuses: Record<string, AssetStatus>` and `passed: boolean`. `AssetToolDeps` gains `snapshotContent(gameId): Promise<{ hash: string }>`.

- [ ] **Step 1: Write the failing tests**

READ `tools/editor-mcp-server/tests/assetTools.test.ts` first and reuse its temp-workspace/session scaffolding. Add:

```ts
it('validates media, flips generated→validated, and records a passing check:assets step', async () => {
  // workspace fixture: a game whose spec has ui+model+audio requirements,
  // generated via the generateAssets tool with an explicit seed
  await runner.execute('generateAssets', { gameId, seed: 7 })
  const result = await runner.execute('validateAssets', { gameId })
  expect(result.ok).toBe(true)
  const content = result.content as { passed: boolean; statuses: Record<string, string> }
  expect(content.passed).toBe(true)
  expect(Object.values(content.statuses).every((status) => status === 'validated')).toBe(true)
  const manifest = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
  expect(manifest.assets.every((entry: { status: string }) => entry.status === 'validated')).toBe(true)
  const engine = await deps.ensureEngine(gameId)
  const step = engine.session.steps.findLast((candidate) => candidate.kind === 'check:assets')
  expect(step?.status).toBe('completed')
  expect((step?.result as { passed?: boolean }).passed).toBe(true)
})

it('flips a corrupted asset to failed, records a finding, and fails the gate', async () => {
  await runner.execute('generateAssets', { gameId, seed: 7 })
  const manifest = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
  const target = manifest.assets[0]
  await writeFile(join(gameRoot, 'public', target.path), 'corrupted')
  const result = await runner.execute('validateAssets', { gameId })
  const content = result.content as { passed: boolean; statuses: Record<string, string> }
  expect(content.passed).toBe(false)
  expect(content.statuses[target.id]).toBe('failed')
  const engine = await deps.ensureEngine(gameId)
  const open = engine.session.findings.filter((finding) => finding.source === 'asset' && finding.resolvedAt === undefined)
  expect(open.some((finding) => finding.code === 'asset-media-invalid')).toBe(true)
})

it('regenerating and revalidating a failed asset returns it to validated', async () => {
  await runner.execute('generateAssets', { gameId, seed: 7 })
  const manifest = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
  const target = manifest.assets[0]
  await writeFile(join(gameRoot, 'public', target.path), 'corrupted')
  await runner.execute('validateAssets', { gameId })
  await runner.execute('generateAssets', { gameId, assetIds: [target.id], seed: 7 })
  const result = await runner.execute('validateAssets', { gameId })
  expect((result.content as { statuses: Record<string, string> }).statuses[target.id]).toBe('validated')
})
```

(The third test uses `generateAssets` for recovery; Task 5's `regenerateAsset` gets its own tests.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project editor-mcp-server -t 'check:assets'`
Expected: FAIL — response has no `passed`/`statuses`.

- [ ] **Step 3: Implement**

In `tools/editor-mcp-server/src/assetTools.ts`, inside the `validateAssets` branch after the structural pass:

```ts
      // Media pass: bytes-level validation per entry, then status write-back.
      const spec = await readGameSpecOptional(deps.repoRoot, gameId)   // extract from readGameSpec: null on ENOENT
      const style = spec ? deriveStyleParams(spec.direction, composition?.source?.seed ?? 0) : null
      const mediaIssues: AssetIssue[] = []
      const statuses: Record<string, AssetStatus> = {}
      const updatedAssets = await Promise.all(manifest.assets.map(async (entry) => {
        let bytes: Uint8Array | null = null
        try {
          bytes = new Uint8Array(await readFile(join(deps.repoRoot, 'games', gameId, 'public', entry.path)))
        } catch {
          bytes = null
        }
        const entryIssues: AssetIssue[] = bytes === null
          ? [{ severity: 'error', code: 'asset-media-invalid', assetId: entry.id, message: `Asset file missing: ${entry.path}` }]
          : style ? validateAssetMedia(entry, bytes, style) : []
        mediaIssues.push(...entryIssues)
        const status: AssetStatus =
          entryIssues.length > 0 ? 'failed'
          : entry.status === 'generated' || entry.status === 'failed' ? 'validated'
          : entry.status
        statuses[entry.id] = status
        return { ...entry, status }
      }))
      const updatedManifest = { formatVersion: 2 as const, assets: updatedAssets }
      await writeFile(
        join(deps.repoRoot, 'games', gameId, 'public', 'assets', 'assets.json'),
        `${JSON.stringify(updatedManifest, null, 2)}\n`
      )
      const allIssues = [...issues, ...mediaIssues]
      const errors = allIssues.filter((issue) => issue.severity === 'error')
      const passed = errors.length === 0 && updatedAssets.every((entry) => entry.status === 'validated')
      const { hash: contentHash } = await deps.snapshotContent(gameId)
      await engine.runGuarded('check:assets', { contentHash }, async () => ({ passed, contentHash }))
      await reconcileAssetFindings(engine, errors, hashJson({ manifest: updatedManifest, composition }))
      return ok({
        issues: allIssues, passed, statuses,
        errorCount: errors.length, warningCount: allIssues.length - errors.length
      })
```

Adjustments while implementing (read the surrounding code): reuse the existing `issues`/`errors` variables instead of duplicating; add `snapshotContent` to `AssetToolDeps` and thread it in `server.ts` exactly as `composeTools` receives it; `readGameSpecOptional` is the existing `readGameSpec` with the ENOENT throw replaced by `return null` (keep `generateAssets` throwing). A `failed → validated` flip is legitimate only because the media pass just re-ran clean — the evaluator is the sole status writer, so this is its decision to make. Structural validation runs against the ORIGINAL manifest text (unchanged behavior); the status write-back happens after.

Update the `validateAssets` description in `packages/contracts/src/assetTools.ts`:

```ts
  validateAssets: 'Run structural + media asset validation, flip generated→validated / →failed statuses, persist findings, and record the check:assets gate step.',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS (new + existing asset tool tests; existing tests may need their expected response shape extended with `passed`/`statuses` — that is this task's intended API change, not a regression).

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server packages/contracts
git commit -m "feat(editor-mcp-server): media validation pass with status write-back + check:assets step"
```

---

### Task 5: `regenerateAsset` tool + `asset` release gate in slice evidence

**Files:**
- Modify: `packages/contracts/src/assetTools.ts` (new tool name, arg schema, description)
- Modify: `tools/editor-mcp-server/src/assetTools.ts` (the runner branch)
- Modify: `tools/editor-mcp-server/src/composeTools.ts` (GATES gains the asset gate)
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts`, `tools/editor-mcp-server/tests/composeTools.test.ts` (extend in style)

**Interfaces:**
- Produces:

```ts
// contracts assetTools.ts
export type AssetToolName = 'listAssets' | 'validateAssets' | 'generateAssets' | 'regenerateAsset'
regenerateAsset: z.strictObject({
  gameId: gameSlugSchema,
  assetId: z.string().min(1).max(60),
  seed: z.number().int().min(0).optional()
})
// composeTools.ts GATES gains:
{ kind: 'asset' as const, step: 'check:assets' }
```

`regenerateAsset` re-runs exactly one requirement through `generateGameAssets` (which includes the optimize stage) behind `engine.runGuarded('asset:regenerate', { assetId, seed, specVersion }, …)`; the merged entry keeps the previous entry's `references`, resets provenance/transformations from the fresh run, and lands as `generated` (validation is a separate, explicit step). Every other file and manifest entry is byte-for-byte untouched.

- [ ] **Step 1: Write the failing tests**

Append to `tools/editor-mcp-server/tests/assetTools.test.ts`:

```ts
it('regenerates exactly one asset behind its stable id, leaving every other byte untouched', async () => {
  await runner.execute('generateAssets', { gameId, seed: 7 })
  await runner.execute('validateAssets', { gameId })
  const before = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
  const [target, ...others] = before.assets
  const otherBytes = await Promise.all(others.map(async (entry: { path: string }) =>
    Buffer.from(await readFile(join(gameRoot, 'public', entry.path))).toString('hex')))

  const result = await runner.execute('regenerateAsset', { gameId, assetId: target.id, seed: 7 })
  expect(result.ok).toBe(true)

  const after = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
  const regenerated = after.assets.find((entry: { id: string }) => entry.id === target.id)
  expect(regenerated.status).toBe('generated')            // fresh lifecycle: revalidation is explicit
  expect(regenerated.references).toEqual(target.references) // consumers unchanged
  const untouched = after.assets.filter((entry: { id: string }) => entry.id !== target.id)
  expect(untouched).toEqual(others)                        // entries byte-identical
  const otherBytesAfter = await Promise.all(others.map(async (entry: { path: string }) =>
    Buffer.from(await readFile(join(gameRoot, 'public', entry.path))).toString('hex')))
  expect(otherBytesAfter).toEqual(otherBytes)
  // same-seed regeneration is idempotent: the file equals the original generation
  const targetBytes = await readFile(join(gameRoot, 'public', target.path))
  await runner.execute('regenerateAsset', { gameId, assetId: target.id, seed: 7 })
  expect(await readFile(join(gameRoot, 'public', target.path))).toEqual(targetBytes)
})

it('rejects unknown asset ids and missing seeds with typed errors', async () => {
  await expect(runner.execute('regenerateAsset', { gameId, assetId: 'nope', seed: 7 }))
    .rejects.toThrow(/Unknown asset id/)
  // gameRootNoComposition: a fixture game without composition.json and no explicit seed
  await expect(runner.execute('regenerateAsset', { gameId: gameIdNoComposition, assetId: validId }))
    .rejects.toThrow(/No seed/)
})
```

Append to `tools/editor-mcp-server/tests/composeTools.test.ts` (find the existing slice-evidence test and mirror its setup):

```ts
it('slice evidence includes the asset gate and fails it while assets are not validated', async () => {
  // after composeGame + generateAssets but BEFORE validateAssets:
  const evidence = await assembleEvidenceForTest(gameId)   // whatever helper the file already uses
  const assetGate = evidence.gates.find((gate) => gate.kind === 'asset')
  expect(assetGate).toBeDefined()
  expect(['missing', 'failed', 'stale']).toContain(assetGate!.status)
  // after validateAssets passes:
  await assetRunner.execute('validateAssets', { gameId })
  const evidenceAfter = await assembleEvidenceForTest(gameId)
  expect(evidenceAfter.gates.find((gate) => gate.kind === 'asset')!.status).toBe('passed')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project editor-mcp-server -t regenerate`
Expected: FAIL — `Unknown asset tool "regenerateAsset"`.

- [ ] **Step 3: Implement**

`packages/contracts/src/assetTools.ts` — add the name, schema (above), and description:

```ts
  regenerateAsset: 'Re-run exactly one asset\'s provider behind its stable logical id (hash-guarded, seeded). Resets it to status "generated" with fresh provenance; other assets are untouched. Follow with validateAssets.'
```

`tools/editor-mcp-server/src/assetTools.ts` — new branch before the shared tail:

```ts
      if (name === 'regenerateAsset') {
        const args = parseAssetToolArgs(name, raw) as { gameId: string; assetId: string; seed?: number }
        const spec = await readGameSpec(deps.repoRoot, args.gameId)
        const requirement = spec.assets.find((entry) => entry.id === args.assetId)
        if (!requirement) {
          throw new Error(`Unknown asset id "${args.assetId}"; spec declares: ${spec.assets.map((entry) => entry.id).join(', ')}`)
        }
        const composition = await readComposition(deps.repoRoot, args.gameId)
        const seed = args.seed ?? composition?.source?.seed
        if (seed === undefined) {
          throw new Error('No seed: pass an explicit seed or compose the game first (composition.json source.seed)')
        }
        const engine = await deps.ensureEngine(args.gameId)
        const guarded = await engine.runGuarded('asset:regenerate', { assetId: args.assetId, seed, specVersion: spec.specVersion }, async () => {
          const [generated] = await generateGameAssets({
            requirements: [requirement], direction: spec.direction, seed, specVersion: spec.specVersion
          })
          return { path: generated!.path, entry: generated!.entry, bytesBase64: Buffer.from(generated!.bytes).toString('base64') }
        })
        const output = guarded.output as { path: string; entry: AssetManifestEntry; bytesBase64: string }
        const publicDir = join(deps.repoRoot, 'games', args.gameId, 'public')
        await mkdir(dirname(join(publicDir, output.path)), { recursive: true })
        await writeFile(join(publicDir, output.path), Buffer.from(output.bytesBase64, 'base64'))
        const existingText = await readManifestText(deps.repoRoot, args.gameId)
        const existing = existingText ? parseAssetManifest(existingText) : { formatVersion: 2 as const, assets: [] }
        const previous = existing.assets.find((entry) => entry.id === args.assetId)
        const entry = { ...output.entry, references: previous?.references ?? output.entry.references }
        const manifest = mergeManifest(existingText, [entry])
        await mkdir(join(publicDir, 'assets'), { recursive: true })
        await writeFile(join(publicDir, 'assets', 'assets.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        return ok({ id: entry.id, path: output.path, seed, status: entry.status, cached: guarded.cached })
      }
```

`tools/editor-mcp-server/src/composeTools.ts` — extend GATES:

```ts
const GATES = [
  { kind: 'build' as const, step: 'check:build' },
  { kind: 'test' as const, step: 'check:test' },
  { kind: 'browser' as const, step: 'check:browser' },
  { kind: 'evaluate' as const, step: 'check:evaluate' },
  { kind: 'asset' as const, step: 'check:assets' }
]
```

The evidence loop already handles `passed`-shaped results (`build`/`browser` path); `check:assets` results carry `{ passed, contentHash }`, so no loop changes — verify by reading the branch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS. Existing slice-evidence tests that enumerate gates gain the `asset` row — update their expectations in this task (intended API change).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts tools/editor-mcp-server
git commit -m "feat(editor-mcp-server): regenerateAsset tool + asset release gate in slice evidence"
```

---

### Task 6: Compose wiring — real providers in `composeGame` (BLOCKED until Phase 4 cycle 3 closes — Task 12)

**Files:**
- Modify: `packages/game-compose/src/compose.ts` (async; providers replace the stub SVG path)
- Modify: `packages/game-compose/package.json` (add `"@automata/asset-providers": "*"`)
- Modify: `tools/editor-mcp-server/src/composedWriter.ts` (binary file variant)
- Modify: `tools/editor-mcp-server/src/composeTools.ts` (await + writer passthrough — verify, likely no change beyond types)
- Test: `packages/game-compose/tests/compose.test.ts`, `tools/editor-mcp-server/tests/composedWriter.test.ts`

**Interfaces:**
- Produces:

```ts
// game-compose
export type ComposedFile = { path: string; text: string } | { path: string; base64: string }
export async function composeGame(args: { spec: GameSpec; seed: number; specHash: string }): Promise<ComposeResult>
```

All spec asset requirements (every kind) generate through `generateGameAssets` (optimize stage included); entries land `status: 'generated'` with `references: ['public/project/composition.json']`; `iconPath` resolves from the generated `ui` entry; the stub `drawIconSvg` and `'stub-generator'` provenance are deleted. The RNG draw order for sections is UNCHANGED (asset generation uses child seeds from the same `seed`, not draws from the section `rng`) — section configs stay byte-identical; only asset bytes/manifest change.

- [ ] **Step 1: Confirm the dependency cleared**

Run: `git log --oneline -5 -- packages/game-compose/src/compose.ts` and `git log --oneline -5 -- docs/ROADMAP.md`
Expected: Phase 4 cycle 3's "compose schedules section" commit AND its cycle-close commit ("docs: Phase 4 cycle 3 shipped …") are both present — the close commit proves its bit-identical first-light recompose gate already ran against the pre-provider compose path. If either is missing, STOP — this task is blocked.

- [ ] **Step 2: Write the failing tests**

In `packages/game-compose/tests/compose.test.ts` add (and convert existing `composeGame` call sites in this file to `await` — the signature change is this task's point):

```ts
it('generates every spec asset requirement through the provider registry', async () => {
  const spec = specWithAssets([
    { id: 'icon-a', kind: 'ui', description: 'emblem' },
    { id: 'crate-a', kind: 'model', description: 'crate' },
    { id: 'blip-a', kind: 'audio', description: 'blip' }
  ])
  const result = await composeGame({ spec, seed: 11, specHash: 'hash-11' })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.assetManifest.assets.map((entry) => entry.status)).toEqual(['generated', 'generated', 'generated'])
  expect(result.assetManifest.assets.every((entry) => entry.provenance.provider !== 'stub-generator')).toBe(true)
  expect(result.assetManifest.assets.every((entry) => entry.references.includes('public/project/composition.json'))).toBe(true)
  const wavFile = result.files.find((file) => file.path.endsWith('.wav'))!
  expect('base64' in wavFile).toBe(true)
})

it('same seed composes byte-identical output including generated assets', async () => {
  const spec = specWithAssets([{ id: 'icon-a', kind: 'ui', description: 'emblem' }])
  const a = await composeGame({ spec, seed: 11, specHash: 'hash-11' })
  const b = await composeGame({ spec, seed: 11, specHash: 'hash-11' })
  expect(a).toEqual(b)
})

it('section configs are unchanged by asset generation (no new rng draws)', async () => {
  const spec = specWithCapabilities(['interaction-inventory', 'dialogue-quests'])
  const result = await composeGame({ spec, seed: 11, specHash: 'hash-11' })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  // compare pack configs against the frozen cycle-3 golden captured by Phase 4
  // cycle 3 Task 11 (tests/fixtures/frozen-inv-dlg.json): composition.packs must
  // deep-equal the golden's packs. The golden's asset manifest/files are
  // superseded by this task — Step 4 relaxes the golden test to packs-only.
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project game-compose`
Expected: FAIL — `composeGame` is sync and still emits `stub-generator` entries.

- [ ] **Step 4: Implement**

In `packages/game-compose/src/compose.ts`:

- `import { generateGameAssets } from '@automata/asset-providers'`; make `composeGame` `async` returning `Promise<ComposeResult>`.
- Change `ComposedFile` to the union above.
- Delete `drawIconSvg` and the `uiAssets` stub loop. In its place (same position in the flow, BEFORE the section rng draws so `iconPath` is available — asset generation takes no draws from `rng`):

```ts
  const generated = await generateGameAssets({
    requirements: spec.assets, direction: spec.direction, seed, specVersion: spec.specVersion
  })
  const assetFiles: ComposedFile[] = generated.map((asset) => ({
    path: `public/${asset.path}`,
    base64: Buffer.from(asset.bytes).toString('base64')
  }))
  const assetManifest: AssetManifest = {
    formatVersion: 2,
    assets: generated.map((asset) => ({
      ...asset.entry,
      references: ['public/project/composition.json']
    }))
  }
  const iconPath = assetManifest.assets.find((entry) => entry.requirement.kind === 'ui')?.path ?? null
```

- **Relax the frozen-golden test** (committed by Phase 4 cycle 3 Task 11 in `packages/game-compose/tests/compose.test.ts` against `tests/fixtures/frozen-inv-dlg.json`): this task legitimately changes asset bytes/manifest and makes the result async, so full-output equality can no longer hold. Change its assertion to compare `result.composition.packs` (and only packs) against the golden's `composition.packs`, `await`ing the call. Do NOT regenerate or edit the fixture file itself — the committed golden's pack configs remain the frozen baseline; shrinking the comparison scope is this task's reviewed act.
- Composition `assets` mapping and file list stay as-is (they read `assetManifest.assets`).
- In `tools/editor-mcp-server/src/composedWriter.ts`, extend the file type and write step: `'text' in file ? fs.writeFile(target, file.text) : fs.writeFile(target, Buffer.from(file.base64, 'base64'))` (update the `ComposedWriterFs.writeFile` signature to accept `string | Uint8Array`). Extend its tests with a base64 round-trip case.
- In `composeTools.ts` the `runSeededStep` callback already awaits `composeGame` — verify types compile; the cached-replay path re-writes both variants through the same writer.

- [ ] **Step 5: Run tests + full server suite**

Run: `npx vitest run --project game-compose --project editor-mcp-server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/game-compose tools/editor-mcp-server package-lock.json
git commit -m "feat(game-compose): real provider assets in composeGame (binary composed files)"
```

---

### Task 7: first-light baseline update (reviewed) + release-gate proof + docs close

**Files:**
- Modify: `games/first-light/public/assets/*`, `games/first-light/public/project/composition.json` (recompose artifacts — reviewed diff)
- Modify: `docs/ROADMAP.md`, this plan's progress header, decomposition-doc sub-cycle index

- [ ] **Step 1: Recompose first-light and review the intended diff**

Recompose through the repo's established flow (same proof path as Phase 4 cycle 3 Task 12). Run `git diff --stat games/first-light`.
Expected: changes ONLY under `public/assets/` and `public/project/composition.json` (+ `public/assets/assets.json`): stub icon replaced by provider output, manifest entries now `generated` with real provenance and an optimization transformation. Section configs (`resources/tuning.resource.json`, pack configs inside `composition.json`) must be unchanged — any diff there is a draw-order regression; STOP and fix. Commit the reviewed baseline:

```bash
git add games/first-light
git commit -m "chore(first-light): reviewed baseline - provider-generated assets via compose"
```

- [ ] **Step 2: End-to-end release-gate proof**

Against a temp workspace game (the MCP test fixtures or a scratch `new-game`):

1. `composeGame` → `generateAssets` implicit via compose → `validateAssets` → gate `passed: true`, all `validated`.
2. Corrupt one asset file on disk → `validateAssets` → `passed: false`, entry `failed`, slice evidence `asset` gate `failed`.
3. `regenerateAsset` that id (same seed) → `validateAssets` → `passed: true` again.

Expected: exactly the lifecycle above; step 3 proves the Phase 7 repair hook end-to-end.

- [ ] **Step 3: Run the full gate set**

```bash
npm run ci
npm run verify:new-game
```

Expected: green.

- [ ] **Step 4: Update docs**

- `docs/ROADMAP.md` Phase 5 cycles: cycle 3 → `Shipped` (date + plan link). All three Phase 5 cycles are now shipped — move Phase 5 itself to `Shipped` in section 3 and add the section-1 entry (newest first) with the merge commit, per the roadmap's own discipline.
- `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` sub-cycle index: mark `Asset validation + optimization + independent regeneration — completed`.
- This plan's `**Implementation progress:**` line → 100%.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: Phase 5 cycle 3 shipped - asset pipeline complete"
```
