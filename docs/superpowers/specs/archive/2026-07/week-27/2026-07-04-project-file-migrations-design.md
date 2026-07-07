# Project-File Migrations (P3) — Design

Status: awaiting user review. The user was away during brainstorming, so the
four roadmap open questions were settled by documented recommendation rather
than dialogue; every decision below is revisable at this review gate.

## Problem

`formatVersion` is a bare `z.literal(1)` stamped into four document kinds
(manifest, every scene, every resource, bundle root). There is no way to
evolve the on-disk format: any change strands every existing project. Parsing
is also split across four paths that would each need migration logic:

1. `loadProjectFiles` (`packages/project/src/files.ts`) — folder loads:
   editor fileSystem/memory storage `open()`, MCP `--project` mode, both
   games' runtime boot, validate-project scripts.
2. `parseProjectBundle` (`packages/project/src/bundle.ts`) — editor bundle
   import, MCP `--bundle` mode.
3. Editor autosave (`packages/editor/src/project/storage/autosave.ts`) — a
   shadow versioning scheme: ad-hoc `{ version: 1, snapshot }` envelope,
   parses `projectSnapshotSchema` directly, silently discards on mismatch.
4. Writers that hardcode `formatVersion: 1` — game templates, scaffold
   `projectData.ts`, editor `resources.ts`, monkey-ball `legacyImporter.ts`.

## Goals

- One central parse entry every load path funnels through, with an ordered
  core migration pipeline in front of validation.
- An optional per-game `migrate(snapshot, fromVersion)` hook on
  `GameProjectDefinition`.
- A real formatVersion 2 so the pipeline ships carrying a real migration
  (roadmap: "don't build a pipeline with no real migration to carry").
- Precise failure behavior for unknown/future versions.

Non-goals: rewriting files on disk at load time; a migration CLI; per-game
independent data versioning (see Rejected alternatives).

## Decisions (the four roadmap open questions)

### D1 — What motivates formatVersion 2: single version authority

v2 makes the **manifest the only carrier of `formatVersion`**. Scene
documents, resource documents, and the bundle root all drop their copies.

- Kills the representable mixed-version state space (a v1 manifest pointing
  at a v2 scene is impossible to write down).
- Simplifies every writer: templates, scaffold, editor document creation stop
  stamping per-doc literals.
- The 1→2 migration (strip `formatVersion` from scene/resource docs) is a
  real structural transform the pipeline carries forever, and it exercises
  every parse path.
- Trade-off accepted: a scene file detached from its manifest is no longer
  self-describing. Detached files are already meaningless — paths and ids are
  manifest-declared and cross-checked.
- Torn folders degrade gracefully: a v2 manifest with stale v1 scene files
  parses, because `z.object` strips the leftover `formatVersion` key; the
  next save rewrites the files clean.

### D2 — Where the pipeline lives: `packages/project/src/migrate.ts`

New module in `@automata/project` (exported from `index.ts`), beside
`model.ts` — the schemas it fronts.

```ts
/** Pre-validation shape every load source normalizes into. */
export interface RawProjectDocuments {
  manifest: unknown
  scenes: unknown[]
  resources: unknown[]
}

/** One core migration step; `from` N transforms to N+1. */
interface ProjectMigration {
  from: number
  migrate(docs: RawProjectDocuments): RawProjectDocuments
}

/** The per-game hook shape (same as `GameProjectDefinition.migrate`). */
export type GameMigrateHook = (snapshot: ProjectSnapshot, fromVersion: number) => ProjectSnapshot

export interface ParsedProject {
  snapshot: ProjectSnapshot
  /** formatVersion the documents were read at (≤ PROJECT_FORMAT_VERSION). */
  fromVersion: number
}

export function parseProjectSnapshot(
  raw: RawProjectDocuments,
  opts?: { migrate?: GameMigrateHook }
): ParsedProject

/** For callers that learn the game definition after parsing (editor). */
export function applyGameMigration(
  parsed: ParsedProject,
  migrate: GameMigrateHook
): ProjectSnapshot
```

`parseProjectSnapshot` steps, in order:

1. **Version detection.** Read `formatVersion` from the raw manifest. Missing
   or not a positive integer → error (`not a versioned Automata project`).
2. **Future version.** `> PROJECT_FORMAT_VERSION` → error naming both
   versions and saying the engine is too old.
3. **Core migrations.** Run the ordered chain `fromVersion → current` over
   the raw documents. The registry is a contiguous array asserted at module
   init (a gap 1→current is a programmer error caught by test + init check).
