# Phase 5 Cycle 7 — Cross-Asset Style-Family Evaluator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make style identity first-class manifest data (`formatVersion: 3`) and add a set-agreement evaluator that blocks the release gate when a game's assets do not share one style.

**Architecture:** `computeStyleId` hashes the resolved `StyleParams` into a stable id. `buildGeneratedAsset` stamps it on every asset unconditionally; the manifest records the style the game is *supposed* to have. `validateAssetManifest` — already the pure manifest evaluator — compares the two and names each stale asset.

**Tech Stack:** TypeScript, npm workspaces, vitest, zod v4 via `@automata/project`, node `crypto`.

**Spec:** [`2026-08-02-phase-5-cycle-7-style-family-evaluator-design.md`](../../../../specs/active/2026-08/week-31/2026-08-02-phase-5-cycle-7-style-family-evaluator-design.md)
**Umbrella:** [`2026-07-14-phase-5-asset-pipeline-design.md`](../../../../specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md)

## Global Constraints

- **Never `import { z } from 'zod'`.** Import `z` from `@automata/project`. Lint enforces this.
- **Vitest project filters use the directory name:** `npx vitest run --project contracts`. The package-name form fails.
- **`asset-providers`, `asset-providers-ai`, and `editor-mcp-server` declare no `test` script.** Use `npx vitest run --project <dir>`, never `npm test -w`.
- **`asset-providers` *computes* style ids; `contracts` only *compares* strings.** Do not import a hashing helper into `contracts` — `validateAssetManifest` must stay pure with no new imports.
- **Only asset manifests move to `formatVersion: 3`.** The same literal appears at ~30 sites for the **project** manifest (`automata.project.json`) across `packages/project`, `packages/editor`, `games/*`, and `tools/scaffold` — an unrelated schema. Touching those breaks the editor. Task 5 and Task 6 enumerate the five real sites.
- **Providers are not modified.** `GeneratedBytes.provenance` becomes `Omit<AssetProvenance, 'styleId'>` so the orchestrator owns `styleId` exactly as it already owns `path`. `svgProvider`, `propProvider`, `audioProvider`, `claudeSvgProvider`, and `claudePropProvider` need zero edits.
- **Verified zod behavior** (checked against this repo's zod v4 on 2026-08-02): `.omit()` and `.extend()` work on `strictObject` and preserve strictness; a `.nullable()` field without `.optional()` must still be present. The plan relies on all three.
- **No git worktrees** (AGENTS.md ground rule).
- **Run `npm run ci` and `npm run coverage`** before claiming the cycle is ready — `contracts` and `asset-providers` are coverage-sensitive.
- **Mark each step off in this document as it completes**, and make each documented commit.

---

### Task 1: `computeStyleId`

**Files:**
- Modify: `packages/asset-providers/src/styleParams.ts`
- Test: `packages/asset-providers/tests/styleParams.test.ts`

**Interfaces:**
- Consumes: `StyleParams` from `@automata/contracts`, `sha256Hex` from `./hash`.
- Produces: `canonicalStyleString(style: StyleParams): string` and `computeStyleId(style: StyleParams): string`. Tasks 4, 6, 7 use `computeStyleId`.

- [ ] **Step 1: Write the failing test**

Append to `packages/asset-providers/tests/styleParams.test.ts`:

```ts
import { canonicalStyleString, computeStyleId } from '../src/styleParams'
import type { StyleParams } from '@automata/contracts'

const base = (): StyleParams => ({
  palette: { baseHue: 210, accentHues: [90, 330], saturation: 0.7, lightness: 0.55 },
  audio: { waveform: 'sine', tempo: 'slow' }
})

describe('computeStyleId', () => {
  it('serializes canonically with a fixed field order', () => {
    expect(canonicalStyleString(base()))
      .toBe('base=210|accents=90,330|sat=0.7000|light=0.5500|wave=sine|tempo=slow')
  })

  it('is a stable 64-char hex digest', () => {
    const id = computeStyleId(base())
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(computeStyleId(base())).toBe(id)
  })

  it('changes when any of the six fields changes', () => {
    const ids = new Set([
      computeStyleId(base()),
      computeStyleId({ ...base(), palette: { ...base().palette, baseHue: 211 } }),
      computeStyleId({ ...base(), palette: { ...base().palette, accentHues: [91, 330] } }),
      computeStyleId({ ...base(), palette: { ...base().palette, saturation: 0.71 } }),
      computeStyleId({ ...base(), palette: { ...base().palette, lightness: 0.56 } }),
      computeStyleId({ ...base(), audio: { ...base().audio, waveform: 'square' } }),
      computeStyleId({ ...base(), audio: { ...base().audio, tempo: 'brisk' } })
    ])
    expect(ids.size).toBe(7)
  })

  it('treats accent order as significant', () => {
    expect(computeStyleId({ ...base(), palette: { ...base().palette, accentHues: [330, 90] } }))
      .not.toBe(computeStyleId(base()))
  })

  it('resolves finer than deriveStyleParams rounds', () => {
    // styleParams.ts rounds saturation/lightness to 2dp; toFixed(4) is strictly finer,
    // so no distinction the pipeline can produce is lost in the hash.
    expect(computeStyleId({ ...base(), palette: { ...base().palette, saturation: 0.7001 } }))
      .not.toBe(computeStyleId(base()))
  })
})
```

Fold the new imports into the file's existing import block.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project asset-providers styleParams`
Expected: FAIL — `canonicalStyleString` and `computeStyleId` are not exported.

- [ ] **Step 3: Implement**

Append to `packages/asset-providers/src/styleParams.ts`:

```ts
/**
 * Canonical style serialization: a FIXED field order, not key-sorted, because
 * StyleParams is a plain interface rather than a zod schema. The two floats go
 * through toFixed(4) so number-formatting variance cannot reach the hash;
 * deriveStyleParams rounds to 2dp, so 4 is strictly finer than anything the
 * pipeline produces. accentHues order is significant — two styles differing
 * only in accent order are different styles.
 */
export function canonicalStyleString(style: StyleParams): string {
  const { baseHue, accentHues, saturation, lightness } = style.palette
  return [
    `base=${baseHue}`,
    `accents=${accentHues.join(',')}`,
    `sat=${saturation.toFixed(4)}`,
    `light=${lightness.toFixed(4)}`,
    `wave=${style.audio.waveform}`,
    `tempo=${style.audio.tempo}`
  ].join('|')
}

/** Stable identity for a resolved style. Two assets cohere iff these match. */
export function computeStyleId(style: StyleParams): string {
  return sha256Hex(new TextEncoder().encode(canonicalStyleString(style)))
}
```

Add `import { sha256Hex } from './hash'` to the file's import block.

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project asset-providers styleParams`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): computeStyleId over canonical StyleParams"
```

---

### Task 2: Manifest `formatVersion: 3` and the v2→v3 migration

**Files:**
- Modify: `packages/contracts/src/assetManifest.ts` (provenance schema ~line 24, manifest schema 57-61, migration 82-112)
- Modify: `packages/contracts/src/assetProvider.ts:30-33` (`GeneratedBytes`)
- Test: `packages/contracts/tests/assetManifest.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 — `contracts` never computes a style id.
- Produces: `assetProvenanceSchema` with `styleId: string | null`; `assetManifestSchema` at `formatVersion: 3` with a top-level `styleId: string | null`; `migrateV2ToV3`; `parseAssetManifest` chaining v1→v2→v3. Tasks 3-8 depend on these.

- [ ] **Step 1: Write the failing test**

Append to `packages/contracts/tests/assetManifest.test.ts`:

```ts
describe('asset manifest v3', () => {
  it('requires styleId on the manifest and on provenance', () => {
    expect(() => assetManifestSchema.parse({ formatVersion: 3, assets: [] })).toThrow()
    expect(assetManifestSchema.parse({ formatVersion: 3, styleId: null, assets: [] }))
      .toEqual({ formatVersion: 3, styleId: null, assets: [] })
  })

  it('rejects the old formatVersion 2 shape', () => {
    expect(() => assetManifestSchema.parse({ formatVersion: 2, assets: [] })).toThrow()
  })

  it('migrates v2 to v3 with null styles', () => {
    const v2 = { formatVersion: 2, assets: [v2Entry] }
    const migrated = parseAssetManifest(JSON.stringify(v2))
    expect(migrated.formatVersion).toBe(3)
    expect(migrated.styleId).toBeNull()
    expect(migrated.assets[0]!.provenance.styleId).toBeNull()
  })

  it('chains v1 all the way to v3', () => {
    const v1 = {
      formatVersion: 1,
      assets: [{
        id: 'icon', requirement: { id: 'icon', kind: 'ui', description: 'An icon.' },
        path: 'assets/icon.svg',
        provenance: { provider: 'stub-generator', generator: 'stub', specVersion: 1, seed: 3 },
        validation: { status: 'placeholder' }
      }]
    }
    const migrated = parseAssetManifest(JSON.stringify(v1))
    expect(migrated.formatVersion).toBe(3)
    expect(migrated.styleId).toBeNull()
    expect(migrated.assets[0]!.provenance.styleId).toBeNull()
    expect(migrated.assets[0]!.status).toBe('placeholder')
  })

  it('round-trips a real styleId', () => {
    const withStyle = assetManifestSchema.parse({
      formatVersion: 3, styleId: 'a'.repeat(64),
      assets: [{ ...v2Entry, provenance: { ...v2Entry.provenance, styleId: 'a'.repeat(64) } }]
    })
    expect(withStyle.assets[0]!.provenance.styleId).toBe('a'.repeat(64))
  })

  it('still rejects an unsupported version', () => {
    expect(() => parseAssetManifest(JSON.stringify({ formatVersion: 4, assets: [] }))).toThrow(/formatVersion/)
  })
})
```

The file's existing `v2Entry` fixture has no `styleId`; leave it as-is — it is now the *v2* fixture and the migration tests consume it. Tests elsewhere in the file that call `assetManifestSchema.parse({ formatVersion: 2, ... })` directly (lines 36, 42, 45, 49, 50, 65) must switch to `formatVersion: 3` **and** add `styleId: null` at both levels; the `migrated` assertion at line 55 becomes `{ formatVersion: 3, styleId: null, assets: [{ ...v2Entry, provenance: { ...v2Entry.provenance, styleId: null } }] }`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project contracts assetManifest`
Expected: FAIL — `formatVersion: 3` is rejected by `z.literal(2)`.

- [ ] **Step 3: Add `styleId` to provenance and bump the manifest**

In `packages/contracts/src/assetManifest.ts`, add to `assetProvenanceSchema` (after `specVersion`):

```ts
  /** Identity of the StyleParams this asset was generated under; null when unrecorded. */
  styleId: z.string().min(1).max(64).nullable(),
```

Replace `assetManifestSchema` (lines 57-61):

```ts
export const assetManifestSchema = z.strictObject({
  formatVersion: z.literal(3),
  /** The style the game is supposed to have; null in migrated manifests. */
  styleId: z.string().min(1).max(64).nullable(),
  assets: z.array(assetManifestEntrySchema).max(80)
})
export type AssetManifest = z.infer<typeof assetManifestSchema>
```

- [ ] **Step 4: Add the v2 source shapes and the v2→v3 migration**

Still in `assetManifest.ts`, after the existing v1 legacy block (line 80), add:

```ts
/** The cycle-1 shape, kept as the v2→v3 migration source. */
const v2EntrySchema = assetManifestEntrySchema.extend({
  provenance: assetProvenanceSchema.omit({ styleId: true })
})
const v2ManifestSchema = z.strictObject({
  formatVersion: z.literal(2),
  assets: z.array(v2EntrySchema).max(80)
})
export type AssetManifestV2 = z.infer<typeof v2ManifestSchema>

/** v2 knew nothing about style identity, so both levels backfill to null. */
export function migrateV2ToV3(v2: AssetManifestV2): AssetManifest {
  return {
    formatVersion: 3,
    styleId: null,
    assets: v2.assets.map((entry) => ({
      ...entry,
      provenance: { ...entry.provenance, styleId: null }
    }))
  }
}
```

Change `migrateAssetManifest` to return the v2 shape, and rename it for honesty:

```ts
export function migrateV1ToV2(legacy: LegacyAssetManifest): AssetManifestV2 {
```

…keeping its body exactly as-is (it already produces `formatVersion: 2`). Then re-export the old name so nothing outside breaks:

```ts
/** @deprecated Prefer the explicit step names; kept for callers of the v1 entry point. */
export const migrateAssetManifest = migrateV1ToV2
```

Replace `parseAssetManifest` (lines 106-112):

```ts
/** Single parse entry: v1 and v2 migrate forward, v3 validates, anything else errors. */
export function parseAssetManifest(text: string): AssetManifest {
  const raw = JSON.parse(text) as { formatVersion?: unknown }
  if (raw.formatVersion === 1) {
    return migrateV2ToV3(migrateV1ToV2(legacyManifestSchema.parse(raw)))
  }
  if (raw.formatVersion === 2) return migrateV2ToV3(v2ManifestSchema.parse(raw))
  if (raw.formatVersion === 3) return assetManifestSchema.parse(raw)
  throw new Error(`Unsupported asset manifest formatVersion: ${String(raw.formatVersion)}`)
}
```

- [ ] **Step 5: Keep providers out of it**

In `packages/contracts/src/assetProvider.ts:30-33`:

```ts
export interface GeneratedBytes {
  bytes: Uint8Array
  /** The orchestrator stamps styleId, exactly as it owns path construction. */
  provenance: Omit<AssetProvenance, 'styleId'>
}
```

This is what keeps all five providers unmodified. Do not add `styleId` to any provider.

- [ ] **Step 6: Run the contracts suite**

Run: `npx vitest run --project contracts`
Expected: PASS. Other test files in `packages/contracts/tests/` that build manifests (`composition.test.ts:57,61,62`, `assetValidation.test.ts:21`) need `formatVersion: 3` plus `styleId: null` at both levels — expected churn from the version bump.

Run: `npm run typecheck -w @automata/contracts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): asset manifest v3 with first-class styleId"
```

---

### Task 3: The set-agreement evaluator

**Files:**
- Modify: `packages/contracts/src/assetValidation.ts` (the `code` union at 17-28, and `validateAssetManifest` from line 36)
- Test: `packages/contracts/tests/assetValidation.test.ts`

**Interfaces:**
- Consumes: the v3 schema from Task 2.
- Produces: three new `AssetIssue` codes — `asset-style-stale`, `asset-style-unrecorded`, `manifest-style-unrecorded`. Task 7 emits `asset-style-stale` too.

- [ ] **Step 1: Write the failing test**

Append to `packages/contracts/tests/assetValidation.test.ts`:

```ts
const STYLE_A = 'a'.repeat(64)
const STYLE_B = 'b'.repeat(64)

/** Build a v3 manifest directly; the file's `manifest()` helper parses v2 text. */
const styled = (styleId: string | null, assets: unknown[]) =>
  parseAssetManifest(JSON.stringify({ formatVersion: 3, styleId, assets }))

const entryWith = (id: string, styleId: string | null, status = 'validated') => ({
  ...baseEntry, id, path: `assets/${id}.svg`, status,
  provenance: { ...baseEntry.provenance, styleId }
})

describe('style-family agreement', () => {
  it('passes when every asset shares the manifest style', () => {
    const issues = validateAssetManifest(styled(STYLE_A, [
      entryWith('a', STYLE_A), entryWith('b', STYLE_A)
    ]))
    expect(issues.filter((i) => i.code.includes('style'))).toEqual([])
  })

  it('names each stale asset individually', () => {
    const issues = validateAssetManifest(styled(STYLE_A, [
      entryWith('a', STYLE_A), entryWith('b', STYLE_B), entryWith('c', STYLE_B)
    ]))
    const stale = issues.filter((i) => i.code === 'asset-style-stale')
    expect(stale.map((i) => i.assetId)).toEqual(['b', 'c'])
    expect(stale[0]!.severity).toBe('error')
  })

  it('flags an unrecorded style on a generated or validated asset', () => {
    const issues = validateAssetManifest(styled(STYLE_A, [entryWith('a', null)]))
    expect(issues.filter((i) => i.code === 'asset-style-unrecorded').map((i) => i.assetId))
      .toEqual(['a'])
  })

  it('exempts placeholder and failed entries', () => {
    const issues = validateAssetManifest(styled(STYLE_A, [
      entryWith('p', null, 'placeholder'),
      entryWith('f', STYLE_B, 'failed')
    ]))
    expect(issues.filter((i) => i.code.includes('style'))).toEqual([])
  })

  it('reports a null manifest style once and suppresses staleness', () => {
    const issues = validateAssetManifest(styled(null, [
      entryWith('a', null), entryWith('b', STYLE_B)
    ]))
    expect(issues.filter((i) => i.code === 'manifest-style-unrecorded')).toHaveLength(1)
    expect(issues.find((i) => i.code === 'manifest-style-unrecorded')!.assetId).toBeNull()
    expect(issues.filter((i) => i.code === 'asset-style-stale')).toEqual([])
    expect(issues.filter((i) => i.code === 'asset-style-unrecorded').map((i) => i.assetId))
      .toEqual(['a'])
  })

  it('does not report a null manifest style when there are no assets to gate', () => {
    expect(validateAssetManifest(styled(null, []))
      .filter((i) => i.code === 'manifest-style-unrecorded')).toHaveLength(1)
  })
})
```

Reuse whatever the file names its shared entry fixture in place of `baseEntry`, and add `parseAssetManifest` to its imports if absent.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project contracts assetValidation`
Expected: FAIL — the new codes are not in the union and no style checks run.

- [ ] **Step 3: Add the codes**

In `packages/contracts/src/assetValidation.ts`, append to the `code` union (after `'asset-hash-mismatch'` on line 28):

```ts
    | 'asset-style-stale'
    | 'asset-style-unrecorded'
    | 'manifest-style-unrecorded'
```

- [ ] **Step 4: Implement the checks**

In `validateAssetManifest`, immediately before the `if (composition)` block (currently line 54), insert:

```ts
  // Set-level style agreement. Placeholder and failed entries are exempt —
  // they already block the release by status, so demanding a style id from
  // them is noise.
  const gated = manifest.assets.filter(
    (entry) => entry.status === 'generated' || entry.status === 'validated'
  )
  if (manifest.styleId === null) {
    issues.push({
      severity: 'error', code: 'manifest-style-unrecorded', assetId: null,
      message: 'Manifest records no styleId — regenerate the game\'s assets so the style family is verifiable'
    })
  }
  for (const entry of gated) {
    if (entry.provenance.styleId === null) {
      issues.push({
        severity: 'error', code: 'asset-style-unrecorded', assetId: entry.id,
        message: `Asset "${entry.id}" records no styleId — regenerate it to record the style it was built under`
      })
      continue
    }
    // Nothing to compare against when the manifest style is unknown; the
    // manifest-level issue above is the actionable one.
    if (manifest.styleId !== null && entry.provenance.styleId !== manifest.styleId) {
      issues.push({
        severity: 'error', code: 'asset-style-stale', assetId: entry.id,
        message: `Asset "${entry.id}" was built under style ${entry.provenance.styleId.slice(0, 12)}… but the game's style is ${manifest.styleId.slice(0, 12)}… — regenerate it`
      })
    }
  }
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run --project contracts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): style-family agreement checks in validateAssetManifest"
```

---

### Task 4: Stamp `styleId` during generation

**Files:**
- Modify: `packages/asset-providers/src/generate.ts` (`buildGeneratedAsset` 33-66, `generateGameAssets` 73-87)
- Test: `packages/asset-providers/tests/generate.test.ts`

**Interfaces:**
- Consumes: `computeStyleId` (Task 1), the v3 provenance shape (Task 2).
- Produces: every built entry carries `provenance.styleId`; `generateGameAssets` returns `{ assets: GeneratedAsset[]; styleId: string }`. Tasks 5 and 6 consume the new return shape.

- [ ] **Step 1: Write the failing test**

Append to `packages/asset-providers/tests/generate.test.ts`:

```ts
describe('styleId stamping', () => {
  it('stamps every built asset with the style id, without provider involvement', async () => {
    const style = deriveStyleParams({ visualStyle: 'test', audioStyle: 'test' }, 1)
    const built = await buildGeneratedAsset(
      { id: 'icon-a', kind: 'ui', description: 'Emblem.' } as never,
      svgProvider,
      { seed: 1, style, specVersion: 1 }
    )
    expect(built.entry.provenance.styleId).toBe(computeStyleId(style))
  })

  it('returns the shared style id alongside the assets', async () => {
    const result = await generateGameAssets({
      requirements: [
        { id: 'icon-a', kind: 'ui', description: 'Emblem.' },
        { id: 'blip', kind: 'audio', description: 'A blip.' }
      ] as never,
      direction: { visualStyle: 'test', audioStyle: 'test' },
      seed: 1,
      specVersion: 1
    })
    expect(result.styleId).toBe(computeStyleId(deriveStyleParams({ visualStyle: 'test', audioStyle: 'test' }, 1)))
    expect(result.assets).toHaveLength(2)
    for (const asset of result.assets) {
      expect(asset.entry.provenance.styleId).toBe(result.styleId)
    }
  })
})
```

Fold `computeStyleId` and `svgProvider` into the file's imports. Every existing call site of `generateGameAssets` **in this test file** now needs `.assets` — update them in Step 3.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project asset-providers generate`
Expected: FAIL — `provenance.styleId` is undefined and `generateGameAssets` returns an array.

