# Paved road: registered-game scaffold + convention registry

Status: approved design. Date: 2026-07-02.

## Motivation

The north star for AutomataEngine is that an agent (Claude Code via MCP) can
build a new game from a description. The current "new game" path works against
that goal:

- `npm run new-game` emits an empty shell — no sim, no project definition, no
  editor registration, no tests.
- Game registration is hand-wired in two separate catalogs
  (`tools/level-editor/src/projectCatalog.ts`,
  `tools/editor-mcp-server/src/projectCatalog.ts`) that duplicate the
  monkey-ball YAML special case with different loading code.
- Root wiring (`package.json` scripts, `playwright.config.ts` webServer) is
  done by string surgery from `tools/scaffold/src/rootWiring.ts`.

The cost of this road is measurable: the third game, LAST LIGHTKEEPER, shipped
entirely outside the project/editor/MCP system. Agents amplify whatever the
road is; this effort paves it.

## Goals

- `npm run new-game <name>` (or the MCP `createGame` tool) emits a game that
  is **registered, playable, MCP-visible, and CI-green** with zero hand-edited
  files outside `games/<name>/`.
- One convention-driven registry replaces both hardcoded catalogs: a game
  participates by exposing standard loader exports, discovered automatically.
- Root dev/build/e2e wiring derives from workspace conventions; the scaffold
  never edits root files.
- The scaffold is exposed over MCP (`createGame`, `listGames`) so agents can
  start a game without shell access.
- All existing gates stay green: `npm run ci`, `npm run coverage` (90%),
  `npm run build`, `npm run e2e`.

## Non-goals

- No schema-language change (zod unification is phase P2).
- No project-format migrations (P3), game-kit extraction (P4), MCP session
  tools like `openProject` (P5), or LAST LIGHTKEEPER retrofit (P7).
- `createGame` takes a name only; description-driven generation is the agent's
  job on top of the skeleton.
- No in-server `npm install`; the tool result tells the client what to run.

## Design

### D1 — Registry: convention entry files + async loaders

A game participates in the registry iff it exposes:

- `games/<name>/src/project/editor.ts` →
  `export const loadEditorRegistration: (deps: RegistrationDeps) =>
  Promise<EditorProjectRegistration<unknown>>` — browser-safe; prefabs and
  preview; may import `@automata/engine/browser`.
- `games/<name>/src/project/index.ts` (the `<name>/project` package export) →
  `export const loadHeadlessRegistration: (deps: RegistrationDeps) =>
  Promise<EditorProjectRegistration<unknown>>` — Node-safe; no preview.
- `RegistrationDeps = { readText(path: string): Promise<string> }` with paths
  relative to the game's `public/` directory. The browser consumer supplies
  `fetch('/' + path)`; the Node consumer supplies
  `readFile(games/<id>/public/<path>)`.

Loaders are async everywhere so monkey-ball's YAML archetype registration
becomes a plain loader (`deps.readText('data/archetypes/standard.yaml')`)
instead of a special case duplicated across two tools. Sync games resolve
immediately.

Discovery is consumer-specific; policy is shared:

- **Browser** (`tools/level-editor`): eager
  `import.meta.glob('../../../games/*/src/project/editor.ts')`. No generated
  files; a new game appears on rebuild.
- **Node** (`tools/editor-mcp-server`): readdir `games/`, accept directories
  whose `package.json` has `exports["./project"]` and
  `name === dirname === gameId`, then `await import('<name>/project')` so
  package-exports encapsulation is respected through workspace symlinks.
- **Shared core** (`packages/editor/src/project/catalog.ts`, exported from
  both `.` and `./headless`): loader types, module shape checks with clear
  errors, `createProjectCatalog(registrations)` with duplicate-gameId throw.

`gameId === package name === directory name` becomes a load-bearing,
test-enforced convention. Both registered games already comply.

### D2 — Root wiring: no string surgery, ever

- Each game/tool declares `"automata": { "devPort": N }` in its own
  `package.json`; its `vite.config.ts` reads its own package.json and sets
  `server: { host, port, strictPort }`.
- `playwright.config.ts` derives `webServer` by scanning `games/*` and
  `tools/*` package.json at config-load time; `testMatch` covers root `e2e/**`
  plus `games/*/e2e/**`; `PLAYWRIGHT_ONLY=<workspace>` filters servers
  (replaces `PLAYWRIGHT_LAST_LIGHTKEEPER`).
- Root `build` becomes `npm run build --workspaces --if-present`; dev scripts
  are portless delegations; `dev:game` is renamed `dev:monkey-ball`.
- `tools/scaffold/src/rootWiring.ts` is deleted; the scaffold writes only
  inside `games/<name>/`.

### D3 — Scaffold as MCP tool: `--workspace` mode

`automata-editor-mcp` gains `--workspace <repoRoot>` (mutually exclusive with
`--project`/`--bundle`) exposing `createGame` and `listGames`. Tool arg
schemas live in `@automata/contracts` (`workspaceTools.ts`), following the
same derive-don't-duplicate pattern as `toolArgSchemas`. The scaffold package
is renamed `@automata/scaffold` and consumed as a library. `createGame`
returns `{ gameDir, devPort, nextSteps }` — the freshly written game is not
importable until `npm install` links it, and results must say so.

### D4 — Template parity by construction

The scaffold defines the default authored project data once
(`tools/scaffold/src/templates/projectData.ts`, typed against
`@automata/project`) and injects it into both the generated
`src/project/template.ts` and the generated `public/project/*.json`. A
generated content test (pulsebreak's pattern) keeps them equal afterward.

### The generated game

Mirrors pulsebreak's registration shape, minimal: a deterministic "beacon
runner" sim (`step(control, dt)` moves toward `tuning.goal`, clamped arena,
succeed within `goalRadius`, fail past `timeLimitS`) plus a `seekGoal`
scripted control for headless evaluation; `src/game/gameplay.ts` wiring shared
by browser boot and editor preview; a project definition with one
`<name>.spawn-point` component (point gizmo) and one singleton
`<name>.tuning` resource; compiled `public/project` JSON; regen scripts;
generated tests passing untouched at the 90% gate; an e2e smoke inside the
game dir; an agent-oriented README.

## Acceptance criterion

From a clean checkout: `npm run new-game foo && npm install` (or MCP
`createGame`) →

1. `foo` appears in the level-editor chooser,
2. `automata-editor-mcp --project games/foo/public/project` serves tools,
3. `npm run ci` passes (lint boundaries, typecheck, tests, 90% coverage) with
   the new game included,
4. `npm run dev -w foo` serves a playable page,
5. zero files outside `games/foo/` were edited.

Proven by `npm run verify:new-game` (local clone → scaffold `probe-game` →
install → ci → build → MCP ready-line → `PLAYWRIGHT_ONLY=probe-game` smoke).
Pre-merge/nightly, not part of `npm run ci`.

## Risks

- `import.meta.glob` with `../` patterns: supported by Vite, but eager-glob
  typing under vitest must be verified early; fallback is a
  scaffold-regenerated catalog module (still no user-file splicing).
- Eager glob compiles every game into the level-editor bundle — fine at 2–3
  games; go lazy + light manifest when it hurts.
- 90% coverage on generated code: `verify:new-game` must be re-run whenever
  engine/project APIs move — the recurring cost of string templates.
- P2 (zod) will invalidate only the schema-DSL literal inside the generated
  `definition.ts`; everything else in M1 is schema-agnostic by design.
