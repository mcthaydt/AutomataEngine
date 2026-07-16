# AutomataEngine Roadmap

**North star:** an agent (Claude Code/Codex/OpenCode via MCP) turns a natural-language
description into a complete, coherent browser game. MCP-first is the blessed AI
path; the in-editor chat agent is a thin client, not the product. The full
destination is the [Autonomous Game Factory design](superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md);
this document is the living map of how we get there.

## How to read this

- **This file is the single source of truth for status and sequencing.** Specs
  describe a design at a point in time; plans are per-initiative checklists;
  this roadmap is the one place that says what is shipped, what is in flight,
  and what comes next.
- **Status vocabulary** (used everywhere below): `Shipped` · `In progress` ·
  `Next` · `Planned` · `Moot`.
- **Granularity rule:** in-progress and next work carry task breakdowns. Later
  phases stay scoped headings — their detail arrives just-in-time in their own
  spec→plan cycle, not written speculatively here.
- **Keeping this current:** update this file whenever a phase or item changes
  status, and at the end of every spec→plan→merge cycle (the same discipline
  AGENTS.md already requires for plans).

---

## 1. Shipped

Newest first. Each links to the spec/plan that defines it.

- **Phase 3 — Vertical slice · first playable** (2026-07-14,
  `phase-0-completion` @ `pending merge`). Added the capability-pack and runtime
  composition contracts, seeded compose/report/checkpoint MCP flow, enriched
  browser and critical-path gates, and the checked-in `first-light` playable.
  Spec:
  [`2026-07-13-phase-3-vertical-slice-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-13-phase-3-vertical-slice-design.md);
  plan:
  [`2026-07-13-phase-3-vertical-slice.md`](superpowers/plans/active/2026-07/week-29/2026-07-13-phase-3-vertical-slice.md).

- **Phase 2 — Versioned `GameSpec`** (2026-07-13, `phase-0-completion` @
  `pending merge`). Added bounded versioned GameSpec contracts, deterministic
  validation/normalization/versioning/brief rendering, and MCP design-checkpoint
  tooling with ten-prompt seeded-replay acceptance. Spec:
  [`2026-07-13-phase-2-versioned-gamespec-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec-design.md);
  plan:
  [`2026-07-13-phase-2-versioned-gamespec.md`](superpowers/plans/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec.md).

- **Phase 1 — Persistent MCP build sessions (P5)** (2026-07-13,
  `phase-0-completion` @ `b0c9341`). Added durable session ledgers, atomic
  recovery, hash-guarded server checks and findings, seeded replay, the empty
  pack-composition seam, and a workspace-only MCP server with write-through
  authoring. Spec:
  [`specs/2026-07-12-p5-persistent-mcp-build-sessions-design.md`](superpowers/specs/active/2026-07/week-28/2026-07-12-p5-persistent-mcp-build-sessions-design.md);
  plan:
  [`plans/2026-07-12-p5-persistent-mcp-build-sessions.md`](superpowers/plans/active/2026-07/week-28/2026-07-12-p5-persistent-mcp-build-sessions.md).

- **Phase 0 — Platform integrity** (2026-07-12, `phase-0-completion` @
  `f62910d`). Completed editor entity-ID/render-sync hardening, P4's shared
  `@automata/game-kit` browser shell and scaffold adoption, and
  visible/reversible save-reopen recovery with long-session acceptance coverage.
  Spec: [`specs/2026-07-11-phase-0-completion-design.md`](superpowers/specs/active/2026-07/week-28/2026-07-11-phase-0-completion-design.md);
  plan: [`plans/2026-07-11-phase-0-completion.md`](superpowers/plans/active/2026-07/week-28/2026-07-11-phase-0-completion.md).
