# Phase 1 — Persistent MCP Build Sessions (P5) — Design

Status: approved design. Date: 2026-07-12.
Scope source: [Phase 0→8 decomposition](2026-07-11-factory-phase-decomposition-design.md) §Phase 1;
status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 1.

## 1. Goal and non-goals

**Goal.** An agent (Claude Code/Codex/OpenCode over MCP) can create, reopen,
modify, evaluate, and repair a game **across process and context resets**,
without blindly replaying work that already succeeded, and with every
generation step deterministically replayable from a recorded seed.

This is the durable substrate every autonomous phase runs on. It covers the
whole of factory Phase 1 — both sub-cycles named in the decomposition doc:

1. the durable build-session substrate (open/swap, persistence, idempotency,
   results surface), and
2. the seeded-generation/replay harness plus the pack-composition runtime seam.

**Non-goals (explicitly deferred).** No `GameSpec` compilation (Phase 2), no
capability packs beyond the empty seam (Phases 3–4), no content or asset
generation (Phases 5–6), no automated repair jobs (Phase 7 — this phase builds
the findings/budget surface repair will consume, not the loop). No arbitrary
shell execution tool: the check vocabulary is closed.

## 2. Decisions of record

Settled during brainstorming, binding for the plan:

- **One spec for the whole phase.** Both sub-cycles are designed here; the plan
  may still sequence them as two milestones.
- **Server-executed checks.** The MCP server itself spawns build/test/browser
  /eval commands and normalizes results into typed findings. Findings are never
  self-reported by the agent.
- **Write-through authoring.** Every successful mutating project tool call
  flushes the snapshot to `games/<name>/public/project`. No explicit save tool;
  a crash loses at most the in-flight call.
- **Session home.** `.automata/sessions/<gameId>/` at the repo root,
  **gitignored**.
- **Single mode.** Workspace mode absorbs project authoring via
  `openProject`; the `--project` and `--bundle` CLI modes are **removed** and
  their tests migrate.
- **Structure.** Types in `@automata/contracts`; the session engine in a new
  leaf package `packages/build-session` (`@automata/build-session`); the
  pack-composition seam in `@automata/game-kit`; `tools/editor-mcp-server`
  remains a thin protocol adapter.

## 3. Architecture

```
@automata/contracts        session schema, typed findings, check results,
                           seed/replay contract, workspace tool defs (types only)
        ▲                          ▲
@automata/build-session    session store (atomic), step ledger + hash guards,
                           check runners (child processes), changed-files,
                           budgets, seeded-step harness
        ▲
tools/editor-mcp-server    one workspace mode; composes catalog + project
                           tool host + session engine; protocol adapter only
@automata/game-kit         GamePack interface + composePacks seam in the
                           shared browser shell (P4)
```

Dependency direction: `editor-mcp-server → build-session → contracts`;
`game-kit → contracts`. `build-session` does not import editor, engine
internals, or any provider/agent code — it is model-agnostic orchestration
state, deliberately separate from `agent-core`.

## 4. Session model

One session per game at `.automata/sessions/<gameId>/`:

- `session.json` — the durable session document.
- `artifacts/` — raw check outputs (build logs, test reports, browser-eval
  JSON), referenced from ledger steps.
- `lock` — pid-stamped lockfile; one server per session. Stale locks (dead
  pid) are reclaimed; a live lock makes `openProject` fail with a typed error.

`session.json` (zod schema in contracts, versioned from day one):

| Field | Content |
|---|---|
| `version` | session schema version (starts at 1) |
| `gameId`, `projectDir` | identity |
| `engineVersion`, `formatVersion` | environment fingerprints at last open |
| `baseline` | git ref + content hash of project + game source at session start; re-recorded on explicit rebaseline |
| `steps[]` | the step ledger: id, kind, input hash, result hash, status, recorded seed (generation steps), timestamps, artifact paths |
| `findings[]` | typed findings: id, source (`build`/`test`/`browser`/`eval`/`validate`/`session`), severity, code, message, location, the input hash they were observed at, resolvedAt |
| `budgets` | per-check attempt counters: limit and spent; default limits ship in the contracts schema, and Phase 1 exposes no tool to raise them (Phase 7 owns budget policy) |
| `resume` | last completed step + agent-declared next action |

Every change is written atomically (temp file + rename). A corrupt or
unknown-version `session.json` is **quarantined** (renamed alongside, kept),
a fresh session starts, and a `session`-source finding records the quarantine —
the same visible/reversible discipline as the editor's autosave recovery.

**Idempotency rule.** Expensive operations — scaffold, build, tests, browser
eval, evaluate — compute an input hash (relevant content + args). A completed
ledger step with the same hash short-circuits: the recorded result is returned
with `cached: true`. This is the "never blindly replay successful work" exit
criterion, mechanically. Authoring mutations are journaled as steps but not
hash-deduped (two identical `addEntity` calls legitimately differ); they accept
an optional `clientStepId` for exactly-once semantics on agent retries.

## 5. MCP tool surface (single workspace mode)

`automata-editor-mcp --workspace <repoRoot>` is the only invocation.
Four tool groups:

**Catalog (existing).** `listGames`. `createGame` becomes idempotent: invoked
with an existing game's name it returns that game's info plus session summary
instead of erroring, so a reset agent can safely repeat its opening move. It
also becomes a recorded seeded step (see §6): `createGame` creates the new
game's session implicitly and journals the scaffold step there, so the step
exists before the first `openProject`.

