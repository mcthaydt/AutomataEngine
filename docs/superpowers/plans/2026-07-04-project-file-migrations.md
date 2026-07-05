# Project-File Migrations (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ordered formatVersion migration pipeline behind one central parse entry (folder, bundle, autosave all ride it), an optional per-game `migrate` hook, and a real formatVersion 2 (manifest becomes the single version authority).

**Architecture:** New `packages/project/src/migrate.ts` owns a `RawProjectDocuments` pre-validation shape, the ordered core migration chain, and `parseProjectSnapshot` — the one entry `loadProjectFiles`, `parseProjectBundle`, and (via bundle text) editor autosave delegate to. Per-game hooks run after core migrations on the typed snapshot. Migration is in-memory only; the editor seeds all paths dirty so the first save persists the new format.

**Tech Stack:** TypeScript, zod v4 (via `@automata/project` — never import `zod` directly in games/tools), vitest workspace projects, npm workspaces monorepo.

**Spec:** `docs/superpowers/specs/2026-07-04-project-file-migrations-design.md`

## Global Constraints

- `npm run ci` (lint + typecheck + tests) must pass at every commit checkpoint; branch coverage ≥ 90%.
- `npm run verify:new-game` after scaffold-template or project-API changes (Task 9 runs it; scaffold changes land in Task 8).
- TDD: write the failing test before the implementation for every behavior change.
- Games/tools import engine/project APIs from `@automata/engine` / `@automata/project` only.
- "Never silently repairs": anything but a known older version migrating cleanly fails loudly. Sole exception: `loadProjectAutosave` returns `null` on any failure.
- Workspace-scoped test runs: `npx vitest run --project @automata/project` (likewise `@automata/editor`, `level-editor`, `pulsebreak`, `monkey-ball`, `editor-mcp-server`).
- Mark each step's checkbox in this file as you complete it; commit at every task's commit step.

## Cross-task interface summary (single source of truth)

Defined in Task 1, `packages/project/src/migrate.ts`, re-exported from `packages/project/src/index.ts`:

```ts
export interface RawProjectDocuments {
  manifest: unknown
  scenes: unknown[]
  resources: unknown[]
}

export type GameMigrateHook = (snapshot: ProjectSnapshot, fromVersion: number) => ProjectSnapshot

export interface ParsedProject {
  snapshot: ProjectSnapshot
  fromVersion: number // version the documents were read at, ≤ PROJECT_FORMAT_VERSION
}

export function parseProjectSnapshot(raw: RawProjectDocuments, opts?: { migrate?: GameMigrateHook }): ParsedProject
export function applyGameMigration(parsed: ParsedProject, migrate: GameMigrateHook | undefined): ProjectSnapshot
```

Return-type changes rolled out across tasks:

- Task 2: `loadProjectFiles(reader, opts?) → Promise<ParsedProject>` (was `Promise<ProjectSnapshot>`)
- Task 3: `parseProjectBundle(text, opts?) → ParsedProject`; `importProjectBundle(text) → ParsedProject`
- Task 7: `ProjectStoragePort.open() → Promise<ParsedProject>`, `importBundle(text) → ParsedProject`; `OpenedBrowserProject` gains `fromVersion: number`
- Task 5: `GameProjectDefinition.migrate?: GameMigrateHook`
- Task 6: store action `{ type: 'markAllDirty' }`

Tasks 2–3 leave the editor storage port unchanged by unwrapping `.snapshot` at the adapter (two one-line touch-ups that Task 7 replaces — deliberate, so every task compiles and is reviewable alone).

---

### Task 1: Core pipeline module (`migrate.ts`)

**Files:**
- Create: `packages/project/src/migrate.ts`
- Create: `packages/project/tests/migrate.test.ts`
- Modify: `packages/project/src/index.ts` (add one export line)

**Interfaces:**
- Consumes: `packages/project/src/model.ts` schemas (`projectManifestSchema`, `sceneDocumentSchema`, `resourceDocumentSchema`, `projectSnapshotSchema`, `PROJECT_FORMAT_VERSION`).
- Produces: everything in the cross-task interface summary above. `CORE_MIGRATIONS` stays module-private.

Notes for the implementer: `PROJECT_FORMAT_VERSION` is `1` right now, so no older version exists yet. `parseProjectSnapshot`'s hook-*fires* path is therefore exercised through `applyGameMigration` with a fabricated `fromVersion: 0` (it only compares numbers); the real 1→2 hook test is added in Task 8.

- [x] **Step 1: Write the failing tests**