- [ ] **Step 3: Implement**

In `packages/asset-providers/src/generate.ts`, add `computeStyleId` to the `./styleParams` import, then in `buildGeneratedAsset` change the provenance assembly so the style id is stamped after the pinned-hash step:

```ts
  const finalProvenance = attributedProvenance.determinism.kind === 'pinned'
    ? { ...attributedProvenance, determinism: { kind: 'pinned' as const, contentHash: sha256Hex(finalBytes) } }
    : attributedProvenance
  const stampedProvenance = { ...finalProvenance, styleId: computeStyleId(input.style) }
```

…and use `stampedProvenance` in the returned `entry.provenance`.

Change `generateGameAssets`'s return:

```ts
export interface GenerateAssetsResult {
  assets: GeneratedAsset[]
  /** Identity of the one style every asset above was generated under. */
  styleId: string
}

export async function generateGameAssets(
  input: GenerateAssetsInput
): Promise<GenerateAssetsResult> {
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
  return { assets: generated, styleId: computeStyleId(style) }
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project asset-providers`
Expected: PASS. Update any assertion in this package that expected a bare array from `generateGameAssets`.

- [ ] **Step 5: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): stamp styleId on every generated asset"
```

---

### Task 5: `composeGame` records the manifest style

**Files:**
- Modify: `packages/game-compose/src/compose.ts:65-73`
- Test: `packages/game-compose/tests/compose.test.ts`

**Interfaces:**
- Consumes: `generateGameAssets` returning `{ assets, styleId }` (Task 4), the v3 schema (Task 2).
- Produces: composed manifests at `formatVersion: 3` with a non-null `styleId`.

- [ ] **Step 1: Write the failing test**

Append to `packages/game-compose/tests/compose.test.ts`:

```ts
it('records a v3 manifest whose styleId every asset shares', async () => {
  const result = await composeGame({ spec: sliceSpec(), seed: 7, specHash: 'hash' })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.assetManifest.formatVersion).toBe(3)
  expect(result.assetManifest.styleId).toMatch(/^[0-9a-f]{64}$/)
  for (const entry of result.assetManifest.assets) {
    expect(entry.provenance.styleId).toBe(result.assetManifest.styleId)
  }
  expect(validateAssetManifest(result.assetManifest, result.composition)
    .filter((issue) => issue.code.includes('style'))).toEqual([])
})
```

Add `validateAssetManifest` to the file's `@automata/contracts` import.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project game-compose`
Expected: FAIL — `formatVersion` is 2 and there is no `styleId`.

