# Phase 3 — Vertical Slice · First Playable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One minimal `GameSpec` drives every layer thinly — the `interaction-inventory` pack over the new capability-pack interface v1, a seeded `compose:game` MCP step emitting a data-driven composition manifest plus one stub asset, a composition-aware critical-path evaluation, an enriched browser smoke (boot/console/frame-time), and the vertical-slice checkpoint — proven end-to-end on the checked-in demo game `games/first-light`.

**Architecture:** Compose is a pure function (`@automata/game-compose`) run as a hash-guarded seeded session step; its outputs (composition manifest, seeded tuning, SVG asset, asset-manifest stub) are written through to the game dir. The generic scaffold `main.ts` resolves manifest pack ids against a static registry (`@automata/pack-registry`) and boots them via the evolved `composePacks`; headless evaluation resolves the same manifest into `PackEvalHook`s. Dependency direction: `editor-mcp-server → game-compose → pack-interaction-inventory → game-kit → engine/contracts`; games → `pack-registry → packs`. game-kit never depends on packs.

**Tech Stack:** TypeScript, zod v4, vitest, Playwright, MCP SDK (existing patterns only).

**Spec:** `docs/superpowers/specs/active/2026-07/week-29/2026-07-13-phase-3-vertical-slice-design.md`

**Overall progress:** 100% (Tasks 1-14 complete; all release gates verified)

> **Completion update (2026-07-14):** All fourteen tasks are complete. Final
> verification: `npm run ci` (247 files / 1133 tests), `npm run coverage`
> (90.00% branches), `npx playwright test` (8/8), and
> `npm run verify:new-game` completed successfully. The human vertical-slice
> checkpoint approved the all-green `first-light` report.

## Global Constraints

- Schemas are zod v4 `z.strictObject`; `.min()/.max()` only (no `.gt/.lt/.positive/.negative`); unknown keys rejected. `packages/contracts` imports `zod` directly (leaf); every other new package imports `z` via `@automata/project`'s re-export (lint enforces no direct `zod` outside contracts).
- Engine boundary: packs and game-compose import engine APIs from `@automata/engine` only; no third-party engine deps outside `packages/engine`.
- TDD: failing test first, then minimal implementation. Coverage thresholds are 90% lines/branches. Browser-only shims stay thin (`main.ts` files are the untested inventory).
- Run `npm run ci` before claiming done; run `npm run verify:new-game` after any scaffold-template change; commit at every documented checkpoint.
- Registry convention: never hand-wire a game into `tools/*`; never edit root `package.json` or `playwright.config.ts` per game. New packages sit flat under `packages/` (root workspaces/vitest globs pick them up).
- **Determinism (binding):** `composeGame` draws from `createSeededRng(seed)` in a **fixed order — goal position, then icon, then item placements** — so recorded seeds replay to identical bytes. No wall-clock timestamps in any composed file.
- Step kinds introduced: `compose:game` (seeded), `slice:report` (seeded), `checkpoint:slice` (journal). Finding source introduced: `compose`.
- **Hash-stability guard (binding):** the capability-config change must not alter the parsed value of any existing spec with `config: {}` — all new config fields are `.optional()` with **no `.default()`**; defaults are applied by compose (`INVENTORY_DEFAULTS`), never by the schema.

---

## Milestone A — contracts

### Task 1: Composition + asset-manifest schemas, `compose` finding source

**Files:**
- Create: `packages/contracts/src/composition.ts`
- Create: `packages/contracts/src/assetManifest.ts`
- Modify: `packages/contracts/src/session.ts` (add `'compose'` to `findingSourceSchema`)
- Modify: `packages/contracts/src/index.ts` (add `export * from './composition'` and `export * from './assetManifest'`)
- Test: `packages/contracts/tests/composition.test.ts`

**Interfaces:**
- Produces: `compositionManifestSchema`, `CompositionManifest`, `parseCompositionManifest(text: string): CompositionManifest`, `emptyComposition(gameId: string): CompositionManifest`; `assetManifestSchema`, `AssetManifest`, `AssetManifestEntry`; finding source `'compose'` valid in `findingSchema`.

- [x] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/composition.test.ts
import { describe, expect, it } from 'vitest'
import {
  assetManifestSchema, compositionManifestSchema, emptyComposition,
  findingSourceSchema, parseCompositionManifest
} from '../src'

const manifest = {
  formatVersion: 1,
  gameId: 'first-light',
  source: { specVersion: 1, specHash: 'abc123', seed: 7 },
  packs: [{ id: 'interaction-inventory', version: '1.0.0', config: { interactRadius: 1.5 } }],
  assets: [{ id: 'item-icon', path: 'assets/item-icon.svg' }]
}

describe('composition manifest', () => {
  it('accepts a composed manifest and the empty scaffold shape', () => {
    expect(compositionManifestSchema.safeParse(manifest).success).toBe(true)
    expect(emptyComposition('probe')).toEqual({
      formatVersion: 1, gameId: 'probe', source: null, packs: [], assets: []
    })
    expect(compositionManifestSchema.safeParse(emptyComposition('probe')).success).toBe(true)
  })

  it('round-trips through parseCompositionManifest and rejects malformed text', () => {
    expect(parseCompositionManifest(JSON.stringify(manifest))).toEqual(manifest)
    expect(() => parseCompositionManifest('{"formatVersion":2}')).toThrow()
    expect(() => parseCompositionManifest('not json')).toThrow()
  })

  it('rejects unknown keys, bad formatVersion, and oversized pack lists', () => {
    expect(compositionManifestSchema.safeParse({ ...manifest, extra: true }).success).toBe(false)
    expect(compositionManifestSchema.safeParse({ ...manifest, formatVersion: 2 }).success).toBe(false)
    const packs = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, version: '1.0.0', config: {} }))
    expect(compositionManifestSchema.safeParse({ ...manifest, packs }).success).toBe(false)
  })
})

describe('asset manifest stub', () => {
  const entry = {
    id: 'item-icon',
    requirement: { id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' },
    path: 'assets/item-icon.svg',
    provenance: { provider: 'stub-generator', generator: 'svg-icon@1', specVersion: 1, seed: 7 },
    validation: { status: 'placeholder' }
  }

  it('accepts a placeholder entry with provenance', () => {
    expect(assetManifestSchema.safeParse({ formatVersion: 1, assets: [entry] }).success).toBe(true)
  })

  it('rejects unknown providers and unknown validation states', () => {
    const badProvider = { ...entry, provenance: { ...entry.provenance, provider: 'midjourney' } }
    expect(assetManifestSchema.safeParse({ formatVersion: 1, assets: [badProvider] }).success).toBe(false)
    const badStatus = { ...entry, validation: { status: 'shipped' } }
    expect(assetManifestSchema.safeParse({ formatVersion: 1, assets: [badStatus] }).success).toBe(false)
  })
})

describe('finding sources', () => {
  it("accepts 'compose'", () => {
    expect(findingSourceSchema.safeParse('compose').success).toBe(true)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project contracts -t 'composition'`
Expected: FAIL — module `../src` has no export `compositionManifestSchema`.

- [x] **Step 3: Implement**

```ts
// packages/contracts/src/composition.ts
import { z } from 'zod'
import { gameSlugSchema } from './workspaceTools'

/**
 * Phase 3 contract: the runtime composition manifest — the data-driven bridge
 * from an approved GameSpec to the packs the game boots. Lives as a separate
 * file `public/project/composition.json` next to (not inside) the project
 * snapshot, so no project formatVersion migration is needed and the existing
 * project reader can fetch it. `source: null` marks a plain scaffold that was
 * never composed from a spec.
 */
export const compositionPackEntrySchema = z.strictObject({
  id: z.string().min(1).max(60),
  version: z.string().min(1).max(20),
  config: z.record(z.string(), z.unknown())
})
export type CompositionPackEntry = z.infer<typeof compositionPackEntrySchema>

export const compositionManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  gameId: gameSlugSchema,
  source: z.strictObject({
    specVersion: z.number().int().min(1),
    specHash: z.string().min(1).max(128),
    seed: z.number().int().min(0)
  }).nullable(),
  packs: z.array(compositionPackEntrySchema).max(7),
  assets: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    path: z.string().min(1).max(200)
  })).max(80)
})
export type CompositionManifest = z.infer<typeof compositionManifestSchema>

export function parseCompositionManifest(text: string): CompositionManifest {
  return compositionManifestSchema.parse(JSON.parse(text))
}

export function emptyComposition(gameId: string): CompositionManifest {
  return { formatVersion: 1, gameId, source: null, packs: [], assets: [] }
}
```

```ts
// packages/contracts/src/assetManifest.ts
import { z } from 'zod'
import { assetRequirementSchema } from './gameSpec'

/**
 * Phase 3 stub of the Phase 5 asset manifest: stable logical id (= the spec's
 * assetRequirement id), the requirement it satisfies, provenance, and a
 * validation status. `placeholder` is the hook Phase 5 uses to forbid stub
 * assets in release candidates.
 */
export const assetManifestEntrySchema = z.strictObject({
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
export type AssetManifestEntry = z.infer<typeof assetManifestEntrySchema>

export const assetManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  assets: z.array(assetManifestEntrySchema).max(80)
})
export type AssetManifest = z.infer<typeof assetManifestSchema>
```

In `packages/contracts/src/session.ts`, extend the finding-source enum in place (keep existing order, append):

```ts
export const findingSourceSchema = z.enum(['build', 'test', 'browser', 'eval', 'validate', 'session', 'spec', 'compose'])
```

In `packages/contracts/src/index.ts` add:

```ts
export * from './composition'
export * from './assetManifest'
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project contracts`
Expected: PASS (including all pre-existing contracts tests — the session enum change is additive).

- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): composition + asset-manifest schemas, compose finding source"
```

### Task 2: Capability-config discriminated union (interaction-inventory gets a real config)

**Files:**
- Modify: `packages/contracts/src/gameSpec.ts:76-81` (replace `capabilitySelectionSchema`)
- Test: `packages/contracts/tests/gameSpec.test.ts` (extend)

**Interfaces:**
- Produces: `capabilityConfigSchemas: Record<CapabilityId, z.ZodType>` (exported), `interaction-inventory` config `{ requiredItems?: int 1..8, interactRadius?: number 0.5..5 }`. `gameSpecSchema` / `gameSpecDraftSchema` shapes otherwise unchanged; `config: {}` remains valid for **every** capability and parses to `{}` (hash-stability guard).

- [x] **Step 1: Write the failing test** (append to the existing suite)

```ts
// packages/contracts/tests/gameSpec.test.ts — add:
import { capabilityConfigSchemas } from '../src'

describe('capability config schemas', () => {
  it('keeps config: {} valid for every capability and parses it unchanged', () => {
    for (const id of capabilityIdSchema.options) {
      const draft = minimalGameSpecDraft()
      ;(draft as { capabilities: unknown }).capabilities = [{ id: 'interaction-inventory', config: {}, requirements: [] }]
      if (id !== 'interaction-inventory') {
        ;(draft as { capabilities: Array<Record<string, unknown>> }).capabilities.push({ id, config: {}, requirements: [] })
      }
      const parsed = gameSpecDraftSchema.safeParse(draft)
      expect(parsed.success, `config {} must stay valid for ${id}`).toBe(true)
      if (parsed.success) expect(parsed.data.capabilities.every((entry) => JSON.stringify(entry.config) === '{}')).toBe(true)
    }
  })

  it('accepts and bounds the interaction-inventory config', () => {
    const draft = minimalGameSpecDraft()
    const capabilities = (draft as { capabilities: Array<Record<string, unknown>> }).capabilities
    capabilities[0] = { id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(true)

    capabilities[0] = { id: 'interaction-inventory', config: { requiredItems: 9 }, requirements: [] }
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(false)
    capabilities[0] = { id: 'interaction-inventory', config: { interactRadius: 0.1 }, requirements: [] }
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects a real config on a capability that has none yet', () => {
    const draft = minimalGameSpecDraft()
    ;(draft as { capabilities: unknown }).capabilities = [
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'save-load', config: { slots: 3 }, requirements: [] }
    ]
    expect(gameSpecDraftSchema.safeParse(draft).success).toBe(false)
  })
})
```

Note: this depends on the compatibility table — `save-load` requires nothing, so the pair above is compatibility-clean and only the unknown config key fails. Do not use `dialogue-quests` here (it `requires: ['interaction-inventory']`, which would still pass — pick a capability whose failure isolates the config check).

- [x] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run --project contracts -t 'capability config'`
Expected: FAIL — `capabilityConfigSchemas` is not exported (and today `config: { requiredItems: 2 }` is rejected by the empty strictObject).

- [x] **Step 3: Implement** — replace `capabilitySelectionSchema` in `packages/contracts/src/gameSpec.ts`:

```ts
/**
 * Per-capability config schemas. interaction-inventory is real as of Phase 3
 * (the template for Phase 4's seven); the rest stay empty stubs until their
 * packs own them. All fields are optional with NO zod defaults: `config: {}`
 * must parse to `{}` so stored Phase-2 specs keep their content hashes —
 * defaults are applied by the compose step, never by the schema.
 */
export const capabilityConfigSchemas = {
  'interaction-inventory': z.strictObject({
    requiredItems: z.number().int().min(1).max(8).optional(),
    interactRadius: z.number().min(0.5).max(5).optional()
  }),
  'dialogue-quests': z.strictObject({}),
  'schedules-relationships': z.strictObject({}),
  'combat-ai': z.strictObject({}),
  'economy-progression': z.strictObject({}),
  'hub-navigation-vehicle': z.strictObject({}),
  'save-load': z.strictObject({})
} as const satisfies Record<CapabilityId, z.ZodType>

const capabilitySelection = <Id extends CapabilityId>(id: Id) => z.strictObject({
  id: z.literal(id),
  config: capabilityConfigSchemas[id],
  requirements: z.array(z.string().min(1).max(240)).max(10)
})

const capabilitySelectionSchema = z.discriminatedUnion('id', [
  capabilitySelection('interaction-inventory'),
  capabilitySelection('dialogue-quests'),
  capabilitySelection('schedules-relationships'),
  capabilitySelection('combat-ai'),
  capabilitySelection('economy-progression'),
  capabilitySelection('hub-navigation-vehicle'),
  capabilitySelection('save-load')
])
```

- [x] **Step 4: Run the full affected suites**

Run: `npx vitest run --project contracts --project game-spec --project editor-mcp-server`
Expected: PASS — every existing spec fixture uses `config: {}`, which still parses identically, so validation, normalization, hashes, and the Phase-2 acceptance tests are all unaffected. `z.toJSONSchema(gameSpecDraftSchema)` (rides in the `compileGameSpec` tool description) serializes the discriminated union as `anyOf`; if it throws, that is a regression to fix here, not to work around.

- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): interaction-inventory capability config via discriminated selection union"
```

---

## Milestone B — the runtime seam

### Task 3: Capability-pack interface v1, `PackEvalHook`, `loadComposition`