Create `packages/project/tests/migrate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { applyGameMigration, parseProjectSnapshot, PROJECT_FORMAT_VERSION } from '../src'
import type { RawProjectDocuments } from '../src'
import { sampleSnapshot } from './fixtures/sampleProject'

/** Explode a snapshot into the raw pre-validation shape the pipeline consumes. */
function rawDocs(): RawProjectDocuments {
  const snapshot = structuredClone(sampleSnapshot())
  return {
    manifest: snapshot.manifest,
    scenes: Object.values(snapshot.scenes),
    resources: Object.values(snapshot.resources)
  }
}

describe('parseProjectSnapshot', () => {
  it('parses current-version documents and reports fromVersion', () => {
    const parsed = parseProjectSnapshot(rawDocs())
    expect(parsed.snapshot).toEqual(sampleSnapshot())
    expect(parsed.fromVersion).toBe(PROJECT_FORMAT_VERSION)
  })

  it('rejects a missing or non-positive-integer formatVersion', () => {
    for (const bad of [undefined, '1', 1.5, 0, -1, null]) {
      const docs = rawDocs()
      ;(docs.manifest as Record<string, unknown>).formatVersion = bad
      expect(() => parseProjectSnapshot(docs)).toThrow(/not a versioned automata project/i)
    }
  })

  it('rejects a future formatVersion with an update-the-engine error', () => {
    const docs = rawDocs()
    ;(docs.manifest as Record<string, unknown>).formatVersion = PROJECT_FORMAT_VERSION + 1
    expect(() => parseProjectSnapshot(docs)).toThrow(/newer than this build supports/i)
  })

  it('rejects duplicate scene and resource ids', () => {
    const dupScene = rawDocs()
    dupScene.scenes.push(structuredClone(dupScene.scenes[0]))
    expect(() => parseProjectSnapshot(dupScene)).toThrow(/duplicate scene id "main"/i)

    const dupResource = rawDocs()
    dupResource.resources.push(structuredClone(dupResource.resources[0]))
    expect(() => parseProjectSnapshot(dupResource)).toThrow(/duplicate resource id "tuning"/i)
  })

  it('rejects manifest/document set mismatches', () => {
    const missingScene = rawDocs()
    missingScene.scenes = []
    expect(() => parseProjectSnapshot(missingScene)).toThrow(/missing scene "main"/i)

    const unreferencedScene = rawDocs()
    unreferencedScene.scenes.push({ ...structuredClone(sampleSnapshot().scenes.main), id: 'stray' })
    expect(() => parseProjectSnapshot(unreferencedScene)).toThrow(/scene "stray" is not referenced/i)

    const missingResource = rawDocs()
    missingResource.resources = []
    expect(() => parseProjectSnapshot(missingResource)).toThrow(/missing resource "tuning"/i)

    const unreferencedResource = rawDocs()
    unreferencedResource.resources.push({ ...structuredClone(sampleSnapshot().resources.tuning), id: 'stray' })
    expect(() => parseProjectSnapshot(unreferencedResource)).toThrow(/resource "stray" is not referenced/i)

    const typeMismatch = rawDocs()
    ;(typeMismatch.resources[0] as Record<string, unknown>).typeId = 'other'
    expect(() => parseProjectSnapshot(typeMismatch)).toThrow(/resource type mismatch for "tuning"/i)
  })

  it('does not invoke the game hook for current-version documents', () => {
    const migrate = vi.fn()
    parseProjectSnapshot(rawDocs(), { migrate })
    expect(migrate).not.toHaveBeenCalled()
  })
})

describe('applyGameMigration', () => {
  it('returns the snapshot untouched without a hook or at the current version', () => {
    const snapshot = sampleSnapshot()
    expect(applyGameMigration({ snapshot, fromVersion: 0 }, undefined)).toBe(snapshot)
    const migrate = vi.fn()
    expect(applyGameMigration({ snapshot, fromVersion: PROJECT_FORMAT_VERSION }, migrate)).toBe(snapshot)
    expect(migrate).not.toHaveBeenCalled()
  })

  it('invokes the hook with the snapshot and original fromVersion, and re-validates the result', () => {
    const snapshot = sampleSnapshot()
    const migrate = vi.fn((input: typeof snapshot) => structuredClone(input))
    const result = applyGameMigration({ snapshot, fromVersion: 0 }, migrate)
    expect(migrate).toHaveBeenCalledWith(snapshot, 0)
    expect(result).toEqual(snapshot)
  })

  it('rejects hook output that fails the snapshot schema', () => {
    const snapshot = sampleSnapshot()
    const migrate = () => ({ garbage: true }) as never
    expect(() => applyGameMigration({ snapshot, fromVersion: 0 }, migrate)).toThrow()
  })

  it('rejects a hook that changes gameId', () => {
    const snapshot = sampleSnapshot()
    const migrate = (input: typeof snapshot) => {
      const out = structuredClone(input)
      out.manifest.gameId = 'other'
      return out
    }
    expect(() => applyGameMigration({ snapshot, fromVersion: 0 }, migrate)).toThrow(/must not change gameid/i)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project @automata/project tests/migrate.test.ts`
Expected: FAIL — `parseProjectSnapshot` is not exported.

- [x] **Step 3: Implement `migrate.ts`**

Create `packages/project/src/migrate.ts`:

```ts
import {
  projectManifestSchema, sceneDocumentSchema, resourceDocumentSchema,
  projectSnapshotSchema, PROJECT_FORMAT_VERSION
} from './model'
import type { ProjectManifest, ProjectSnapshot, SceneDocument, ResourceDocument } from './model'

/**
 * Ordered core migration pipeline plus the one parse entry every load path
 * (folder, bundle, autosave) funnels through. Core migrations transform raw
 * pre-validation JSON version-by-version; per-game hooks then upgrade
 * game-owned payloads on the typed snapshot. Never silently repairs:
 * anything but a known older version migrating cleanly fails loudly.
 */

/** Pre-validation shape every load source normalizes into. */
export interface RawProjectDocuments {
  manifest: unknown
  scenes: unknown[]
  resources: unknown[]
}

/** Upgrades game-owned data payloads written at an older formatVersion. */
export type GameMigrateHook = (snapshot: ProjectSnapshot, fromVersion: number) => ProjectSnapshot

export interface ParsedProject {
  snapshot: ProjectSnapshot
  /** formatVersion the documents were read at (≤ PROJECT_FORMAT_VERSION). */
  fromVersion: number
}

/** One core step: transforms documents written at `from` to `from + 1`. */
interface ProjectMigration {
  from: number
  migrate(docs: RawProjectDocuments): RawProjectDocuments
}

const CORE_MIGRATIONS: ProjectMigration[] = []

// A gap in the chain is a programmer error; fail at module load, not at parse time.
if (CORE_MIGRATIONS.length !== PROJECT_FORMAT_VERSION - 1) {
  throw new Error(`Core migrations must cover 1..${PROJECT_FORMAT_VERSION}; found ${CORE_MIGRATIONS.length} steps`)
}
CORE_MIGRATIONS.forEach((migration, index) => {
  if (migration.from !== index + 1) {
    throw new Error(`Core migrations must be contiguous from 1; found "from: ${migration.from}" at index ${index}`)
  }
})

function readFormatVersion(manifest: unknown): number {
  const value = (manifest as { formatVersion?: unknown } | null | undefined)?.formatVersion
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Not a versioned Automata project: manifest formatVersion must be a positive integer')
  }
  return value
}

function crossCheck(
  manifest: ProjectManifest,
  scenes: Record<string, SceneDocument>,
  resources: Record<string, ResourceDocument>
): void {
  for (const entry of manifest.scenes) {
    if (!scenes[entry.id]) throw new Error(`Manifest references missing scene "${entry.id}"`)
  }
  const sceneIds = new Set(manifest.scenes.map((entry) => entry.id))
  for (const id of Object.keys(scenes)) {
    if (!sceneIds.has(id)) throw new Error(`Scene "${id}" is not referenced by the manifest`)
  }
  for (const entry of manifest.resources) {
    const resource = resources[entry.id]
    if (!resource) throw new Error(`Manifest references missing resource "${entry.id}"`)
    if (resource.typeId !== entry.typeId) {
      throw new Error(`Resource type mismatch for "${entry.id}": manifest "${entry.typeId}" vs document "${resource.typeId}"`)
    }
  }
  const resourceIds = new Set(manifest.resources.map((entry) => entry.id))
  for (const id of Object.keys(resources)) {
    if (!resourceIds.has(id)) throw new Error(`Resource "${id}" is not referenced by the manifest`)
  }
}

/**
 * The central parse entry: version detection → core migrations → structural
 * validation → manifest/document cross-checks → optional game migration.
 */
export function parseProjectSnapshot(
  raw: RawProjectDocuments,
  opts: { migrate?: GameMigrateHook } = {}
): ParsedProject {
  const fromVersion = readFormatVersion(raw.manifest)
  if (fromVersion > PROJECT_FORMAT_VERSION) {
    throw new Error(
      `Project formatVersion ${fromVersion} is newer than this build supports (<= ${PROJECT_FORMAT_VERSION}); update the engine`
    )
  }

  let docs = raw
  for (const migration of CORE_MIGRATIONS.slice(fromVersion - 1)) docs = migration.migrate(docs)

  const manifest = projectManifestSchema.parse(docs.manifest)
  const scenes: Record<string, SceneDocument> = {}
  for (const doc of docs.scenes) {
    const scene = sceneDocumentSchema.parse(doc)
    if (scenes[scene.id]) throw new Error(`Duplicate scene id "${scene.id}"`)
    scenes[scene.id] = scene
  }
  const resources: Record<string, ResourceDocument> = {}
  for (const doc of docs.resources) {
    const resource = resourceDocumentSchema.parse(doc)
    if (resources[resource.id]) throw new Error(`Duplicate resource id "${resource.id}"`)
    resources[resource.id] = resource
  }
  crossCheck(manifest, scenes, resources)

  const snapshot = projectSnapshotSchema.parse({ manifest, scenes, resources })
  return { snapshot: applyGameMigration({ snapshot, fromVersion }, opts.migrate), fromVersion }
}

/**
 * Run a game's payload migration on an already-parsed project. No-op at the
 * current version or without a hook. The result is re-validated so a buggy
 * hook can neither smuggle malformed structure nor rebadge the project.
 */
export function applyGameMigration(parsed: ParsedProject, migrate: GameMigrateHook | undefined): ProjectSnapshot {
  if (!migrate || parsed.fromVersion >= PROJECT_FORMAT_VERSION) return parsed.snapshot
  const migrated = projectSnapshotSchema.parse(migrate(parsed.snapshot, parsed.fromVersion))
  if (migrated.manifest.gameId !== parsed.snapshot.manifest.gameId) {
    throw new Error(
      `Game migration must not change gameId ("${parsed.snapshot.manifest.gameId}" -> "${migrated.manifest.gameId}")`
    )
  }
  return migrated
}
```

