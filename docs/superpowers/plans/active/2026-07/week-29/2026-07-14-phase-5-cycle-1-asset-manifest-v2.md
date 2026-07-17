# Phase 5 Cycle 1 — Asset Manifest v2 + Provenance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 3 stub asset manifest with the real normalized v2 schema (provenance, determinism mode, license, transformations, status, references), migrate first-light, expose the manifest over MCP, and land structural asset validation — per the [Phase 5 umbrella spec](/docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md).

**Architecture:** All schemas and pure validation live in `@automata/contracts` (the schema leaf, which imports `zod` directly). `composeGame` in `@automata/game-compose` emits v2 entries. Two new MCP tools (`listAssets`, `validateAssets`) follow the exact `composeTools` pattern: arg schemas + defs in contracts, a runner in `tools/editor-mcp-server`, dispatch in `sessionHost.ts`. Findings from asset validation flow through the existing session findings surface under a new `'asset'` source.

**Tech Stack:** TypeScript, zod v4 (direct import in contracts only), vitest, npm workspaces, MCP server tooling.

**Progress:** 100% (26/26 steps complete)

## Global Constraints

- Work from the repo root.
- TDD: failing test before each behavior change.
- `packages/contracts` imports `zod` directly; everything else uses the `@automata/project` re-export.
- `games/first-light/tests/project/composition.test.ts` (compose parity) must be green at the end of every task that touches compose output or checked-in files — the checked-in `assets.json` and `composeGame`'s emitted manifest must change **in the same task**.
- Manifest entry counts / string bounds mirror the v1 stub's style: keep `.max()` bounds on every string and array.
- Run `npm run ci` before claiming done.
- Mark each step off in this document as it completes; make every commit listed.
- Parallel-safety with the Phase 4 cycle-1 plan: this plan owns `packages/contracts/src/assetManifest.ts`, `games/first-light/public/assets/assets.json`, and the **asset section** of `packages/game-compose/src/compose.ts` (lines ~44–57). It must not touch `packages/game-kit`, `packages/pack-*`, or the capability-selection region of `compose.ts`. Other shared files, all in distinct regions (merge, don't overwrite): `packages/game-compose/tests/compose.test.ts` (this plan edits asset assertions; Phase 4 appends one pack-set test) and the closeout docs (`docs/ROADMAP.md` §3 — this plan owns the Phase 5 section; decomposition design §5 — this plan owns the Phase 5 block).

---

### Task 1: Asset manifest v2 schema + v1 migration

**Files:**
- Rewrite: `packages/contracts/src/assetManifest.ts`
- Test: `packages/contracts/tests/assetManifest.test.ts` (create; check `ls packages/contracts/tests` first and follow the existing test-file naming if it differs)

**Interfaces:**
- Consumes: `assetRequirementSchema` from `./gameSpec` (existing).
- Produces (exact names later tasks and cycles 2–3 rely on):
  - `assetDeterminismSchema` → `{ kind: 'seeded' } | { kind: 'pinned', contentHash: string }`
  - `assetLicenseSchema` → `{ kind: 'generated' | 'licensed' | 'public-domain', notes: string }`
  - `assetProvenanceSchema` → `{ provider, providerVersion, generator, sourceParams, seed, specVersion, determinism, license }`
  - `assetTransformationSchema` → `{ tool, toolVersion, params }`
  - `assetStatusSchema` → `'placeholder' | 'generated' | 'validated' | 'failed'`
  - `assetManifestEntrySchema`, `assetManifestSchema` (`formatVersion: 2`), types `AssetManifest`, `AssetManifestEntry`, `AssetProvenance`, `AssetStatus`
  - `migrateAssetManifest(legacy): AssetManifest` and `parseAssetManifest(text: string): AssetManifest` (accepts v1 → migrates, v2 → validates, others → throws)

- [x] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/assetManifest.test.ts
import { describe, expect, it } from 'vitest'
import { assetManifestSchema, migrateAssetManifest, parseAssetManifest } from '../src/assetManifest'

const v1Manifest = {
  formatVersion: 1,
  assets: [{
    id: 'item-icon',
    requirement: { id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD.' },
    path: 'assets/item-icon.svg',
    provenance: { provider: 'stub-generator', generator: 'svg-icon@1', specVersion: 1, seed: 933489342 },
    validation: { status: 'placeholder' }
  }]
}

const v2Entry = {
  id: 'item-icon',
  requirement: { id: 'item-icon', kind: 'ui' as const, description: 'Light-cell icon for the inventory HUD.' },
  path: 'assets/item-icon.svg',
  provenance: {
    provider: 'stub-generator',
    providerVersion: '1.0.0',
    generator: 'svg-icon@1',
    sourceParams: {},
    seed: 933489342,
    specVersion: 1,
    determinism: { kind: 'seeded' as const },
    license: { kind: 'generated' as const, notes: 'Procedurally generated placeholder.' }
  },
  transformations: [],
  status: 'placeholder' as const,
  references: ['public/project/composition.json']
}

describe('asset manifest v2', () => {
  it('accepts a valid v2 manifest', () => {
    const parsed = assetManifestSchema.parse({ formatVersion: 2, assets: [v2Entry] })
    expect(parsed.assets[0]!.provenance.determinism).toEqual({ kind: 'seeded' })
  })

  it('pinned determinism requires a contentHash', () => {
    const pinned = { ...v2Entry, provenance: { ...v2Entry.provenance, determinism: { kind: 'pinned', contentHash: 'abc123' } } }
    expect(assetManifestSchema.parse({ formatVersion: 2, assets: [pinned] }).assets[0]!.provenance.determinism)
      .toEqual({ kind: 'pinned', contentHash: 'abc123' })
    const broken = { ...v2Entry, provenance: { ...v2Entry.provenance, determinism: { kind: 'pinned' } } }
    expect(() => assetManifestSchema.parse({ formatVersion: 2, assets: [broken] })).toThrow()
  })

  it('rejects unknown status values and unknown keys', () => {
    expect(() => assetManifestSchema.parse({ formatVersion: 2, assets: [{ ...v2Entry, status: 'shiny' }] })).toThrow()
    expect(() => assetManifestSchema.parse({ formatVersion: 2, assets: [{ ...v2Entry, extra: true }] })).toThrow()
  })

  it('migrates a v1 stub manifest to v2', () => {
    const migrated = migrateAssetManifest(v1Manifest as never)
    expect(migrated).toEqual({ formatVersion: 2, assets: [v2Entry] })
  })

  it('migration maps v1 validated status through, everything else to placeholder', () => {
    const validated = { ...v1Manifest, assets: [{ ...v1Manifest.assets[0]!, validation: { status: 'validated' } }] }
    expect(migrateAssetManifest(validated as never).assets[0]!.status).toBe('validated')
  })

  it('parseAssetManifest handles v1 (migrating), v2 (validating), and rejects others', () => {
    expect(parseAssetManifest(JSON.stringify(v1Manifest)).formatVersion).toBe(2)
    expect(parseAssetManifest(JSON.stringify({ formatVersion: 2, assets: [v2Entry] })).assets).toHaveLength(1)
    expect(() => parseAssetManifest(JSON.stringify({ formatVersion: 3, assets: [] }))).toThrow(/Unsupported asset manifest formatVersion/)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/contracts/tests/assetManifest.test.ts`
Expected: FAIL — `migrateAssetManifest` / `parseAssetManifest` not exported; v2 schema absent.

- [x] **Step 3: Rewrite `packages/contracts/src/assetManifest.ts`**

```ts
import { z } from 'zod'
import { assetRequirementSchema } from './gameSpec'

/**
 * Phase 5 asset manifest v2: the normalized, versioned record behind every
 * asset. Stable logical id (= the spec's assetRequirement id) — everything
 * regenerates behind it. Provenance carries the determinism mode from day
 * one: 'seeded' (recomputable from seed+params) for procedural providers,
 * 'pinned' (reproduced by content hash) for future AI providers. `status`
 * gates the release: anything not 'validated' hard-fails the release gate,
 * which is how "fallbacks never ship" is a data rule rather than policy.
 */
export const assetDeterminismSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('seeded') }),
  z.strictObject({ kind: z.literal('pinned'), contentHash: z.string().min(1).max(128) })
])
export type AssetDeterminism = z.infer<typeof assetDeterminismSchema>

export const assetLicenseSchema = z.strictObject({
  kind: z.enum(['generated', 'licensed', 'public-domain']),
  notes: z.string().max(400)
})

export const assetProvenanceSchema = z.strictObject({
  provider: z.string().min(1).max(60),
  providerVersion: z.string().min(1).max(20),
  generator: z.string().min(1).max(60),
  sourceParams: z.record(z.string(), z.unknown()),
  seed: z.number().int().min(0),
  specVersion: z.number().int().min(1),
  determinism: assetDeterminismSchema,
  license: assetLicenseSchema
})
export type AssetProvenance = z.infer<typeof assetProvenanceSchema>

export const assetTransformationSchema = z.strictObject({
  tool: z.string().min(1).max(60),
  toolVersion: z.string().min(1).max(20),
  params: z.record(z.string(), z.unknown())
})

/** Only the asset evaluator sets 'validated'; providers emit 'generated' or 'placeholder'. */
export const assetStatusSchema = z.enum(['placeholder', 'generated', 'validated', 'failed'])
export type AssetStatus = z.infer<typeof assetStatusSchema>

export const assetManifestEntrySchema = z.strictObject({
  id: z.string().min(1).max(60),
  requirement: assetRequirementSchema,
  path: z.string().min(1).max(200),
  provenance: assetProvenanceSchema,
  transformations: z.array(assetTransformationSchema).max(20),
  status: assetStatusSchema,
  references: z.array(z.string().min(1).max(200)).max(40)
})
export type AssetManifestEntry = z.infer<typeof assetManifestEntrySchema>

export const assetManifestSchema = z.strictObject({
  formatVersion: z.literal(2),
  assets: z.array(assetManifestEntrySchema).max(80)
})
export type AssetManifest = z.infer<typeof assetManifestSchema>

/** The Phase 3 stub shape, kept only as the migration source. */
const legacyEntrySchema = z.strictObject({
  id: z.string().min(1).max(60),
  requirement: assetRequirementSchema,
  path: z.string().min(1).max(200),
  provenance: z.strictObject({
    provider: z.literal('stub-generator'),
    generator: z.string().min(1).max(60),
    specVersion: z.number().int().min(1),
    seed: z.number().int().min(0)
  }),
  validation: z.strictObject({ status: z.enum(['placeholder', 'validated']) })
})
const legacyManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  assets: z.array(legacyEntrySchema).max(80)
})
export type LegacyAssetManifest = z.infer<typeof legacyManifestSchema>

