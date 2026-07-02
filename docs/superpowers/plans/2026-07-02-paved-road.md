# Paved Road Implementation Plan (M1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run new-game <name>` (or MCP `createGame`) emits a registered, playable, MCP-visible, CI-green game; one convention-driven registry replaces both hardcoded catalogs; the scaffold never edits root files.

**Spec:** `docs/superpowers/specs/2026-07-02-paved-road-scaffold-registry-design.md`

**Architecture:** Convention entry files (`src/project/editor.ts` → `loadEditorRegistration`, `src/project/index.ts` → `loadHeadlessRegistration`, both async taking `RegistrationDeps { readText }` with public-relative paths) discovered by `import.meta.glob` in the browser and a package-exports scan + dynamic import in Node, with shared catalog policy in `@automata/editor`. Ports live in each workspace's `package.json` under `automata.devPort`; Playwright derives webServers by scanning. The scaffold generates a complete pulsebreak-shaped game and is exposed over MCP via a `--workspace` server mode.

**Progress:** 0% (0/9 tasks complete)

## Global Constraints

- Strict TS from `tsconfig.base.json`; repo-wide coverage gate 90% lines + branches.
- Engine boundary: games/tools use third-party engine deps only through `@automata/engine`(`/browser`, `/data`).
- TDD for new behavior: failing test first. Refactor tasks gate on "all existing tests stay green."
- Run workspace-scoped `vitest run --project <name>` per task; `npm run ci` at each commit checkpoint.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Do not push or switch branches; work on the current branch (`paved-road`).

## Tasks

- [x] **M1.0 — Spec + plan docs.** This file and the spec; commit checkpoint.

- [x] **M1.1 — Catalog core in `@automata/editor`.**
  Create `packages/editor/src/project/catalog.ts`: `RegistrationDeps`, `EditorRegistrationLoader`, module shape-check helper (clear error naming the offending path/export), `ProjectCatalog` interface (moved from level-editor), `createProjectCatalog(registrations)` with duplicate-gameId throw naming the id. Export from `src/index.ts` + `src/headless.ts`. TDD: `packages/editor/tests/project/catalog.test.ts` (dup detection, stable order, `get` miss). Verify: editor project tests + lint. Commit.

- [x] **M1.2 — Standardized loader exports in existing games.**
  Pulsebreak: `loadEditorRegistration` (async wrapper) in `src/project/editor.ts`, `loadHeadlessRegistration` in `src/project/index.ts`. Monkey-ball: `loadEditorRegistration(deps)` delegating to `loadMonkeyBallEditorRegistration` with public-relative YAML path; new `src/project/headless.ts` holding the `parseData` + `evaluateMonkeyBallProject` closure moved out of the MCP server catalog, re-exported from `src/project/index.ts`. Tests: loaders resolve; monkey-ball headless loader with stub `readText` + fixture YAML. Verify: both games' test projects. Commit.

- [x] **M1.3 — Browser registry (level-editor).**
  Rewrite `tools/level-editor/src/projectCatalog.ts` on eager `import.meta.glob('../../../games/*/src/project/editor.ts')`; validate module exports via M1.1 helper; keep the external `createProjectCatalog({ readText })` signature so `main.ts`/`editorApp.ts` are untouched. Verify glob typing under vitest FIRST (fallback: scaffold-regenerated catalog module). Test: monkey-ball + pulsebreak listed, last-lightkeeper absent. Verify: level-editor tests, `npm run dev:editor` chooser check, editor e2e. Commit.

