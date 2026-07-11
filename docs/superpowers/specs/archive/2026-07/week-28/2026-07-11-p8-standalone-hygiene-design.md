# Standalone Hygiene (P8) — Design

Status: approved in discussion; awaiting written-spec review. Date: 2026-07-11.

Roadmap placement: this is the standalone **P8 — Hygiene** item of the
[Autonomous Game Factory](../../../archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md).
Live status and sequencing live in [`docs/ROADMAP.md`](/docs/ROADMAP.md) (see the
`P8 — Hygiene` entry under §4 Cross-cutting and standalone).

## Problem

Three unrelated pieces of cruft were parked under P8. Investigation reduced them
to two code cleanups plus one already-resolved environment item:

1. **Monkey Ball's legacy ingestion seam is still alive.**
   `importLegacyMonkeyBallProject` converts the pre-project bespoke format
   (`config/physics.toml`, `levels/*.json`, `levels/worlds.json`) into a canonical
   `ProjectSnapshot`. Post-P3 the canonical `public/project` tree is the runtime
   source of truth — the `runtimeParity` test already guards that no production
   request path reads legacy data — yet the importer, its `legacyTypes` parsers,
   and the quarantined `tests/fixtures/legacy/**` tree persist because four things
   still reach for them: the manual `scripts/build-project.ts` generator,
   `createMonkeyBallTemplate()`, the level-editor's pre-P3 autosave recovery, and
   ~20 tests that source `Level`/`PhysicsTuning` data through the legacy parsers.

2. **The multi-game level editor is pinned to one game's assets.**
   `tools/level-editor/vite.config.ts` hardcodes
   `publicDir: '../../games/monkey-ball/public'`, so the dev server serves exactly
   one game's `public` at `/`. The editor discovers *every* registered game via
   glob and hands each registration a **flat** `readText('/' + path)`, so any
   other game's code-owned public read (e.g. pulsebreak archetypes) collides with
   monkey-ball's folder or 404s. One game is privileged; the rest are broken for
   fetch-based loads.

3. **iCloud `" 2"` duplicates — already resolved.** The repo previously lived on
   an iCloud-synced Desktop path that periodically spawned duplicate `"<name> 2"`
   files. It now lives at `/Users/mcthaydt/dev/AutomataEngine` (a real path, not a
   symlink, not under iCloud), and the tree currently holds zero `" 2"` artifacts.
   The "real fix" (move off the synced path) already happened, so this item is
   **moot** and carries no code work — only a roadmap status correction.

## Goal

Retire the dead legacy ingestion path and de-privilege the level editor, leaving
the codebase reading canonical data everywhere. **Done when:**

1. `importLegacyMonkeyBallProject`, `parseLegacyMonkeyBallLevel`, and
   `legacyTypes` no longer exist; Monkey Ball builds, templates, and tests from
   canonical project data only.
2. The level editor serves each registered game's project assets under its own
   game-scoped path, with no hardcoded single-game `publicDir`; both Monkey Ball
   and Pulsebreak load through it.
3. `npm run ci` is green (plus `npm run coverage` for the engine-adjacent test
   re-sourcing), and the ROADMAP reflects the iCloud item as moot and P8 as
   shipped.

The two workstreams are independent and independently revertible; they may land
as separate commits (or separate PRs) in either order.

## Design decisions

Three forks were settled during brainstorming.

1. **iCloud item → moot.** The move off the synced path already happened;
   P8 records it as resolved rather than reopening it. No guard script is added —
   the periodic-sweep habit stays a pre-commit convention, not new tooling.
2. **Retire the importer fully (drop autosave recovery).** The pre-P3
   `monkey-ball-editor` localStorage autosave recovery is the *only* remaining
   runtime consumer that genuinely needs legacy→snapshot conversion. Keeping it
   would keep the importer alive; the roadmap's stated intent is that "the
   importer, `legacyTypes`, and the quarantined legacy fixtures can be deleted."
   The format is days old on a single-developer project, and folder/bundle import
   remains the recovery path for any stray copy. So the recovery feature is
   **dropped**, unblocking full deletion.
3. **Editor decoupling → game-scoped dev middleware.** `publicDir: false` plus a
   `configureServer` middleware that maps `/games/<id>/public/<path>` to disk, and
   per-registration `readText` scoped to each game's id. No game is privileged and
   the editor's `dist` no longer copies example assets — chosen over repointing
   `publicDir` to the `games/` root (which bloats the build by copying every
   game's public) and over dropping fetch-based loading (which loses shipped-example
   opens and `?project=` deep-links).

## Workstream A — Retire Monkey Ball's `legacyImporter`

The legacy path is the pre-project ingestion seam. Retiring it proceeds in three
parts, in order, so that each intermediate state still passes `npm run ci`.

### A1. Rebuild the template directly