export function migrateAssetManifest(legacy: LegacyAssetManifest): AssetManifest {
  return {
    formatVersion: 2,
    assets: legacy.assets.map((entry) => ({
      id: entry.id,
      requirement: entry.requirement,
      path: entry.path,
      provenance: {
        provider: entry.provenance.provider,
        providerVersion: '1.0.0',
        generator: entry.provenance.generator,
        sourceParams: {},
        seed: entry.provenance.seed,
        specVersion: entry.provenance.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally generated placeholder.' }
      },
      transformations: [],
      status: entry.validation.status === 'validated' ? 'validated' : 'placeholder',
      references: ['public/project/composition.json']
    }))
  }
}

/** Single parse entry: v1 migrates, v2 validates, anything else is an error. */
export function parseAssetManifest(text: string): AssetManifest {
  const raw = JSON.parse(text) as { formatVersion?: unknown }
  if (raw.formatVersion === 1) return migrateAssetManifest(legacyManifestSchema.parse(raw))
  if (raw.formatVersion === 2) return assetManifestSchema.parse(raw)
  throw new Error(`Unsupported asset manifest formatVersion: ${String(raw.formatVersion)}`)
}
```

(`packages/contracts/src/index.ts` already has `export * from './assetManifest'` — no index change needed.)

- [x] **Step 4: Run tests; expect downstream compile failures to locate consumers**

Run: `npx vitest run packages/contracts/tests/assetManifest.test.ts`
Expected: PASS.

Run: `npx tsc -b 2>&1 | head -30` (or `npm run ci` and read the type errors)
Expected: `packages/game-compose/src/compose.ts` fails — it still builds a v1 literal. That is Task 2. **Do not commit a broken workspace: Tasks 1 and 2 commit together at Task 2 Step 5.**

---

### Task 2: `composeGame` emits v2 + first-light manifest migration (one atomic change)

**Files:**
- Modify: `packages/game-compose/src/compose.ts` (asset section, lines ~44–57)
- Modify: `packages/game-compose/tests/compose.test.ts` (v2 expectations)
- Rewrite: `games/first-light/public/assets/assets.json`

**Interfaces:**
- Consumes: `AssetManifest`, `AssetManifestEntry` v2 types (Task 1).
- Produces: `composeGame` emits `formatVersion: 2` manifests whose stub entries carry exactly: `provider: 'stub-generator'`, `providerVersion: '1.0.0'`, `generator: 'svg-icon@1'`, `sourceParams: {}`, `determinism: { kind: 'seeded' }`, `license: { kind: 'generated', notes: 'Procedurally generated placeholder.' }`, `transformations: []`, `status: 'placeholder'`, `references: ['public/project/composition.json']`. Key order in the emitted JSON matches the checked-in file below (compose parity is byte-for-byte).

- [x] **Step 1: Update the compose test expectations**

In `packages/game-compose/tests/compose.test.ts`, find every assertion on the asset manifest (search for `formatVersion: 1`, `validation`, `stub-generator`) and update to the v2 shape. Add:

```ts
it('emits a v2 asset manifest with seeded stub provenance', () => {
  const result = composeOk() // use the file's existing helper for a successful compose; adapt the name
  expect(result.assetManifest.formatVersion).toBe(2)
  const entry = result.assetManifest.assets[0]!
  expect(entry.status).toBe('placeholder')
  expect(entry.provenance.determinism).toEqual({ kind: 'seeded' })
  expect(entry.provenance.license.kind).toBe('generated')
  expect(entry.transformations).toEqual([])
  expect(entry.references).toEqual(['public/project/composition.json'])
})
```

(Adapt the successful-compose helper name to what the test file already uses — read it first.)

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run packages/game-compose/tests/compose.test.ts`
Expected: FAIL (still emitting v1) plus the Task 1 type error.