**Session & lifecycle (new).**
- `openProject(gameId)` — load, migrate, validate, then create-or-resume the
  session. Reopen and open are the same call; the response reports resume
  position, outstanding findings, and completed steps. Opening a different
  game swaps (previous state is already durable; swap = close + open).
- `getSession()` — session summary on demand.
- `setResumePoint(nextAction)` — the agent records its intended next move
  before context death.

**Authoring (existing tools, now durable).** The sixteen project tools
(`addEntity` … `evaluate`) become available once a project is open, unchanged
in shape. Every successful mutation write-through-flushes the snapshot to the
project directory and journals a ledger step. `validate` and `evaluate`
additionally land their results as typed findings.

**Checks (new, server-executed, hash-guarded).**
- `runBuild(gameId)` — typecheck/build for the game; runs dependency install
  first when the lockfile demands it.
- `runTests(gameId, scope?)` — the game's vitest suite (scoped filter allowed).
- `runBrowserEval(gameId)` — the playwright boot/console/frame-time acceptance
  path.
- `changedFiles()` — project + game source diff against the session baseline.

Each check spawns the real command with a timeout, stores raw output as a
session artifact, normalizes failures into typed findings, journals a hashed
ledger step, and decrements its attempt budget. Exhausted budget → the tool
refuses with a typed `budget-exhausted` finding (the enforcement hook Phase 7
leans on). A finding auto-resolves when the same check later passes at a newer
input hash. Check *failures are results, not errors* (§8).

## 6. Seeded-generation/replay harness

Contract (in `@automata/contracts`): a **generation step** is any operation
that produces project content or code non-interactively. It runs as a
`SeededStep`:

- the session engine allocates a seed and records it in the ledger step;
- the step derives all randomness from that seed via the engine's seeded RNG;
- the step's output is content-hashed into the ledger.

Harness (in `@automata/build-session`): `runSeededStep(kind, inputs)` and
`replayStep(stepId)` — replay re-executes the recorded kind with the recorded
seed and inputs and asserts the output hash matches.

Phase 1 proves the machinery on what exists: `createGame` (the scaffold
generator) runs as a seeded step — trivially deterministic today, which is
fine; the deliverable is the plumbing — plus a deliberately randomized
test-only generation step that fails replay if seeding leaks. Phases 2/6
implement the same interface for spec compilation and content generation.

## 7. Pack-composition runtime seam

In `@automata/game-kit`, alongside the P4 shared browser shell:

- `GamePack` — identity (id, version), a config-schema slot, and a `register`
  hook contributing systems/resources at boot;
- `composePacks(packs, config)` — called by the shared shell during boot;
  rejects duplicate pack ids; registration order is declaration order.

Phase 1 ships the **empty seam**: composing zero packs is the status quo
(existing games boot identically through the seam), and a trivial test-only
pack proves registration order, config plumbing, and double-registration
rejection. No real packs, no discovery, no editor integration — Phase 3
composes the first real pack through this exact interface; Phase 4 widens to
seven.

## 8. Error handling

- **Check failures are results.** A failing build is a *successful*
  `runBuild` call whose result carries findings. Tool errors are reserved for
  contract violations: no project open, unknown game, lock held, budget
  exhausted, malformed args.
- **Crash safety.** Atomic session writes; write-through authoring; a reset
  loses at most the in-flight call.
- **Corruption.** Quarantine + fresh session + a finding (never silent
  discard, never silent recovery).
- **Out-of-band edits.** If the agent edits files directly, baseline-hash
  mismatch is detected on `openProject` and on every check; affected ledger
  entries are marked stale so their cached results no longer short-circuit.
  Detection marks and reports — it never blocks.
- **Concurrency.** Pid-stamped lockfile per session; stale locks reclaimed,
  live locks refuse with a typed error.

## 9. Testing & acceptance

- **Unit (`build-session`).** Store round-trip, atomic-write crash simulation,
  hash guards (hit, miss, stale), finding normalization and auto-resolve,
  budget enforcement, lock reclaim, quarantine path.
- **Contract tests.** Session schema versioning (unknown version → quarantine),
  tool arg parsing for the new tools.
- **Acceptance (scripted, no LLM).** An integration test walking the exit
  criterion literally: create → open → author → run checks → **kill the server
  process** → restart → verify resume position and cached step results →
  inject a defect → findings appear → repair via authoring tools → re-check →
  findings auto-resolve. Plus determinism: `replayStep` over every recorded
  generation step reproduces identical output hashes.
- **Seam tests (`game-kit`).** Existing games boot unchanged through
  `composePacks([])`; the test pack registers in order and duplicate ids are
  rejected.
- **Regression.** `npm run ci`, `npm run coverage` (engine-adjacent),
  `npm run verify:new-game` (scaffold + workspace flow after the mode
  consolidation) all stay green; e2e gains the restart scenario.

**Exit (from the roadmap, unchanged).** An agent creates, reopens, modifies,
evaluates, and repairs a game across process and context resets without
replaying successful work blindly, and generation steps replay
deterministically from a recorded seed.

## 10. Migration & cleanup notes

- Remove `--project`/`--bundle` from `main.ts`; `headlessHost` becomes the
  internal open-project path invoked by `openProject`.
- Migrate `smoke`/`server`/`mcpAdapter`/`headlessHost` tests onto the
  workspace open/swap flow.
- `createGame` nextSteps text updates: no more "reconnect with --project" —
  the follow-on instruction becomes `openProject`.
- Add `.automata/` to `.gitignore`.
- Update `AGENTS.md` (verification commands / MCP usage) and ROADMAP.md
  statuses at ship time.