**Files:**
- Modify: `packages/game-kit/src/packs.ts` (rewrite — breaking evolution; only caller is the template's `composePacks([])`)
- Create: `packages/game-kit/src/packEval.ts`
- Create: `packages/game-kit/src/composition.ts`
- Modify: `packages/game-kit/src/index.ts` (add `export * from './packEval'` and `export * from './composition'`)
- Modify: `packages/game-kit/package.json` (add `"@automata/contracts": "*"` to dependencies)
- Test: `packages/game-kit/tests/packs.test.ts` (rewrite), `packages/game-kit/tests/composition.test.ts` (new)

**Interfaces:**
- Consumes: `parseCompositionManifest`, `CompositionManifest` (Task 1); `GameHost` (`./host`); `RenderPort`, `CleanupStack` (`@automata/engine`); `ProjectReader` (`./projectReader`).
- Produces: `PackBootContext { host: GameHost; render: RenderPort }`, `PackWorldState { playerPosition: { x: number; z: number } }`, `PackRuntimeHandle { fixedUpdate?(dt, world); render?(alpha); objectivesComplete?(): boolean; dispose?(): void }`, `GamePack<TConfig> { id; version; configSchema?; register(ctx, config): PackRuntimeHandle | void }`, `ComposedRuntime { packIds; fixedUpdate(dt, world); render(alpha); objectivesComplete(): boolean }`, `composePacks(packs, configs?): { packIds; boot(ctx): ComposedRuntime }`; `PackEvalHook { packId; createState(); nextTarget(state, player): {x,z} | null; step(state, player): unknown; complete(state): boolean }`; `loadComposition(reader: ProjectReader): Promise<CompositionManifest>`.

- [x] **Step 1: Rewrite the pack tests (failing)**

```ts
// packages/game-kit/tests/packs.test.ts — full replacement
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost } from '../src/host'
import { composePacks, type GamePack, type PackBootContext, type PackRuntimeHandle } from '../src/packs'

function context(): PackBootContext {
  const app = document.createElement('div')
  document.body.append(app)
  return { host: createGameHost(app), render: createNullRenderer().port }
}

describe('composePacks (capability-pack interface v1)', () => {
  it('rejects duplicate pack ids at compose time', () => {
    const pack: GamePack = { id: 'a', version: '1.0.0', register: () => {} }
    expect(() => composePacks([pack, { ...pack }])).toThrow(/Duplicate pack id/)
  })

  it('boots in declaration order, parses configs, and returns an aggregated runtime', () => {
    const calls: string[] = []
    const make = (id: string, complete: boolean): GamePack<{ tag: string }> => ({
      id, version: '1.0.0',
      configSchema: { parse: (input) => { calls.push(`parse:${id}`); return input as { tag: string } } },
      register(_ctx, config): PackRuntimeHandle {
        calls.push(`register:${id}:${config.tag}`)
        return {
          fixedUpdate: (dt) => calls.push(`fixed:${id}:${dt}`),
          render: (alpha) => calls.push(`render:${id}:${alpha}`),
          objectivesComplete: () => complete
        }
      }
    })
    const runtime = composePacks([make('a', true), make('b', false)], { a: { tag: 'x' }, b: { tag: 'y' } }).boot(context())
    expect(runtime.packIds).toEqual(['a', 'b'])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 0, z: 0 } })
    runtime.render(0.5)
    expect(calls).toEqual([
      'parse:a', 'register:a:x', 'parse:b', 'register:b:y',
      'fixed:a:0.016', 'fixed:b:0.016', 'render:a:0.5', 'render:b:0.5'
    ])
    expect(runtime.objectivesComplete()).toBe(false) // ANDs all gates
  })

  it('treats packs without a gate as vacuously complete and defers dispose onto the host stack', () => {
    let disposed = 0
    const pack: GamePack = {
      id: 'a', version: '1.0.0',
      register: () => ({ dispose: () => { disposed += 1 } })
    }
    const ctx = context()
    const runtime = composePacks([pack]).boot(ctx)
    expect(runtime.objectivesComplete()).toBe(true)
    ctx.host.dispose()
    expect(disposed).toBe(1)
  })

  it('composing zero packs yields an inert, vacuously complete runtime', () => {
    const runtime = composePacks([]).boot(context())
    expect(runtime.packIds).toEqual([])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 1, z: 2 } })
    runtime.render(0)
    expect(runtime.objectivesComplete()).toBe(true)
  })
})
```

```ts
// packages/game-kit/tests/composition.test.ts
import { describe, expect, it } from 'vitest'
import { loadComposition } from '../src/composition'

const reader = (files: Record<string, string>) => ({
  readText: async (path: string) => {
    const text = files[path]
    if (text === undefined) throw new Error(`missing ${path}`)
    return text
  }
})

describe('loadComposition', () => {
  it('parses a valid composition.json through the contracts schema', async () => {
    const manifest = { formatVersion: 1, gameId: 'probe', source: null, packs: [], assets: [] }
    await expect(loadComposition(reader({ 'composition.json': JSON.stringify(manifest) }))).resolves.toEqual(manifest)
  })

  it('fails diagnosably when the file is missing or invalid', async () => {
    await expect(loadComposition(reader({}))).rejects.toThrow(/composition\.json/)
    await expect(loadComposition(reader({ 'composition.json': '{"formatVersion":9}' }))).rejects.toThrow()
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run --project game-kit`
Expected: FAIL — `boot` returns void today; `PackBootContext`, `packEval`, `composition` don't exist.

- [x] **Step 3: Implement**

```ts
// packages/game-kit/src/packs.ts — full replacement
import type { RenderPort } from '@automata/engine'
import type { GameHost } from './host'

/**
 * The capability-pack interface v1 (factory Phase 3). Packs register against a
 * boot context and hand back a runtime handle; the composed runtime is driven
 * by the game loop. Player state flows IN as an argument, win-gating flows OUT
 * via objectivesComplete — no pack↔gameplay circular binding.
 */
export interface PackBootContext {
  host: GameHost
  render: RenderPort
}

export interface PackWorldState {
  playerPosition: { x: number; z: number }
}

export interface PackRuntimeHandle {
  fixedUpdate?(dt: number, world: PackWorldState): void
  render?(alpha: number): void
  /** Win-condition gate; the composed runtime ANDs all gates (vacuously true). */
  objectivesComplete?(): boolean
  dispose?(): void
}

export interface GamePack<TConfig = unknown> {
  id: string
  version: string
  /** Structural schema slot (zod-compatible); validated at boot when present. */
  configSchema?: { parse(input: unknown): TConfig }
  register(ctx: PackBootContext, config: TConfig): PackRuntimeHandle | void
}

export interface ComposedRuntime {
  packIds: readonly string[]
  fixedUpdate(dt: number, world: PackWorldState): void
  render(alpha: number): void
  objectivesComplete(): boolean
}

export interface ComposedPacks {
  packIds: readonly string[]
  boot(ctx: PackBootContext): ComposedRuntime
}

export function composePacks(packs: readonly GamePack[], configs: Record<string, unknown> = {}): ComposedPacks {
  const seen = new Set<string>()
  for (const pack of packs) {
    if (seen.has(pack.id)) throw new Error(`Duplicate pack id "${pack.id}"`)
    seen.add(pack.id)
  }
  const packIds = packs.map((pack) => pack.id)
  return {
    packIds,
    boot(ctx) {
      const handles: PackRuntimeHandle[] = []
      for (const pack of packs) {
        const config = pack.configSchema ? pack.configSchema.parse(configs[pack.id]) : configs[pack.id]
        const handle = pack.register(ctx, config as never)
        if (!handle) continue
        handles.push(handle)
        if (handle.dispose) ctx.host.cleanup.defer(() => handle.dispose!())
      }
      return {
        packIds,
        fixedUpdate(dt, world) { for (const handle of handles) handle.fixedUpdate?.(dt, world) },
        render(alpha) { for (const handle of handles) handle.render?.(alpha) },
        objectivesComplete() { return handles.every((handle) => handle.objectivesComplete?.() ?? true) }
      }
    }
  }
}
```

```ts
// packages/game-kit/src/packEval.ts
/**
 * Headless twin of the pack runtime: a pure hook the scripted evaluator drives
 * to complete a pack's objectives deterministically (no DOM, no engine).
 */
export interface PackEvalHook {
  packId: string
  createState(): unknown
  /** Next waypoint the scripted evaluator should seek, or null when satisfied. */
  nextTarget(state: unknown, player: { x: number; z: number }): { x: number; z: number } | null
  step(state: unknown, player: { x: number; z: number }): unknown
  complete(state: unknown): boolean
}
```

```ts
// packages/game-kit/src/composition.ts
import { parseCompositionManifest, type CompositionManifest } from '@automata/contracts'
import type { ProjectReader } from './projectReader'

/** Read + validate `composition.json` through the project reader; boot-diagnosable on failure. */
export async function loadComposition(reader: ProjectReader): Promise<CompositionManifest> {
  let text: string
  try {
    text = await reader.readText('composition.json')
  } catch (error) {
    throw new Error(`Failed to read composition.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parseCompositionManifest(text)
}
```

Add to `packages/game-kit/src/index.ts`:

```ts
export * from './packEval'
export * from './composition'
```

Add `"@automata/contracts": "*"` to `packages/game-kit/package.json` dependencies, then `npm install`.

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project game-kit`
Expected: PASS. Also run `npm run typecheck -w @automata/game-kit` — the package's actual npm workspace name includes the `@automata/` scope. The scaffold templates still emit `composePacks([]).boot(host)` (fixed in Task 10); the two shipped games don't use `composePacks`, so nothing else breaks yet. `npx tsc -p tools/scaffold` is NOT expected to fail (templates are string literals), but `verify:new-game` would — do not run it until Task 10.

- [x] **Step 5: Commit**

```bash
git add packages/game-kit package-lock.json
git commit -m "feat(game-kit): capability-pack interface v1, PackEvalHook, loadComposition"
```

---

## Milestone C — the interaction-inventory pack

### Task 4: Pure inventory core + eval hook

**Files:**
- Create: `packages/pack-interaction-inventory/package.json`, `packages/pack-interaction-inventory/tsconfig.json`, `packages/pack-interaction-inventory/vitest.config.ts`
- Create: `packages/pack-interaction-inventory/src/core.ts`
- Create: `packages/pack-interaction-inventory/src/evalHook.ts`
- Create: `packages/pack-interaction-inventory/src/index.ts`
- Create: `packages/pack-interaction-inventory/tests/fixtures.ts`
- Test: `packages/pack-interaction-inventory/tests/core.test.ts`

Package files (flat under `packages/`, matching sibling packages):

```json
// packages/pack-interaction-inventory/package.json
{
  "name": "@automata/pack-interaction-inventory",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/engine": "*",
    "@automata/game-kit": "*",
    "@automata/project": "*"
  }
}
```

```json
// packages/pack-interaction-inventory/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

```ts
// packages/pack-interaction-inventory/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-interaction-inventory', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

**Interfaces:**
- Consumes: `PackEvalHook` (Task 3); `z` via `@automata/project` (lint: no direct `zod`).
- Produces: `InventoryItem { id: string; position: { x: number; z: number } }`, `InventoryPackConfig { interactRadius: number; items: InventoryItem[]; iconPath: string | null }`, `packConfigSchema` (strict zod, bounds: interactRadius 0.5..5, items 1..8), `InventoryState { collected: readonly string[] }`, `createInventoryState()`, `stepInventory(state, player, config): InventoryState`, `inventoryComplete(state, config): boolean`, `nextItemTarget(state, player, config): { x; z } | null`, `createInventoryEvalHook(config): PackEvalHook`.

- [x] **Step 1: Write the failing test**

```ts
// packages/pack-interaction-inventory/tests/fixtures.ts
import type { InventoryPackConfig } from '../src/core'

/** Deterministic fixture shared by unit tests and the critical-path smoke. */
export function fixtureConfig(): InventoryPackConfig {
  return {
    interactRadius: 1.5,
    items: [
      { id: 'cell-a', position: { x: -2, z: 3 } },
      { id: 'cell-b', position: { x: 4, z: -1 } }
    ],
    iconPath: 'assets/item-icon.svg'
  }
}
```

```ts
// packages/pack-interaction-inventory/tests/core.test.ts
import { describe, expect, it } from 'vitest'
import {
  createInventoryState, inventoryComplete, nextItemTarget, packConfigSchema, stepInventory
} from '../src/core'
import { createInventoryEvalHook } from '../src/evalHook'
import { fixtureConfig } from './fixtures'

describe('inventory core', () => {
  const config = fixtureConfig()

  it('collects an item only within the interact radius, exactly once', () => {
    let state = createInventoryState()
    state = stepInventory(state, { x: 10, z: 10 }, config)
    expect(state.collected).toEqual([])
    state = stepInventory(state, { x: -2.5, z: 3.5 }, config) // within 1.5 of cell-a
    expect(state.collected).toEqual(['cell-a'])
    state = stepInventory(state, { x: -2.5, z: 3.5 }, config)
    expect(state.collected).toEqual(['cell-a'])
  })

  it('is complete exactly when every item is collected', () => {
    let state = createInventoryState()
    expect(inventoryComplete(state, config)).toBe(false)
    state = stepInventory(state, { x: -2, z: 3 }, config)
    state = stepInventory(state, { x: 4, z: -1 }, config)
    expect(state.collected).toEqual(['cell-a', 'cell-b'])
    expect(inventoryComplete(state, config)).toBe(true)
  })

  it('targets the nearest uncollected item, then null when done', () => {
    let state = createInventoryState()
    expect(nextItemTarget(state, { x: 4, z: 0 }, config)).toEqual({ x: 4, z: -1 })
    state = stepInventory(state, { x: 4, z: -1 }, config)
    expect(nextItemTarget(state, { x: 4, z: 0 }, config)).toEqual({ x: -2, z: 3 })
    state = stepInventory(state, { x: -2, z: 3 }, config)
    expect(nextItemTarget(state, { x: 0, z: 0 }, config)).toBeNull()
  })

  it('bounds the config schema', () => {
    expect(packConfigSchema.safeParse(config).success).toBe(true)
    expect(packConfigSchema.safeParse({ ...config, interactRadius: 0.1 }).success).toBe(false)
    expect(packConfigSchema.safeParse({ ...config, items: [] }).success).toBe(false)
    expect(packConfigSchema.safeParse({ ...config, extra: 1 }).success).toBe(false)
  })
})

describe('inventory eval hook', () => {
  it('walks the scripted evaluator through every item then reports complete', () => {
    const config = fixtureConfig()
    const hook = createInventoryEvalHook(config)
    let state = hook.createState()
    let player = { x: 0, z: 0 }
    for (let guard = 0; guard < 10 && !hook.complete(state); guard += 1) {
      const target = hook.nextTarget(state, player)
      expect(target).not.toBeNull()
      player = target! // teleport for the unit test; the real evaluator walks the sim
      state = hook.step(state, player)
    }
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, player)).toBeNull()
    expect(hook.packId).toBe('interaction-inventory')
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npm install && npx vitest run --project pack-interaction-inventory`
Expected: FAIL — modules don't exist. (`npm install` first so the new workspace package resolves.)

- [x] **Step 3: Implement**

```ts
// packages/pack-interaction-inventory/src/core.ts
import { z } from '@automata/project'

/** Pure inventory state machine: no DOM, clocks, or RNG. */
export interface InventoryItem {
  id: string
  position: { x: number; z: number }
}

export interface InventoryPackConfig {
  interactRadius: number
  items: InventoryItem[]
  /** Public-relative path of the HUD icon, or null for no icon. */
  iconPath: string | null
}

export const packConfigSchema = z.strictObject({
  interactRadius: z.number().min(0.5).max(5),
  items: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    position: z.strictObject({ x: z.number(), z: z.number() })
  })).min(1).max(8),
  iconPath: z.string().min(1).max(200).nullable()
})

export interface InventoryState {
  collected: readonly string[]
}

export function createInventoryState(): InventoryState {
  return { collected: [] }
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** Collect every uncollected item within the interact radius (idempotent per item). */
export function stepInventory(state: InventoryState, player: { x: number; z: number }, config: InventoryPackConfig): InventoryState {
  const picked = config.items.filter((item) =>
    !state.collected.includes(item.id) && distance(item.position, player) <= config.interactRadius)
  if (picked.length === 0) return state
  return { collected: [...state.collected, ...picked.map((item) => item.id)] }
}

export function inventoryComplete(state: InventoryState, config: InventoryPackConfig): boolean {
  return config.items.every((item) => state.collected.includes(item.id))
}

/** Nearest uncollected item's position, or null when all are collected. */
export function nextItemTarget(state: InventoryState, player: { x: number; z: number }, config: InventoryPackConfig): { x: number; z: number } | null {
  let best: InventoryItem | null = null
  for (const item of config.items) {
    if (state.collected.includes(item.id)) continue
    if (!best || distance(item.position, player) < distance(best.position, player)) best = item
  }
  return best ? { ...best.position } : null
}
```