Add to `packages/project/src/index.ts` (after the `./model` export line):

```ts
export * from './migrate'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project @automata/project`
Expected: PASS (migrate.test.ts and all existing project tests).

- [x] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/project/src/migrate.ts packages/project/src/index.ts packages/project/tests/migrate.test.ts
git commit -m "feat(project): core migration pipeline + central parse entry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Route `loadProjectFiles` through the pipeline

**Files:**
- Modify: `packages/project/src/files.ts` (replace `loadProjectFiles`)
- Modify: `packages/project/tests/files.test.ts`
- Modify (unwrap `.snapshot`, one line each): `packages/editor/src/project/storage/fileSystem.ts:42`, `packages/editor/src/project/storage/memory.ts:20-27`, `tools/editor-mcp-server/src/headlessHost.ts:44`
- Modify (destructure): `games/pulsebreak/src/project/load.ts`, `games/monkey-ball/src/project/load.ts`, `games/pulsebreak/scripts/validate-project.ts`, `games/monkey-ball/scripts/validate-project.ts`, `games/pulsebreak/tests/project/content.test.ts`

**Interfaces:**
- Consumes: `parseProjectSnapshot`, `RawProjectDocuments`, `ParsedProject`, `GameMigrateHook` from Task 1.
- Produces: `loadProjectFiles(reader: ProjectFileReader, opts?: { migrate?: GameMigrateHook }): Promise<ParsedProject>`. `projectFileDocuments` and `isSafeProjectPath` unchanged.

- [x] **Step 1: Update `files.test.ts` to the new contract (failing first)**

In `packages/project/tests/files.test.ts` apply exactly these edits:

Line 18 (`loads a project folder back into a snapshot`):
```ts
expect(await loadProjectFiles(reader)).toEqual({ snapshot, fromVersion: 1 })
```

Lines 35–36 (`round-trips documents back through the loader`):
```ts
const loaded = await loadProjectFiles({ readText: async (path) => map.get(path)! })
expect(loaded.snapshot).toEqual(snapshot)
```

In `throws when a referenced document is missing or mismatched` (lines 52–58), the id-mismatch errors now come from the shared cross-checks — a doc whose id differs from its manifest entry surfaces as a missing manifest reference:
```ts
const mismatched = readerFor()
mismatched.files.set('scenes/main.scene.json', JSON.stringify({ ...sampleSnapshot().scenes.main, id: 'other' }))
await expect(loadProjectFiles(mismatched.reader)).rejects.toThrow(/missing scene "main"/i)

const resourceId = readerFor()
resourceId.files.set('resources/tuning.resource.json', JSON.stringify({ ...sampleSnapshot().resources.tuning, id: 'other' }))
await expect(loadProjectFiles(resourceId.reader)).rejects.toThrow(/missing resource "tuning"/i)
```
(The `resource type mismatch` case on lines 60–62 keeps its assertion — the message is unchanged.)

Append one new test inside the `describe`:
```ts
it('rejects a manifest whose scene index is not an array', async () => {
  const files = new Map([['automata.project.json', JSON.stringify({ formatVersion: 1, scenes: 'nope' })]])
  await expect(loadProjectFiles({ readText: async (path) => files.get(path)! })).rejects.toThrow(/must be an array/i)
})
```

- [x] **Step 2: Run to verify the updated tests fail**

Run: `npx vitest run --project @automata/project tests/files.test.ts`
Expected: FAIL — `loadProjectFiles` still returns a bare snapshot.

- [x] **Step 3: Replace `loadProjectFiles` in `files.ts`**

Replace the import block and `loadProjectFiles` (keep `PROJECT_MANIFEST_PATH`, `ProjectFileReader`, `ProjectFileDocument`, `isSafeProjectPath`, `canonicalJson`, `projectFileDocuments` as they are):

```ts
import { parseProjectSnapshot, type GameMigrateHook, type ParsedProject, type RawProjectDocuments } from './migrate'
import type { ProjectSnapshot } from './model'
```
(`projectManifestSchema`/`sceneDocumentSchema`/`resourceDocumentSchema`/`projectSnapshotSchema` imports go away; `projectFileDocuments` still needs `ProjectSnapshot` and `PROJECT_MANIFEST_PATH`.)