4. **Structural parse.** zod-parse manifest, scenes, resources against the
   current schemas.
5. **Cross-checks.** Docs keyed by id must exactly match manifest entries:
   every manifest scene/resource entry has a doc with that id (resources also
   matching `typeId`), no unreferenced docs, no duplicate ids. This moves the
   checks that today live only in `loadProjectFiles` into the shared entry —
   bundles gain them (today `parseProjectBundle` never cross-checks, and
   duplicate ids silently last-win through `Object.fromEntries`).
6. **Game hook** (when provided and `fromVersion < PROJECT_FORMAT_VERSION`) —
   see D3.
7. Assemble and return `ParsedProject`.

“Never silently repairs” is preserved: migrations are explicit version-keyed
transforms; everything else still fails loudly.

### D3 — Per-game hook: after core migrations, on the typed snapshot

```ts
// on GameProjectDefinition<Compiled>
/** Upgrade game-owned data payloads written at an older formatVersion. */
migrate?: (snapshot: ProjectSnapshot, fromVersion: number) => ProjectSnapshot
```

- Runs **after** core migrations and structural parse: the hook always
  receives a structurally-current `ProjectSnapshot` plus the version the
  files were actually at. Games only reason about their own `data` payloads
  (which are `z.unknown()` at the persisted layer, so structural parse never
  blocks old game data).
- Only invoked when `fromVersion < PROJECT_FORMAT_VERSION`.
- Output is re-parsed through `projectSnapshotSchema`, and
  `manifest.gameId` must be unchanged — a buggy hook cannot smuggle
  malformed structure or rebadge a project.
- Callers that know the definition up front (games' `load.ts`, MCP host)
  pass the hook into `parseProjectSnapshot`. The editor resolves the
  registration *from* the parsed manifest, so it applies
  `applyGameMigration` afterwards; both routes share one implementation.
  (`RegisteredEditorProject` already exposes `project`, so the editor
  reaches `registration.project.migrate` without new surface.)
- No game needs the hook today; it ships exercised by test fixtures only.
  The scaffold does not stamp a no-op hook.

### D4 — Unknown/future versions: fail loudly, with one exception

- Missing/non-integer version → error; future version → "update the engine"
  error (step 1–2 above). Plain `Error` with a precise message, matching the
  codebase's existing error idiom.
- Version 1..current always migrates: core migrations are kept forever.
- **Exception — autosave:** `loadProjectAutosave` keeps its
  return-`null`-on-any-failure semantics. Autosave is a crash-recovery
  cache; a stale/foreign autosave should silently yield to the real project
  files, not block opening.

## Path unification

**`loadProjectFiles(reader)`** reads the manifest *leniently* first (extract
`scenes[].path` / `resources[].path` entries from raw JSON, unsafe-path
checks unchanged), reads every referenced file, assembles
`RawProjectDocuments`, and delegates to `parseProjectSnapshot`. Constraint
this imposes on future migrations: the manifest's path-index shape
(`scenes[].path`, `resources[].path`) must stay readable pre-migration, or
the loader grows version awareness. Acceptable at this scale.

**`parseProjectBundle(text)`** becomes `JSON.parse` → shape-check
(`manifest` object, `scenes`/`resources` arrays) → `parseProjectSnapshot`.
The `ProjectBundle` type and `toProjectBundle` drop the root
`formatVersion`; version detection reads the manifest inside (v1 bundles'
root copy is simply ignored, then stripped by nature of re-serialization).

**Autosave** drops the `{ version, snapshot }` envelope and
`PROJECT_AUTOSAVE_VERSION`. Writes become canonical bundle text
(`stringifyProjectBundle(toProjectBundle(snapshot))`); reads become
`parseProjectBundle` in a try/catch → `null`. Old-envelope autosaves fail
parse → `null`, the same user-visible outcome as today's version-mismatch
discard — but future old-format autosaves *migrate* instead of being
discarded, strictly better than the status quo.

**Return types.** `loadProjectFiles`, `parseProjectBundle`,
`ProjectStoragePort.open()`, and `ProjectStoragePort.importBundle()` all
return `ParsedProject` instead of a bare snapshot, so hosts can see
`fromVersion`. Mechanical ripple: three storage adapters, editorApp/
browserWorkspace, headlessHost, games' `load.ts`, validate scripts, tests.

## Write-back policy

Migration is in-memory only; loading never writes.

- **Editor:** when `fromVersion < PROJECT_FORMAT_VERSION`, the session opens
  with the store's `dirtyPaths` seeded with every document path (from
  `projectFileDocuments(snapshot)`), so the first explicit save actually
  writes every file in the current format. The existing `initiallyDirty`
  boolean is not enough — it only drives the unsaved-changes prompt, not
  which paths `save()` writes. For v1→v2 "all paths" is also exact — every
  file changes.