- [x] **M1.4 — Node registry (editor-mcp-server).**
  Rewrite `tools/editor-mcp-server/src/projectCatalog.ts`: `discoverGames(repoRoot)` (dir scan + `exports["./project"]` filter + `name === dirname` assert) and `loadProjectRegistration(gameId, repoRoot)` (dynamic import, loader shape assert, `registration.gameId === gameId` assert, Node `readText` bound to the game's `public/`). Delete `PROJECT_GAME_IDS` + duplicated YAML code; drop game deps from `tools/editor-mcp-server/package.json`. Thread `repoRoot` through `headlessHost.ts`. Tests: discovery lists exactly the two games; unknown-id error lists discovered ids; monkey-ball loads against real YAML; existing host/smoke tests green. Verify + manual `--project` run. Commit.

- [x] **M1.5 — Convention-driven root wiring.**
  `automata.devPort`: monkey-ball 5174, level-editor 5175, pulsebreak 5176, last-lightkeeper 5177; each vite.config reads its own package.json. `playwright.config.ts`: derive `webServer` from port scan; `testMatch` root `e2e/**` + `games/*/e2e/**`; `PLAYWRIGHT_ONLY=<workspace>` replaces `PLAYWRIGHT_LAST_LIGHTKEEPER`. Root package.json: `build` → `npm run build --workspaces --if-present`; portless dev delegations; `dev:game` → `dev:monkey-ball`. Delete `rootWiring.ts` + test; strip root-file writes/rollback from `write.ts`. New `tools/scaffold/tests/conventions.test.ts`: devPorts unique; every `games/*/src/project/editor.ts` has a `"./editor"` export. Verify: `npm run build`, `npm run e2e`, `npm run ci`; update AGENTS.md commands. Commit.

- [ ] **M1.6 — Scaffold template rewrite.**
  New `tools/scaffold/src/templates/` string modules + `projectData.ts` (typed against `@automata/project`; injected into both generated `template.ts` and `public/project/*.json`). Generated game mirrors pulsebreak: beacon-runner sim + `seekGoal`, `gameplay.ts` shared by boot and preview, project definition (one `spawn-point` component with point gizmo, one singleton `tuning` resource, validate = exactly one spawn point), compiler, evaluation (headless run, normalized metrics), editor + headless loaders, `load.ts`, thin `main.ts`, regen + validate scripts, generated tests (sim determinism/win/loss, definition, content round-trip, editor loader + preview via `createNullRenderer()`), `e2e/smoke.spec.ts`, agent-oriented README, `package.json` with exports map + auto-assigned `automata.devPort` (max existing + 1). `planNewGame(name, { port?, existingPorts })`; `write.ts` scans existing ports, keeps `assertMissing`/rollback (game dir only). Integration test: generated `public/project` round-trips through `loadProjectFiles` + `projectSnapshotSchema`. Verify: scaffold tests, `npm run ci`. Commit.

- [ ] **M1.7 — `createGame` over MCP.**
  `packages/contracts/src/workspaceTools.ts`: `workspaceToolArgSchemas` (`createGame {name: slug, port?}`, `listGames {}`), `workspaceToolDefs()`, `parseWorkspaceToolArgs()`. Rename scaffold package → `@automata/scaffold` with exports map (root `new-game` script path unchanged). `tools/editor-mcp-server`: `--workspace <repoRoot>` mode (exclusive with `--project`/`--bundle`); new `src/workspaceHost.ts` over `@automata/scaffold` + M1.4 discovery; `createGame` returns `{ gameDir, devPort, nextSteps }`; loosen `createMcpServer`/`mcpAdapter` host param to a structural type. Tests: contracts schemas (slug rejection, JSON-schema emission); workspaceHost with injected in-memory FS; server lists workspace tools in workspace mode. Verify + manual stdio call. Commit.

- [ ] **M1.8 — End-to-end proof + docs.**
  `tools/scaffold/scripts/verify-new-game.ts` + root `verify:new-game`: `git clone --local . <tmp>` → scaffold `probe-game` → `npm install` → `npm run ci` → `npm run build -w probe-game` → spawn MCP server `--project games/probe-game/public/project`, assert ready line → `PLAYWRIGHT_ONLY=probe-game` e2e smoke. Update AGENTS.md (registry convention, commands) + root README. Run full M1 acceptance. Commit.