- [x] **Step 3: Update the asset section of `compose.ts`**

Replace lines ~47–56 (`const assetManifest: AssetManifest = { formatVersion: 1, ... }` through the `assetManifest.assets.push({...})` block) with:

```ts
  const assetManifest: AssetManifest = { formatVersion: 2, assets: [] }
  for (const requirement of uiAssets) {
    const path = `assets/${requirement.id}.svg`
    assetFiles.push({ path: `public/${path}`, text: drawIconSvg(rng) })
    assetManifest.assets.push({
      id: requirement.id, requirement, path,
      provenance: {
        provider: 'stub-generator',
        providerVersion: '1.0.0',
        generator: 'svg-icon@1',
        sourceParams: {},
        seed,
        specVersion: spec.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally generated placeholder.' }
      },
      transformations: [],
      status: 'placeholder',
      references: ['public/project/composition.json']
    })
  }
```

- [x] **Step 4: Rewrite `games/first-light/public/assets/assets.json`**

Exactly (2-space indent, trailing newline — matching `compose.ts`'s `json()` helper):

```json
{
  "formatVersion": 2,
  "assets": [
    {
      "id": "item-icon",
      "requirement": {
        "id": "item-icon",
        "kind": "ui",
        "description": "Light-cell icon for the inventory HUD."
      },
      "path": "assets/item-icon.svg",
      "provenance": {
        "provider": "stub-generator",
        "providerVersion": "1.0.0",
        "generator": "svg-icon@1",
        "sourceParams": {},
        "seed": 933489342,
        "specVersion": 1,
        "determinism": {
          "kind": "seeded"
        },
        "license": {
          "kind": "generated",
          "notes": "Procedurally generated placeholder."
        }
      },
      "transformations": [],
      "status": "placeholder",
      "references": [
        "public/project/composition.json"
      ]
    }
  ]
}
```

- [x] **Step 5: Verify parity byte-for-byte, then commit Tasks 1+2 together**

Run: `npx vitest run packages/contracts packages/game-compose games/first-light/tests/project/composition.test.ts`
Expected: ALL PASS — the parity test recomposes from seed `933489342` and compares each emitted file to the checked-in bytes; if `assets.json` differs, diff the two texts and fix key order in `compose.ts` (the emitted JSON follows object-literal insertion order).

```bash
git add packages/contracts/src/assetManifest.ts packages/contracts/tests/assetManifest.test.ts \
  packages/game-compose/src/compose.ts packages/game-compose/tests/compose.test.ts \
  games/first-light/public/assets/assets.json
git commit -m "feat(assets): manifest v2 with provenance, determinism mode, and status; migrate first-light"
```

---

### Task 3: Structural asset validation

**Files:**
- Create: `packages/contracts/src/assetValidation.ts`
- Modify: `packages/contracts/src/index.ts` (add export)
- Modify: `packages/contracts/src/session.ts` line 9 (`findingSourceSchema`)
- Test: `packages/contracts/tests/assetValidation.test.ts`

**Interfaces:**
- Consumes: `AssetManifest` (Task 1), `CompositionManifest` (existing).
- Produces:
  - `AssetIssue { severity: 'error' | 'warning'; code: 'asset-duplicate-id' | 'asset-duplicate-path' | 'asset-missing' | 'asset-orphaned' | 'asset-status-invalid'; assetId: string | null; message: string }`
  - `validateAssetManifest(manifest: AssetManifest, composition?: CompositionManifest | null): AssetIssue[]` — Task 4's `validateAssets` tool and cycle 3's full evaluator build on this.
  - `findingSourceSchema` gains `'asset'`.

- [x] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/assetValidation.test.ts
import { describe, expect, it } from 'vitest'
import { parseAssetManifest } from '../src/assetManifest'
import { validateAssetManifest } from '../src/assetValidation'
import { findingSourceSchema } from '../src/session'

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-icon',
  requirement: { id: 'item-icon', kind: 'ui', description: 'Icon.' },
  path: 'assets/item-icon.svg',
  provenance: {
    provider: 'stub-generator', providerVersion: '1.0.0', generator: 'svg-icon@1',
    sourceParams: {}, seed: 1, specVersion: 1,
    determinism: { kind: 'seeded' }, license: { kind: 'generated', notes: '' }
  },
  transformations: [],
  status: 'placeholder',
  references: ['public/project/composition.json'],
  ...overrides
})
const manifest = (assets: unknown[]) => parseAssetManifest(JSON.stringify({ formatVersion: 2, assets }))
const composition = (assets: Array<{ id: string; path: string }>) => ({
  formatVersion: 1 as const, gameId: 'first-light', source: null, packs: [], assets
})