- **P8 — Standalone hygiene** (2026-07-11). Retired Monkey Ball's legacy
  ingestion seam (`importLegacyMonkeyBallProject`, `legacyTypes`,
  `scripts/build-project.ts`, quarantined legacy fixtures; dropped the pre-P3
  editor autosave recovery; re-sourced tests onto the canonical project) and
  decoupled the level editor from a single game's `publicDir` via a game-scoped
  dev-server middleware. The iCloud `" 2"` duplicates item was already resolved
  by moving the repo off the synced path. Spec:
  [`specs/2026-07-11-p8-standalone-hygiene-design.md`](superpowers/specs/active/2026-07/week-28/2026-07-11-p8-standalone-hygiene-design.md);
  plan: [`plans/2026-07-11-p8-standalone-hygiene.md`](superpowers/plans/active/2026-07/week-28/2026-07-11-p8-standalone-hygiene.md).
- **P3 — Project-file migrations** (2026-07-05, main @ `39439b9`). One central
  parse entry (`parseProjectSnapshot`) behind every load path; an ordered core
  migration chain; an optional per-game `migrate` hook; **formatVersion 2** with
  the manifest as the single version authority. Checked-in games normalized to
  v2. Spec: [`specs/2026-07-04-project-file-migrations-design.md`](superpowers/specs/archive/2026-07/week-27/2026-07-04-project-file-migrations-design.md);
  plan: [`plans/2026-07-04-project-file-migrations.md`](superpowers/plans/archive/2026-07/week-27/2026-07-04-project-file-migrations.md).
- **M2 / P2 — Schema unification + agent prompt layer** (2026-07-04, main @
  `82dcf9e`). zod is the single authored-schema language (the `ObjectSchema` DSL
  is gone); per-type JSON schemas ride in MCP tool descriptions; the `build-game`
  prompt and workflow-grade `createGame` nextSteps land. Spec:
  [`specs/2026-07-03-schema-unification-design.md`](superpowers/specs/archive/2026-07/week-27/2026-07-03-schema-unification-design.md);
  plan: [`plans/2026-07-03-schema-unification.md`](superpowers/plans/archive/2026-07/week-27/2026-07-03-schema-unification.md).
- **M1 — Paved road: scaffold + convention registry** (2026-07-02).
  `npm run new-game` / MCP `createGame` emit a registered, playable, MCP-visible
  game; a convention registry replaced both hardcoded catalogs;
  `npm run verify:new-game` is the clean-clone acceptance proof. Spec:
  [`specs/2026-07-02-paved-road-scaffold-registry-design.md`](superpowers/specs/archive/2026-07/week-27/2026-07-02-paved-road-scaffold-registry-design.md);
  plan: [`plans/2026-07-02-paved-road.md`](superpowers/plans/archive/2026-07/week-27/2026-07-02-paved-road.md).
- **M0–M16 — Engine build era** (2026-06). The original arc: engine foundation
  (M0–M6) → the Monkey Ball game (M7–M10) → generic project/scene editor,
  content, and polish (M11–M15) → editor MCP server + tuning agent + chat overlay
  (M16). Founding spec:
  [`specs/2026-06-09-automata-engine-monkey-ball-design.md`](superpowers/specs/archive/2026-06/week-24/2026-06-09-automata-engine-monkey-ball-design.md).

---

## 2. Numbering key

Three numbering schemes coexist in the history; this table reconciles them so
nobody has to guess. **The trap: P3 (project-file migrations) is not Phase 3
(the first-playable vertical slice).**

| P-series | Restarted milestone | Factory phase | What it is | Status |
|---|---|---|---|---|
| (P1) | M1 | Phase 0 precursor | Paved road: scaffold + convention registry | Shipped |
| P2 | M2 | Phase 0 precursor | Schema unification (zod) + agent prompt layer | Shipped |
| P3 | M3 | Phase 0 (part) | Project-file migrations, formatVersion 2 | Shipped |
| P4 | — | Phase 0 (part) | Richer `@automata/game-kit` | Shipped |
| P5 | — | Phase 1 | Persistent MCP build sessions | Shipped |
| P6 | — | Cross-cutting | Generated agent docs (llms.txt / API digest) | Planned |
| P7 | — | — | Retrofit Last Lightkeeper | Moot — game deleted 2026-07-04 |
| P8 | — | Standalone | Hygiene | Shipped |

Two axes to keep separate: the **old M0–M16** labels belong to the completed
engine-build era (section 1) and are *closed*. The **restarted M1/M2/M3** labels
belong to the AI-first series and equal P1/P2/P3. The **factory Phases 0–8**
(section 3) are the destination-oriented axis that absorbs the P-series.