```ts
/** Read path entries from a raw (unvalidated, possibly old-format) manifest. */
function manifestPathEntries(rawManifest: unknown, key: 'scenes' | 'resources'): string[] {
  const entries = (rawManifest as Record<string, unknown> | null | undefined)?.[key]
  if (!Array.isArray(entries)) throw new Error(`Manifest "${key}" must be an array`)
  return entries.map((entry) => {
    const path = (entry as { path?: unknown } | null)?.path
    if (typeof path !== 'string' || !isSafeProjectPath(path)) {
      throw new Error(`Unsafe ${key === 'scenes' ? 'scene' : 'resource'} path "${String(path)}"`)
    }
    return path
  })
}

/** Load a project folder through the central migration-aware parse entry. */
export async function loadProjectFiles(
  reader: ProjectFileReader,
  opts: { migrate?: GameMigrateHook } = {}
): Promise<ParsedProject> {
  const manifest: unknown = JSON.parse(await reader.readText(PROJECT_MANIFEST_PATH))
  const raw: RawProjectDocuments = { manifest, scenes: [], resources: [] }
  for (const path of manifestPathEntries(manifest, 'scenes')) {
    raw.scenes.push(JSON.parse(await reader.readText(path)))
  }
  for (const path of manifestPathEntries(manifest, 'resources')) {
    raw.resources.push(JSON.parse(await reader.readText(path)))
  }
  return parseProjectSnapshot(raw, opts)
}
```

Constraint this bakes in (documented in the spec): future migrations must keep `manifest.scenes[].path` / `manifest.resources[].path` readable pre-migration, or this loader grows version awareness.

- [x] **Step 4: Fix the compiler-enumerated consumers**

Run: `npm run typecheck`
Expected failures at exactly these sites; apply these edits:

`packages/editor/src/project/storage/fileSystem.ts` `open()`:
```ts
async open() {
  return (await loadProjectFiles({ readText: (path) => readFile(directory, path) })).snapshot
},
```

`packages/editor/src/project/storage/memory.ts` `open()` — same pattern: wrap the existing `loadProjectFiles({...})` call in `(await ...).snapshot`.

`tools/editor-mcp-server/src/headlessHost.ts:42-44`:
```ts
const snapshot = options.bundleJson !== undefined
  ? parseProjectBundle(options.bundleJson)
  : (await loadProjectFiles(createProjectDirectoryReader(options.projectDir ?? DEFAULT_PROJECT_DIR))).snapshot
```

`games/pulsebreak/src/project/load.ts:11` and `games/monkey-ball/src/project/load.ts` (same line in each):
```ts
const { snapshot } = await loadProjectFiles(reader)
```

`games/pulsebreak/scripts/validate-project.ts` and `games/monkey-ball/scripts/validate-project.ts`:
```ts
const { snapshot } = await loadProjectFiles({ readText: (path) => readFile(resolve(root, path), 'utf8') })
```

`games/pulsebreak/tests/project/content.test.ts` — the file aliases `loadProjectFiles` results throughout; add one local helper at the top and reroute all call sites through it:
```ts
const loadSnapshot = async () => (await loadProjectFiles(reader)).snapshot
```
Replace every `await loadProjectFiles(reader)` in this file with `await loadSnapshot()`, and the two `Awaited<ReturnType<typeof loadProjectFiles>>` type references with `Awaited<ReturnType<typeof loadSnapshot>>`.

If typecheck names any additional call sites (e.g. monkey-ball tests), apply the same `{ snapshot }` destructure pattern.

- [x] **Step 5: Run the affected suites**

Run: `npx vitest run --project @automata/project --project @automata/editor --project pulsebreak --project monkey-ball --project editor-mcp-server`
Expected: PASS.

- [x] **Step 6: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "refactor(project): route loadProjectFiles through parseProjectSnapshot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Route `parseProjectBundle` through the pipeline

**Files:**
- Modify: `packages/project/src/bundle.ts`
- Modify: `packages/project/tests/bundle.test.ts`
- Modify: `packages/editor/src/project/storage/bundle.ts` (`importProjectBundle` returns `ParsedProject`)
- Modify (unwrap `.snapshot`, one line each): `packages/editor/src/project/storage/memory.ts` + `fileSystem.ts` (`importBundle`), `tools/level-editor/src/browserWorkspace.ts:50`, `tools/editor-mcp-server/src/headlessHost.ts:43`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `parseProjectBundle(text: string, opts?: { migrate?: GameMigrateHook }): ParsedProject`; `importProjectBundle(text: string): ParsedProject`. `toProjectBundle`/`stringifyProjectBundle` unchanged for now (root `formatVersion` still emitted until Task 8; the parser ignores it from here on — the manifest is authoritative).

Behavior strengthenings this task ships (already unit-tested in migrate.test.ts, smoke-tested here): bundles gain manifest/doc cross-checks; duplicate ids stop silently last-winning through `Object.fromEntries`.

- [x] **Step 1: Update `bundle.test.ts` (failing first)**

Lines 26–30 (`round-trips a snapshot through stringify/parse`):
```ts
it('round-trips a snapshot through stringify/parse', () => {
  const snapshot = sampleSnapshot()
  const parsed = parseProjectBundle(stringifyProjectBundle(toProjectBundle(snapshot)))
  expect(parsed.snapshot).toEqual(snapshot)
  expect(parsed.fromVersion).toBe(1)
})
```

Replace lines 32–35 (`rejects an invalid bundle...` — the old text-replace trick hit the root `formatVersion`, which is no longer authoritative):
```ts
it('rejects a future manifest formatVersion and non-bundle shapes', () => {
  const bundle = toProjectBundle(sampleSnapshot())
  const future = { ...bundle, manifest: { ...bundle.manifest, formatVersion: 99 } }
  expect(() => parseProjectBundle(JSON.stringify(future))).toThrow(/newer than this build supports/i)
  expect(() => parseProjectBundle('42')).toThrow(/not a project bundle/i)
  expect(() => parseProjectBundle('{"manifest":{}}')).toThrow(/not a project bundle/i)
})

it('rejects duplicate ids instead of silently last-winning', () => {
  const bundle = toProjectBundle(sampleSnapshot())
  const dup = { ...bundle, scenes: [...bundle.scenes, structuredClone(bundle.scenes[0]!)] }
  expect(() => parseProjectBundle(JSON.stringify(dup))).toThrow(/duplicate scene id/i)
})
```

- [x] **Step 2: Run to verify failures**

Run: `npx vitest run --project @automata/project tests/bundle.test.ts`
Expected: FAIL.

- [x] **Step 3: Replace `parseProjectBundle`**

In `packages/project/src/bundle.ts`: delete the `projectBundleSchema` const and the `z` import; add `import { parseProjectSnapshot, type GameMigrateHook, type ParsedProject } from './migrate'`; drop now-unused schema imports from `./model` (keep `PROJECT_FORMAT_VERSION` — the `ProjectBundle` interface still carries the root field until Task 8):

```ts
/** Parse bundle text through the central migration-aware entry. */
export function parseProjectBundle(text: string, opts: { migrate?: GameMigrateHook } = {}): ParsedProject {
  const raw = JSON.parse(text) as { manifest?: unknown; scenes?: unknown; resources?: unknown } | null
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.scenes) || !Array.isArray(raw.resources)) {
    throw new Error('Not a project bundle: expected { manifest, scenes[], resources[] }')
  }
  return parseProjectSnapshot({ manifest: raw.manifest, scenes: raw.scenes, resources: raw.resources }, opts)
}
```