- [ ] **Step 3: Implement**

In `packages/game-compose/src/compose.ts`, change the destructuring at line 65 and the manifest at 69-72:

```ts
  const { assets: generated, styleId } = await generateGameAssets({
    requirements: spec.assets,
    direction: spec.direction,
    seed,
    specVersion: spec.specVersion
  })
```

```ts
  const assetManifest: AssetManifest = {
    formatVersion: 3,
    styleId,
    assets: generated.map((asset) => ({ ...asset.entry, references: ['public/project/composition.json'] }))
  }
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project game-compose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-compose
git commit -m "feat(game-compose): record the manifest styleId at compose time"
```

---

### Task 6: The four `assetTools` write sites

**Files:**
- Modify: `tools/editor-mcp-server/src/assetTools.ts` — lines 114-129 (`mergeManifest`), 211, 380
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts`

**Interfaces:**
- Consumes: the v3 schema (Task 2), `computeStyleId` (Task 1), `generateGameAssets` (Task 4).
- Produces: `mergeManifest(existingText, entries, styleId)` — a third required parameter. Task 7 builds on the same file.

> **Read first.** `formatVersion: 2` appears at four asset-manifest sites in this file (117, 126, 211, 380) and at ~30 unrelated **project**-manifest sites elsewhere in the repo. Change only the four here plus `compose.ts:76` (Task 5). If `npm run ci` reports editor or scaffold failures, you bumped a project manifest by mistake.

- [ ] **Step 1: Write the failing test**

Append to `tools/editor-mcp-server/tests/assetTools.test.ts`:

```ts
describe('manifest styleId through the MCP flow', () => {
  it('records a styleId on generate and preserves it through validate', async () => {
    const { runner, manifestPath } = await setupWithSpec(
      [{ id: 'icon-a', kind: 'ui', description: 'An icon.' }]
    )
    await runner.execute('generateAssets', {})
    const afterGenerate = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(afterGenerate.formatVersion).toBe(3)
    expect(afterGenerate.styleId).toMatch(/^[0-9a-f]{64}$/)
    expect(afterGenerate.assets[0].provenance.styleId).toBe(afterGenerate.styleId)

    await runner.execute('validateAssets', {})
    const afterValidate = JSON.parse(await readFile(manifestPath, 'utf8'))
    // The line-380 regression: validate rebuilds the manifest from entries.
    expect(afterValidate.formatVersion).toBe(3)
    expect(afterValidate.styleId).toBe(afterGenerate.styleId)
  })
})
```

Match the file's own `setupWithSpec` destructuring and tool-name/argument shapes exactly — copy them from a neighbouring test rather than trusting the names above.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project editor-mcp-server assetTools`
Expected: FAIL — the manifest is still v2 with no `styleId`.