---

## 3. Forward roadmap (factory Phases 0–8)

In-progress and next phases carry Goal · Depends-on · Tasks · Exit. Later phases
are scoped headings — Goal · Exit only — until their own spec exists. Phase
definitions derive from the
[Autonomous Game Factory design](superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md).
The full per-phase decomposition (scope, dependencies, cross-cutting slices, the
spec→plan sub-cycles each phase spawns, and contracts) lives in the
[Phase 0→8 decomposition design](superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md);
this section remains the source of truth for **status and sequencing**.

Two capabilities run through every phase rather than a single late one:
**evaluation grows with generation** (each phase ships the evaluator slice that
makes its own output checkable; Phase 7 only *closes the repair loop* over
evaluators that already exist), and **determinism + runtime composition** (a
seeded-generation/replay harness and the pack-composition runtime are stood up
in Phase 1 and extended by later phases). An early **vertical slice (Phase 3)**
proves the whole pipeline seam on a thin playable before any layer is built at
scale.

### Phase 0 — Platform integrity · `Shipped`

- **Goal:** generated projects survive engine evolution and long editing
  sessions.
- **Depends on:** M1, M2/P2 (shipped).
- **Tasks:**
  - **P3 project-file migrations** — `Shipped` (2026-07-05).
  - Editor entity-ID and render-timing hardening — `Shipped` (2026-07-12).
  - **P4** — expand `@automata/game-kit` around the literal game duplication
    (shared browser boot, loop, visibility, HUD, project-reader) — `Shipped` (2026-07-12).
  - Save/reopen recovery and longer browser acceptance coverage — `Shipped` (2026-07-12).
- **Exit:** generated projects survive engine evolution and long editing
  sessions; the remaining hardening/game-kit/acceptance tasks are all done.

### Phase 1 — Persistent MCP build sessions (P5) · `Shipped`

Spec: [`2026-07-12-p5-persistent-mcp-build-sessions-design.md`](superpowers/specs/active/2026-07/week-28/2026-07-12-p5-persistent-mcp-build-sessions-design.md);
plan: [`2026-07-12-p5-persistent-mcp-build-sessions.md`](superpowers/plans/active/2026-07/week-28/2026-07-12-p5-persistent-mcp-build-sessions.md).

- **Goal:** an agent can create, reopen, modify, evaluate, and repair a game
  across process and context resets.
- **Depends on:** Phase 0 complete.
- **Tasks:**
  - Add project open/swap behavior to workspace MCP mode — `Shipped` (`b0c9341`).
  - Persist session state, artifacts, findings, budgets, and resume position
    outside model context — `Shipped` (`b0c9341`).
  - Expose changed-file, build, test, browser, and evaluation results — `Shipped` (`b0c9341`).
  - Make every operation idempotent or artifact-hash guarded — `Shipped` (`b0c9341`).
  - Stand up the seeded-generation/replay harness and the pack-composition
    runtime seam that later phases extend — `Shipped` (`b0c9341`).
- **Exit:** an agent creates, reopens, modifies, evaluates, and repairs a game
  across process and context resets without replaying successful work blindly,
  and generation steps replay deterministically from a recorded seed.

### Phase 2 — Versioned `GameSpec` · `Shipped`

Spec: [`2026-07-13-phase-2-versioned-gamespec-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec-design.md);
plan: [`2026-07-13-phase-2-versioned-gamespec.md`](superpowers/plans/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec.md).

- **Goal:** a prompt compiles into a valid, bounded, reviewable `GameSpec` plus a
  design checkpoint. **Evaluators:** structural spec validation (schema, budgets,
  capability compatibility) gating the design checkpoint. **Exit:** ten
  differently worded prompts produce valid, bounded, reviewable specs.

### Phase 3 — Vertical slice · first playable · `Shipped`

Spec: [`2026-07-13-phase-3-vertical-slice-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-13-phase-3-vertical-slice-design.md);
plan: [`2026-07-13-phase-3-vertical-slice.md`](superpowers/plans/active/2026-07/week-29/2026-07-13-phase-3-vertical-slice.md).