describe('validateAssetManifest (structural slice of the asset evaluator)', () => {
  it('passes a consistent manifest + composition', () => {
    const issues = validateAssetManifest(
      manifest([entry()]),
      composition([{ id: 'item-icon', path: 'assets/item-icon.svg' }])
    )
    expect(issues).toEqual([])
  })

  it('flags duplicate ids and duplicate paths as errors', () => {
    const issues = validateAssetManifest(manifest([entry(), entry()]), null)
    const codes = issues.map((issue) => issue.code).sort()
    expect(codes).toEqual(['asset-duplicate-id', 'asset-duplicate-path'])
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true)
  })

  it('flags composition assets missing from the manifest as errors', () => {
    const issues = validateAssetManifest(manifest([]), composition([{ id: 'item-icon', path: 'assets/item-icon.svg' }]))
    expect(issues).toEqual([expect.objectContaining({ code: 'asset-missing', severity: 'error', assetId: 'item-icon' })])
  })

  it('flags manifest assets absent from the composition as warnings', () => {
    const issues = validateAssetManifest(manifest([entry()]), composition([]))
    expect(issues).toEqual([expect.objectContaining({ code: 'asset-orphaned', severity: 'warning', assetId: 'item-icon' })])
  })

  it('flags a stub-generator asset claiming validated status as an error', () => {
    const issues = validateAssetManifest(manifest([entry({ status: 'validated' })]), null)
    expect(issues).toEqual([expect.objectContaining({ code: 'asset-status-invalid', severity: 'error', assetId: 'item-icon' })])
  })

  it("the findings surface accepts the 'asset' source", () => {
    expect(findingSourceSchema.parse('asset')).toBe('asset')
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run packages/contracts/tests/assetValidation.test.ts`
Expected: FAIL — module not found; `'asset'` not in the source enum.

- [x] **Step 3: Implement**

In `packages/contracts/src/session.ts` line 9, add `'asset'`:

```ts
export const findingSourceSchema = z.enum(['build', 'test', 'browser', 'eval', 'validate', 'session', 'spec', 'compose', 'asset'])
```

```ts
// packages/contracts/src/assetValidation.ts
import type { AssetManifest } from './assetManifest'
import type { CompositionManifest } from './composition'

/**
 * Structural slice of the Phase 5 asset evaluator: pure manifest/composition
 * consistency. Media-level validation (dimensions, budgets, import success,
 * visual family, browser compatibility) arrives in cycle 3 on top of this.
 */
export interface AssetIssue {
  severity: 'error' | 'warning'
  code: 'asset-duplicate-id' | 'asset-duplicate-path' | 'asset-missing' | 'asset-orphaned' | 'asset-status-invalid'
  assetId: string | null
  message: string
}

export function validateAssetManifest(manifest: AssetManifest, composition?: CompositionManifest | null): AssetIssue[] {
  const issues: AssetIssue[] = []
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const entry of manifest.assets) {
    if (ids.has(entry.id)) {
      issues.push({ severity: 'error', code: 'asset-duplicate-id', assetId: entry.id, message: `Duplicate asset id "${entry.id}"` })
    }
    ids.add(entry.id)
    if (paths.has(entry.path)) {
      issues.push({ severity: 'error', code: 'asset-duplicate-path', assetId: entry.id, message: `Duplicate asset path "${entry.path}"` })
    }
    paths.add(entry.path)
    if (entry.status === 'validated' && entry.provenance.provider === 'stub-generator') {
      issues.push({ severity: 'error', code: 'asset-status-invalid', assetId: entry.id, message: `Stub asset "${entry.id}" can never be 'validated' — placeholders must not ship` })
    }
  }
  if (composition) {
    for (const ref of composition.assets) {
      if (!ids.has(ref.id)) {
        issues.push({ severity: 'error', code: 'asset-missing', assetId: ref.id, message: `Composition references asset "${ref.id}" missing from the manifest` })
      }
    }
    const referenced = new Set(composition.assets.map((ref) => ref.id))
    for (const entry of manifest.assets) {
      if (!referenced.has(entry.id)) {
        issues.push({ severity: 'warning', code: 'asset-orphaned', assetId: entry.id, message: `Manifest asset "${entry.id}" is not referenced by the composition` })
      }
    }
  }
  return issues
}
```

Add to `packages/contracts/src/index.ts`:

```ts
export * from './assetValidation'
```

- [x] **Step 4: Run to verify green** (including no fallout from the widened enum)

Run: `npx vitest run packages/contracts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/contracts/src/assetValidation.ts packages/contracts/src/session.ts \
  packages/contracts/src/index.ts packages/contracts/tests/assetValidation.test.ts
git commit -m "feat(contracts): structural asset validation + 'asset' finding source"
```

---

### Task 4: MCP tools — `listAssets` and `validateAssets`

**Files:**
- Create: `packages/contracts/src/assetTools.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `tools/editor-mcp-server/src/assetTools.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts`
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts` (check `ls tools/editor-mcp-server/tests` first; if server tests live elsewhere — e.g. a `test/` dir or co-located — follow that convention and mirror how the existing `composeTools`/`specTools` tests build their deps)

**Interfaces:**
- Consumes: `parseAssetManifest`, `validateAssetManifest`, `parseCompositionManifest` (Tasks 1+3, existing), `SessionEngine.addFinding`/`autoResolve` (existing build-session surface, used exactly as `composeTools.ts` uses them).
- Produces:
  - `AssetToolName = 'listAssets' | 'validateAssets'`; `assetToolArgSchemas` (both `z.strictObject({ gameId: gameSlugSchema })`); `assetToolDefs(): ToolDef[]`; `parseAssetToolArgs(name, args)` — mirroring `composeTools.ts` in contracts exactly.
  - Server runner `createAssetToolRunner(deps: { repoRoot: string; ensureEngine(gameId: string): Promise<SessionEngine> })` with `execute(name, raw): Promise<ToolResult>`:
    - `listAssets` → `{ formatVersion: 2, assets: [{ id, kind, path, status, provenance }] }` where `provenance` is the entry's **full** provenance object (the umbrella spec's cycle-1 scope is "list assets, show provenance, query status" — no field trimming), or `{ missing: true, assets: [] }` when no manifest exists.
    - `validateAssets` → `{ issues, errorCount, warningCount }`; persists error findings under source `'asset'`, calls `autoResolve('asset')` when clean.

- [x] **Step 1: Write the contracts tool defs** (schema-only, no test needed beyond compile — the pattern is `composeTools.ts` verbatim)

```ts
// packages/contracts/src/assetTools.ts
import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/** Phase 5 tools: inspect and structurally validate a game's asset manifest. */
export type AssetToolName = 'listAssets' | 'validateAssets'

export const assetToolArgSchemas = {
  listAssets: z.strictObject({ gameId: gameSlugSchema }),
  validateAssets: z.strictObject({ gameId: gameSlugSchema })
} as const satisfies Record<AssetToolName, z.ZodType>

const DESCRIPTIONS: Record<AssetToolName, string> = {
  listAssets: 'List the asset manifest: id, kind, path, status, and full provenance per asset.',
  validateAssets: 'Run structural asset validation (ids, paths, references, status rules) and persist findings.'
}

const NAMES = Object.keys(assetToolArgSchemas) as AssetToolName[]

export function assetToolDefs(): ToolDef[] {
  return NAMES.map((name) => ({ name, description: DESCRIPTIONS[name], schema: z.toJSONSchema(assetToolArgSchemas[name]) }))
}

export function parseAssetToolArgs(name: string, args: unknown): unknown {
  const schema = (assetToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown asset tool "${name}"`)
  return schema.parse(args)
}
```

Add to `packages/contracts/src/index.ts`:

```ts
export * from './assetTools'
```

- [x] **Step 2: Write the failing server-runner test**

```ts
// tools/editor-mcp-server/tests/assetTools.test.ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionEngine } from '@automata/build-session'
import { createAssetToolRunner } from '../src/assetTools'

const V2_MANIFEST = {
  formatVersion: 2,
  assets: [{
    id: 'item-icon',
    requirement: { id: 'item-icon', kind: 'ui', description: 'Icon.' },
    path: 'assets/item-icon.svg',
    provenance: {
      provider: 'stub-generator', providerVersion: '1.0.0', generator: 'svg-icon@1',
      sourceParams: {}, seed: 1, specVersion: 1,
      determinism: { kind: 'seeded' }, license: { kind: 'generated', notes: '' }
    },
    transformations: [],
    status: 'placeholder',
    references: ['public/project/composition.json']
  }]
}
const COMPOSITION = {
  formatVersion: 1, gameId: 'demo-game', source: null, packs: [],
  assets: [{ id: 'item-icon', path: 'assets/item-icon.svg' }]
}

async function setup(manifest: unknown | null) {
  const repoRoot = await mkdtemp(join(tmpdir(), 'asset-tools-'))
  const gameDir = join(repoRoot, 'games', 'demo-game', 'public')
  await mkdir(join(gameDir, 'assets'), { recursive: true })
  await mkdir(join(gameDir, 'project'), { recursive: true })
  if (manifest) await writeFile(join(gameDir, 'assets', 'assets.json'), JSON.stringify(manifest))
  await writeFile(join(gameDir, 'project', 'composition.json'), JSON.stringify(COMPOSITION))
  const { engine } = await createSessionEngine({
    sessionsRoot: join(repoRoot, '.automata', 'sessions'), gameId: 'demo-game',
    projectDir: join(gameDir, 'project'), engineVersion: 'test'
  })
  const runner = createAssetToolRunner({ repoRoot, ensureEngine: async () => engine })
  return { runner, engine }
}

describe('asset MCP tools', () => {
  it('listAssets returns each asset with its full provenance', async () => {
    const { runner } = await setup(V2_MANIFEST)
    const result = await runner.execute('listAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual({
      formatVersion: 2,
      assets: [{
        id: 'item-icon', kind: 'ui', path: 'assets/item-icon.svg',
        status: 'placeholder', provenance: V2_MANIFEST.assets[0]!.provenance
      }]
    })
  })

  it('listAssets reports a missing manifest without erroring', async () => {
    const { runner } = await setup(null)
    const result = await runner.execute('listAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual({ missing: true, assets: [] })
  })

  it('validateAssets returns issues and persists error findings under source asset', async () => {
    const bad = { ...V2_MANIFEST, assets: [{ ...V2_MANIFEST.assets[0]!, status: 'validated' }] }
    const { runner, engine } = await setup(bad)
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual(expect.objectContaining({ errorCount: 1, warningCount: 0 }))
    const finding = engine.session.findings.find((entry) => entry.source === 'asset')
    expect(finding).toBeDefined()
    expect(finding!.code).toBe('asset-status-invalid')
  })

  it('validateAssets auto-resolves asset findings when clean', async () => {
    const { runner, engine } = await setup(V2_MANIFEST)
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual(expect.objectContaining({ errorCount: 0 }))
    expect(engine.session.findings.filter((entry) => entry.source === 'asset' && entry.status !== 'resolved')).toEqual([])
  })
})
```

Adapt three details to the codebase while implementing (read the existing `composeTools`/`specTools` tests first): (1) `createSessionEngine`'s exact option names, (2) the finding record's resolved/open field name (`status` above — mirror whatever `engine.session.findings` really carries), (3) whether `engineVersion` accepts an arbitrary string in tests. The assertions' *behavioral* content is the contract.

- [x] **Step 3: Run to verify failure**

Run: `npx vitest run tools/editor-mcp-server/tests/assetTools.test.ts`
Expected: FAIL — `createAssetToolRunner` missing.

- [x] **Step 4: Implement the runner**

```ts
// tools/editor-mcp-server/src/assetTools.ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashJson, type SessionEngine } from '@automata/build-session'
import {
  parseAssetToolArgs, parseAssetManifest, parseCompositionManifest, validateAssetManifest,
  type AssetManifest, type CompositionManifest, type ToolResult
} from '@automata/contracts'

export interface AssetToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
}

const ok = (content: unknown): ToolResult => ({ ok: true, content })

async function readManifest(repoRoot: string, gameId: string): Promise<AssetManifest | null> {
  try {
    return parseAssetManifest(await readFile(join(repoRoot, 'games', gameId, 'public', 'assets', 'assets.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function readComposition(repoRoot: string, gameId: string): Promise<CompositionManifest | null> {
  try {
    return parseCompositionManifest(await readFile(join(repoRoot, 'games', gameId, 'public', 'project', 'composition.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export function createAssetToolRunner(deps: AssetToolDeps) {
  return {
    async execute(name: string, raw: unknown): Promise<ToolResult> {
      const { gameId } = parseAssetToolArgs(name, raw) as { gameId: string }
      const manifest = await readManifest(deps.repoRoot, gameId)
      if (name === 'listAssets') {
        if (!manifest) return ok({ missing: true, assets: [] })
        return ok({
          formatVersion: manifest.formatVersion,
          assets: manifest.assets.map((entry) => ({
            id: entry.id, kind: entry.requirement.kind, path: entry.path,
            status: entry.status, provenance: entry.provenance
          }))
        })
      }
      // validateAssets
      const engine = await deps.ensureEngine(gameId)
      if (!manifest) {
        return ok({ issues: [], errorCount: 0, warningCount: 0, missing: true })
      }
      const composition = await readComposition(deps.repoRoot, gameId)
      const issues = validateAssetManifest(manifest, composition)
      const inputHash = hashJson({ manifest, composition })
      const errors = issues.filter((issue) => issue.severity === 'error')
      for (const issue of errors) {
        await engine.addFinding({ source: 'asset', severity: 'error', code: issue.code, message: issue.message, inputHash })
      }
      if (errors.length === 0) await engine.autoResolve('asset')
      return ok({
        issues,
        errorCount: errors.length,
        warningCount: issues.length - errors.length
      })
    }
  }
}
```

- [x] **Step 5: Wire into `sessionHost.ts`**

Three edits in `tools/editor-mcp-server/src/sessionHost.ts`:

1. Extend the contracts import (line 5) with `assetToolDefs`:

```ts
import { assetToolDefs, composeToolDefs, sessionToolDefs, specToolDefs, splitClientStepId, workspaceToolDefs, writeToolNames, type McpToolHost, type ToolResult } from '@automata/contracts'
```

2. Import and instantiate the runner (next to `createComposeToolRunner` usage, ~line 36):

```ts
import { createAssetToolRunner } from './assetTools'
// … inside createSessionHost, after composeTools:
const assetTools = createAssetToolRunner({ repoRoot, ensureEngine })
```

3. Advertise and dispatch — in `listTools` (~line 104) add `...assetToolDefs(),` after `...composeToolDefs(),`; in `executeTool`, directly after the `composeGame/renderSliceReport/recordSliceDecision` dispatch line, add:

```ts
        if (name === 'listAssets' || name === 'validateAssets') return assetTools.execute(name, args)
```

- [x] **Step 6: Run to verify green**

Run: `npx vitest run tools/editor-mcp-server`
Expected: PASS — new tests plus all existing server tests (tool-listing snapshots may need the two new tools added; update those snapshots deliberately, not blindly).

- [x] **Step 7: Commit**

```bash
git add packages/contracts/src/assetTools.ts packages/contracts/src/index.ts \
  tools/editor-mcp-server/src/assetTools.ts tools/editor-mcp-server/src/sessionHost.ts \
  tools/editor-mcp-server/tests/assetTools.test.ts
git commit -m "feat(editor-mcp): listAssets + validateAssets tools over manifest v2"
```

---

### Task 5: Full verification, roadmap bookkeeping, closeout

**Files:**
- Modify: `docs/ROADMAP.md` (§3 Phase 5 heading + body)
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` (§5 Phase 5 index)

**Interfaces:** none — verification and documentation.

- [x] **Step 1: Full CI**

Run: `npm run ci`
Expected: PASS.

- [x] **Step 2: Compose parity one last time**

Run: `npx vitest run games/first-light/tests/project/composition.test.ts`
Expected: PASS.

- [x] **Step 3: Update ROADMAP.md**

In `docs/ROADMAP.md` §3, change the Phase 5 heading and body to:

```markdown
### Phase 5 — Asset pipeline · `In progress`

Umbrella spec: [`2026-07-14-phase-5-asset-pipeline-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md).

- **Goal:** a normalized, versioned asset manifest with provider adapters,
  provenance, validation, optimization, and stable independent replacement.
  **Exit:** a failed asset regenerates independently and every release asset has
  valid provenance and browser budgets.
- **Depends on:** Phase 3 complete. Runs in parallel with Phase 4.
- **Cycles:**
  - Cycle 1 — manifest v2 + provenance model + migration + structural
    validation + MCP surface — `Shipped` (plan:
    [`2026-07-14-phase-5-cycle-1-asset-manifest-v2.md`](superpowers/plans/active/2026-07/week-29/2026-07-14-phase-5-cycle-1-asset-manifest-v2.md)).
  - Cycle 2 — provider-adapter interface + first procedural adapters — `Next`.
  - Cycle 3 — asset validation (media) + optimization + independent
    regeneration — `Planned`.
```

- [x] **Step 4: Update the decomposition design's Phase 5 sub-cycle index**

In `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` §5, change the Phase 5 block's first item to:

```markdown
1. Asset manifest + provenance model — completed
```

- [x] **Step 5: Mark this plan complete and commit**

Every checkbox above should now be checked. Then:

```bash
git add docs/ROADMAP.md docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md \
  docs/superpowers/plans/active/2026-07/week-29/2026-07-14-phase-5-cycle-1-asset-manifest-v2.md
git commit -m "docs: Phase 5 cycle 1 shipped - asset manifest v2 with provenance and structural validation"
```