`packages/editor/src/project/storage/bundle.ts`:
```ts
export function importProjectBundle(text: string): ParsedProject {
  return parseProjectBundle(text)
}
```
(adjust the import to pull `ParsedProject` from `@automata/project`).

- [x] **Step 4: Fix compiler-enumerated consumers (temporary unwraps, replaced in Task 7)**

Run `npm run typecheck`; apply:

`memory.ts` and `fileSystem.ts`: `importBundle(text) { return importProjectBundle(text).snapshot }`

`tools/level-editor/src/browserWorkspace.ts:50`: `const snapshot = importProjectBundle(text).snapshot`

`tools/editor-mcp-server/src/headlessHost.ts:43`: `? parseProjectBundle(options.bundleJson).snapshot`

- [x] **Step 5: Run affected suites; commit**

Run: `npx vitest run --project @automata/project --project @automata/editor --project level-editor --project editor-mcp-server`
Expected: PASS.

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "refactor(project): route parseProjectBundle through parseProjectSnapshot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Autosave rides the bundle format

**Files:**
- Modify: `packages/editor/src/project/storage/autosave.ts`
- Modify: `packages/editor/tests/project/storage/autosave.test.ts`

**Interfaces:**
- Consumes: `parseProjectBundle`, `stringifyProjectBundle`, `toProjectBundle` from `@automata/project`.
- Produces: `loadProjectAutosave(storage, projectId): ProjectSnapshot | null` (signature unchanged; storage format is now canonical bundle text). `PROJECT_AUTOSAVE_VERSION` is **deleted** (grep confirms `autosave.ts` is its only referencing file). No game hook here: autosaves are written by the current build so `fromVersion` is always current; pre-existing old-envelope autosaves fail parse → `null`, matching today's discard-on-mismatch.

The comparison at `tools/level-editor/src/editorApp.ts:281` already canonicalizes via `stringifyProjectBundle(toProjectBundle(...))` and `loadProjectAutosave` still returns a snapshot — no editorApp change needed.

- [x] **Step 1: Update the autosave tests (failing first)**

In `autosave.test.ts`, replace the `rejects a version mismatch on load` test (lines 60–64):