```ts
// packages/pack-interaction-inventory/src/evalHook.ts
import type { PackEvalHook } from '@automata/game-kit'
import {
  createInventoryState, inventoryComplete, nextItemTarget, stepInventory,
  type InventoryPackConfig, type InventoryState
} from './core'

/** Headless twin of the browser pack: drives the scripted evaluator over the pure core. */
export function createInventoryEvalHook(config: InventoryPackConfig): PackEvalHook {
  return {
    packId: 'interaction-inventory',
    createState: () => createInventoryState(),
    nextTarget: (state, player) => nextItemTarget(state as InventoryState, player, config),
    step: (state, player) => stepInventory(state as InventoryState, player, config),
    complete: (state) => inventoryComplete(state as InventoryState, config)
  }
}
```

```ts
// packages/pack-interaction-inventory/src/index.ts
export * from './core'
export * from './evalHook'
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project pack-interaction-inventory`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-interaction-inventory package-lock.json
git commit -m "feat(pack-interaction-inventory): pure inventory core + headless eval hook"
```

### Task 5: Browser pack adapter

**Files:**
- Create: `packages/pack-interaction-inventory/src/pack.ts`
- Modify: `packages/pack-interaction-inventory/src/index.ts` (add `export * from './pack'`)
- Test: `packages/pack-interaction-inventory/tests/pack.test.ts`

**Interfaces:**
- Consumes: `GamePack`, `PackBootContext`, `PackRuntimeHandle` (Task 3); `createNullRenderer` (`@automata/engine`, tests); core (Task 4).
- Produces: `interactionInventoryPack: GamePack<InventoryPackConfig>` with `id: 'interaction-inventory'`, `version: '1.0.0'`, `configSchema: packConfigSchema`. HUD div class `inventory-hud` in `ctx.host.overlays`; one sphere renderable per item (entity id `inventory-item-<itemId>`, radius 0.35, color `#ffd23f`, posed at y 0.35).

- [x] **Step 1: Write the failing test**

```ts
// packages/pack-interaction-inventory/tests/pack.test.ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost, type PackBootContext } from '@automata/game-kit'
import { interactionInventoryPack } from '../src/pack'
import { fixtureConfig } from './fixtures'

function boot(config = fixtureConfig()) {
  const app = document.createElement('div')
  document.body.append(app)
  const render = createNullRenderer()
  const ctx: PackBootContext = { host: createGameHost(app), render: render.port }
  const handle = interactionInventoryPack.register(ctx, config)
  if (!handle) throw new Error('pack must return a runtime handle')
  return { ctx, render, handle, app }
}

describe('interaction-inventory pack (browser adapter)', () => {
  it('declares the capability id and validates config through its schema', () => {
    expect(interactionInventoryPack.id).toBe('interaction-inventory')
    expect(interactionInventoryPack.version).toBe('1.0.0')
    expect(() => interactionInventoryPack.configSchema!.parse({})).toThrow()
  })

  it('adds one renderable per item and a HUD with icon + count', () => {
    const { render, app } = boot()
    const adds = render.calls.filter((call) => call.op === 'add')
    expect(adds).toHaveLength(2)
    const hud = app.querySelector('.inventory-hud')
    expect(hud?.textContent).toContain('0/2')
    expect(hud?.querySelector('img')?.getAttribute('src')).toBe('assets/item-icon.svg')
  })

  it('omits the icon img when iconPath is null', () => {
    const { app } = boot({ ...fixtureConfig(), iconPath: null })
    expect(app.querySelector('.inventory-hud img')).toBeNull()
  })

  it('collects on fixedUpdate, removes the renderable, updates the HUD, and gates completion', () => {
    const { render, handle, app } = boot()
    expect(handle.objectivesComplete!()).toBe(false)
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
    expect(render.calls.filter((call) => call.op === 'remove')).toHaveLength(1)
    expect(app.querySelector('.inventory-hud')?.textContent).toContain('1/2')
    handle.fixedUpdate!(1 / 60, { playerPosition: { x: 4, z: -1 } })
    expect(app.querySelector('.inventory-hud')?.textContent).toContain('2/2')
    expect(handle.objectivesComplete!()).toBe(true)
  })

  it('dispose removes remaining renderables and the HUD', () => {
    const { render, handle, app } = boot()
    handle.dispose!()
    expect(render.port.objectCount).toBe(0)
    expect(app.querySelector('.inventory-hud')).toBeNull()
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run --project pack-interaction-inventory -t 'browser adapter'`
Expected: FAIL — `./pack` does not exist.

- [x] **Step 3: Implement**

```ts
// packages/pack-interaction-inventory/src/pack.ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import {
  createInventoryState, inventoryComplete, packConfigSchema, stepInventory,
  type InventoryPackConfig, type InventoryState
} from './core'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ITEM_COLOR = '#ffd23f'

/** The first real capability pack: item pickups + inventory HUD over interface v1. */
export const interactionInventoryPack: GamePack<InventoryPackConfig> = {
  id: 'interaction-inventory',
  version: '1.0.0',
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let state: InventoryState = createInventoryState()
    const entities = new Map(config.items.map((item) => [item.id, { id: `inventory-item-${item.id}` }]))
    for (const item of config.items) {
      const entity = entities.get(item.id)!
      ctx.render.add(entity, { primitive: 'sphere', radius: 0.35, color: ITEM_COLOR })
      ctx.render.setPose(entity, { x: item.position.x, y: 0.35, z: item.position.z }, IDENTITY)
    }

    const hud = document.createElement('div')
    hud.className = 'inventory-hud'
    if (config.iconPath !== null) {
      const icon = document.createElement('img')
      icon.src = config.iconPath
      icon.alt = 'item'
      icon.width = 16
      icon.height = 16
      hud.append(icon)
    }
    const count = document.createElement('span')
    hud.append(count)
    const updateHud = (): void => { count.textContent = ` ${state.collected.length}/${config.items.length}` }
    updateHud()
    ctx.host.overlays.append(hud)

    return {
      fixedUpdate(_dt, world) {
        const next = stepInventory(state, world.playerPosition, config)
        if (next === state) return
        for (const id of next.collected) {
          if (state.collected.includes(id)) continue
          const entity = entities.get(id)
          if (entity) { ctx.render.remove(entity); entities.delete(id) }
        }
        state = next
        updateHud()
      },
      objectivesComplete: () => inventoryComplete(state, config),
      dispose() {
        for (const entity of entities.values()) ctx.render.remove(entity)
        entities.clear()
        hud.remove()
      }
    }
  }
}
```

Add `export * from './pack'` to `packages/pack-interaction-inventory/src/index.ts`.

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project pack-interaction-inventory`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-interaction-inventory
git commit -m "feat(pack-interaction-inventory): browser GamePack adapter with items + inventory HUD"
```

### Task 6: Seeded compose section

**Files:**
- Create: `packages/pack-interaction-inventory/src/composeSection.ts`
- Modify: `packages/pack-interaction-inventory/src/index.ts` (add `export * from './composeSection'`)
- Test: `packages/pack-interaction-inventory/tests/composeSection.test.ts`

**Interfaces:**
- Consumes: `SeededRng`, `createSeededRng` (`@automata/engine`); `InventoryPackConfig` (Task 4).
- Produces: `INVENTORY_DEFAULTS = { requiredItems: 1, interactRadius: 1.5 } as const`; `composeInventorySection(input: { specConfig: { requiredItems?: number; interactRadius?: number }; arena: { half: number; spawn: { x; z }; goal: { x; z } }; iconPath: string | null }, rng: SeededRng): InventoryPackConfig`. Item ids are `item-1`, `item-2`, … in placement order. Placement guarantees: inside `|coord| <= half - 1`, at least 3 units from spawn and goal, at least 2 units between items; throws after a deterministic 200-draw budget.

- [x] **Step 1: Write the failing test**

```ts
// packages/pack-interaction-inventory/tests/composeSection.test.ts
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { INVENTORY_DEFAULTS, composeInventorySection } from '../src/composeSection'

const arena = { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 8, z: 8 } }
const input = (specConfig: { requiredItems?: number; interactRadius?: number } = {}) =>
  ({ specConfig, arena, iconPath: 'assets/item-icon.svg' as string | null })

describe('composeInventorySection', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    const a = composeInventorySection(input({ requiredItems: 2 }), createSeededRng(7))
    const b = composeInventorySection(input({ requiredItems: 2 }), createSeededRng(7))
    const c = composeInventorySection(input({ requiredItems: 2 }), createSeededRng(8))
    expect(a).toEqual(b)
    expect(a.items).not.toEqual(c.items)
  })

  it('applies defaults when spec config fields are absent', () => {
    const composed = composeInventorySection(input(), createSeededRng(7))
    expect(composed.items).toHaveLength(INVENTORY_DEFAULTS.requiredItems)
    expect(composed.interactRadius).toBe(INVENTORY_DEFAULTS.interactRadius)
    expect(composed.iconPath).toBe('assets/item-icon.svg')
  })

  it('honors placement constraints across many seeds', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { items } = composeInventorySection(input({ requiredItems: 8 }), createSeededRng(seed))
      expect(items).toHaveLength(8)
      expect(items.map((item) => item.id)).toEqual(items.map((_, index) => `item-${index + 1}`))
      for (const [index, item] of items.entries()) {
        expect(Math.abs(item.position.x)).toBeLessThanOrEqual(arena.half - 1)
        expect(Math.abs(item.position.z)).toBeLessThanOrEqual(arena.half - 1)
        expect(Math.hypot(item.position.x - arena.spawn.x, item.position.z - arena.spawn.z)).toBeGreaterThanOrEqual(3)
        expect(Math.hypot(item.position.x - arena.goal.x, item.position.z - arena.goal.z)).toBeGreaterThanOrEqual(3)
        for (const other of items.slice(index + 1)) {
          expect(Math.hypot(item.position.x - other.position.x, item.position.z - other.position.z)).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('throws when the placement budget cannot satisfy the constraints', () => {
    const tiny = { specConfig: { requiredItems: 8 }, arena: { half: 2, spawn: { x: 0, z: 0 }, goal: { x: 0, z: 0 } }, iconPath: null }
    expect(() => composeInventorySection(tiny, createSeededRng(1))).toThrow(/placement/i)
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run --project pack-interaction-inventory -t 'composeInventorySection'`
Expected: FAIL — module missing.

- [x] **Step 3: Implement**

```ts
// packages/pack-interaction-inventory/src/composeSection.ts
import type { SeededRng } from '@automata/engine'
import type { InventoryItem, InventoryPackConfig } from './core'

export const INVENTORY_DEFAULTS = { requiredItems: 1, interactRadius: 1.5 } as const

export interface ComposeSectionInput {
  specConfig: { requiredItems?: number; interactRadius?: number }
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  iconPath: string | null
}

const WALL_MARGIN = 1
const KEEPOUT = 3       // min distance from spawn and goal
const SEPARATION = 2    // min distance between items
const DRAW_BUDGET = 200 // deterministic rejection-sampling budget

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Seeded item placement; defaults applied here, never by the spec schema. */
export function composeInventorySection(input: ComposeSectionInput, rng: SeededRng): InventoryPackConfig {
  const requiredItems = input.specConfig.requiredItems ?? INVENTORY_DEFAULTS.requiredItems
  const interactRadius = input.specConfig.interactRadius ?? INVENTORY_DEFAULTS.interactRadius
  const extent = input.arena.half - WALL_MARGIN
  const items: InventoryItem[] = []
  for (let draw = 0; items.length < requiredItems && draw < DRAW_BUDGET; draw += 1) {
    const candidate = { x: round2((rng.next() * 2 - 1) * extent), z: round2((rng.next() * 2 - 1) * extent) }
    if (!far(candidate, input.arena.spawn, KEEPOUT)) continue
    if (!far(candidate, input.arena.goal, KEEPOUT)) continue
    if (!items.every((item) => far(candidate, item.position, SEPARATION))) continue
    items.push({ id: `item-${items.length + 1}`, position: candidate })
  }
  if (items.length < requiredItems) {
    throw new Error(`Item placement budget exhausted: placed ${items.length}/${requiredItems}`)
  }
  return { interactRadius, items, iconPath: input.iconPath }
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project pack-interaction-inventory`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-interaction-inventory
git commit -m "feat(pack-interaction-inventory): seeded compose section with placement constraints"
```

---

## Milestone D — registry + compose engine

### Task 7: Static pack registry

**Files:**
- Create: `packages/pack-registry/package.json`, `packages/pack-registry/tsconfig.json`, `packages/pack-registry/vitest.config.ts` (same shapes as Task 4's, name `@automata/pack-registry`, test name `pack-registry`; dependencies: `"@automata/contracts": "*"`, `"@automata/game-kit": "*"`, `"@automata/pack-interaction-inventory": "*"`)
- Create: `packages/pack-registry/src/index.ts`
- Test: `packages/pack-registry/tests/registry.test.ts`

**Interfaces:**
- Consumes: `interactionInventoryPack`, `packConfigSchema`, `createInventoryEvalHook` (Tasks 4–5); `GamePack`, `PackEvalHook` (Task 3); `CompositionManifest` (Task 1).
- Produces: `STANDARD_PACKS: Record<string, GamePack>`; `resolvePacks(ids: readonly string[]): GamePack[]` (throws `Unknown pack id "<id>"` listing known ids); `resolveEvalHooks(composition: CompositionManifest): PackEvalHook[]` (parses each entry's config through the pack's schema; entries without a hook builder contribute none). This is the ONLY module that knows the full pack set — Phase 4 adds packs here and nowhere else.

- [x] **Step 1: Write the failing test**

```ts
// packages/pack-registry/tests/registry.test.ts
import { describe, expect, it } from 'vitest'
import type { CompositionManifest } from '@automata/contracts'
import { STANDARD_PACKS, resolveEvalHooks, resolvePacks } from '../src'

const composition = (packs: CompositionManifest['packs']): CompositionManifest =>
  ({ formatVersion: 1, gameId: 'probe', source: null, packs, assets: [] })