- **Goal:** drive one minimal `GameSpec` through the thinnest version of every
  layer — one pack (`interaction-inventory`), trivially-generated content, one
  placeholder asset through a stub asset path, composed by the runtime from a
  data-driven manifest — into a genuinely playable artifact, proving the
  prompt → spec → compose → play → evaluate seam before any layer is built at
  scale. **Evaluators:** first browser eval (boot/console/frame-time) plus a
  critical-path smoke. **Exit:** a thin but genuinely playable artifact runs
  end-to-end from a minimal `GameSpec` and passes the vertical-slice checkpoint.
- **Depends on:** Phase 2 complete.
- **Tasks:**
  - Contracts: composition + asset-manifest schemas; interaction-inventory
    capability config — `Shipped`.
  - Capability-pack interface v1 + `PackEvalHook` + `loadComposition` in
    `@automata/game-kit` — `Shipped`.
  - `@automata/pack-interaction-inventory` (pure core, browser adapter, eval
    hook, seeded compose section) — `Shipped`.
  - `@automata/pack-registry` + `@automata/game-compose` (`composeGame`,
    slice report) — `Shipped`.
  - Composition-aware scaffold templates + enriched browser e2e
    (console capture, frame-time budget) — `Shipped`.
  - `composeGame` / `renderSliceReport` / `recordSliceDecision` MCP tools +
    end-to-end acceptance with seeded replay — `Shipped`.
  - `games/first-light` slice game: composed, gated, checkpointed, checked
    in — `Shipped`.

### Phase 4 — Capability packs · `Next`

Umbrella spec: [`2026-07-14-phase-4-capability-packs-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md)
(pack contract v2, per-pack cycle template, composition-matrix harness).
Runs in parallel with Phase 5.

- **Goal:** widen from the Phase 3 slice to the initial seven reusable gameplay
  packs; each pack is its own spec→plan cycle against the umbrella spec's
  contract v2 and template. **Exit:** packs compose without game-specific
  editor or MCP changes.
- **Cycles:**
  - Cycle 1 — contract v2 + interaction-inventory widening + composition-matrix
    harness — `Next` (plan:
    [`2026-07-14-phase-4-cycle-1-pack-contract-v2.md`](superpowers/plans/active/2026-07/week-29/2026-07-14-phase-4-cycle-1-pack-contract-v2.md)).
  - Cycle 2 — branching dialogue & quests pack — `Planned`.
  - Cycle 3 — schedules & relationships pack — `Planned`.
  - Cycle 4 — combat & enemy AI pack — `Planned`.
  - Cycle 5 — economy, shops & progression pack — `Planned`.
  - Cycle 6 — compact-hub navigation + one vehicle pack — `Planned`.
  - Cycle 7 — save/load integration pack — `Planned`.

### Phase 5 — Asset pipeline · `In progress`

Umbrella spec: [`2026-07-14-phase-5-asset-pipeline-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md).

- **Goal:** a normalized, versioned asset manifest with provider adapters,
  provenance, validation, optimization, and stable independent replacement.
  **Exit:** a failed asset regenerates independently and every release asset has
  valid provenance and browser budgets.
- **Cycles:**
  - Cycle 1 — manifest v2 + provenance model + migration + structural
    validation + MCP surface — `Shipped` (plan:
    [`2026-07-14-phase-5-cycle-1-asset-manifest-v2.md`](superpowers/plans/active/2026-07/week-29/2026-07-14-phase-5-cycle-1-asset-manifest-v2.md)).
  - Cycle 2 — provider-adapter interface + first procedural adapters — `Next`.
  - Cycle 3 — asset validation (media) + optimization + independent
    regeneration — `Planned`.

### Phase 6 — Content compiler · `Planned`

- **Goal:** generate complete world, cast, quest, dialogue, encounter, economy,
  and progression content from `GameSpec` within budgets; the per-domain
  generators are separate spec→plan cycles sharing the `GameSpec` contract.
  **Exit:** deterministic automation can complete the generated critical path.

### Phase 7 — Closed-loop repair · `Planned`