- [ ] **Step 3: Thread `styleId` through `mergeManifest`**

Replace the signature and both literals in `mergeManifest` (lines 114-129):

```ts
/** Replace generated ids, append new entries, and preserve unrelated assets. */
function mergeManifest(existingText: string | null, entries: AssetManifestEntry[], styleId: string) {
  const existing = existingText
    ? parseAssetManifest(existingText)
    : { formatVersion: 3 as const, styleId, assets: [] }
  const generatedById = new Map(entries.map((entry) => [entry.id, entry]))
  const retained = existing.assets.map((entry) => {
    const replacement = generatedById.get(entry.id)
    if (!replacement) return entry
    generatedById.delete(entry.id)
    return { ...replacement, references: entry.references }
  })
  return assetManifestSchema.parse({
    formatVersion: 3,
    // Newly generated assets define the game's current style.
    styleId,
    assets: [...retained, ...generatedById.values()]
  })
}
```

- [ ] **Step 4: Pass a style id at both call sites**

At line 239 (regenerate) and line 287 (generate), the surrounding code already derives a style via `deriveStyleParams(spec.direction, seed)` or calls `generateWithNamedProvider`. Pass `computeStyleId(style)` for the named-provider path, and the `styleId` returned by `generateGameAssets` for the default path. Add `computeStyleId` to the `@automata/asset-providers` import on line 3.