describe('pack registry', () => {
  it('resolves known ids in order and rejects unknown ids with the known set', () => {
    expect(resolvePacks(['interaction-inventory']).map((pack) => pack.id)).toEqual(['interaction-inventory'])
    expect(() => resolvePacks(['dialogue-quests'])).toThrow(/Unknown pack id "dialogue-quests".*interaction-inventory/)
  })

  it('builds eval hooks from a composition, validating configs through the pack schema', () => {
    const hooks = resolveEvalHooks(composition([{
      id: 'interaction-inventory', version: '1.0.0',
      config: { interactRadius: 1.5, items: [{ id: 'item-1', position: { x: 1, z: 1 } }], iconPath: null }
    }]))
    expect(hooks).toHaveLength(1)
    expect(hooks[0]!.packId).toBe('interaction-inventory')
    expect(() => resolveEvalHooks(composition([{ id: 'interaction-inventory', version: '1.0.0', config: {} }]))).toThrow()
  })

  it('yields no hooks for an empty composition', () => {
    expect(resolveEvalHooks(composition([]))).toEqual([])
  })

  it('exposes exactly the packs that exist (one, in Phase 3)', () => {
    expect(Object.keys(STANDARD_PACKS)).toEqual(['interaction-inventory'])
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npm install && npx vitest run --project pack-registry`
Expected: FAIL — package empty.

- [x] **Step 3: Implement**

```ts
// packages/pack-registry/src/index.ts
import type { CompositionManifest } from '@automata/contracts'
import type { GamePack, PackEvalHook } from '@automata/game-kit'
import {
  createInventoryEvalHook, interactionInventoryPack, packConfigSchema
} from '@automata/pack-interaction-inventory'

/**
 * The static pack registry: the only module that knows the full pack set.
 * Phase 4 packs are added to these two tables and nowhere else — game-kit
 * stays pack-agnostic and games resolve packs purely from composition data.
 */
export const STANDARD_PACKS: Record<string, GamePack> = {
  [interactionInventoryPack.id]: interactionInventoryPack as GamePack
}

const EVAL_HOOK_BUILDERS: Record<string, (config: unknown) => PackEvalHook> = {
  [interactionInventoryPack.id]: (config) => createInventoryEvalHook(packConfigSchema.parse(config))
}

export function resolvePacks(ids: readonly string[]): GamePack[] {
  return ids.map((id) => {
    const pack = STANDARD_PACKS[id]
    if (!pack) throw new Error(`Unknown pack id "${id}"; known packs: ${Object.keys(STANDARD_PACKS).join(', ')}`)
    return pack
  })
}

export function resolveEvalHooks(composition: CompositionManifest): PackEvalHook[] {
  const hooks: PackEvalHook[] = []
  for (const entry of composition.packs) {
    const build = EVAL_HOOK_BUILDERS[entry.id]
    if (build) hooks.push(build(entry.config))
  }
  return hooks
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project pack-registry`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-registry package-lock.json
git commit -m "feat(pack-registry): static registry resolving composition packs and eval hooks"
```

### Task 8: `composeGame` — the pure compose engine

**Files:**
- Create: `packages/game-compose/package.json`, `packages/game-compose/tsconfig.json`, `packages/game-compose/vitest.config.ts` (same shapes as Task 4's, name `@automata/game-compose`, test name `game-compose`; dependencies: `"@automata/contracts": "*"`, `"@automata/engine": "*"`, `"@automata/pack-interaction-inventory": "*"`)
- Create: `packages/game-compose/src/compose.ts`
- Create: `packages/game-compose/src/index.ts` (`export * from './compose'`; Task 9 adds `export * from './sliceReport'`)
- Test: `packages/game-compose/tests/compose.test.ts`

**Interfaces:**
- Consumes: `GameSpec`, `CompositionManifest`, `AssetManifest` (contracts); `createSeededRng` (`@automata/engine`); `composeInventorySection`, `INVENTORY_DEFAULTS` (Task 6).
- Produces:
  ```ts
  interface ComposedFile { path: string; text: string }   // relative to games/<gameId>/
  interface ComposeIssue { code: string; message: string }
  type ComposeResult =
    | { ok: true; composition: CompositionManifest; assetManifest: AssetManifest; files: ComposedFile[]; summary: { packIds: string[]; itemCount: number; assetIds: string[] } }
    | { ok: false; issues: ComposeIssue[] }
  function composeGame(args: { spec: GameSpec; seed: number; specHash: string }): ComposeResult
  ```
  RNG draw order (binding): goal position → icon hue → item placements. Emitted files: `public/project/resources/tuning.resource.json`, `public/project/composition.json`, `public/assets/item-icon.svg` (one per spec `ui` asset requirement, path `public/assets/<requirement.id>.svg`), `public/assets/assets.json`. JSON serialized as `JSON.stringify(value, null, 2) + '\n'` (byte-parity with `projectFilesFromSnapshot`). Base arena constants match the scaffold template: `arenaHalf 12`, `moveSpeed 6`, `goalRadius 1.5`, `timeLimitS 30`, spawn `(-8, -8)`, colors `{ floor: '#12203a', player: '#27e0ff', goal: '#ffd23f' }`.

- [x] **Step 1: Write the failing test**

```ts
// packages/game-compose/tests/compose.test.ts
import { describe, expect, it } from 'vitest'
import { compositionManifestSchema, assetManifestSchema, gameSpecSchema, minimalGameSpecDraft, type GameSpec } from '@automata/contracts'
import { composeGame } from '../src'

function sliceSpec(): GameSpec {
  const draft = minimalGameSpecDraft('first-light') as Record<string, unknown>
  draft.capabilities = [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }]
  draft.assets = [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' }]
  ;(draft.identity as Record<string, unknown>).id = 'first-light'
  return gameSpecSchema.parse({
    specVersion: 1,
    provenance: { prompt: 'test', translations: [], history: [{ version: 1, reason: 'initial compile' }] },
    ...draft
  })
}

describe('composeGame', () => {
  it('is byte-deterministic for the same (spec, seed) and differs across seeds', () => {
    const spec = sliceSpec()
    const a = composeGame({ spec, seed: 7, specHash: 'h1' })
    const b = composeGame({ spec, seed: 7, specHash: 'h1' })
    const c = composeGame({ spec, seed: 8, specHash: 'h1' })
    expect(a).toEqual(b)
    if (!a.ok || !c.ok) throw new Error('expected ok results')
    expect(a.files).not.toEqual(c.files)
  })

  it('emits schema-valid composition and asset manifests wired to the spec', () => {
    const result = composeGame({ spec: sliceSpec(), seed: 7, specHash: 'h1' })
    if (!result.ok) throw new Error('expected ok')
    expect(compositionManifestSchema.parse(result.composition)).toEqual(result.composition)
    expect(assetManifestSchema.parse(result.assetManifest)).toEqual(result.assetManifest)
    expect(result.composition.source).toEqual({ specVersion: 1, specHash: 'h1', seed: 7 })
    expect(result.composition.packs.map((entry) => entry.id)).toEqual(['interaction-inventory'])
    const config = result.composition.packs[0]!.config as { items: unknown[]; iconPath: string }
    expect(config.items).toHaveLength(2)
    expect(config.iconPath).toBe('assets/item-icon.svg')
    expect(result.composition.assets).toEqual([{ id: 'item-icon', path: 'assets/item-icon.svg' }])
    expect(result.assetManifest.assets[0]!.provenance).toEqual({ provider: 'stub-generator', generator: 'svg-icon@1', specVersion: 1, seed: 7 })
    expect(result.summary).toEqual({ packIds: ['interaction-inventory'], itemCount: 2, assetIds: ['item-icon'] })
  })

  it('emits the file set with stable serialization and a seeded in-bounds goal', () => {
    const result = composeGame({ spec: sliceSpec(), seed: 7, specHash: 'h1' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.files.map((file) => file.path)).toEqual([
      'public/project/resources/tuning.resource.json',
      'public/project/composition.json',
      'public/assets/item-icon.svg',
      'public/assets/assets.json'
    ])
    for (const file of result.files.filter((entry) => entry.path.endsWith('.json'))) {
      expect(file.text.endsWith('\n')).toBe(true)
      expect(file.text).toBe(`${JSON.stringify(JSON.parse(file.text), null, 2)}\n`)
    }
    const tuning = JSON.parse(result.files[0]!.text) as { id: string; typeId: string; data: { goal: { x: number; z: number }; arenaHalf: number } }
    expect(tuning.id).toBe('tuning')
    expect(tuning.typeId).toBe('first-light.tuning')
    expect(Math.abs(tuning.data.goal.x)).toBeLessThanOrEqual(tuning.data.arenaHalf)
    expect(Math.abs(tuning.data.goal.z)).toBeLessThanOrEqual(tuning.data.arenaHalf)
    expect(result.files[2]!.text).toContain('<svg')
  })

  it('rejects capabilities beyond the Phase 3 slice with a typed issue', () => {
    const spec = sliceSpec()
    const withExtra = {
      ...spec,
      capabilities: [...spec.capabilities, { id: 'save-load' as const, config: {}, requirements: [] }]
    }
    const result = composeGame({ spec: withExtra as GameSpec, seed: 7, specHash: 'h1' })
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'compose-unsupported-capability' }] })
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npm install && npx vitest run --project game-compose`
Expected: FAIL — package empty.

- [x] **Step 3: Implement**

```ts
// packages/game-compose/src/compose.ts
import { createSeededRng, type SeededRng } from '@automata/engine'
import type { AssetManifest, CompositionManifest, GameSpec } from '@automata/contracts'
import { composeInventorySection, interactionInventoryPack } from '@automata/pack-interaction-inventory'

export interface ComposedFile { path: string; text: string }
export interface ComposeIssue { code: string; message: string }
export type ComposeResult =
  | { ok: true; composition: CompositionManifest; assetManifest: AssetManifest; files: ComposedFile[]; summary: { packIds: string[]; itemCount: number; assetIds: string[] } }
  | { ok: false; issues: ComposeIssue[] }

/** Scaffold-template base content the slice composes over (single source: tools/scaffold templates). */
const ARENA = { half: 12, spawn: { x: -8, z: -8 } }
const BASE_TUNING = { moveSpeed: 6, goalRadius: 1.5, timeLimitS: 30, colors: { floor: '#12203a', player: '#27e0ff', goal: '#ffd23f' } }

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
const round2 = (value: number): number => Math.round(value * 100) / 100

/** Seeded goal in the quadrant opposite spawn; always inside the arena. */
const drawGoal = (rng: SeededRng): { x: number; z: number } =>
  ({ x: round2(2 + rng.next() * 8), z: round2(2 + rng.next() * 8) })

const drawIconSvg = (rng: SeededRng): string => {
  const hue = Math.floor(rng.next() * 360)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n` +
    `  <circle cx="16" cy="16" r="12" fill="hsl(${hue} 90% 60%)" stroke="#ffffff" stroke-width="2"/>\n` +
    `</svg>\n`
}

/**
 * Pure spec→artifacts compose. RNG draw order is binding for replay:
 * goal position → icon hue → item placements.
 */
export function composeGame(args: { spec: GameSpec; seed: number; specHash: string }): ComposeResult {
  const { spec, seed, specHash } = args
  const unsupported = spec.capabilities.filter((entry) => entry.id !== interactionInventoryPack.id)
  if (unsupported.length > 0) {
    return {
      ok: false,
      issues: unsupported.map((entry) => ({
        code: 'compose-unsupported-capability',
        message: `Phase 3 composes only "interaction-inventory"; spec selects "${entry.id}"`
      }))
    }
  }

  const rng = createSeededRng(seed)
  const goal = drawGoal(rng)

  const uiAssets = spec.assets.filter((asset) => asset.kind === 'ui')
  const assetFiles: ComposedFile[] = []
  const assetManifest: AssetManifest = { formatVersion: 1, assets: [] }
  for (const requirement of uiAssets) {
    const path = `assets/${requirement.id}.svg`
    assetFiles.push({ path: `public/${path}`, text: drawIconSvg(rng) })
    assetManifest.assets.push({
      id: requirement.id, requirement, path,
      provenance: { provider: 'stub-generator', generator: 'svg-icon@1', specVersion: spec.specVersion, seed },
      validation: { status: 'placeholder' }
    })
  }
  const iconPath = assetManifest.assets[0]?.path ?? null

  const selection = spec.capabilities[0]!
  const packConfig = composeInventorySection({
    specConfig: selection.config as { requiredItems?: number; interactRadius?: number },
    arena: { half: ARENA.half, spawn: ARENA.spawn, goal },
    iconPath
  }, rng)

  const composition: CompositionManifest = {
    formatVersion: 1,
    gameId: spec.identity.id,
    source: { specVersion: spec.specVersion, specHash, seed },
    packs: [{ id: interactionInventoryPack.id, version: interactionInventoryPack.version, config: packConfig as unknown as Record<string, unknown> }],
    assets: assetManifest.assets.map((entry) => ({ id: entry.id, path: entry.path }))
  }

  const tuningResource = {
    id: 'tuning',
    typeId: `${spec.identity.id}.tuning`,
    data: { arenaHalf: ARENA.half, moveSpeed: BASE_TUNING.moveSpeed, goal, goalRadius: BASE_TUNING.goalRadius, timeLimitS: BASE_TUNING.timeLimitS, colors: BASE_TUNING.colors }
  }

  const files: ComposedFile[] = [
    { path: 'public/project/resources/tuning.resource.json', text: json(tuningResource) },
    { path: 'public/project/composition.json', text: json(composition) },
    ...assetFiles,
    { path: 'public/assets/assets.json', text: json(assetManifest) }
  ]

  return {
    ok: true, composition, assetManifest, files,
    summary: { packIds: composition.packs.map((entry) => entry.id), itemCount: packConfig.items.length, assetIds: assetManifest.assets.map((entry) => entry.id) }
  }
}
```

```ts
// packages/game-compose/src/index.ts
export * from './compose'
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project game-compose`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/game-compose package-lock.json
git commit -m "feat(game-compose): pure seeded composeGame emitting content, manifest, and stub asset"
```

### Task 9: `SliceEvidence` contract + `renderSliceReport`

**Files:**
- Create: `packages/contracts/src/sliceReport.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from './sliceReport'`)
- Create: `packages/game-compose/src/sliceReport.ts`
- Modify: `packages/game-compose/src/index.ts` (add `export * from './sliceReport'`)
- Test: `packages/game-compose/tests/sliceReport.test.ts`

**Interfaces:**
- Consumes: `AcceptanceCriterion` (contracts).
- Produces (contracts):
  ```ts
  type SliceGateKind = 'build' | 'test' | 'browser' | 'evaluate'
  type SliceGateStatus = 'passed' | 'failed' | 'missing' | 'stale'
  interface SliceGateResult { kind: SliceGateKind; status: SliceGateStatus; stepId?: string }
  interface SliceEvidence {
    gameId: string; specVersion: number; specHash: string
    compositionHash: string; seed: number; packIds: string[]; contentHash: string
    gates: SliceGateResult[]
    acceptance: AcceptanceCriterion[]
    evalMetrics: Record<string, number | string | boolean> | null
    howToPlay: { devCommand: string; url: string; controls: string }
  }
  ```
- Produces (game-compose): `renderSliceReport(evidence: SliceEvidence): string` — deterministic markdown, purely a function of the evidence.

- [x] **Step 1: Write the failing test**

```ts
// packages/game-compose/tests/sliceReport.test.ts
import { describe, expect, it } from 'vitest'
import type { SliceEvidence } from '@automata/contracts'
import { renderSliceReport } from '../src'

const evidence: SliceEvidence = {
  gameId: 'first-light', specVersion: 1, specHash: 'spec-hash', compositionHash: 'comp-hash',
  seed: 7, packIds: ['interaction-inventory'], contentHash: 'content-hash',
  gates: [
    { kind: 'build', status: 'passed', stepId: 'step-0003' },
    { kind: 'test', status: 'passed', stepId: 'step-0004' },
    { kind: 'browser', status: 'failed', stepId: 'step-0005' },
    { kind: 'evaluate', status: 'missing' }
  ],
  acceptance: [
    { id: 'a-sim', description: 'Critical path completes.', kind: 'simulation', target: 'evaluate:critical-path' },
    { id: 'a-manual', description: 'A human approves the slice.', kind: 'manual', target: 'checkpoint:slice' }
  ],
  evalMetrics: { objectivesComplete: true, elapsedS: 4.2 },
  howToPlay: { devCommand: 'npm run dev -w first-light', url: 'http://127.0.0.1:5178/', controls: 'WASD/arrows: move' }
}

describe('renderSliceReport', () => {
  it('renders a deterministic markdown report carrying hashes, gates, acceptance, and how-to-play', () => {
    const markdown = renderSliceReport(evidence)
    expect(renderSliceReport(evidence)).toBe(markdown)
    expect(markdown).toContain('# Vertical-slice report — first-light')
    expect(markdown).toContain('spec-hash')
    expect(markdown).toContain('comp-hash')
    expect(markdown).toContain('content-hash')
    expect(markdown).toContain('| browser | failed | step-0005 |')
    expect(markdown).toContain('| evaluate | missing | — |')
    expect(markdown).toContain('`evaluate:critical-path` — covered by check:evaluate')
    expect(markdown).toContain('covered by this checkpoint')
    expect(markdown).toContain('npm run dev -w first-light')
    expect(markdown).toContain('objectivesComplete: true')
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run --project game-compose -t 'renderSliceReport'`
Expected: FAIL.

- [x] **Step 3: Implement**

```ts
// packages/contracts/src/sliceReport.ts
import type { AcceptanceCriterion } from './gameSpec'

/** Evidence assembled from the session ledger for the vertical-slice checkpoint. */
export type SliceGateKind = 'build' | 'test' | 'browser' | 'evaluate'
export type SliceGateStatus = 'passed' | 'failed' | 'missing' | 'stale'

export interface SliceGateResult {
  kind: SliceGateKind
  status: SliceGateStatus
  stepId?: string
}

export interface SliceEvidence {
  gameId: string
  specVersion: number
  specHash: string
  compositionHash: string
  seed: number
  packIds: string[]
  contentHash: string
  gates: SliceGateResult[]
  acceptance: AcceptanceCriterion[]
  evalMetrics: Record<string, number | string | boolean> | null
  howToPlay: { devCommand: string; url: string; controls: string }
}
```

```ts
// packages/game-compose/src/sliceReport.ts
import type { SliceEvidence } from '@automata/contracts'

const COVERAGE: Record<string, string> = {
  structural: 'spec:compile',
  simulation: 'check:evaluate',
  browser: 'check:browser',
  manual: 'this checkpoint'
}

/** Deterministic markdown evidence report for the vertical-slice checkpoint. */
export function renderSliceReport(evidence: SliceEvidence): string {
  const lines: string[] = []
  lines.push(`# Vertical-slice report — ${evidence.gameId}`)
  lines.push('')
  lines.push(`- specVersion: ${evidence.specVersion} (\`${evidence.specHash}\`)`)
  lines.push(`- composition: \`${evidence.compositionHash}\` (seed ${evidence.seed})`)
  lines.push(`- content: \`${evidence.contentHash}\``)
  lines.push(`- packs: ${evidence.packIds.join(', ') || 'none'}`)
  lines.push('')
  lines.push('## Gates')
  lines.push('')
  lines.push('| gate | status | step |')
  lines.push('|---|---|---|')
  for (const gate of evidence.gates) lines.push(`| ${gate.kind} | ${gate.status} | ${gate.stepId ?? '—'} |`)
  lines.push('')
  lines.push('## Acceptance criteria')
  lines.push('')
  for (const criterion of evidence.acceptance) {
    const coverage = COVERAGE[criterion.kind] ?? 'unknown'
    lines.push(`- **${criterion.id}** (${criterion.kind}): ${criterion.description} \`${criterion.target}\` — covered by ${coverage}`)
  }
  lines.push('')
  lines.push('## Evaluation metrics')
  lines.push('')
  if (evidence.evalMetrics === null) lines.push('- none recorded')
  else for (const [key, value] of Object.entries(evidence.evalMetrics)) lines.push(`- ${key}: ${value}`)
  lines.push('')
  lines.push('## How to play')
  lines.push('')
  lines.push(`- \`${evidence.howToPlay.devCommand}\` then open ${evidence.howToPlay.url}`)
  lines.push(`- ${evidence.howToPlay.controls}`)
  lines.push('')
  return lines.join('\n')
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project game-compose --project contracts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/contracts packages/game-compose
git commit -m "feat(game-compose): SliceEvidence contract + deterministic slice report renderer"
```

---

## Milestone E — scaffold templates

### Task 10: Composition-aware generic templates

**Files:**
- Modify: `tools/scaffold/src/templates/srcFiles.ts` (`mainTs`, `gameplayTs`)
- Modify: `tools/scaffold/src/templates/projectFiles.ts` (`evaluationTs`, `projectIndexTs`)
- Modify: `tools/scaffold/src/templates/testFiles.ts` (`gameplayTest`, `editorTest` evaluation cases, `e2eSmokeSpec`)
- Modify: `tools/scaffold/src/templates/configFiles.ts` (`packageJson`: add `'@automata/contracts': '*'` and `'@automata/pack-registry': '*'` deps)
- Modify: `tools/scaffold/src/plan.ts` (emit `public/project/composition.json`)
- Test: existing scaffold tests under `tools/scaffold/tests/` (extend where they assert template content) + `npm run verify:new-game`

**Interfaces:**
- Consumes: `loadComposition`, `composePacks`, `ComposedRuntime` (Task 3); `resolvePacks`, `resolveEvalHooks` (Task 7); `emptyComposition`, `parseCompositionManifest`, `CompositionManifest` (Task 1).
- Produces: generated games whose `main.ts` boots packs from `composition.json`; `GameplayDeps` gains `objectiveGate?: () => boolean`; generated `evaluateProject(snapshot, opts, composition?)` routes the scripted control through eval hooks and gates success; generated e2e asserts boot + console + frame-time. Template changes are generic — no game names in logic. An `emptyComposition` manifest reproduces today's behavior.

- [x] **Step 1: Extend the template tests (failing)**

In `tools/scaffold/tests/` locate the test that snapshots/asserts template output (`plan.test.ts` or similar — it asserts `planNewGame` file contents). Add cases:

```ts
// tools/scaffold/tests/plan.test.ts — add to the existing suite
it('emits an empty composition manifest and composition-aware sources', () => {
  const plan = planNewGame('probe')
  const byPath = new Map(plan.files.map((file) => [file.path, file.content]))
  const composition = JSON.parse(byPath.get('games/probe/public/project/composition.json')!) as Record<string, unknown>
  expect(composition).toEqual({ formatVersion: 1, gameId: 'probe', source: null, packs: [], assets: [] })

  const main = byPath.get('games/probe/src/main.ts')!
  expect(main).toContain('loadComposition(createProjectReader())')
  expect(main).toContain("from '@automata/pack-registry'")
  expect(main).toContain('objectiveGate: () => runtime.objectivesComplete()')

  const gameplay = byPath.get('games/probe/src/game/gameplay.ts')!
  expect(gameplay).toContain('objectiveGate')

  const evaluation = byPath.get('games/probe/src/project/evaluation.ts')!
  expect(evaluation).toContain('resolveEvalHooks')
  expect(evaluation).toContain('emptyComposition')

  // Pins the publicDir-relative read path (see Step 5) — a bare 'composition.json' is a silent false green.
  const projectIndex = byPath.get('games/probe/src/project/index.ts')!
  expect(projectIndex).toContain("deps.readText('project/composition.json')")

  const pkg = JSON.parse(byPath.get('games/probe/package.json')!) as { dependencies: Record<string, string> }
  expect(pkg.dependencies['@automata/pack-registry']).toBe('*')
  expect(pkg.dependencies['@automata/contracts']).toBe('*')

  const e2e = byPath.get('games/probe/e2e/smoke.spec.ts')!
  expect(e2e).toContain("page.on('console'")
  expect(e2e).toContain('requestAnimationFrame')
})
```

Run: `npx vitest run --project scaffold`
Expected: the new case FAILS.

- [x] **Step 2: Update `mainTs()`** — full replacement of the function's template string:

```ts
export function mainTs(): string {
  return `import { createThreeRenderer } from '@automata/engine'
import { attachCanvasRenderer } from '@automata/engine/browser'
import { composePacks, createGameHost, createProjectReader, loadComposition, startGameLoop } from '@automata/game-kit'
import { resolvePacks } from '@automata/pack-registry'
import { createGameplay } from './game/gameplay'
import { loadProject } from './project/load'
import type { SimControl, SimState } from './sim/sim'

const STATUS_TEXT: Record<SimState['status'], string> = {
  running: 'Reach the beacon',
  succeeded: 'Beacon reached!',
  failed: 'Too late — the light went out'
}

function keyboardControl(target: Window): () => SimControl {
  const pressed = new Set<string>()
  target.addEventListener('keydown', (event) => pressed.add(event.key.toLowerCase()))
  target.addEventListener('keyup', (event) => pressed.delete(event.key.toLowerCase()))
  const axis = (negative: string[], positive: string[]): number => {
    const held = (keys: string[]): boolean => keys.some((key) => pressed.has(key))
    return (held(positive) ? 1 : 0) - (held(negative) ? 1 : 0)
  }
  return () => ({
    x: axis(['a', 'arrowleft'], ['d', 'arrowright']),
    z: axis(['w', 'arrowup'], ['s', 'arrowdown'])
  })
}

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')
  const host = createGameHost(app)
  try {
    const reader = createProjectReader()
    const compiled = await loadProject(reader)
    // Data-driven pack composition: the manifest chooses packs; no game code changes per pack.
    const composition = await loadComposition(reader)
    const packs = resolvePacks(composition.packs.map((entry) => entry.id))
    const configs = Object.fromEntries(composition.packs.map((entry) => [entry.id, entry.config]))

    const hud = document.createElement('div')
    hud.className = 'hud'
    app.append(hud)
    host.cleanup.defer(() => hud.remove())

    const renderer = createThreeRenderer()
    host.cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, host.canvas)
    host.cleanup.defer(() => canvasRenderer.dispose())
    const runtime = composePacks(packs, configs).boot({ host, render: renderer.port })
    const control = keyboardControl(window)
    const game = createGameplay({
      compiled,
      render: renderer.port,
      control: () => control(),
      objectiveGate: () => runtime.objectivesComplete()
    })

    hud.textContent = STATUS_TEXT.running
    startGameLoop({
      fixedUpdate: (dt) => {
        game.fixedUpdate(dt)
        runtime.fixedUpdate(dt, { playerPosition: { x: game.state.position.x, z: game.state.position.z } })
        hud.textContent = STATUS_TEXT[game.state.status]
      },
      render: (alpha, frameDt) => {
        game.render(alpha, frameDt)
        runtime.render(alpha)
      },
      renderFrame: () => canvasRenderer.renderFrame()
    }, host.cleanup)
  } catch (error) {
    host.dispose()
    host.renderBootError(error)
  }
}

void main()
`
}
```

- [x] **Step 3: Update `gameplayTs()`** — add the objective gate. Changes only (apply inside the template string):

In `GameplayDeps` add:

```ts
  /** Optional win gate (from composed packs); goal completion holds until it opens. */
  objectiveGate?: () => boolean
```

Replace the `fixedUpdate` body:

```ts
    fixedUpdate(dt) {
      let next = step(state, deps.control(state), dt, tuning)
      if (next.status === 'succeeded' && deps.objectiveGate && !deps.objectiveGate()) {
        next = { ...next, status: 'running' }
      }
      state = next
    },
```

- [x] **Step 4: Update `evaluationTs()`** — full replacement of the template string:

```ts
export function evaluationTs(): string {
  return `import { emptyComposition, type CompositionManifest } from '@automata/contracts'
import { resolveEvalHooks } from '@automata/pack-registry'
import type { ProjectSnapshot } from '@automata/project'
import { createInitialState, seekGoal, step, type SimControl, type SimState } from '../sim/sim'
import { compileProject } from './compiler'

export interface EvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}

const seekPoint = (state: SimState, target: { x: number; z: number }): SimControl => {
  const dx = target.x - state.position.x
  const dz = target.z - state.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1e-9) return { x: 0, z: 0 }
  return { x: dx / distance, z: dz / distance }
}

/**
 * Runtime-safe normalized evaluation used by editor, agent, and MCP hosts.
 * Composition-aware: pack eval hooks route the scripted control through their
 * objectives first (the critical path), and success is gated on completing
 * them — mirroring the browser runtime's objective gate.
 */
export async function evaluateProject(
  snapshot: ProjectSnapshot,
  opts: { maxSteps: number },
  composition: CompositionManifest = emptyComposition(snapshot.manifest.gameId)
): Promise<EvaluationResult> {
  const compiled = compileProject(snapshot)
  const dt = 1 / 60
  const maxSteps = Math.max(0, Math.floor(opts.maxSteps))
  const hooks = resolveEvalHooks(composition)
  const hookStates = hooks.map((hook) => hook.createState())
  const hooksComplete = (): boolean => hooks.every((hook, index) => hook.complete(hookStates[index]))

  let state = createInitialState(compiled.spawn)
  let steps = 0
  while (steps < maxSteps && state.status === 'running') {
    let target: { x: number; z: number } | null = null
    for (let index = 0; index < hooks.length && target === null; index += 1) {
      target = hooks[index]!.nextTarget(hookStates[index], state.position)
    }
    const control = target ? seekPoint(state, target) : seekGoal(state, compiled.tuning)
    let next = step(state, control, dt, compiled.tuning)
    if (next.status === 'succeeded' && !hooksComplete()) next = { ...next, status: 'running' }
    state = next
    for (let index = 0; index < hooks.length; index += 1) {
      hookStates[index] = hooks[index]!.step(hookStates[index], state.position)
    }
    steps += 1
  }

  const objectivesComplete = hooksComplete()
  const outcome = state.status === 'succeeded' ? 'passed' : state.status === 'failed' ? 'failed' : 'incomplete'
  const score = outcome === 'passed' ? Math.max(0, 1 - state.elapsedS / compiled.tuning.timeLimitS) : 0
  const distanceToGoal = Math.hypot(
    compiled.tuning.goal.x - state.position.x,
    compiled.tuning.goal.z - state.position.z
  )
  return {
    outcome,
    score,
    metrics: { status: state.status, elapsedS: state.elapsedS, distanceToGoal, objectivesComplete },
    steps
  }
}
`
}
```

Recorded deviation from spec §9: metrics gain `objectivesComplete` only, not `itemsCollected` — pack eval-hook state is opaque (`unknown`) by design, so a generic template cannot count items; per-pack metrics arrive when Phase 4 gives hooks a metrics surface.

- [x] **Step 5: Update `projectIndexTs()`** — composition-aware headless registration (full replacement):

```ts
export function projectIndexTs(): string {
  return `import { emptyComposition, parseCompositionManifest } from '@automata/contracts'
import type { EditorRegistrationLoader } from '@automata/editor/headless'
import { projectDefinition } from './definition'
import { evaluateProject } from './evaluation'

export { GAME_TYPE_IDS, type CompiledProject } from './types'
export { projectDefinition } from './definition'
export { compileProject } from './compiler'
export { createTemplate } from './template'
export { loadProject } from './load'
export { evaluateProject, type EvaluationResult } from './evaluation'

/**
 * Registry convention entry for Node hosts (MCP server, headless evaluation).
 * Reads the composition manifest when present so evaluation is
 * composition-aware; a missing file means a plain scaffold (empty composition).
 * An invalid file is a real error and propagates. NOTE the path prefix:
 * RegistrationDeps.readText is bound to games/<id>/public (see
 * loadProjectRegistration in tools/editor-mcp-server/src/projectCatalog.ts),
 * so the manifest at public/project/composition.json is read as
 * 'project/composition.json' — a bare 'composition.json' would silently miss
 * it and evaluation would degrade to the empty composition.
 */
export const loadHeadlessRegistration: EditorRegistrationLoader = async (deps) => {
  let text: string | null = null
  try {
    text = await deps.readText('project/composition.json')
  } catch {
    text = null
  }
  const composition = text === null
    ? emptyComposition(projectDefinition.gameId)
    : parseCompositionManifest(text)
  return {
    project: projectDefinition,
    prefabs: [],
    evaluation: { evaluate: (snapshot, opts) => evaluateProject(snapshot, opts, composition) }
  }
}
`
}
```

Note: check `GameProjectDefinition`'s public shape for the `gameId` accessor — `defineGameProject` receives `gameId`; if the definition object does not expose it, use `createTemplate().manifest.gameId` instead. Verify while implementing; the generated definition test must still pass.

- [x] **Step 6: Update `plan.ts` and `configFiles.ts`**

In `tools/scaffold/src/plan.ts`, add one entry to `files` (after the `e2e/smoke.spec.ts` entry, before the spread):

```ts
    at('public/project/composition.json', `${JSON.stringify({ formatVersion: 1, gameId: name, source: null, packs: [], assets: [] }, null, 2)}\n`),
```

In `tools/scaffold/src/templates/configFiles.ts` `packageJson`, extend dependencies:

```ts
    dependencies: {
      '@automata/contracts': '*',
      '@automata/editor': '*',
      '@automata/engine': '*',
      '@automata/game-kit': '*',
      '@automata/pack-registry': '*',
      '@automata/project': '*'
    },
```

- [x] **Step 7: Update `testFiles.ts`** — three changes.

`gameplayTest()` — add a gate case inside the describe block:

```ts
  it('holds success while the objective gate is closed and releases when it opens', () => {
    const render = createNullRenderer()
    let gateOpen = false
    const game = createGameplay({
      compiled,
      render: render.port,
      control: (state) => seekGoal(state, compiled.tuning),
      objectiveGate: () => gateOpen
    })
    for (let index = 0; index < 600 && game.state.status === 'running'; index += 1) game.fixedUpdate(1 / 60)
    expect(game.state.status).toBe('running') // reached the goal but gated
    gateOpen = true
    for (let index = 0; index < 600 && game.state.status === 'running'; index += 1) game.fixedUpdate(1 / 60)
    expect(game.state.status).toBe('succeeded')
    game.dispose()
  })
```

`editorTest()` — the existing `unusedDeps` fixture (whose `readText` rejects) is now genuinely exercised by the new loader and lands on the empty-composition fallback, so the existing registration case still passes; rename it to `noCompositionDeps` and update its comment while here. Inside the `headless evaluation` describe, add a hook-routing case (uses the real registry with a composed manifest):

```ts
  it('routes the scripted control through composed pack objectives first', async () => {
    const composition = {
      formatVersion: 1 as const,
      gameId: createTemplate().manifest.gameId,
      source: null,
      packs: [{
        id: 'interaction-inventory',
        version: '1.0.0',
        config: { interactRadius: 1.5, items: [{ id: 'item-1', position: { x: 0, z: 0 } }], iconPath: null }
      }],
      assets: []
    }
    const result = await evaluateProject(createTemplate(), { maxSteps: 2000 }, composition)
    expect(result.outcome).toBe('passed')
    expect(result.metrics.objectivesComplete).toBe(true)
  })
```

`e2eSmokeSpec()` — full replacement:

```ts
export function e2eSmokeSpec(name: string, port: number): string {
  return `import { expect, test } from '@playwright/test'

test('${name} boots to a playable canvas without errors and within frame budget', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('http://127.0.0.1:${port}/')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud')).toContainText(/reach the beacon/i)

  // Frame-time budget: sample 140 rAF deltas, discard 20 warmup frames, assert p95 < 50ms.
  const p95 = await page.evaluate(async () => {
    const samples: number[] = []
    let last = performance.now()
    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        samples.push(now - last)
        last = now
        if (samples.length >= 140) resolve()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const settled = samples.slice(20).sort((a, b) => a - b)
    return settled[Math.floor(settled.length * 0.95)] ?? 0
  })
  expect(p95).toBeLessThan(50)
  expect(errors).toEqual([])
})
`
}
```

- [x] **Step 8: Verify**

Execution note: `verify:new-game` validates a fresh `git clone` of `HEAD`, so the Task 10 checkpoint commit must exist before that command can observe the template changes. Run the scaffold suite, create the Step 9 commit, then run `verify:new-game`; fix any clean-clone regression in a follow-up commit before marking Steps 8–9 complete.

Recorded fallback from spec §9: two clean-clone SwiftShader runs reproduced generic-smoke p95 values of 50.8 ms and 83.4 ms against the 50 ms budget. The generic smoke still samples rAF and verifies a finite positive p95; the strict `p95 < 50 ms` assertion moves to `games/first-light/e2e/slice.spec.ts`, as the design's documented fallback allows.

Run: `npx vitest run --project scaffold` — the Step 1 cases pass.
Run: `npm run verify:new-game` — the freshly scaffolded game builds, tests, and boots with the composition-aware templates (empty composition ⇒ behavior identical to today).
Expected: PASS on both. If `verify:new-game` fails on the new imports, the usual cause is a missing workspace link — re-run `npm install`.

- [x] **Step 9: Commit**

```bash
git add tools/scaffold
git commit -m "feat(scaffold): composition-aware templates — manifest boot, objective gate, hook-driven eval, enriched e2e"
```

---

## Milestone F — MCP tools + integration

### Task 11: Compose tool contracts + `composeTools.ts` runner + dispatch

**Files:**
- Create: `packages/contracts/src/composeTools.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from './composeTools'`)
- Create: `tools/editor-mcp-server/src/composeTools.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts` (wire runner + dispatch + `listTools`)
- Modify: `tools/editor-mcp-server/package.json` (add `"@automata/game-compose": "*"` dependency)
- Test: `tools/editor-mcp-server/tests/composeTools.test.ts`

**Interfaces:**
- Consumes: `composeGame`, `renderSliceReport` (Tasks 8–9); `SliceEvidence` (Task 9); `designCheckpointStatus`, `readGameSpec` (existing `specTools.ts` / `specStore.ts`); `SessionEngine` (`@automata/build-session`); `hashJson`.
- Produces (contracts): `ComposeToolName = 'composeGame' | 'renderSliceReport' | 'recordSliceDecision'`, `composeToolDefs(): ToolDef[]`, `parseComposeToolArgs(name, args)`. Arg schemas: `composeGame { gameId }`, `renderSliceReport { gameId }`, `recordSliceDecision { gameId, decision: 'approve' | 'reject', reason: string 1..400 }`.
- Produces (server): `createComposeToolRunner(deps: { repoRoot: string; ensureEngine(gameId): Promise<SessionEngine>; snapshotContent(gameId): Promise<{ hash: string }>; devPortFor(gameId): Promise<number | null> })` with `execute(name, args)`; `sliceCheckpointStatus(engine, { specHash, compositionHash }): 'pending' | 'approved' | 'rejected'`.

- [x] **Step 1: Write the contracts (small enough to TDD together with the runner test below)**

```ts
// packages/contracts/src/composeTools.ts
import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/** Phase 3 tool contracts: compose the game from its approved spec, then run the slice checkpoint. */
export type ComposeToolName = 'composeGame' | 'renderSliceReport' | 'recordSliceDecision'

export const composeToolArgSchemas = {
  composeGame: z.object({ gameId: gameSlugSchema }),
  renderSliceReport: z.object({ gameId: gameSlugSchema }),
  recordSliceDecision: z.object({
    gameId: gameSlugSchema,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().min(1).max(400)
  })
} as const satisfies Record<ComposeToolName, z.ZodType>

const COMPOSE_TOOL_DESCRIPTIONS: Record<ComposeToolName, string> = {
  composeGame:
    'Compose the playable artifact from the approved GameSpec: a hash-guarded seeded step generates the ' +
    'composition manifest (packs + configs), seeded base content, and placeholder assets, written through ' +
    'to games/<gameId>/. Requires an approved design checkpoint. Identical spec hash returns cached: true.',
  renderSliceReport:
    'Assemble the vertical-slice evidence (spec/composition/content hashes, build/test/browser/evaluate ' +
    'gate statuses, acceptance coverage, eval metrics, how-to-play) into a markdown report persisted as a ' +
    'session artifact. Required before recordSliceDecision.',
  recordSliceDecision:
    'Record the human vertical-slice checkpoint decision (approve/reject + reason) in the durable session ' +
    'ledger. Approve requires all four gates passed and freezes the reviewed spec/composition/content ' +
    'hashes; any recompile or recompose re-opens the checkpoint.'
}

const COMPOSE_TOOL_NAMES = Object.keys(composeToolArgSchemas) as ComposeToolName[]

export function composeToolDefs(): ToolDef[] {
  return COMPOSE_TOOL_NAMES.map((name) => ({
    name,
    description: COMPOSE_TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(composeToolArgSchemas[name])
  }))
}

export function parseComposeToolArgs(name: string, args: unknown): unknown {
  const schema: z.ZodType | undefined = (composeToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown compose tool "${name}"`)
  return schema.parse(args)
}
```

- [x] **Step 2: Write the failing runner test**

```ts
// tools/editor-mcp-server/tests/composeTools.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { minimalGameSpecDraft } from '@automata/contracts'
import { createSessionHost } from '../src/sessionHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function sliceDraft(gameId: string): Record<string, unknown> {
  const draft = minimalGameSpecDraft(gameId)
  draft.capabilities = [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }]
  draft.assets = [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' }]
  return draft
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'compose-'))
  roots.push(root)
  await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await writeFile(join(root, 'games/probe/package.json'),
    JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' }, automata: { devPort: 5199 } }))
  const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
  const compile = await host.executeTool('compileGameSpec', { gameId: 'probe', draft: sliceDraft('probe'), prompt: 'slice', translations: [] })
  expect(compile.ok).toBe(true)
  return { root, host }
}

describe('composeGame tool', () => {
  it('refuses to compose before design approval, with a compose finding', async () => {
    const { host } = await setup()
    const result = await host.executeTool('composeGame', { gameId: 'probe' })
    expect(result).toMatchObject({ ok: false, content: { code: 'compose-requires-approval' } })
    await host.dispose()
  })

  it('composes after approval: writes files, records a seeded step, caches identical re-runs', async () => {
    const { root, host } = await setup()
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })

    const first = await host.executeTool('composeGame', { gameId: 'probe' })
    expect(first).toMatchObject({ ok: true, content: { cached: false, packIds: ['interaction-inventory'], itemCount: 2 } })
    const manifestText = await readFile(join(root, 'games/probe/public/project/composition.json'), 'utf8')
    expect(JSON.parse(manifestText)).toMatchObject({ gameId: 'probe', source: { seed: 7 } })
    await readFile(join(root, 'games/probe/public/assets/item-icon.svg'), 'utf8')
    await readFile(join(root, 'games/probe/public/assets/assets.json'), 'utf8')
    const tuning = JSON.parse(await readFile(join(root, 'games/probe/public/project/resources/tuning.resource.json'), 'utf8'))
    expect(tuning.typeId).toBe('probe.tuning')

    const second = await host.executeTool('composeGame', { gameId: 'probe' })
    expect(second).toMatchObject({ ok: true, content: { cached: true } })
    await host.dispose()
  })

  it('rejects unsupported capabilities with a typed finding and writes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'compose-bad-'))
    roots.push(root)
    await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
    await writeFile(join(root, 'games/probe/package.json'),
      JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } }))
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
    const draft = sliceDraft('probe')
    ;(draft.capabilities as Array<Record<string, unknown>>).push({ id: 'save-load', config: {}, requirements: [] })
    await host.executeTool('compileGameSpec', { gameId: 'probe', draft, prompt: 'slice', translations: [] })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    const result = await host.executeTool('composeGame', { gameId: 'probe' })
    expect(result).toMatchObject({ ok: false, content: { code: 'compose-unsupported-capability' } })
    await expect(readFile(join(root, 'games/probe/public/project/composition.json'), 'utf8')).rejects.toThrow()
    await host.dispose()
  })
})

describe('slice checkpoint tools', () => {
  it('renders a report (even with missing gates) and gates approval on green gates', async () => {
    const { host } = await setup()
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    await host.executeTool('composeGame', { gameId: 'probe' })

    const report = await host.executeTool('renderSliceReport', { gameId: 'probe' })
    expect(report).toMatchObject({ ok: true, content: { artifact: 'artifacts/slice-report.md' } })
    expect((report.content as { markdown: string }).markdown).toContain('| build | missing | — |')

    const approve = await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'approve', reason: 'ship it' })
    expect(approve).toMatchObject({ ok: false, content: { code: 'slice-gates-not-passed' } })

    const reject = await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'gates are red' })
    expect(reject).toMatchObject({ ok: true, content: { recorded: true, decision: 'reject' } })
    await host.dispose()
  })

  it('requires a fresh report before deciding', async () => {
    const { host } = await setup()
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    await host.executeTool('composeGame', { gameId: 'probe' })
    const decide = await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'no report yet' })
    expect(decide).toMatchObject({ ok: false })
    expect(String((decide as { content: unknown }).content)).toMatch(/renderSliceReport/)
    await host.dispose()
  })
})
```

Run: `npx vitest run --project editor-mcp-server -t 'composeGame tool'`
Expected: FAIL — tools unknown.

- [x] **Step 3: Implement the runner**

```ts
// tools/editor-mcp-server/src/composeTools.ts
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { hashJson, type SessionEngine } from '@automata/build-session'
import {
  parseComposeToolArgs,
  type CompositionManifest, type GameSpec, type SliceEvidence, type SliceGateResult, type ToolResult
} from '@automata/contracts'
import { composeGame, renderSliceReport, type ComposeResult } from '@automata/game-compose'
import { designCheckpointStatus } from './specTools'
import { readGameSpec } from './specStore'

export interface ComposeToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
  snapshotContent(gameId: string): Promise<{ hash: string }>
  /** automata.devPort from the game's package.json, for the how-to-play block. */
  devPortFor(gameId: string): Promise<number | null>
}

const ok = (content: unknown): ToolResult => ({ ok: true, content })
const fail = (content: unknown): ToolResult => ({ ok: false, isError: true, content })

const GATE_KINDS = [
  { kind: 'build' as const, step: 'check:build' },
  { kind: 'test' as const, step: 'check:test' },
  { kind: 'browser' as const, step: 'check:browser' },
  { kind: 'evaluate' as const, step: 'check:evaluate' }
]

/** Latest slice decision recorded for this exact (spec, composition) pair. */
export function sliceCheckpointStatus(engine: SessionEngine, hashes: { specHash: string; compositionHash: string }): 'pending' | 'approved' | 'rejected' {
  for (let index = engine.session.steps.length - 1; index >= 0; index -= 1) {
    const step = engine.session.steps[index]!
    if (step.kind !== 'checkpoint:slice') continue
    const result = step.result as { decision?: string; specHash?: string; compositionHash?: string } | undefined
    if (result?.specHash === hashes.specHash && result?.compositionHash === hashes.compositionHash) {
      return result.decision === 'approve' ? 'approved' : 'rejected'
    }
  }
  return 'pending'
}

/** Atomic write mirroring specStore's pattern: sibling temp file then rename. */
async function writeComposedFile(root: string, relPath: string, text: string): Promise<void> {
  const path = join(root, relPath)
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp-${randomUUID()}`
  await writeFile(temporaryPath, text)
  await rename(temporaryPath, path)
}

export function createComposeToolRunner(deps: ComposeToolDeps) {
  const requireSpec = async (gameId: string): Promise<{ spec: GameSpec; engine: SessionEngine } | ToolResult> => {
    const engine = await deps.ensureEngine(gameId)
    const spec = await readGameSpec(deps.repoRoot, gameId)
    return spec ? { spec, engine } : fail(`no gamespec.json for "${gameId}" — call compileGameSpec first`)
  }

  const latestComposition = (engine: SessionEngine): { manifest: CompositionManifest; stepId: string } | null => {
    for (let index = engine.session.steps.length - 1; index >= 0; index -= 1) {
      const step = engine.session.steps[index]!
      if (step.kind !== 'compose:game' || step.status !== 'completed') continue
      const result = step.result as { composition?: CompositionManifest } | undefined
      if (result?.composition) return { manifest: result.composition, stepId: step.id }
    }
    return null
  }

  const compose = async (raw: unknown): Promise<ToolResult> => {
    const args = parseComposeToolArgs('composeGame', raw) as { gameId: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    const { spec, engine } = found
    const specHash = hashJson(spec)

    if (designCheckpointStatus(engine, specHash) !== 'approved') {
      await engine.addFinding({ source: 'compose', severity: 'error', code: 'compose-requires-approval', message: 'composeGame requires an approved design checkpoint for the current spec.', inputHash: specHash })
      return fail({ code: 'compose-requires-approval' })
    }

    const guarded = await engine.runSeededStep('compose:game', { specHash }, async (_rng, seed) => {
      const result = composeGame({ spec, seed, specHash })
      if (!result.ok) throw new ComposeFailure(result)
      return { composition: result.composition, assetManifest: result.assetManifest, files: result.files, summary: result.summary }
    }).catch(async (error: unknown) => {
      if (error instanceof ComposeFailure) {
        const issue = error.result.ok ? undefined : error.result.issues[0]
        await engine.addFinding({ source: 'compose', severity: 'error', code: issue?.code ?? 'compose-failed', message: issue?.message ?? 'compose failed', inputHash: specHash })
        return null
      }
      throw error
    })
    if (guarded === null) {
      const finding = engine.session.findings.at(-1)
      return fail({ code: finding?.code ?? 'compose-failed', message: finding?.message })
    }

    const output = guarded.output as { composition: CompositionManifest; files: Array<{ path: string; text: string }>; summary: { packIds: string[]; itemCount: number; assetIds: string[] } }
    for (const file of output.files) await writeComposedFile(join(deps.repoRoot, 'games', args.gameId), file.path, file.text)

    // Our own writes changed the content: stale prior checks (mirrors detectOutOfBand), then record the new hash.
    const { hash } = await deps.snapshotContent(args.gameId)
    if (engine.session.lastKnownContentHash !== null && engine.session.lastKnownContentHash !== hash) {
      for (const step of engine.session.steps) {
        if (step.kind.startsWith('check:') && step.status === 'completed') step.status = 'stale'
      }
    }
    await engine.noteContentHash(hash)
    await engine.autoResolve('compose')

    const compositionHash = hashJson(output.composition)
    return ok({
      ...output.summary,
      compositionHash,
      files: output.files.map((file) => file.path),
      cached: guarded.cached,
      stepId: guarded.step.id,
      sliceCheckpoint: sliceCheckpointStatus(engine, { specHash, compositionHash })
    })
  }

  const assembleEvidence = async (gameId: string, spec: GameSpec, engine: SessionEngine): Promise<SliceEvidence | ToolResult> => {
    const composed = latestComposition(engine)
    if (!composed) return fail(`no compose:game step for "${gameId}" — call composeGame first`)
    const gates: SliceGateResult[] = GATE_KINDS.map(({ kind, step }) => {
      for (let index = engine.session.steps.length - 1; index >= 0; index -= 1) {
        const record = engine.session.steps[index]!
        if (record.kind !== step) continue
        if (record.status === 'stale') return { kind, status: 'stale', stepId: record.id }
        if (record.status === 'failed') return { kind, status: 'failed', stepId: record.id }
        if (record.status === 'completed') {
          if (kind === 'evaluate') {
            const outcome = (record.result as { output?: { outcome?: string }; outcome?: string } | undefined)
            const value = outcome?.outcome ?? outcome?.output?.outcome
            return { kind, status: value === 'passed' ? 'passed' : 'failed', stepId: record.id }
          }
          const passed = (record.result as { passed?: boolean } | undefined)?.passed
          return { kind, status: passed === false ? 'failed' : 'passed', stepId: record.id }
        }
      }
      return { kind, status: 'missing' }
    })
    const evalStep = [...engine.session.steps].reverse().find((step) => step.kind === 'check:evaluate' && step.status === 'completed')
    // runGuarded stores the run's `output` object directly as step.result (engine.ts recordStep) — no extra nesting.
    const evalOutput = evalStep?.result as { metrics?: Record<string, number | string | boolean> } | undefined
    const { hash: contentHash } = await deps.snapshotContent(gameId)
    const devPort = await deps.devPortFor(gameId)
    return {
      gameId,
      specVersion: spec.specVersion,
      specHash: hashJson(spec),
      compositionHash: hashJson(composed.manifest),
      seed: composed.manifest.source?.seed ?? 0,
      packIds: composed.manifest.packs.map((entry) => entry.id),
      contentHash,
      gates,
      acceptance: spec.acceptance,
      evalMetrics: evalOutput?.metrics ?? null,
      howToPlay: {
        devCommand: `npm run dev -w ${gameId}`,
        url: devPort === null ? 'http://127.0.0.1:<devPort>/' : `http://127.0.0.1:${devPort}/`,
        controls: 'WASD/arrows: move · collect every item, then reach the beacon'
      }
    }
  }

  const report = async (raw: unknown): Promise<ToolResult> => {
    const args = parseComposeToolArgs('renderSliceReport', raw) as { gameId: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    const evidence = await assembleEvidence(args.gameId, found.spec, found.engine)
    if ('ok' in evidence) return evidence
    const evidenceHash = hashJson(evidence)
    const guarded = await found.engine.runSeededStep('slice:report', { evidenceHash }, async () => renderSliceReport(evidence))
    const artifact = 'artifacts/slice-report.md'
    await writeFile(join(found.engine.dir, artifact), guarded.output as string)
    return ok({ markdown: guarded.output, cached: guarded.cached, artifact, evidenceHash, gates: evidence.gates })
  }

  const decide = async (raw: unknown): Promise<ToolResult> => {
    const args = parseComposeToolArgs('recordSliceDecision', raw) as { gameId: string; decision: 'approve' | 'reject'; reason: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    const evidence = await assembleEvidence(args.gameId, found.spec, found.engine)
    if ('ok' in evidence) return evidence
    const evidenceHash = hashJson(evidence)
    if (!found.engine.findCompleted('slice:report', hashJson({ evidenceHash }))) {
      return fail('the slice report for the current evidence has not been rendered — call renderSliceReport, present it, then decide')
    }
    if (args.decision === 'approve' && !evidence.gates.every((gate) => gate.status === 'passed')) {
      return fail({ code: 'slice-gates-not-passed', gates: evidence.gates })
    }
    const step = await found.engine.journalStep('checkpoint:slice', {
      inputHash: hashJson({ evidenceHash, decision: args.decision, reason: args.reason }),
      result: {
        decision: args.decision, reason: args.reason,
        specVersion: evidence.specVersion, specHash: evidence.specHash,
        compositionHash: evidence.compositionHash, contentHash: evidence.contentHash
      }
    })
    return ok({ recorded: true, decision: args.decision, specVersion: evidence.specVersion, stepId: step.id })
  }

  return {
    async execute(name: string, args: unknown): Promise<ToolResult> {
      if (name === 'composeGame') return compose(args)
      if (name === 'renderSliceReport') return report(args)
      if (name === 'recordSliceDecision') return decide(args)
      return fail(`Unknown compose tool "${name}"`)
    }
  }
}

class ComposeFailure extends Error {
  constructor(readonly result: ComposeResult) { super('compose failed') }
}
```

Implementation notes (verify while coding, adjust the plan's assumptions if the ledger disagrees):
- `runCheck`'s step kinds and result shape: confirm in `packages/build-session/src/checks.ts` that spawned checks record `check:build|check:test|check:browser` steps and how pass/fail is represented (the `status: 'failed'` step vs a `passed` flag in the result). Align the gate classification in `assembleEvidence` with the real shape — the integration test in Task 12 pins the truth.
- A failed seeded run: `runSeededStep` has no failure path (it records only completed steps), hence the `ComposeFailure` throw *before* any step is recorded — a failed compose records a finding and **no step**, so a later successful compose is not shadowed by a cached failure.
- `devPortFor`: read `games/<gameId>/package.json` `automata.devPort` (nullable when absent).

Wire into `tools/editor-mcp-server/src/sessionHost.ts`:

```ts
// imports
import { composeToolDefs } from '@automata/contracts'
import { createComposeToolRunner } from './composeTools'

// after `const specTools = createSpecToolRunner(...)`:
const composeTools = createComposeToolRunner({
  repoRoot, ensureEngine,
  snapshotContent: async (gameId) => contentSnapshot(gameId, projectDirFor(gameId)),
  devPortFor: async (gameId) => {
    try {
      const pkg = JSON.parse(await readFile(join(repoRoot, 'games', gameId, 'package.json'), 'utf8')) as { automata?: { devPort?: number } }
      return pkg.automata?.devPort ?? null
    } catch { return null }
  }
})

// in listTools:
listTools: () => [...workspaceToolDefs(), ...sessionToolDefs(), ...specToolDefs(), ...composeToolDefs(), ...(open ? open.headless.host.listTools() : [])],

// in executeTool, after the spec-tool dispatch line:
if (name === 'composeGame' || name === 'renderSliceReport' || name === 'recordSliceDecision') return composeTools.execute(name, args)
```

(`readFile` joins the existing `node:fs/promises` import.) Add `"@automata/game-compose": "*"` to `tools/editor-mcp-server/package.json` and `npm install`.

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS — new compose tests plus all existing suites (spec tools, sessions, checks) untouched.

- [x] **Step 5: Commit**

```bash
git add packages/contracts tools/editor-mcp-server package-lock.json
git commit -m "feat(editor-mcp-server): composeGame + slice-checkpoint tools over the session ledger"
```

### Task 12: End-to-end integration + seeded replay (exit acceptance)

**Files:**
- Test: `tools/editor-mcp-server/tests/composeFlow.test.ts`

**Interfaces:**
- Consumes: everything above; `createSessionEngine`, `hashJson`, `CommandSpawner`, `SpawnResult` (`@automata/build-session`); `composeGame` (`@automata/game-compose`); the fake spawner **and** fake `headless()` host from `tools/editor-mcp-server/tests/sessionChecks.test.ts` (reuse both shapes verbatim — the spawner is an object with a `run` method, and the injected `openHeadless` is what lets `check:evaluate` run without real game sources).

- [x] **Step 1: Write the test**

```ts
// tools/editor-mcp-server/tests/composeFlow.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine, hashJson, type CommandSpawner, type SpawnResult } from '@automata/build-session'
import { gameSpecSchema, minimalGameSpecDraft, type ToolResult } from '@automata/contracts'
import { composeGame } from '@automata/game-compose'
import type { HeadlessHost } from '../src/headlessHost'
import { createSessionHost } from '../src/sessionHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function sliceDraft(gameId: string): Record<string, unknown> {
  const draft = minimalGameSpecDraft(gameId)
  draft.capabilities = [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }]
  draft.assets = [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon' }]
  return draft
}

/** Fakes copied from sessionChecks.test.ts: every spawned check passes; headless evaluate passes. */
const OK: SpawnResult = { code: 0, stdout: 'ok', stderr: '', timedOut: false }
const passingSpawner: CommandSpawner = { async run() { return OK } }
function headless(): HeadlessHost {
  const snapshot = { manifest: { id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2, scenes: [], resources: [] }, scenes: {}, resources: {} }
  const host = {
    get snapshot() { return snapshot }, get commands() { return [] }, listTools: () => [],
    async executeTool(name: string): Promise<ToolResult> {
      return name === 'evaluate'
        ? { ok: true, content: { outcome: 'passed', metrics: { objectivesComplete: true } } }
        : { ok: false, isError: true, content: 'nope' }
    },
    async readResource() { return snapshot }
  }
  return { host, registration: {}, snapshot } as unknown as HeadlessHost
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'compose-flow-'))
  roots.push(root)
  await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await mkdir(join(root, 'games/probe/src'), { recursive: true })
  await writeFile(join(root, 'games/probe/package.json'),
    JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' }, automata: { devPort: 5199 } }))
  const host = createSessionHost({
    repoRoot: root, sessionsRoot: join(root, '.automata/sessions'),
    lock: false, seedSource: () => 7, spawner: passingSpawner, openHeadless: async () => headless()
  })
  return { root, host }
}

describe('Phase 3 exit criterion — spec → compose → evaluate → slice checkpoint', () => {
  it('runs the full flow, approves on green gates, and reopens on recompose', async () => {
    const { root, host } = await setup()
    // Design phase (Phase 2 machinery)
    await host.executeTool('compileGameSpec', { gameId: 'probe', draft: sliceDraft('probe'), prompt: 'slice', translations: [] })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })

    // Compose
    const composed = await host.executeTool('composeGame', { gameId: 'probe' })
    expect(composed).toMatchObject({ ok: true, content: { cached: false, itemCount: 2 } })

    // Gates: build/test/browser via the fake spawner (spawned checks record check:* steps).
    for (const tool of ['runBuild', 'runTests', 'runBrowserEval']) {
      expect(await host.executeTool(tool, { gameId: 'probe' })).toMatchObject({ ok: true })
    }

    // Evaluate not yet run → report renders anyway, approve refused, reject records.
    const early = await host.executeTool('renderSliceReport', { gameId: 'probe' })
    expect(early.ok).toBe(true)
    const earlyGates = (early.content as { gates: Array<{ kind: string; status: string }> }).gates
    expect(earlyGates.filter((gate) => gate.status === 'passed').map((gate) => gate.kind).sort()).toEqual(['browser', 'build', 'test'])
    expect(earlyGates.find((gate) => gate.kind === 'evaluate')).toMatchObject({ status: 'missing' })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'approve', reason: 'ship' }))
      .toMatchObject({ ok: false, content: { code: 'slice-gates-not-passed' } })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'evaluate missing' }))
      .toMatchObject({ ok: true })

    // Green the fourth gate through the injected headless host, then approve on all-green.
    expect(await host.executeTool('openProject', { gameId: 'probe' })).toMatchObject({ ok: true })
    expect(await host.executeTool('evaluate', { maxSteps: 4000 })).toMatchObject({ ok: true })
    const report = await host.executeTool('renderSliceReport', { gameId: 'probe' })
    expect(report.ok).toBe(true)
    const gates = (report.content as { gates: Array<{ kind: string; status: string }> }).gates
    expect(gates.every((gate) => gate.status === 'passed')).toBe(true)
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'approve', reason: 'all four gates green' }))
      .toMatchObject({ ok: true, content: { recorded: true, decision: 'approve' } })

    // Recompile with a change reason → spec hash changes → old report no longer covers
    const draft2 = sliceDraft('probe')
    ;(draft2.identity as Record<string, unknown>).logline = 'A changed tiny hub adventure.'
    await host.executeTool('compileGameSpec', { gameId: 'probe', draft: draft2, prompt: 'slice', translations: [], changeReason: 'tweak logline' })
    const stale = await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'stale' })
    expect(stale).toMatchObject({ ok: false }) // fresh report required for the new evidence
    await host.dispose()
    void root
  })

  it('compose:game replays deterministically from the recorded seed', async () => {
    const { root, host } = await setup()
    await host.executeTool('compileGameSpec', { gameId: 'probe', draft: sliceDraft('probe'), prompt: 'slice', translations: [] })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    await host.executeTool('composeGame', { gameId: 'probe' })
    await host.dispose()

    const { engine } = await createSessionEngine({
      sessionsRoot: join(root, '.automata/sessions'), gameId: 'probe',
      projectDir: join(root, 'games/probe/public/project'), engineVersion: 'test', lock: false
    })
    const step = engine.session.steps.find((value) => value.kind === 'compose:game')!
    const spec = gameSpecSchema.parse(JSON.parse(await readFile(join(root, 'games/probe/gamespec.json'), 'utf8')))
    const specHash = hashJson(spec)
    const replay = await engine.replayStep(step.id, async (_rng, seed) => {
      const result = composeGame({ spec, seed, specHash })
      if (!result.ok) throw new Error('replay compose failed')
      return { composition: result.composition, assetManifest: result.assetManifest, files: result.files, summary: result.summary }
    })
    expect(replay.ok).toBe(true)
    await engine.dispose()
  })
})
```

- [x] **Step 2: Run to verify (fix the harness against reality)**

Run: `npx vitest run --project editor-mcp-server -t 'Phase 3 exit criterion'`
Expected: PASS. The fakes are copied verbatim from `tools/editor-mcp-server/tests/sessionChecks.test.ts`; if the gate classification in Task 11's `assembleEvidence` disagrees with `runCheck`'s real step records (spawned checks store `{ passed, exitCode, timedOut, tail }` directly as `step.result`; `check:evaluate` stores the evaluate tool's content directly), fix the source, not the test's intent.

- [x] **Step 3: Commit**

```bash
git add tools/editor-mcp-server/tests/composeFlow.test.ts
git commit -m "test(editor-mcp-server): Phase 3 exit flow — compose, gates, slice checkpoint, seeded replay"
```

---

## Milestone G — the slice game

### Task 13: `first-light` — scaffold, compose, evaluate, checkpoint, check in

**Files:**
- Modify: `packages/contracts/src/gameSpecFixtures.ts` (add `firstLightGameSpecDraft()`)
- Create: `scripts/compose-first-light.ts` (repo-root script driving the MCP host; checked in — deterministic and idempotent, safe to re-run)
- Create (generated + composed, checked in): `games/first-light/**` — scaffold output plus `gamespec.json`, composed `public/project/composition.json`, seeded `public/project/resources/tuning.resource.json`, `public/assets/item-icon.svg`, `public/assets/assets.json`
- Replace: `games/first-light/tests/project/content.test.ts` first case with `games/first-light/tests/project/composition.test.ts`
- Create: `games/first-light/e2e/slice.spec.ts`

**Interfaces:**
- Consumes: every prior task. `firstLightGameSpecDraft(): Record<string, unknown>` becomes the checked-in draft fixture (compiles to `games/first-light/gamespec.json` v1).

- [x] **Step 1: Add the spec fixture** (in `packages/contracts/src/gameSpecFixtures.ts`)

```ts
/** The Phase 3 vertical-slice game: relight the beacon by gathering its light cells. */
export function firstLightGameSpecDraft(): Record<string, unknown> {
  return {
    identity: {
      id: 'first-light', title: 'First Light',
      logline: 'Relight the harbor beacon by gathering its scattered light cells.',
      themes: ['exploration', 'restoration'], contentRating: 'everyone'
    },
    direction: {
      visualStyle: 'stylized low-poly night harbor', audioStyle: 'calm ambient synth',
      dialogueTone: 'quiet and hopeful', camera: 'fixed'
    },
    budgets: {
      targetMinutes: 30, districtCount: 1, interiorCount: 0, characterCount: 1,
      mainQuestCount: 2, sideQuestCount: 0, enemyTypeCount: 0, assetBudget: 1, buildTimeMinutes: 30
    },
    capabilities: [{
      id: 'interaction-inventory',
      config: { requiredItems: 2, interactRadius: 1.5 },
      requirements: ['collect both light cells before the beacon counts']
    }],
    world: {
      locations: [{
        id: 'harbor', name: 'Harbor', kind: 'district',
        description: 'A small dark harbor arena lit only by the dormant beacon.'
      }]
    },
    cast: [{ id: 'player', name: 'The Keeper', role: 'player', description: 'The lighthouse keeper.' }],
    story: {
      premise: 'The beacon went dark; its two light cells are scattered across the harbor.',
      beats: [
        { id: 'b-begin', kind: 'beginning', summary: 'The keeper arrives at the dark harbor.' },
        { id: 'b-end', kind: 'ending', summary: 'With both cells recovered, the beacon relights.' }
      ],
      quests: [
        { id: 'q-cells', kind: 'main', summary: 'Gather the two scattered light cells.' },
        { id: 'q-beacon', kind: 'main', summary: 'Return to the beacon and relight it.' }
      ]
    },
    progression: {
      milestones: [
        { id: 'm-first-cell', summary: 'First light cell recovered.' },
        { id: 'm-relit', summary: 'Beacon relit.' }
      ]
    },
    assets: [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD.' }],
    acceptance: [
      { id: 'a-structural', description: 'The spec validates against the supported envelope.', kind: 'structural', target: 'spec:valid' },
      { id: 'a-sim', description: 'Deterministic automation collects both cells then reaches the beacon.', kind: 'simulation', target: 'evaluate:critical-path' },
      { id: 'a-browser', description: 'The game boots clean and holds frame budget in the browser.', kind: 'browser', target: 'e2e:boot-console-frametime' },
      { id: 'a-manual', description: 'A human approves the playable slice.', kind: 'manual', target: 'checkpoint:slice' }
    ]
  }
}
```

Add a contracts test case asserting `gameSpecDraftSchema.safeParse(firstLightGameSpecDraft()).success === true`. Commit: `git commit -m "feat(contracts): first-light slice spec fixture"`.

- [x] **Step 2: Write the driver script**

```ts
// scripts/compose-first-light.ts
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { firstLightGameSpecDraft } from '@automata/contracts'
import { createSessionHost } from '../tools/editor-mcp-server/src/sessionHost'

/**
 * Drive the Phase 3 slice over the same MCP host agents use: scaffold, compile
 * the spec, design-approve, compose, run every gate, render the slice report.
 * Idempotent — hash-guarded steps make re-runs cheap. Pass `approve <reason>`
 * or `reject <reason>` to record the human slice decision after reading the report.
 */
const repoRoot = resolve(import.meta.dirname, '..')
const host = createSessionHost({ repoRoot })
const call = async (name: string, args: unknown): Promise<Record<string, unknown>> => {
  const result = await host.executeTool(name as never, args)
  if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`)
  process.stdout.write(`${name}: ${JSON.stringify(result.content).slice(0, 200)}\n`)
  return result.content as Record<string, unknown>
}

const [decision, ...reasonParts] = process.argv.slice(2)
try {
  const scaffold = await call('createGame', { name: 'first-light' })
  if (scaffold.alreadyExisted !== true) {
    // A fresh workspace package must be npm-linked before any spawned gate can
    // build it (verify-new-game does the same install-after-scaffold).
    execSync('npm install --no-audit --no-fund', { cwd: repoRoot, stdio: 'inherit' })
  }
  await call('compileGameSpec', {
    gameId: 'first-light', draft: firstLightGameSpecDraft(),
    prompt: 'A tiny night-harbor game: gather the beacon\'s two scattered light cells, then relight it.',
    translations: []
  })
  await call('renderDesignBrief', { gameId: 'first-light' })
  await call('recordDesignDecision', { gameId: 'first-light', decision: 'approve', reason: 'Phase 3 slice design approved' })
  await call('composeGame', { gameId: 'first-light' })
  await call('openProject', { gameId: 'first-light' })
  await call('runBuild', { gameId: 'first-light' })
  await call('runTests', { gameId: 'first-light' })
  await call('runBrowserEval', { gameId: 'first-light' })
  await call('evaluate', { maxSteps: 4000 })
  const report = await call('renderSliceReport', { gameId: 'first-light' })
  process.stdout.write(`\n${String(report.markdown)}\n`)
  if (decision === 'approve' || decision === 'reject') {
    await call('recordSliceDecision', { gameId: 'first-light', decision, reason: reasonParts.join(' ') || 'recorded via compose-first-light script' })
  } else {
    process.stdout.write('\nRead the report above, then re-run with: approve|reject <reason>\n')
  }
} finally {
  await host.dispose()
}
```

Check the `evaluate` tool's exact arg shape against the open project's tool set (`headlessHost`) before running; adjust `maxSteps` form if the project tool expects different args.

- [x] **Step 3: Scaffold + compose + gates**

```bash
node --import tsx scripts/compose-first-light.ts
```

Expected: every step prints ok; `games/first-light/` now contains the scaffold plus `gamespec.json` and the four composed files; the slice report prints with **all four gates passed** (the composition-aware evaluate collects both items then reaches the seeded goal). If evaluate fails, debug the compose→hook seam before proceeding — that failure is the phase's whole point.

- [x] **Step 4: Swap the template-parity case for compose parity**

In `games/first-light/tests/project/content.test.ts`, delete the `ships public files equal to the in-code template` case (compose deliberately rewrote the tuning resource). Keep the other cases. Add:

```ts
// games/first-light/tests/project/composition.test.ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gameSpecSchema, parseCompositionManifest } from '@automata/contracts'
import { composeGame } from '@automata/game-compose'

const gameRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFile(resolve(gameRoot, path), 'utf8')

describe('compose parity', () => {
  it('checked-in composed files reproduce byte-for-byte from the recorded seed', async () => {
    const spec = gameSpecSchema.parse(JSON.parse(await read('gamespec.json')))
    const composition = parseCompositionManifest(await read('public/project/composition.json'))
    expect(composition.source).not.toBeNull()
    const result = composeGame({ spec, seed: composition.source!.seed, specHash: composition.source!.specHash })
    if (!result.ok) throw new Error('compose must succeed for the checked-in spec')
    for (const file of result.files) {
      expect(await read(file.path), file.path).toBe(file.text)
    }
  })
})
```

Add `"@automata/game-compose": "*"` and `"@automata/pack-interaction-inventory": "*"` to `games/first-light/package.json` dependencies (test + runtime deps; the registry already pulls the pack transitively but the explicit dep keeps the game honest), then `npm install`.

- [x] **Step 5: Slice e2e**

Checkpoint evidence (2026-07-14): all functional slice assertions pass, but the approved strict frame gate remains red under the local WebGL2/SwiftShader fallback. The full two-worker slice run measured p95 `100.9 ms`; an isolated `--workers=1` run measured p95 `66.6 ms`, both against `< 50 ms`. Do not record slice approval or ship Phase 3 until the budget passes or the approved plan is explicitly amended.

Performance recovery (scope approved 2026-07-14):

- [x] Profile the renderer boundary: the default always constructs `WebGPURenderer`, which reports its WebGL2 compatibility backend when native WebGPU is unavailable.
- [x] Isolate the hypothesis with a disposable direct-WebGL override: the unchanged strict slice test passed in 3.4 seconds; the override was reverted before implementation.
- [x] Add a test-first generic backend selector and rerun the strict slice gate. Direct WebGL is selected only when `requestAdapter()` cannot produce a usable native WebGPU adapter; the unchanged isolated strict test passed in 3.2 seconds and the normal two-worker first-light suite passed both tests in 4.6 seconds. A fresh MCP session then passed build/test/browser/evaluate and rendered an all-green slice report.

```ts
// games/first-light/e2e/slice.spec.ts  (port: read automata.devPort from games/first-light/package.json)
import { expect, test } from '@playwright/test'

test('first-light composes the inventory pack: HUD, icon asset, composition manifest', async ({ page }) => {
  await page.goto('http://127.0.0.1:<devPort>/')
  await expect(page.locator('canvas')).toBeVisible()
  const hud = page.locator('.inventory-hud')
  await expect(hud).toContainText('0/2')
  const icon = hud.locator('img')
  await expect(icon).toHaveJSProperty('complete', true)
  expect(await icon.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  const manifest = await page.evaluate(async () => (await fetch('project/composition.json')).ok)
  expect(manifest).toBe(true)
})
```

Replace `<devPort>` with the assigned port. Run: `PLAYWRIGHT_ONLY=first-light npx playwright test games/first-light/e2e` — both specs pass.

- [x] **Step 6: Record the slice decision and check in**

```bash
node --import tsx scripts/compose-first-light.ts approve "Phase 3 vertical slice approved: playable, gated, deterministic"
npx vitest run --project first-light
git add packages/contracts scripts/compose-first-light.ts games/first-light package-lock.json
git commit -m "feat(first-light): the Phase 3 vertical slice — spec-composed playable with slice checkpoint"
```

(The decision lives in the gitignored session ledger; the checked-in evidence is the game + spec + composed artifacts + the report reproduced on demand.)

---

## Milestone H — hygiene

### Task 14: Boundaries, docs sync, full gates

**Files:**
- Modify: `eslint.config.js` (boundary groups for the three new packages)
- Modify: `docs/ROADMAP.md` (Phase 3 → `Shipped` with merge commit; move from §3 `Next`)
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` (Phase 3 header gains "Completed <date>" + spec/plan links, mirroring Phases 1–2; §3 table Sub-cycles column)
- Modify: `AGENTS.md` (extend the "MCP build sessions" section: one short paragraph on composeGame/renderSliceReport/recordSliceDecision, mirroring the existing Phase 2 paragraph)
- Modify: this plan (mark tasks complete; add the completion update header)

- [x] **Step 1: eslint boundaries.** In `eslint.config.js`, add the three new packages to the same regimes game-kit uses (they may not import games, tools, or the editor; third-party engine deps only via `@automata/engine`; no direct `zod` — they use `@automata/project`'s re-export). Concretely: extend the game-kit boundary block's `files` glob (or clone it) to cover `packages/pack-interaction-inventory/**/*.ts`, `packages/pack-registry/**/*.ts`, `packages/game-compose/**/*.ts`, and add those globs to the direct-`zod` ban group (currently `games/**`, `tools/**`, editor packages). Verify with `npx eslint packages/pack-interaction-inventory packages/pack-registry packages/game-compose`.

- [x] **Step 2: Docs sync.** ROADMAP Phase 3 section: flip to `Shipped` with date + spec/plan links (follow the Phase 2 entry's exact format in §1 and §3). Decomposition doc §Phase 3: add the completion line. AGENTS.md: after the Phase 2 sentence in "MCP build sessions", add:

> Phase 3 adds the compose surface: `composeGame` turns an approved spec into
> the composition manifest, seeded content, and placeholder assets under
> `games/<name>/` (a seeded, replayable step); `renderSliceReport` assembles the
> vertical-slice evidence; `recordSliceDecision` records the checkpoint —
> approval requires all four gates (build/test/browser/evaluate) green and
> freezes the reviewed spec/composition/content hashes.

- [x] **Step 3: Full gates**

```bash
npm run ci
npm run coverage          # game-kit + engine-adjacent code changed
npx playwright test       # full e2e set including first-light
npm run verify:new-game   # scaffold still green end-to-end
```

Expected: all green. Fix regressions before the final commit.

- [x] **Step 4: Commit**

```bash
git add eslint.config.js docs AGENTS.md
git commit -m "docs: Phase 3 vertical slice shipped; boundaries, roadmap, and agent guide updated"
```

---

## Verification (exit criteria mapping)

| Exit criterion (spec §13) | Proven by |
|---|---|
| Playable artifact end-to-end from a minimal GameSpec | Task 13: `npm run dev -w first-light` boots the composed game; compose-parity test pins spec→artifact |
| Browser evaluation (boot/console/frame-time) passes | Task 10 e2e template + Task 13 `runBrowserEval` gate green |
| Critical-path smoke passes through typed findings | Task 13 `evaluate` gate green (`objectivesComplete: true`, `outcome: passed`) |
| `compose:game` replays deterministically | Task 12 replay test + Task 13 compose-parity byte check |
| Slice checkpoint round-trips with hash-guarded approval | Task 11–12 gate/refusal/reopen tests + Task 13 recorded approval |

Playable check for the human reviewer: `npm run dev -w first-light`, open the printed URL, collect the two glowing cells (WASD/arrows), watch the HUD count, then reach the beacon — it must not succeed before both cells are collected.