- **Goal:** wire the evaluators built incrementally in Phases 2–6 into bounded
  repair jobs (rank findings, change the smallest owned slice, re-run focused
  gates, escalate on repeated failure) — closing the loop over evaluators that
  already exist. **Exit:** seeded platform/content/asset defects are detected and
  repaired without human intervention.

### Phase 8 — Golden validation game · `Planned`

- **Goal:** generate the compact social/crime hub game from a fresh prompt using
  only the three product checkpoints. **Exit:** three consecutive fresh runs
  deliver complete one-to-two-hour games with no manual code edits.

---

## 4. Cross-cutting and standalone

Work that supports the arc but does not sit inside a single phase. P5's detail
lives under **Phase 1** in section 3 (it is a phase, not a cross-cutting item).

### P4 — Richer `@automata/game-kit` · `Shipped` (also a Phase 0 task)

- **What today looks like:** each game's browser entry point duplicates the same
  boot code — `games/monkey-ball/src/main.ts` (~200 lines) and
  `games/pulsebreak/src/main.ts` (~145 lines) both hand-wire
  `createThreeRenderer` + `attachCanvasRenderer`, a `GameLoop` + `startLoopDriver`,
  canvas creation, keyboard/pointer/`beforeunload`/visibility listeners,
  audio-resume-on-first-input, a cleanup stack, and a `fetch`-based project
  reader (`fetch(new URL('project/…', document.baseURI))`). `game-kit` today only
  carries `view`, `dom`, `browserAudio`, and `overlayScene`.
- **The work:** lift that shared browser shell (boot, loop, input, visibility,
  project reader) into `@automata/game-kit`, and regenerate the scaffold template
  so new games inherit it instead of copying it.
- **Done when:** a game's `main.ts` wires only game-specific pieces; the shared
  boot/loop/input/project-reader lives in one place; `verify:new-game` still
  passes with the thinner template.

### P6 — Generated agent documentation (llms.txt / API digest) · `Planned`

- **Why:** the MCP-first agent builds games by reading the project/engine API,
  but that knowledge is scattered across source, `AGENTS.md`, and specs. The
  agent needs one authoritative, current place to read.
- **The work:** generate agent-facing docs — an `llms.txt` (the emerging
  convention: a curated, LLM-readable index at a stable path), a digest of the
  public `@automata/project` / `@automata/engine` surface that games and tools
  may use, and a prompt-to-game walkthrough — plus **drift checks** (tests that
  fail when the generated docs fall out of sync with the real API).
- **Done when:** an agent can build a game from the generated doc set alone, and
  CI fails if the docs drift from the code.

### P8 — Hygiene · `Shipped`

Two code cleanups plus one already-resolved environment item:

- **Retired Monkey Ball's `legacyImporter`.** The old bespoke MB format
  (`levels/*.json`, `physics.toml`, `worlds.json`) was replaced by canonical
  `public/project` data; the importer, `legacyTypes`, generator, recovery seam,
  and quarantined legacy fixtures are gone. **Done:** Monkey Ball now reads
  canonical project data only.
- **iCloud `" 2"` duplicates — resolved.** The repo now lives off the synced
  path (`/Users/mcthaydt/dev/AutomataEngine`, not under iCloud Desktop) with no
  duplicate artifacts present, which is the intended fix. No code change.
- **Decoupled the level editor from a single game's `publicDir`.** The dev
  server now serves game-scoped public assets for every registered game.
  **Done:** project asset reads are no longer pinned to one game's folder.

### P7 — Retrofit Last Lightkeeper · `Moot`

The game was deleted on 2026-07-04; paved-road validation is covered by
`verify:new-game` instead. Kept in the table so the P-number isn't silently
reused.

---

## Keeping this document accurate

Update this file when any of the following happen:

- a phase or item changes status (start it, ship it, drop it);
- a spec→plan→merge cycle completes (move the item to `Shipped` with its merge
  commit, and promote the next item to `Next` / `In progress`);
- a new initiative is scoped (add it under the right phase or the cross-cutting
  section with a `Planned` status).

Detailed design belongs in a spec under `docs/superpowers/specs/`; the
step-by-step lives in a plan under `docs/superpowers/plans/`. This document
stays the map, not the territory.
