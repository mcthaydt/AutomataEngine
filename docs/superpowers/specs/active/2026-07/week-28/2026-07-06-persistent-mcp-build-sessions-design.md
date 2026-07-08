# Persistent MCP Build Sessions (P5) — Design

Status: approved in discussion; awaiting written-spec review. Date: 2026-07-06.

Roadmap placement: this is **Phase 1 / P5** of the
[Autonomous Game Factory](../../../archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md).
Live status and sequencing live in [`docs/ROADMAP.md`](/docs/ROADMAP.md).

## Scope

P5 is scoped to **durable build sessions only** — the first of the factory
design's two cross-cutting spines. The second spine (the seeded-generation/replay
harness and the pack-composition runtime seam) is **deferred**: the harness moves
to Phase 2, where GameSpec generation is its first consumer, and the composition
seam to Phase 3, where the vertical slice's single pack is its first consumer.
Both were speculative here, ahead of the artifacts they attach to. This deferral
is recorded in `docs/ROADMAP.md`.

## Problem

The editor MCP server (`tools/editor-mcp-server`) has two disjoint modes chosen
at process startup:

- `--workspace <repoRoot>` exposes `createGame` / `listGames`. It never opens a
  project; after scaffolding, the client is told to **restart** the server with
  `--project …` to author the game.
- `--project <dir>` / `--bundle <file>` opens exactly one project into an
  **in-memory** `createProjectToolHost`. Commands mutate an in-memory snapshot
  and push onto a `commands[]` array. **Nothing is written back to disk** — on
  process exit, every edit evaporates.

So an agent cannot keep one session alive across create → author, cannot persist
edits, cannot resume after a context or process reset, and cannot see build,
test, or browser results. That is the P5 gap.

## Goal

An agent can create, reopen, modify, evaluate, and repair a game across process
and context resets without replaying successful work blindly.

## Design decisions

Five forks were settled during brainstorming; each section below implements one.

1. **Run vs record** — the session *runs and captures* build/test/browser/eval,
   so results are trustworthy and idempotency-checkable (not agent self-report).
2. **Edit durability** — *disk-is-truth, write-through*: `public/project` stays
   the live source of truth; the session directory holds only new metadata.
3. **Topology** — *one durable server, single session per repo*; project and run
   tools appear when a project is open; the server rehydrates on restart.
4. **Staleness** — a *per-step result cache keyed by an input fingerprint*.
5. **Result exposure** — `sessionStatus` presents state (fresh/stale/absent),
   not a prescriptive state machine.

## Architecture

The current `--workspace` mode becomes a **durable build-session host**: one
long-lived MCP server, one active session per repo. Three collaborators:

- **SessionStore** — reads and writes `.automata/session/` (JSON): the active
  project pointer, the per-step result cache, findings, budget counters, and an
  audit log. This is the only new persistent state.
- **Active project host** — the existing `createProjectToolHost`, wrapped so that
  every successful write command also write-throughs the affected canonical
  files to disk.
- **Runner** — executes build, test, browser smoke, and evaluate; fingerprints
  inputs; consults the cache; records typed results and derives findings.

### Tool surface (dynamic via `tools/list_changed`)

Always present:

- `createGame`, `listGames` (existing workspace tools);
- `openProject(gameId)` — load from disk, set active, emit `tools/list_changed`;
- `closeProject()` — flush and clear the active project;
- `sessionStatus()` — active project, per-step freshness, findings summary,
  budget counters.

Present only while a project is open:

- the existing authoring tools (`addEntity` … `validate`, `evaluate`,
  `getProject` / `getHierarchy` / `getResources`), now write-through;
- new run tools: `runBuild`, `runTests`, `browserSmoke`.

The four run tools produce the four cache **steps**:
`runBuild → build`, `runTests → test`, `browserSmoke → browser`,
`evaluate → evaluate`. "Step" names the cache/result key; "tool" names the MCP
verb.

`swap` is not a separate tool: `openProject(b)` while `a` is open flushes and
closes `a` first. `createGame`'s `nextSteps` changes from *"reconnect with
`--project …`"* to *"call `openProject(<name>)`"*.

### Session directory

```
.automata/session/           # metadata only; gitignored; pid lockfile guards single-server
  session.json   # id, createdAt, activeProjectId, schemaVersion, and the state maps:
                 #   results  -> per-step cache: stepKey -> { step, ok, inputHash, ts, durationMs, ... }
                 #   findings -> typed: { severity, code, message, step, evidence, ts }
                 #   budgets  -> per step: { runs, totalMs } (recorded, not enforced)
  log.jsonl      # append-only audit of every tool call and outcome
  artifacts/     # browser-smoke screenshots
```

The result cache, findings, and budgets live inside the single `session.json`
document (one atomic write per change) rather than in separate files.

`stepKey` is `${gameId}:${step}` where `step ∈ {build, test, browser, evaluate}`.
Project content is **not** stored here — it lives in
`games/<name>/public/project/`, always current via write-through.

### Write-through persistence

After a write command returns `changed: true`, the session serializes the
affected files to the canonical on-disk layout via a new
**`writeProjectFiles(dir, snapshot)`** — the inverse of the existing
`loadProjectFiles`, living in `@automata/project` because pure serialization
belongs beside the parser. Resume needs no edit replay: `openProject` re-parses
from disk, so the P3 migration chain (`parseProjectSnapshot`) runs on every
reopen.

### Staleness and idempotency (per-step fingerprint cache)

| Step | Input hash |
|---|---|
| `build` / `test` | hash of the game's `src/**` + `public/project/**` |
| `evaluate` | hash of the canonical snapshot + eval options |
| `browser` | hash of the build artifact (downstream of `build`) |