In `generateWithNamedProvider` (160-177), return the id alongside so the caller does not re-derive:

```ts
  return { assets: generated, styleId: computeStyleId(style) }
```

…and update its caller to destructure `{ assets, styleId }`.

- [ ] **Step 5: Fix the remaining two literals**

Line 211 (the regenerate path's empty default) becomes:

```ts
        const existing = existingText ? parseAssetManifest(existingText) : { formatVersion: 3 as const, styleId: null, assets: [] }
```

Line 380 — the manifest rebuilt after validation, and the dangerous one — becomes:

```ts
      const updatedManifest = assetManifestSchema.parse({
        formatVersion: 3,
        // Preserve the recorded style; this rebuild sees only entries.
        styleId: manifest.styleId,
        assets: evaluated.map(({ entry }) => entry)
      })
```

- [ ] **Step 6: Run and confirm it passes**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS. The file's own manifest fixtures (`assetTools.test.ts:13, 109`) need `formatVersion: 3` and `styleId` at both levels.

- [ ] **Step 7: Commit**

```bash
git add tools/editor-mcp-server
git commit -m "feat(editor-mcp-server): thread manifest styleId through asset tools"
```

---

### Task 7: Make the style-recovery fallback self-checking

**Files:**
- Modify: `tools/editor-mcp-server/src/assetTools.ts:365-371`
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts`

**Interfaces:**
- Consumes: `computeStyleId` (Task 1), `asset-style-stale` (Task 3).
- Produces: nothing further.

- [ ] **Step 1: Write the failing test**

Append to `tools/editor-mcp-server/tests/assetTools.test.ts`:

The mutation must set the manifest style **and** the entry style to the *same* wrong value. Setting only the entry's would make Task 3's `asset-style-stale` fire and the test would pass without this task's guard existing — proving nothing. Keeping them equal satisfies Task 3 and isolates the recovery cross-check:

```ts
it('flags an asset whose recorded styleId disagrees with the recoverable style', async () => {
  const { runner, manifestPath } = await setupWithSpec(
    [{ id: 'icon-a', kind: 'ui', description: 'An icon.' }]
  )
  await runner.execute('generateAssets', {})
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  // Both levels agree on a style that the spec + seed cannot produce, so
  // Task 3's set-agreement check is satisfied and only the recovery
  // cross-check can catch this.
  const wrong = 'c'.repeat(64)
  manifest.styleId = wrong
  manifest.assets[0].provenance.styleId = wrong
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const result = await runner.execute('validateAssets', {})
  expect(result.ok).toBe(true)
  expect((result.content as { passed: boolean }).passed).toBe(false)
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project editor-mcp-server assetTools`
Expected: FAIL — `passed` is `true`. Both style levels agree, so Task 3 raises nothing, and without the guard nothing compares the recorded id against the style the spec and seed actually recover.

- [ ] **Step 3: Implement the guard**

In `assetTools.ts`, right after `const style = spec && styleSeed !== null ? deriveStyleParams(spec.direction, styleSeed) : null` (line 369), insert:

```ts
        // The recovered style is what palette membership is checked against, so
        // a disagreement with the recorded id means that check just ran against
        // the wrong palette.
        const recoveredId = style ? computeStyleId(style) : null
        const styleMismatch = recoveredId !== null &&
          entry.provenance.styleId !== null &&
          entry.provenance.styleId !== recoveredId
```

…then include it when assembling `entryIssues`:

```ts
        const entryIssues: AssetIssue[] = bytes === null
          ? [{ severity: 'error', code: 'asset-media-invalid', assetId: entry.id, message: `Asset file missing: ${entry.path}` }]
          : [
            ...validateAssetMedia(entry, bytes, style),
            ...(styleMismatch ? [{
              severity: 'error' as const, code: 'asset-style-stale' as const, assetId: entry.id,
              message: `Asset "${entry.id}" records style ${entry.provenance.styleId!.slice(0, 12)}… but its inputs recover ${recoveredId!.slice(0, 12)}… — the palette check ran against the wrong style`
            }] : [])
          ]
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server
git commit -m "feat(editor-mcp-server): cross-check recovered style against the recorded id"
```

---

### Task 8: Regenerate first-light, run the gates, ship the docs

**Files:**
- Modify: `games/first-light/public/assets/assets.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`
- Modify: `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md`
- Modify: this plan (check every box)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: nothing.

- [ ] **Step 1: Bring first-light's manifest to v3**

`games/first-light/public/assets/assets.json` holds one asset (`item-icon`, `ui`, `procedural-svg`) and is checked in at v2.

There is **no** existing recompose-assets command: `npm run generate:project -w first-light` regenerates only `public/project` from the in-code template (`games/first-light/scripts/generate-project.ts`), not the asset manifest. The authority for what the manifest should contain is the compose-parity test at `games/first-light/tests/project/composition.test.ts`, which recomposes from the checked-in spec and recorded seed and asserts byte-for-byte equality. That test **will fail** after Task 5 — this step is what fixes it.

Write this temporary script at `games/first-light/scripts/__recompose-assets.ts`, mirroring the parity test's setup exactly:

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gameSpecSchema, parseCompositionManifest } from '@automata/contracts'
import { composeGame } from '@automata/game-compose'

const gameRoot = resolve(import.meta.dirname, '..')
const read = (path: string) => readFile(resolve(gameRoot, path), 'utf8')

const spec = gameSpecSchema.parse(JSON.parse(await read('gamespec.json')))
const composition = parseCompositionManifest(await read('public/project/composition.json'))
const result = await composeGame({
  spec, seed: composition.source!.seed, specHash: composition.source!.specHash
})
if (!result.ok) throw new Error(`compose failed: ${JSON.stringify(result.issues)}`)

const manifestFile = result.files.find((file) => file.path === 'public/assets/assets.json')
if (!manifestFile || !('text' in manifestFile)) throw new Error('no assets.json in compose output')
await writeFile(resolve(gameRoot, 'public/assets/assets.json'), manifestFile.text)
process.stdout.write('assets.json rewritten\n')
```

Run it, then delete it:

```bash
node --import tsx games/first-light/scripts/__recompose-assets.ts
rm games/first-light/scripts/__recompose-assets.ts
```

The parity test preserves `status` separately (it copies statuses across before comparing), so a freshly composed `generated` status where the checked-in file says `validated` is expected and not something to hand-patch.

- [ ] **Step 2: Verify first-light validates clean**

Run: `npx vitest run --project first-light --project game-compose --project contracts`
Expected: PASS with no `asset-style-*` or `manifest-style-*` issues.

- [ ] **Step 3: Run the full gates**

```bash
npm run ci
npm run coverage
```

Expected: both PASS. If `packages/editor`, `packages/project`, `tools/scaffold`, or `games/*` fail, you bumped a **project** manifest `formatVersion` by mistake — revert those; only asset manifests move to 3.

- [ ] **Step 4: Append the capability gaps**

In `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md`, append to the capability-gap log. **If Phase 5 cycle 6 has not shipped yet, that section does not exist** — create it exactly as cycle 6's plan Task 8 Step 4 specifies, then append:

```markdown
- **Cycle 7 — no content-level family check.** Nothing measures the bytes; a
  provider that ignored its style params but recorded the right `styleId` would
  pass.
- **Cycle 7 — style identity is exact-match.** Any edit to the spec's
  `direction` invalidates every asset at once. Intended: the per-asset
  `asset-style-stale` messages make the fix mechanical.
- **Cycle 7 — provider version and prompt are not part of style identity.** An
  AI asset regenerated from a different prompt under the same style is coherent.
- **Cycle 7 — no cross-game family notion.** Agreement is scoped to one game's
  manifest.
```

- [ ] **Step 5: Update the roadmap**

In `docs/ROADMAP.md` §3 Phase 5, append to the cycles list:

```markdown
  - Cycle 7 — cross-asset style-family evaluator (manifest v3, first-class
    `styleId`, set-agreement checks in the release gate) — `Shipped`
    (2026-08-02, plan:
    [`2026-08-02-phase-5-cycle-7-style-family-evaluator.md`](superpowers/plans/active/2026-08/week-31/2026-08-02-phase-5-cycle-7-style-family-evaluator.md)).
```

Phase 5 **stays `Shipped`**. Update the §1 Shipped entry's date and summary only.

- [ ] **Step 6: Update the decomposition counters**

In `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`: bump the §3 phase-map Phase 5 row to `7 cycles completed (2026-08-02)`; update the §5 Phase 5 header date; add item 7 (`Cross-asset style-family evaluator — completed`).

- [ ] **Step 7: Check every box in this plan**

Every `- [ ]` above must be `- [x]`.

- [ ] **Step 8: Commit**

```bash
git add docs games/first-light
git commit -m "docs: mark Phase 5 cycle 7 (style-family evaluator) shipped"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4.1 `computeStyleId`, canonical form, fixed order, `toFixed(4)` | Task 1 |
| §4.1 division of labour (contracts compares only) | Global Constraints, Task 3 |
| §4.2 manifest v3, both nullable fields, v1→v2→v3 chain | Task 2 |
| §4.3 `sourceParams.styleSeed` stays | Task 6 (untouched), Task 7 (still the recovery input) |
| §5 three codes + exemption and null-manifest rules | Task 3 |
| §6 unconditional stamping, `generateGameAssets` return | Task 4 |
| §6 five `formatVersion: 2` write sites | Task 5 (compose.ts:76) + Task 6 (117, 126, 211, 380) |
| §6 project-manifest exclusion | Global Constraints, Task 6 preamble, Task 8 Step 3 |
| §6 self-checking fallback | Task 7 |
| §6 release gate needs no change | Verified — no task; Task 7's test asserts `passed: false` |
| §6 first-light | Task 8 |
| §7 testing | Tasks 1-7 + Task 8 gates |
| §8 gaps · §9 exit · §11 docs | Task 8 |

**Deliberate deviations from the spec, recorded here:**

- The spec says provenance gains `styleId`; the plan additionally narrows `GeneratedBytes.provenance` to `Omit<AssetProvenance, 'styleId'>` (Task 2 Step 5). Without this, all five providers would need edits and each would have to import `computeStyleId`. The narrowing keeps the orchestrator as sole owner — the same division `assetProvider.ts:7` already states for `path` — and means `claude-svg`, `claude-prop`, and cycle 6's `claude-audio` need zero changes. Fold into the spec on ship.
- The spec implies one migration function; the plan splits it into `migrateV1ToV2` + `migrateV2ToV3` and keeps `migrateAssetManifest` as a deprecated alias so external callers do not break.

**Placeholder scan:** none. Two soft spots were closed during self-review rather than left hedged:

- Task 8 Step 1 originally said "recompose using whatever entry point the game documents." Checked: `generate:project` regenerates only `public/project`, and no recompose-assets command exists. The step now carries a complete throwaway script mirroring the compose-parity test, plus the command to run and delete it.
- Task 7's test originally mutated only the entry's `styleId`, which would have made Task 3's `asset-style-stale` fire and let the test pass **without the guard this task adds**. It now mutates both levels to the same wrong value, satisfying Task 3 and isolating the recovery cross-check. The step explains why, so a reviewer does not "simplify" it back.

**Command audit:** every command uses `npx vitest run --project <directory-name>`; `npm test -w` is never used for the three packages that lack a `test` script. Root gates are `npm run ci` and `npm run coverage`.

**Type consistency:** `computeStyleId(style: StyleParams): string` and `canonicalStyleString` are defined in Task 1 and used identically in Tasks 4, 6, 7. `AssetManifest` (v3, with `styleId: string | null`), `migrateV1ToV2`, `migrateV2ToV3`, and `parseAssetManifest` come from Task 2 and are used unchanged after. `GenerateAssetsResult { assets, styleId }` is defined in Task 4 and destructured identically in Tasks 5 and 6. `mergeManifest(existingText, entries, styleId)` is defined in Task 6 and has no other callers. The three issue codes are declared in Task 3 and only `asset-style-stale` is reused, in Task 7.

**Verified before writing** (not assumed): `.omit()`/`.extend()` preserve `strictObject` strictness and a `.nullable()` non-optional field must be present — all three tested against this repo's zod v4; the five asset-manifest `formatVersion: 2` sites and the ~30 project-manifest sites were enumerated by grep; `validateAssetManifest`'s issues already reach `passed` via `allIssues`→`errors` at `assetTools.ts:387-389`.

**Ordering:** 1 and 2 are independent of each other. 3 needs 2. 4 needs 1 and 2. 5 needs 4. 6 needs 1, 2, 4. 7 needs 1, 3, 6. 8 is last.