- **Read-only consumers** (game runtime boot, MCP server, validate scripts):
  never write; they just get a current-shape snapshot.
- **Writers** (templates, scaffold, editor doc creation) author v2 directly.

## Concrete v2 change list

- `model.ts`: `PROJECT_FORMAT_VERSION = 2`; scene/resource schemas drop
  `formatVersion`; manifest keeps `z.literal(PROJECT_FORMAT_VERSION)`.
- `migrate.ts`: migration `{ from: 1 }` strips `formatVersion` from raw
  scene/resource docs (tolerating absence).
- `bundle.ts`: `ProjectBundle` loses root `formatVersion`.
- Writers updated: `games/pulsebreak/src/project/template.ts`, monkey-ball
  template + `legacyImporter.ts`, `tools/scaffold/src/templates/projectData.ts`,
  `packages/editor/src/ui/project/resources.ts` (and any other doc-creation
  sites found by `grep formatVersion` — scene creation, tests' fixtures).
- `packages/editor-agent/src/diff.ts`: `sceneProperties` drops
  `formatVersion`; manifest diff keeps it.
- Checked-in `games/*/public/project/**` migrate to v2 on disk (regenerated,
  hand-checked). Canonical **v1 fixtures live in
  `packages/project/tests/fixtures/`** and pin the 1→2 migration forever.

## Implementation order

1. **Unify at v1 (pure refactor):** introduce `migrate.ts` with an empty
   migration chain + `parseProjectSnapshot`; reroute files/bundle/autosave;
   flip return types to `ParsedProject`; all gates green with zero behavior
   change except the documented strengthenings (bundle cross-checks,
   duplicate-id rejection).
2. **Add the game hook** (`migrate?` on `GameProjectDefinition`,
   `applyGameMigration`, editor wiring + dirty-marking), fixture-tested.
3. **Ship v2:** add the 1→2 migration, bump the constant, update writers and
   checked-in projects, pin v1 fixtures.

Each step is a commit checkpoint with `npm run ci`; step 3 also
`npm run verify:new-game` (scaffold templates change) and `npm run e2e`.

## Testing

- `packages/project/tests/migrate.test.ts`: version detection (missing,
  non-integer, future), chain contiguity assertion, 1→2 strip on all doc
  kinds, cross-check failures (id mismatch, typeId mismatch, duplicate,
  unreferenced doc), hook ordering (receives post-core snapshot + original
  `fromVersion`), hook skipped at current version, hook output re-validated,
  gameId-rebadge rejection.
- files/bundle tests: v1 fixture folder and v1 bundle load to identical v2
  snapshots; `ParsedProject.fromVersion` reported correctly.
- autosave tests: new-format round-trip; old envelope → `null`; garbage →
  `null`; future-version autosave → `null` (not a thrown error).
- editor storage/app tests: opening a v1 project marks all paths dirty and
  the next save writes v2 (memory adapter); import of a v1 bundle marks
  dirty.
- Gates: `npm run ci` (≥90% branch coverage), `npm run e2e`,
  `npm run verify:new-game`.

## Rejected alternatives

- **Per-document versioned zod schemas** (discriminated union across
  versions, typed v1→v2 transforms): more per-step type safety, but N
  document kinds × M versions of schema maintenance, and it cannot express
  migrations that span documents (exactly what v2 is). Raw-level snapshot
  migration matches how real migrations behave.
- **Migrate-on-write CLI / codemod** (parsers stay strict-current, a command
  rewrites folders): breaks "open an old project and it just works" — the
  browser editor can't write before the user grants File System access, and
  the MCP server and game runtime can't write at all.
- **Per-game `dataVersion` in the manifest** (hook keys on game-owned
  version, decoupled from core bumps): no game has a pending data migration,
  so it would ship speculative. Limitation accepted and documented: a
  per-game data migration can only trigger alongside a core `formatVersion`
  bump. When a real need appears, adding `manifest.dataVersion` *is* that
  bump's migration, and the hook signature already carries `fromVersion`.
- **Pipeline with no v2** ("build it, motivate it later"): explicitly warned
  against by the roadmap; the machinery would ship exercised only by
  synthetic fixtures.