`games/monkey-ball/src/project/template.ts` currently builds its `ProjectSnapshot`
by calling `importLegacyMonkeyBallProject({ tuning, manifest, levels })` on inline
`DEFAULT_*` legacy structures. Rewrite `createMonkeyBallTemplate()` to construct
the canonical `ProjectSnapshot` **directly** as an object literal (manifest +
scenes + resources), mirroring the sibling pattern already used by
`games/pulsebreak/src/project/template.ts`'s `createPulsebreakTemplate()`.

- The returned snapshot's shape is unchanged, so `definition.ts` is untouched: it
  keeps calling `createMonkeyBallTemplate()` for `createTemplate` and for the
  physics/worlds resource `defaultData` (`.resources.physics!.data`,
  `.resources.worlds!.data`).
- After this step, `template.ts` no longer imports `./legacyImporter`.

**Verification for A1:** existing editor/template tests that exercise
`createTemplate` / `defaultData` stay green; the template snapshot still validates
through the canonical parse path.

### A2. Drop the pre-P3 autosave recovery

Delete the level-editor's legacy-recovery feature — the sole remaining runtime
importer consumer:

- Delete `tools/level-editor/src/legacyAutosave.ts` and
  `tools/level-editor/tests/legacyAutosave.test.ts`.
- Remove the `legacyRecovery` wiring in `tools/level-editor/src/main.ts` (the
  `loadLegacyMonkeyBallAutosave(window.localStorage)` call and the value threaded
  into `mountEditorApp`).
- Remove the `legacyRecovery` option and its handling in
  `tools/level-editor/src/editorApp.ts` (the `LegacyMonkeyBallRecovery` type/import,
  the option field, and the `[data-recover-legacy]` recovery branch), plus the
  recovery-UI assertion in `tools/level-editor/tests/editorApp.test.ts`.

After A2, no source outside `legacyImporter.ts` itself references
`importLegacyMonkeyBallProject` or `parseLegacyMonkeyBallLevel` except the tests
handled in A3 and the barrel export removed in A3.

### A3. Re-source the tests, then delete the legacy code

This is the bulk of the work. `legacyTypes.ts` **re-exports** the canonical types
(`Level`, `PhysicsTuning`, `WorldsManifest`) that already live in
`games/monkey-ball/src/project/types.ts`, and adds the legacy *parsers*
(`levelKind`, `worldsManifestKind`, `physicsTuningKind`, `toPhysicsTuning`,
`levelSchema`, `worldsManifestSchema`) that read the old TOML/JSON fixtures. The
~20 test files split into two categories:

- **Type-only imports** (`Level`, `PhysicsTuning`, `WorldsManifest` used purely as
  TypeScript types): repoint the import from `../../src/project/legacyTypes` to
  `../../src/project/types`. Zero behavior change. Affected files include
  `tests/ui/levelSelect.test.ts`, `tests/content/levels.test.ts`,
  `tests/state/progress.test.ts`, `tests/state/unlocks.test.ts`,
  `tests/systems/tiltControl.test.ts`, `tests/systems/fallOff.test.ts`,
  `tests/systems/timer.test.ts`, and the type-only imports within the gameplay
  tests.

- **Legacy-parser imports** (`levelKind`, `physicsTuningKind`, `toPhysicsTuning`,
  `worldsManifestKind` used to `parseData(kind, legacyFixture)` and *get*
  `Level`/`PhysicsTuning` data for genuine gameplay/tilt/falloff/timer/seek-goal/
  headless assertions): these are real behavioral tests that merely *source* their
  input through the legacy parser today. Re-source them onto canonical data:
  - Add a focused test helper `games/monkey-ball/tests/helpers/project.ts` that
    loads `public/project` once via `loadMonkeyBallProject` (the canonical loader)
    and exposes the resulting `levels`, `tuning`, and `manifest`. This yields the
    same shipped content the tests read today, via the canonical path instead of
    the legacy parser.
  - Where a test only needs "a level" rather than a specific shipped one, use a
    small inline typed `Level`/`PhysicsTuning` literal (the same shape
    `template.ts` uses for its default level) instead of a fixture round-trip.
  - Update `games/monkey-ball/tests/helpers/data.ts` to drop its
    `legacyDataRoot` (`tests/fixtures/legacy`) branch; keep the `runtimeDataRoot`
    archetypes branch.

  Coverage is preserved — only the *source* of the level/physics data changes.