```ts
it('returns null for the legacy envelope, garbage, and future versions', () => {
  const storage = memoryStorage()
  storage.set(projectAutosaveKey('p'), JSON.stringify({ version: 1, snapshot: {} }))
  expect(loadProjectAutosave(storage, 'p')).toBeNull()

  storage.set(projectAutosaveKey('p'), 'not json')
  expect(loadProjectAutosave(storage, 'p')).toBeNull()

  const future = toProjectBundle(fakeSnapshot())
  storage.set(projectAutosaveKey('p'), JSON.stringify({ ...future, manifest: { ...future.manifest, formatVersion: 99 } }))
  expect(loadProjectAutosave(storage, 'p')).toBeNull()
})

it('stores canonical bundle text', () => {
  vi.useFakeTimers()
  const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
  const storage = memoryStorage()
  installProjectAutosave(store, storage, { debounceMs: 100 })
  store.dispatch(setSpeed(8))
  vi.advanceTimersByTime(100)
  const raw = storage.get(projectAutosaveKey('fake-demo'))!
  expect(raw).toBe(stringifyProjectBundle(toProjectBundle(store.getState().snapshot)))
})
```
Add `import { stringifyProjectBundle, toProjectBundle } from '@automata/project'` at the top. (If `fakeSnapshot()`'s manifest id is not `fake-demo`, keep whatever id the existing tests use — they already pass `'fake-demo'`.)

- [x] **Step 2: Run to verify failures**

Run: `npx vitest run --project @automata/editor tests/project/storage/autosave.test.ts`
Expected: FAIL — `stores canonical bundle text` fails (writes still use the `{ version, snapshot }` envelope). The null-cases test passes even under the old code (any non-envelope input already yields null); it is there to pin that contract through the rewrite, and the failing write-format test is the TDD gate for Step 3.

- [x] **Step 3: Rewrite `autosave.ts`**

```ts
import type { StoragePort } from '@automata/engine'
import { parseProjectBundle, stringifyProjectBundle, toProjectBundle, type ProjectSnapshot } from '@automata/project'
import type { ProjectEditorStore } from '../store'

/**
 * Debounced autosave of the live snapshot as canonical bundle text, keyed per
 * project. Loads ride the same migration pipeline as every other parse path;
 * an unreadable autosave yields null so a stale crash-recovery cache never
 * blocks opening the real project.
 */
export function projectAutosaveKey(projectId: string): string {
  return `automata/project-autosave/${projectId}`
}

export function installProjectAutosave(store: ProjectEditorStore, storage: StoragePort, opts: { debounceMs: number }): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const write = (): void => {
    timer = null
    const snapshot = store.getState().snapshot
    storage.set(projectAutosaveKey(snapshot.manifest.id), stringifyProjectBundle(toProjectBundle(snapshot)))
  }
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.snapshot === prev.snapshot) return // only the snapshot is persisted; ignore UI/no-op changes
    if (timer) clearTimeout(timer)
    timer = setTimeout(write, opts.debounceMs)
  })
  return () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      write()
    }
    unsubscribe()
  }
}

export function loadProjectAutosave(storage: StoragePort, projectId: string): ProjectSnapshot | null {
  const raw = storage.get(projectAutosaveKey(projectId))
  if (!raw) return null
  try {
    return parseProjectBundle(raw).snapshot
  } catch {
    return null
  }
}
```

- [x] **Step 4: Run suites; commit**

Run: `npx vitest run --project @automata/editor --project level-editor`
Expected: PASS.

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "refactor(editor): autosave rides the bundle format and migration pipeline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `migrate` hook on `GameProjectDefinition`

**Files:**
- Modify: `packages/project/src/registration.ts` (one optional field)
- Modify: `packages/project/tests/registration.test.ts` (one test)
- Modify: `games/pulsebreak/src/project/load.ts`, `games/monkey-ball/src/project/load.ts` (thread the hook)
- Modify: `tools/editor-mcp-server/src/headlessHost.ts` (apply via `applyGameMigration`)

**Interfaces:**
- Consumes: `GameMigrateHook`, `applyGameMigration`, `ParsedProject` from Task 1.
- Produces: `GameProjectDefinition.migrate?: GameMigrateHook`. `defineGameProject` passes it through untouched (the existing `...input` spread carries it — verify with the test, don't add code).

- [ ] **Step 1: Failing test in `registration.test.ts`**

```ts
it('preserves an authored migrate hook', () => {
  const migrate = (snapshot: ProjectSnapshot) => snapshot
  const definition = defineGameProject({ ...sampleDefinitionInput, migrate })
  expect(definition.migrate).toBe(migrate)
})
```
(Match the file's existing imports; `sampleDefinitionInput` comes from `./fixtures/sampleProject`, `ProjectSnapshot` from `../src`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project @automata/project tests/registration.test.ts`
Expected: FAIL — `migrate` is not a known property (typecheck error at test compile).

- [ ] **Step 3: Add the field**

In `packages/project/src/registration.ts`, add to the `GameProjectDefinition<Compiled>` interface (after `compile`):

```ts
  /** Upgrade game-owned data payloads written at an older formatVersion. */
  migrate?: GameMigrateHook
```
with `import type { GameMigrateHook } from './migrate'` (no cycle: `migrate.ts` imports only `model.ts`).

- [ ] **Step 4: Thread the hook through the game loaders and MCP host**

`games/pulsebreak/src/project/load.ts:11`:
```ts
const { snapshot } = await loadProjectFiles(reader, { migrate: pulsebreakProjectDefinition.migrate })
```
Same edit in `games/monkey-ball/src/project/load.ts` with `monkeyBallProjectDefinition`.

`tools/editor-mcp-server/src/headlessHost.ts` — the host resolves the registration *from* the parsed manifest, so it uses the late-binding entry (replace lines 42–45):
```ts
const parsed = options.bundleJson !== undefined
  ? parseProjectBundle(options.bundleJson)
  : await loadProjectFiles(createProjectDirectoryReader(options.projectDir ?? DEFAULT_PROJECT_DIR))
const registration = await loadProjectRegistration(parsed.snapshot.manifest.gameId, options.repoRoot)
const snapshot = applyGameMigration(parsed, registration.project.migrate)
```
(add `applyGameMigration` to the `@automata/project` import).

- [ ] **Step 5: Run suites; commit**

Run: `npx vitest run --project @automata/project --project pulsebreak --project monkey-ball --project editor-mcp-server`
Expected: PASS.

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat(project): per-game migrate hook on GameProjectDefinition

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `markAllDirty` store action

**Files:**
- Modify: `packages/editor/src/project/actions.ts`
- Modify: `packages/editor/src/project/store.ts`
- Modify: `packages/editor/tests/project/store.test.ts`

**Interfaces:**
- Produces: store action `{ type: 'markAllDirty' }` — dirties every document path under the store's reference-identity dirt model; `markSaved` then re-adopts per path as saves land.

- [ ] **Step 1: Failing test in `store.test.ts`**

```ts
it('markAllDirty dirties every document path until saved', () => {
  const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
  store.dispatch({ type: 'markAllDirty' })
  const state = store.getState()
  expect(new Set(state.dirtyPaths)).toEqual(new Set(projectFileDocuments(state.snapshot).map((doc) => doc.path)))

  store.dispatch({ type: 'markSaved', paths: state.dirtyPaths, snapshot: state.snapshot })
  expect(store.getState().dirtyPaths).toEqual([])
})
```
(match the file's existing fixture imports; add `projectFileDocuments` to the `@automata/project` import).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project @automata/editor tests/project/store.test.ts`
Expected: FAIL — `markAllDirty` is not a valid action type.

- [ ] **Step 3: Implement**

`actions.ts` — add to the `ProjectEditorAction` union (after `'recoverSnapshot'`):
```ts
  | { type: 'markAllDirty' }
```

`store.ts` — add a reducer arm (after `case 'recoverSnapshot'`):
```ts
case 'markAllDirty': {
  // "Disk differs from memory for every path": cloning the saved baseline
  // gives every document a fresh reference, so the store's identity-based
  // dirt model reports all paths dirty; markSaved re-adopts per path.
  const savedSnapshot = structuredClone(state.savedSnapshot)
  return { ...state, savedSnapshot, dirtyPaths: computeDirtyPaths(state.snapshot, savedSnapshot) }
}
```

- [ ] **Step 4: Run suite; commit**

Run: `npx vitest run --project @automata/editor`
Expected: PASS.

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat(editor): markAllDirty store action

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Surface `fromVersion` through storage and the editor app

**Files:**
- Modify: `packages/editor/src/project/storage/port.ts` (`open`/`importBundle` return `ParsedProject`)
- Modify: `packages/editor/src/project/storage/memory.ts`, `fileSystem.ts` (drop the Task 2/3 unwraps)
- Modify: `tools/level-editor/src/browserWorkspace.ts` (`OpenedBrowserProject.fromVersion`)
- Modify: `tools/level-editor/src/editorApp.ts` (apply game migration on open/import; pass `migrated` into the session; dispatch `markAllDirty`)
- Modify: `tools/level-editor/tests/projectSession.test.ts` and/or `editorApp` tests (wiring test)

**Interfaces:**
- Consumes: `ParsedProject`, `applyGameMigration`, `PROJECT_FORMAT_VERSION` from `@automata/project`; `markAllDirty` from Task 6.
- Produces: `ProjectStoragePort.open(): Promise<ParsedProject>`; `ProjectStoragePort.importBundle(text): ParsedProject`; `OpenedBrowserProject` gains `fromVersion: number`; `ProjectSessionMountOptions` (in `editorApp.ts`) gains `migrated?: boolean`.

- [ ] **Step 1: Failing wiring test**

In `tools/level-editor/tests/projectSession.test.ts` (follow the file's existing mount/fixture helpers — it already mounts sessions with fake options), add a test that a session mounted with `migrated: true` reports every document path dirty:

```ts
it('marks every path dirty when mounted for a migrated project', async () => {
  // Use the file's existing session-mount helper/fixtures; pass `migrated: true`
  // in the options and assert on the store the same way neighboring tests do.
  // Assertion:
  expect(new Set(core.store.getState().dirtyPaths))
    .toEqual(new Set(projectFileDocuments(core.store.getState().snapshot).map((doc) => doc.path)))
})
```
If the mount helper doesn't expose the store, assert via the session's save flow instead (a `save()` after mount must attempt every path) — mirror whichever observation the file already uses for `initiallyDirty`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project level-editor tests/projectSession.test.ts`
Expected: FAIL — `migrated` is not a known option.

- [ ] **Step 3: Port + adapters**

`port.ts`:
```ts
import type { ParsedProject, ProjectSnapshot, ValidationIssue } from '@automata/project'
...
  open(): Promise<ParsedProject>
  save(snapshot: ProjectSnapshot, dirtyPaths: readonly string[]): Promise<ProjectSaveResult>
  exportBundle(snapshot: ProjectSnapshot): ProjectBundleExport
  importBundle(text: string): ParsedProject
```

`memory.ts` / `fileSystem.ts`: remove the Task 2/3 unwraps — `open()` returns `loadProjectFiles(...)` directly; `importBundle(text)` returns `importProjectBundle(text)` directly.

- [ ] **Step 4: browserWorkspace**

`OpenedBrowserProject` gains `fromVersion: number`. In `openBundle`:
```ts
const { snapshot, fromVersion } = importProjectBundle(text)
if (registration) assertGame(registration, snapshot)
return { snapshot, fromVersion, storage: null, source: 'bundle' }
```
In `openDirectory`:
```ts
const { snapshot, fromVersion } = await storage.open()
```
and add `fromVersion` to its return object.

- [ ] **Step 5: editorApp wiring**

In `tools/level-editor/src/editorApp.ts`:

Add to the `@automata/project` imports: `applyGameMigration`, `PROJECT_FORMAT_VERSION`.

`openWorkspace` (currently line 124):
```ts
const openWorkspace = async (opened: OpenedBrowserProject | null): Promise<void> => {
  if (!opened) return
  const registration = resolveRegistration(opened.snapshot)
  const snapshot = applyGameMigration(opened, registration.project.migrate)
  await openSession(registration, snapshot, opened.storage, undefined, opened.fromVersion)
}
```

`openSession` signature gains a defaulted parameter and threads `migrated`:
```ts
const openSession = async (
  registration: RegisteredEditorProject,
  snapshot: ProjectSnapshot,
  storage: ProjectStoragePort | null,
  recovery?: LegacyMonkeyBallRecovery,
  fromVersion: number = PROJECT_FORMAT_VERSION
): Promise<void> => {
```
and in the `createSession({...})` options: `migrated: fromVersion < PROJECT_FORMAT_VERSION,`

`ProjectSessionMountOptions` (same file, near `initiallyDirty` at line 48): add `migrated?: boolean`.

In `mountProjectSession`, directly after `createProjectEditor(...)`/`cleanup.defer(() => core.dispose())`:
```ts
if (options.migrated) core.store.dispatch({ type: 'markAllDirty' })
```
(Order relative to autosave recovery is safe either way: `recoverSnapshot` recomputes dirt against the cloned baseline, so both dirt sources union.)

In-session `importBundle` (currently line 329):
```ts
const importBundle = async (): Promise<void> => {
  const opened = await options.workspace.importBundle(options.registration)
  if (!opened) return
  backingStorage = null
  core.store.dispatch({ type: 'loadSnapshot', snapshot: applyGameMigration(opened, options.registration.project.migrate) })
  if (opened.fromVersion < PROJECT_FORMAT_VERSION) core.store.dispatch({ type: 'markAllDirty' })
}
```

- [ ] **Step 6: Typecheck-enumerated stragglers**

Run `npm run typecheck`; fix any remaining `open()`/`importBundle` consumers (storage tests in `packages/editor/tests/project/storage/`, level-editor tests) with the `{ snapshot, fromVersion }` destructure pattern.

- [ ] **Step 7: Run suites; commit**

Run: `npx vitest run --project @automata/editor --project level-editor`
Expected: PASS, including the Step 1 test.

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat(editor): surface fromVersion; apply game migrations and dirty-marking on open/import

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: formatVersion 2 — manifest becomes the single version authority

**Files:**
- Create: `packages/project/tests/fixtures/v1Project.ts` (frozen v1 documents)
- Modify: `packages/project/src/model.ts`, `packages/project/src/migrate.ts`, `packages/project/src/bundle.ts`
- Modify: `packages/project/tests/migrate.test.ts` (1→2 + hook-fires tests)
- Modify (writer sweep, compiler/grep-enumerated): `packages/project/tests/fixtures/sampleProject.ts`, `games/pulsebreak/src/project/template.ts`, `games/monkey-ball/src/project/legacyImporter.ts`, `tools/scaffold/src/templates/projectData.ts`, `packages/editor/src/ui/project/resources.ts:77`, `packages/editor-agent/src/diff.ts:56`, test fixtures across `packages/editor`, `packages/editor-agent`, `tools/level-editor`, `tools/editor-mcp-server`

**Interfaces:**
- Produces: `PROJECT_FORMAT_VERSION = 2`; scene/resource document schemas without `formatVersion`; `ProjectBundle` without root `formatVersion`; core migration `{ from: 1 }`.

- [ ] **Step 1: Pin the v1 format as a frozen fixture**

Create `packages/project/tests/fixtures/v1Project.ts`:

```ts
import type { RawProjectDocuments } from '../../src'

/**
 * Frozen formatVersion-1 documents pinning the 1→2 migration forever.
 * NEVER update these shapes to a newer format — that is the point of them.
 * Mirrors sampleProject.ts as it existed at v1.
 */
export function v1RawDocuments(): RawProjectDocuments {
  return {
    manifest: {
      formatVersion: 1, id: 'demo', name: 'Demo', gameId: 'fake', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
    },
    scenes: [{
      formatVersion: 1, id: 'main', name: 'Main',
      entities: [
        {
          id: 'root', name: 'Root', enabled: true,
          components: [{ id: 'transform', typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }]
        },
        {
          id: 'spawn', name: 'Spawn', parentId: 'root', enabled: true,
          components: [{ id: 'c-spawn', typeId: 'fake.spawn', data: { team: 'red', tuning: 'tuning' } }]
        }
      ]
    }],
    resources: [{ formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 4 } }]
  }
}

/** The same project as v1 single-file bundle text (root formatVersion included, as v1 wrote it). */
export function v1BundleText(): string {
  const docs = v1RawDocuments()
  return `${JSON.stringify({ formatVersion: 1, manifest: docs.manifest, scenes: docs.scenes, resources: docs.resources }, null, 2)}\n`
}
```

- [ ] **Step 2: Failing 1→2 tests in `migrate.test.ts`**

```ts
import { v1BundleText, v1RawDocuments } from './fixtures/v1Project'
import { parseProjectBundle } from '../src'

describe('migration 1→2', () => {
  it('migrates v1 raw documents: manifest owns the version, docs lose theirs', () => {
    const parsed = parseProjectSnapshot(v1RawDocuments())
    expect(parsed.fromVersion).toBe(1)
    expect(parsed.snapshot.manifest.formatVersion).toBe(2)
    expect('formatVersion' in parsed.snapshot.scenes.main!).toBe(false)
    expect('formatVersion' in parsed.snapshot.resources.tuning!).toBe(false)
    expect(parsed.snapshot.scenes.main!.entities).toHaveLength(2)
  })

  it('parses a v1 bundle (root formatVersion ignored) to the same snapshot', () => {
    const fromBundle = parseProjectBundle(v1BundleText())
    expect(fromBundle.fromVersion).toBe(1)
    expect(fromBundle.snapshot).toEqual(parseProjectSnapshot(v1RawDocuments()).snapshot)
  })

  it('fires the game hook with the post-core snapshot and the original fromVersion', () => {
    const calls: number[] = []
    const parsed = parseProjectSnapshot(v1RawDocuments(), {
      migrate: (snapshot, fromVersion) => {
        calls.push(fromVersion)
        expect(snapshot.manifest.formatVersion).toBe(2) // core migrations ran first
        return snapshot
      }
    })
    expect(calls).toEqual([1])
    expect(parsed.fromVersion).toBe(1)
  })
})
```

Run: `npx vitest run --project @automata/project tests/migrate.test.ts`
Expected: FAIL (`PROJECT_FORMAT_VERSION` is still 1; no migration registered).

- [ ] **Step 3: Bump the model**

`packages/project/src/model.ts`:
- `export const PROJECT_FORMAT_VERSION = 2 as const`
- Delete the `formatVersion: z.literal(PROJECT_FORMAT_VERSION),` line from `sceneDocumentSchema` and `resourceDocumentSchema`. The manifest keeps its line.
- Update the module doc comment's last sentence to: `The manifest is the single formatVersion authority; bumping PROJECT_FORMAT_VERSION plus a core migration in migrate.ts is the only sanctioned way to evolve this shape.`

- [ ] **Step 4: Register the 1→2 migration**

In `packages/project/src/migrate.ts`, replace the empty `CORE_MIGRATIONS`:

```ts
function stripDocFormatVersion(doc: unknown): unknown {
  if (doc === null || typeof doc !== 'object') return doc
  const { formatVersion: _dropped, ...rest } = doc as Record<string, unknown>
  return rest
}

const CORE_MIGRATIONS: ProjectMigration[] = [
  {
    // v2: the manifest is the single version authority — scene/resource
    // documents (and the bundle root) no longer carry formatVersion.
    // Every core migration must stamp its target version into the manifest.
    from: 1,
    migrate: (docs) => ({
      manifest: { ...(docs.manifest as Record<string, unknown>), formatVersion: 2 },
      scenes: docs.scenes.map(stripDocFormatVersion),
      resources: docs.resources.map(stripDocFormatVersion)
    })
  }
]
```

- [ ] **Step 5: Drop the bundle root version**

`packages/project/src/bundle.ts`: remove `formatVersion: typeof PROJECT_FORMAT_VERSION` from the `ProjectBundle` interface, remove `formatVersion: PROJECT_FORMAT_VERSION,` from `toProjectBundle`'s return object, and drop the now-unused `PROJECT_FORMAT_VERSION` import. Update the module doc comment to note the manifest carries the version.

- [ ] **Step 6: Writer sweep (compiler- and grep-enumerated)**

Run `npm run typecheck`, then `grep -rn "formatVersion" packages games tools e2e --include="*.ts" --include="*.json" | grep -v node_modules | grep -v dist | grep -v v1Project`. Fix every hit by exactly one of two patterns:

- **Manifest literals:** `formatVersion: 1` → `formatVersion: 2` (keep literals, matching existing idiom — the next bump must consciously revisit each writer).
- **Scene/resource document literals:** delete the `formatVersion: 1,` property.

Known sites (the sweep may find more in tests — same two patterns):
- `packages/project/tests/fixtures/sampleProject.ts` (manifest + 1 scene + 1 resource)
- `games/pulsebreak/src/project/template.ts` (manifest + 1 scene + 5 resources)
- `games/monkey-ball/src/project/legacyImporter.ts` (manifest at line 47, 2 resources, `importScene` return at line 89)
- `tools/scaffold/src/templates/projectData.ts` (manifest + scene + resource — generated games inherit v2 through `projectFilesFromSnapshot`)
- `packages/editor/src/ui/project/resources.ts:77` (delete the property from the `addResource` payload)
- `packages/editor-agent/src/diff.ts:56` (`sceneProperties` drops `formatVersion: scene.formatVersion,`; `manifestProperties` keeps its line)
- Test fixtures: `packages/editor/tests/fixtures/fakeProject.ts`, `packages/editor-agent/tests/fixtures/fakeProject.ts`, plus literals inside `packages/project/tests/*.test.ts`, `packages/editor/tests/**`, `tools/level-editor/tests/**`, `tools/editor-mcp-server/tests/**`, `games/*/tests/**` as enumerated.

Do NOT touch: `packages/project/tests/fixtures/v1Project.ts` (frozen), `games/*/public/project/**` JSON (Task 9), `docs/**`.

- [ ] **Step 7: Run everything**

Run: `npm run test`
Expected: PASS — including pulsebreak's `content.test.ts` and both `validate:project` paths, which still read v1 JSON from `public/project` and now succeed *through the migration* (that is the pipeline working; the files are normalized on disk in Task 9).

- [ ] **Step 8: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat(project)!: formatVersion 2 - manifest is the single version authority

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Normalize checked-in projects; full gates

**Files:**
- Modify: `games/pulsebreak/public/project/automata.project.json` + `scenes/arena.scene.json` + `resources/{tuning,enemies,waves,upgrades}.resource.json` (hand-edit)
- Regenerate: `games/monkey-ball/public/project/**` (via its build script)
- Modify: `docs/superpowers/plans/2026-07-04-project-file-migrations.md` (tick remaining checkboxes)

- [ ] **Step 1: Migrate pulsebreak's shipped project by hand**

In `games/pulsebreak/public/project/automata.project.json`: `"formatVersion": 1` → `"formatVersion": 2`.
In `scenes/arena.scene.json` and all four `resources/*.resource.json`: delete the `"formatVersion": 1,` line.

- [ ] **Step 2: Regenerate monkey-ball's shipped project**

Run: `node --import tsx games/monkey-ball/scripts/build-project.ts`
Expected: `wrote N Monkey Ball project files to .../games/monkey-ball/public/project` — the regenerated files have `"formatVersion": 2` in the manifest only. Inspect `git diff games/monkey-ball/public/project` to confirm the only changes are version-related.

- [ ] **Step 3: Validate both shipped projects**

Run: `npm run validate:project -w pulsebreak && npm run validate:project -w monkey-ball`
Expected: both print their OK line. (If a workspace lacks the script alias, run the script files directly with `node --import tsx`.)

- [ ] **Step 4: Full gates**

```bash
npm run ci
npm run coverage   # ≥ 90% branches
npm run e2e
npm run verify:new-game
```
Expected: all green. `verify:new-game` is required — Task 8 touched scaffold templates.

- [ ] **Step 5: Sweep iCloud duplicates, tick checkboxes, commit**

```bash
find . -name "* 2*" -not -path "*/node_modules/*"   # must be empty; delete any strays
git add -A
git commit -m "chore: migrate checked-in game projects to formatVersion 2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Deviations & escalation

If reality disagrees with this plan (an API changed, a test observes different behavior, a listed line number drifted), prefer the spec's *decisions* over this plan's *mechanics*, note the deviation in the task's commit message, and keep going. Escalate to the user only if a spec decision itself proves unimplementable.