On run, the runner computes the input hash. If the cached entry's hash matches
and `ok`, it returns `{ skipped: 'cached', result }`; otherwise it executes and
stores. Each run tool takes an optional `force` to bypass the cache.
`sessionStatus` recomputes current hashes and labels every step **fresh / stale /
absent** — that is the "resumable next action," presented as **state, not a
prescriptive state machine** (the orchestrator FSM is a later phase). Write
commands are already idempotent: `applyProjectCommand` no-ops return
`changed: false`.

### Results, findings, budgets

- **Result** (per step): `{ step, ok, inputHash, ts, durationMs, summary, detail }`.
  `detail` is step-specific — build: exit code + log tail; test: passed/failed
  counts + log tail; browser: booted + console errors + frame stats + screenshot
  path; evaluate: normalized metrics (unchanged from today).
- **Findings**: minimal typed issues derived from failing results —
  `{ severity, code, message, step, evidence, ts }`. The factory's richer fields
  (affected artifact IDs, suggested repair scope) are added when repair needs
  them (Phase 7). `validate` / `evaluate` already emit `ValidationIssue`-shaped
  data that maps directly.
- **Budgets** are **recorded, not enforced** in P5: wall-time per step, run
  counts, session age, surfaced through `sessionStatus`. Enforcement and cutoffs
  are repair-loop concerns for a later phase.

### Browser smoke scope

`browserSmoke` is deliberately a *smoke*, not full acceptance: build → serve →
headless Playwright load → capture boot (no uncaught error before first frame),
console errors/warnings, a few frames of frame-time, and a screenshot. It reuses
the existing `playwright.config.ts` patterns. This is the harness that Phase 3's
first browser *evaluator* (boot/console/frame-time wired into the vertical-slice
checkpoint) will build on; P5 stands up the capability, Phase 3 wires it into a
gate.

## Data flow

1. The client launches `automata-editor-mcp --workspace <repo>`; the server
   loads or creates `.automata/session/` and rehydrates the active project if one
   was open.
2. `createGame` scaffolds and returns `nextSteps` pointing at `openProject`.
3. `openProject(gameId)` parses the snapshot from disk (migrations apply),
   installs the active project host, and emits `tools/list_changed`.
4. Authoring tools mutate the snapshot, write-through to disk, and append to the
   audit log.
5. `runBuild` / `runTests` / `browserSmoke` / `evaluate` fingerprint inputs; a
   cache hit returns `skipped: 'cached'`, otherwise the runner executes, stores
   the result, and derives findings.
6. `sessionStatus` presents the active project, per-step freshness, findings, and
   budget counters.
7. The process dies. On restart, step 1 rehydrates everything from disk; no work
   is replayed blindly.

## Error handling

- Tool errors keep the existing `{ ok: false, isError: true, content }` shape.
- A build or test *failure* is **data** — a result with `ok: false` plus findings
  — not a thrown error.
- `openProject` on an unknown or invalid game errors without touching the active
  project.
- Corrupt or partial session files on rehydrate **fail safe**: start a fresh
  session, preserve the bad files as `.bak`, and warn on stderr.
- A pid lockfile in `.automata/session/` prevents two servers racing one repo.

## Code placement

- **Contracts:** a new `sessionTools.ts` in `@automata/contracts` holding the
  session and run tool schemas, matching `tools.ts` / `workspaceTools.ts`.
- **Implementation:** `tools/editor-mcp-server/src/session/` — SessionStore,
  runner, the write-through wrapper, and the dynamic host. It shells out to npm
  and a browser, a tool concern; the engine boundary stays intact.
- **`writeProjectFiles`:** `@automata/project`, beside `loadProjectFiles`.
- **Server binding:** `server.ts` gains dynamic tool-list support and
  `tools/list_changed` emission.

## Testing (TDD)

- **Unit:** SessionStore round-trip (write → rehydrate); staleness cache
  (fresh / stale / `force`); write-through (edit → files on disk → reparse equals
  the in-memory snapshot); findings derivation from failing results.
- **Host:** open / close / swap transitions; the dynamic tool list; run and
  authoring tools error when no project is open.
- **Runner:** build / test / evaluate against a fixture game behind an
  **injectable exec** so tests never spawn real npm; `browserSmoke` behind an
  **injectable browser driver** so tests never launch Chromium.
- **Lifecycle smoke:** create → open → edit → build → evaluate → kill →
  rehydrate → `sessionStatus` shows *fresh* and nothing re-runs.
- Then `npm run ci`, `npm run coverage` (contracts + tools touched; engine
  boundary respected), and `npm run verify:new-game` for the `createGame`
  `nextSteps` change.

## Chosen defaults

- `.automata/` is gitignored.
- Budgets are recorded, not enforced.
- `browserSmoke` is minimal (boot / console / frame-time + screenshot).
- `writeProjectFiles` lives in `@automata/project`.
- A corrupt session rehydrates by failing fresh (bad files preserved as `.bak`).
- A single-server pid lock guards the session directory.

## Non-goals

- The seeded-generation/replay harness (deferred to Phase 2).
- The pack-composition runtime seam (deferred to Phase 3).
- Budget *enforcement*, repair jobs, and the orchestrator state machine (later
  phases).
- Full browser acceptance beyond the boot/console/frame-time smoke.
- Multiple concurrent named sessions (single active session per repo for now).

## Exit criteria

An agent creates, reopens, modifies, evaluates, and repairs a game across process
and context resets without replaying successful work blindly. Concretely: a
lifecycle that creates a game, edits it, runs build/evaluate, is killed, and
restarts shows every unchanged step as *fresh* in `sessionStatus` and re-runs
none of them; an edit that changes an input flips its dependent steps to *stale*.