- **Delete the now-dead legacy code and its pure-legacy tests:**
  - `games/monkey-ball/src/project/legacyImporter.ts`
  - `games/monkey-ball/src/project/legacyTypes.ts`
  - `games/monkey-ball/scripts/build-project.ts` (a manual generator wired to no
    npm script or CI job; moot once canonical `public/project` is authoritative)
  - `games/monkey-ball/tests/fixtures/legacy/**` (`config/physics.toml`,
    `levels/*.json`, `levels/worlds.json`)
  - The barrel re-exports of `importLegacyMonkeyBallProject` and
    `parseLegacyMonkeyBallLevel` in `games/monkey-ball/src/project/index.ts`
  - The `LegacyMonkeyBallProjectInput` type in
    `games/monkey-ball/src/project/types.ts` (input type for the deleted seam)
  - The pure-legacy tests: `tests/project/legacyImporter.test.ts`, the legacy
    round-trip in `tests/project/compiler.test.ts`, and the legacy-parity case in
    `tests/project/content.test.ts` (retain any canonical assertions in those two
    files; delete only the legacy-fixture-driven cases).

**Done when (Workstream A):** Monkey Ball builds, templates, and tests from
canonical project data only; `importLegacyMonkeyBallProject`,
`parseLegacyMonkeyBallLevel`, and `legacyTypes` no longer exist; `npm run ci` and
`npm run coverage` are green.

## Workstream B — Decouple the level editor from one game's `publicDir`

The editor's dev server must serve each registered game's project assets under its
own path, and each game's registration must read only its own public tree.

### B1. Game-scoped dev-server middleware

In `tools/level-editor/vite.config.ts`:

- Set `publicDir: false` (stop copying/serving a single game's public at `/`, and
  keep example assets out of the editor's production `dist`).
- Add a `configureServer(server)` hook whose middleware maps request paths of the
  form `/games/<id>/public/<path>` to the on-disk file
  `<repoRoot>/games/<id>/public/<path>`, returning the file contents (404 on
  miss). The mapping is generic — it privileges no game and needs no per-game
  entry. Resolve `<repoRoot>` relative to the config file's URL, consistent with
  how the config already reads its own `package.json`.

### B2. Scope each registration's `readText` to its game id

In `tools/level-editor/src/projectCatalog.ts`, replace the shared flat reader
(`readText(`/${path}`)`) with a per-registration reader scoped to that
registration's game id: `readText(`/games/${gameId}/public/${path}`)`. The game id
is available from the discovered registration (the glob key
`../../../games/<id>/src/project/editor.ts` and/or the registration's own id).
Each game now reads only its own public tree, matching the middleware's URL
contract.

- Preserve the existing entry points: New Project (in-memory template), Open
  Folder (File System Access), Import Bundle (uploaded file), and the
  `?game=`/`?project=` deep-links — they now resolve per game.
- `tools/level-editor/src/main.ts` continues to pass `fetchTextViaFetch()` as the
  underlying browser reader; only the path construction in `projectCatalog.ts`
  changes.

**Done when (Workstream B):** no hardcoded single-game `publicDir`; the dev server
serves `/games/<id>/public/...` for every registered game; opening a project for
both Monkey Ball and Pulsebreak works.

## Testing & verification

- **Workstream A:**
  - The re-sourced gameplay/tilt/falloff/timer/seek-goal/headless tests keep
    passing (behavior unchanged; data now canonical).
  - `runtimeParity` stays green (still no production request path for legacy data).
  - Add a small guard test asserting the project barrel no longer exports
    `importLegacyMonkeyBallProject` / `parseLegacyMonkeyBallLevel`, extending the
    intent of the existing runtime-parity guard so the legacy surface cannot creep
    back.
  - `npm run ci` and `npm run coverage`.
- **Workstream B:**
  - `tools/level-editor/tests/boundaries.test.ts` ("no legacy or game-specific
    source dependencies") stays green — the middleware and catalog scoping are
    game-agnostic.
  - Add a catalog test asserting a non-Monkey-Ball registration's `readText`
    resolves to its own `/games/<id>/public/...` prefix (no monkey-ball pinning).
  - `npm run dev:editor` smoke: create/open a project for **both** Monkey Ball and
    Pulsebreak and confirm assets resolve.
- Sweep for iCloud `" 2"` duplicates before each commit (habit; the repo is off
  the synced path but the convention stays until the memory is retired).

## Roadmap updates (part of the exit)

- In `docs/ROADMAP.md` §4, mark the iCloud `" 2"` duplicates item **Moot/done**
  with a one-line note that the repo now lives off the synced path
  (`/Users/mcthaydt/dev/AutomataEngine`) with no duplicates present.
- On completion, move P8 to **Shipped** (section 1 and the §2 numbering table),
  with links to this spec and the implementation plan, per the roadmap's own
  upkeep discipline.

## Out of scope

- Any change to the canonical `public/project` content or the compiler/loader
  behavior — the runtime path already reads canonical data and is not touched.
- Adding duplicate-sweep tooling or a pre-commit guard for iCloud artifacts (the
  root cause is already fixed by the repo move).
- Reworking the level editor's authoring UI, workspace, or File System Access /
  bundle flows beyond the asset-serving decoupling.
- Pulsebreak-specific or scaffold-template changes beyond what the editor
  decoupling requires.
