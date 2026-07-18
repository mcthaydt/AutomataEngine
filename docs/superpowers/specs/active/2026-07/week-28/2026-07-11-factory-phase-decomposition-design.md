# Factory Roadmap Completion — Phase 0→8 Decomposition (Design)

Status: approved decomposition. Phase 0 completed 2026-07-12; Phases 1–2
completed 2026-07-13; Phase 3 completed 2026-07-14. Date: 2026-07-11.

## 1. Purpose & how to read

This document is the **phase-decomposition of record** for completing the
Autonomous Game Factory. For each of Phases 0 through 8 it defines what the phase
builds, what it depends on, what it explicitly defers, the cross-cutting slice it
must ship, the independent spec→plan cycles it spawns, the contracts it
introduces, and its exit criteria. Each phase section is the launch pad for that
phase's own spec→plan→verify cycle: this doc bounds the phase so per-phase
brainstorming starts from a firm scope instead of re-deriving it.

It deliberately does **not** carry:

- **Live status / sequencing** — owned by [`/docs/ROADMAP.md`](/docs/ROADMAP.md).
  This design records completed phase boundaries and must be synchronized with
  the roadmap whenever a phase ships; the roadmap remains the source of truth
  for work in flight and what comes next.
- **Strategy & architecture** — the north star, product contract, full `GameSpec`
  interface, the six subsystems, the complete evaluator taxonomy, the repair
  table, risks, and success metrics live in the
  [Autonomous Game Factory design](/docs/superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md).
  This doc restates only the load-bearing frame and points there for exhaustive
  detail.

### The naming trap (read first)

Three numbering axes coexist; the roadmap's §2 table reconciles them. The one
that bites: **the P-series is not the factory Phases.** "P3" (project-file
migrations) is *not* "Phase 3" (the vertical slice); "P8" (standalone hygiene) is
*not* "Phase 8" (the golden validation game — the final destination). This
document uses **Phase N** exclusively to mean the factory phase. Where a P-series
item maps into a phase (P3 and P4 into Phase 0, P5 into Phase 1), it is called out
explicitly.

## 2. The frame, in brief

Self-contained recap of the load-bearing frame; full detail in the founding
design.

- **North star.** A developer describes a game in natural language; the factory
  designs, builds, runs, evaluates, repairs, and packages a complete, coherent
  browser game. First credible target: *a coherent one-to-two-hour
  game-jam-quality browser game in a compact stylized 3D hub, three human
  checkpoints, no manual code editing.* (Founding design §North star,
  §Product contract.)
- **Supported envelope.** One compact outdoor district + several instanced
  interiors; player movement + one vehicle; small scheduled crowds; dialogue,
  relationships, quests, shops, inventory, progression; one combat model +
  bounded enemy roster; finite main story + optional side content; save/load,
  menus, settings, credits; original stylized 3D art and audio. Browser-first.
  Multiplayer, seamless cities, photorealism, console delivery, and arbitrary
  genres are out. (Founding design §Supported envelope, §Non-goals.)
- **Three product checkpoints** — the only human pauses: (1) **Design approval**,
  (2) **Vertical-slice approval**, (3) **Release-candidate approval**. Between
  them the system runs autonomously; each checkpoint presents a playable artifact
  plus evidence, not prose. Every phase below notes which checkpoint it advances.
  (Founding design §Human checkpoints.)
- **`GameSpec` — the spine artifact.** A versioned, machine-readable creative and
  production contract compiled from the prompt and frozen at Design approval. Each
  subsystem consumes only the slice it owns; generated code, assets, and
  evaluators record the spec version. Introduced in Phase 2, consumed by every
  phase after. (Founding design §Core model.)
- **Two cross-cutting spines** — load-bearing in *every* phase, never deferred to
  one late phase:
  - **Evaluation grows with generation.** Each phase ships the evaluator slice
    that makes *its own* output checkable. Phase 7 only *closes the repair loop*
    over evaluators that already exist.
  - **Determinism + runtime composition.** The seeded-generation/replay harness
    and the pack-composition runtime are stood up in Phase 1 and extended by each
    later phase; every generation step replays from a recorded seed.
- **The pass rule.** A release candidate passes only when the critical path
  completes repeatedly across fixed seeds, every hard structural/runtime/browser
  gate passes, no unresolved finding can block completion or corrupt saves,
  budgets are met, and remaining defects are explicitly non-blocking. Subjective
  scores rank alternatives but never override deterministic failures. (Founding
  design §Pass rule, §Failure and repair policy.)

## 3. Phase map

| Phase | Goal (one line) | Advances checkpoint | Depends on | Sub-cycles |
|---|---|---|---|---|
| 0 — Platform integrity | Generated projects survive engine evolution and long editing sessions | — (internal enabler) | M1, M2/P2 (shipped) | 3 completed (2026-07-12) |
| 1 — Persistent MCP build sessions (P5) | Create/reopen/modify/evaluate/repair a game across resets | — (internal enabler) | Phase 0 | 2 completed (2026-07-13) |
| 2 — Versioned `GameSpec` | Prompt → valid, bounded, reviewable `GameSpec` + design checkpoint | Design | Phase 1 | 3 completed (2026-07-13) |
| 3 — Vertical slice | Drive one minimal `GameSpec` through every layer into a playable artifact | Vertical-slice | Phase 2 | 1 completed (2026-07-14) |
| 4 — Capability packs | Widen the slice's pack to the initial 7 reusable packs | — (widens slice) | Phase 3 | 7 (one per pack); 4 of 7 completed (2026-07-18) |
| 5 — Asset pipeline | Normalized, versioned asset manifest with providers, provenance, validation | — | Phase 3 (parallel with 4) | 4 completed (2026-07-18) |
| 6 — Content compiler | Generate full world/cast/quest/dialogue/economy/progression from `GameSpec` | — | Phases 4, 5 | 5 (per domain) |
| 7 — Closed-loop repair | Wire existing evaluators into bounded repair jobs | — | Phases 2–6 evaluators | 2 |
| 8 — Golden validation game | Generate the golden hub game from a fresh prompt, 3 clean runs | all 3 | Phases 1–7 | 1 (validation) |

**Sequencing note.** Phases are largely a chain, with one deliberate fork: after
the Phase 3 slice proves the seam, **Phase 4 (packs) and Phase 5 (assets) can run
in parallel** — they widen the same proven pipeline along different axes
(gameplay vs. assets). Phase 6 (content) needs both. Phase 7 needs the evaluators
that Phases 2–6 accrete. Phase 8 needs everything.

## 4. Per-phase sections

Each phase uses the same template; fields collapse to a line where a phase is
simple and expand where it is not.

### Phase 0 — Platform integrity

- **Goal.** Generated projects survive engine evolution and long editing
  sessions.
- **Advances checkpoint.** None — internal enabler; makes every later phase's
  output durable.
- **Depends on.** M1 (paved road) and M2/P2 (schema unification) — both shipped.
- **In scope.**
  - **P3 project-file migrations** — *shipped 2026-07-05.*
  - **P8 standalone hygiene** — *shipped 2026-07-11* (legacy Monkey Ball importer
    retired; level editor decoupled from one game's `publicDir`). P8 is a
    standalone cleanup off the phase critical path; noted here for a complete
    platform-integrity picture, tracked as its own item in the roadmap.
  - Editor entity-ID and render-timing hardening — *shipped 2026-07-12.*
  - **P4 — richer `@automata/game-kit`:** lift the duplicated browser shell (boot,
    loop, input, visibility, project-reader) out of each game's `main.ts` into the
    kit and regenerate the scaffold template to inherit it — *shipped 2026-07-12.*
  - Save/reopen recovery and longer browser acceptance coverage — *shipped 2026-07-12.*
- **Explicitly out / deferred.** No `GameSpec`, no generation, no evaluators
  beyond acceptance coverage. Pure durability and hygiene of the existing
  hand-authored pipeline.
- **Cross-cutting slice.**
  - *Evaluator:* extends existing acceptance/browser coverage (save-reopen, longer
    sessions) — the substrate later phase-specific evaluators build on; no new
    generated-output evaluator yet.
  - *Determinism/runtime:* none new; stabilizes the project-format and game-kit
    surface the Phase 1 seeded harness will drive.
- **Sub-cycles completed.** (1) editor entity-ID + render-timing hardening; (2) P4
  game-kit shell extraction + scaffold regeneration; (3) save/reopen recovery +
  acceptance-coverage expansion. (P3 and P8 already had their own cycles.)
- **Contracts introduced.** A stabilized `@automata/game-kit` browser-shell
  surface (boot/loop/input/visibility/project-reader) and a hardened
  project-format load path.
- **Exit.** Generated projects survive engine evolution and long editing sessions;
  the hardening, game-kit, and acceptance tasks are all done.
- **Risks retired / carried.** Retires per-game boot-code duplication, silent or
  non-reversible autosave recovery, session-relative editor IDs, and per-item
  render-sync serialization. Carries no generation risks yet.

### Phase 1 — Persistent MCP build sessions (P5)

**Completed 2026-07-13.** Implementation spec:
[`2026-07-12-p5-persistent-mcp-build-sessions-design.md`](2026-07-12-p5-persistent-mcp-build-sessions-design.md);
implementation plan:
[`2026-07-12-p5-persistent-mcp-build-sessions.md`](/docs/superpowers/plans/active/2026-07/week-28/2026-07-12-p5-persistent-mcp-build-sessions.md).

- **Goal.** An agent can create, reopen, modify, evaluate, and repair a game
  across process and context resets.
- **Advances checkpoint.** None — internal enabler; the durable substrate every
  autonomous phase runs on.
- **Depends on.** Phase 0 complete.
- **In scope — shipped.**
  - Project open/swap behavior in workspace MCP mode.
  - Persist session state, artifacts, findings, budgets, and resume position
    *outside model context*.
  - Expose changed-file, build, test, browser, and evaluation results.
  - Every operation idempotent or artifact-hash guarded.
  - **Stand up both spines' machinery:** the seeded-generation/replay harness and
    the pack-composition runtime seam that later phases extend.
- **Explicitly out / deferred.** No `GameSpec` compilation, no capability packs, no
  content/asset generation. This is the orchestrator/session substrate plus the
  empty seams — not their contents.
- **Cross-cutting slice.**
  - *Evaluator:* wires the results-exposure surface (build/test/browser/eval
    results as typed findings) — the pipe every later evaluator reports through.
  - *Determinism/runtime:* **the** phase that establishes the seeded harness and
    composition runtime; foundational for both spines.
- **Sub-cycles completed.** (1) durable build-session substrate — open/swap,
  atomic persistence, idempotency, results surface, and write-through authoring;
  (2) seeded-generation/replay harness + pack-composition runtime seam.
- **Contracts introduced.** The durable build-session schema (versioned session
  documents, artifact hashes, findings, budgets, resumable next action); the
  typed-findings result surface; the seed/replay contract; and the runtime
  `GamePack`/`composePacks` seam interface.
- **Exit.** An agent creates, reopens, modifies, evaluates, and repairs a game
  across resets without blindly replaying successful work, and generation steps
  replay deterministically from a recorded seed.
- **Risks retired / carried.** Retires "provider continuation state as source of
  truth" through durable, hash-guarded artifacts and write-through project
  edits. Carries real-pack and generated-content seam correctness forward to
  Phases 3–6.

### Phase 2 — Versioned `GameSpec`

**Completed 2026-07-13.** Implementation spec:
[`2026-07-13-phase-2-versioned-gamespec-design.md`](../week-29/2026-07-13-phase-2-versioned-gamespec-design.md);
implementation plan:
[`2026-07-13-phase-2-versioned-gamespec.md`](/docs/superpowers/plans/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec.md).

- **Goal.** A prompt compiles into a valid, bounded, reviewable `GameSpec` plus a
  design checkpoint.
- **Advances checkpoint.** **Design approval** (checkpoint 1) — this phase
  produces the artifact that checkpoint reviews.
- **Depends on.** Phase 1 (durable sessions hold the spec and checkpoint
  decision).
- **In scope — shipped.**
  - The first supported envelope and `GameSpec` schemas: identity, direction,
    budgets, capability selection, world/cast, story beats plus main/side quest
    stubs, progression, asset requirements, and acceptance criteria.
  - A deterministic compiler surface that validates, normalizes, versions, and
    persists a supplied spec draft; it renders a human-readable design brief and
    rejects unsupported or contradictory envelope requests.
  - Spec immutability and versioning: approval freezes a version; later changes
    create a new version and require a recorded reason.
  - The design-checkpoint artifact and decisions, persisted atomically with the
    durable session state.
- **Explicitly out / deferred.** No code/content/asset generation from the spec
  (the intent compiler explicitly does not generate game code or assets).
  Capability *packs* are Phase 4; here only their *selection/config schema*
  exists.
- **Cross-cutting slice.**
  - *Evaluator:* **structural spec validation** — schema, budgets, capability
    compatibility — gating the design checkpoint.
  - *Determinism/runtime:* prompt→spec runs under the seeded harness — the same
    prompt and seed reproduce the same spec, so generation is deterministic.
- **Sub-cycles completed.** (1) `GameSpec` schema + envelope definition; (2)
  compiler/normalization + design brief; (3) structural spec-validation evaluator
  + design-checkpoint artifact.
- **Contracts introduced.** **The `GameSpec` schema itself** — the central contract
  every subsequent phase consumes — plus the capability-selection schema and the
  acceptance-criterion format.
- **Exit — met.** Ten materially distinct prompt-derived drafts compile to valid,
  bounded, reviewable specs and replay deterministically. Post-implementation
  review also closed quest-budget validation, persistence-error handling, atomic
  write collision resistance, and lifecycle rejection coverage.
- **Risks retired / carried.** Attacks platform scope creep (envelope enforcement
  and disclosure) and begins on content incoherence (explicit spec facts).

### Phase 3 — Vertical slice · first playable

**Completed 2026-07-14.** Implementation spec:
[`2026-07-13-phase-3-vertical-slice-design.md`](../week-29/2026-07-13-phase-3-vertical-slice-design.md);
implementation plan:
[`2026-07-13-phase-3-vertical-slice.md`](/docs/superpowers/plans/active/2026-07/week-29/2026-07-13-phase-3-vertical-slice.md).

- **Goal.** Drive one minimal `GameSpec` through the thinnest version of every
  layer — one pack, hand-minimal content, one placeholder/generated asset,
  composed by the runtime — into a genuinely playable artifact.
- **Advances checkpoint.** **Vertical-slice approval** (checkpoint 2).
- **Depends on.** Phase 2 (a minimal valid `GameSpec` to drive).
- **In scope — shipped.**
  - The `interaction-inventory` capability pack, establishing the reusable
    capability-pack and headless-evaluation interfaces Phase 4 widens.
  - Seeded minimal content generated from the approved `GameSpec` and recorded
    in a replayable composition step.
  - One generated SVG placeholder plus a versioned stub asset manifest.
  - Data-driven runtime composition of pack + content + asset into the checked-in
    `games/first-light` playable.
  - An evidence report and hash-bound vertical-slice checkpoint requiring green
    build, test, browser, and critical-path evaluation gates.
- **Explicitly out / deferred.** Breadth. Exactly one pack, one asset, minimal
  content — no second pack, no content compiler, no real asset providers. The
  point is the *seam*, not scale.
- **Cross-cutting slice.**
  - *Evaluator:* the first **browser evaluation** (boot, console, frame-time) plus
    a **critical-path completion smoke** on the slice.
  - *Determinism/runtime:* the first real end-to-end exercise of the Phase-1
    composition runtime from a seed.
- **Sub-cycles completed.** One integration cycle touching every layer thinly:
  contracts → pack → seeded compose → generated project/assets → runtime boot →
  browser/critical-path evaluation → checkpoint.
- **Contracts introduced.** The **capability-pack interface**, composition and
  stub asset manifests, pack-evaluation hook, seeded `compose:game` result, slice
  evidence report, and hash-bound slice decision. Together they establish the
  runtime composition contract (spec + pack + content + asset → playable) that
  later phases widen.
- **Exit — met.** `games/first-light` composes deterministically from its minimal
  `GameSpec`, boots as a genuinely playable browser artifact, passes build/test,
  strict browser boot-console-frame-time, and critical-path evaluation gates,
  and has an approved vertical-slice checkpoint over the reviewed
  spec/composition/content hashes.
- **Risks retired / carried.** Retires the **integration risk** — proves
  prompt → spec → compose → play → evaluate before anything is built at scale
  (the reason this phase was pulled out in the 2026-07-05 revision). Carries
  breadth into Phase 4's remaining packs, Phase 5's real asset providers, and
  Phase 6's full-domain content generation without reopening the proven seam.

### Phase 4 — Capability packs

- **Goal.** Widen from the Phase 3 slice to the initial seven reusable gameplay
  packs.
- **Advances checkpoint.** None directly — widens what the slice proved; feeds
  later checkpoints.
- **Depends on.** Phase 3 (the pack interface + composition contract).
  **Can run in parallel with Phase 5.**
- **In scope.** The seven packs, each its own cycle: interaction/inventory;
  branching dialogue/quests; schedules/relationships; combat/enemy AI;
  economy/shops/progression; compact-hub navigation + one vehicle; save/load
  integration. Each pack owns its `GameSpec` config schema, project
  component/resource schemas, compiler/runtime systems, editor prefabs + preview,
  headless evaluation hooks, generated acceptance tests, compatibility
  declarations, and deterministic fixtures.
- **Explicitly out / deferred.** Bespoke game-specific TypeScript (an escape hatch
  only; each escape logged as a capability gap); packs beyond the seven; content
  *generation* (Phase 6) — packs define mechanics and schemas, not the generated
  world/quests that fill them.
- **Cross-cutting slice.**
  - *Evaluator:* per pack — headless simulation plus **pairwise/scenario
    composition suites** (the answer to capability-combinatorics risk).
  - *Determinism/runtime:* each pack plugs into the composition runtime seam;
    deterministic fixtures per pack.
- **Sub-cycles it spawns.** **Seven independent spec→plan cycles, one per pack** —
  peers, not one phase of work.
- **Contracts introduced.** Seven pack config schemas and their inter-pack
  **compatibility declarations**.
- **Exit.** Packs compose without game-specific editor or MCP changes.
- **Risks retired / carried.** Directly attacks **capability combinatorics**
  (compatibility declarations + composition suites).

### Phase 5 — Asset pipeline

- **Goal.** A normalized, versioned asset manifest with provider adapters,
  provenance, validation, optimization, and stable independent replacement.
- **Advances checkpoint.** None directly; feeds vertical-slice and release
  quality.
- **Depends on.** Phase 3 (the slice's stub asset path). **Can run in parallel
  with Phase 4** — both widen the proven seam on different axes.
- **In scope.** A normalized versioned asset manifest (stable logical ID,
  requirement, provider provenance, license/generation record, source prompt,
  transformation history, optimization status, references); provider adapters
  (environments/props, characters/portraits, textures/materials, animation,
  SFX/ambience/music, UI); validation (type, dimensions, poly/texture/audio
  budgets, import success, missing references, visual-family consistency, browser
  compatibility); independent regeneration behind a stable ID; diagnostic
  fallbacks that can never remain in a release candidate.
- **Explicitly out / deferred.** Photorealism and unbounded asset counts; the
  *content* that references assets (Phase 6); fallback assets shipping in a
  release (explicitly forbidden).
- **Cross-cutting slice.**
  - *Evaluator:* **asset validation** (type, dimensions, budgets, provenance,
    visual-family consistency) wired into the release gate.
  - *Determinism/runtime:* asset generation keyed by stable ID + recorded source
    prompt/seed → independent, reproducible regeneration.
- **Sub-cycles it spawns.** (1) manifest + provenance model; (2) provider-adapter
  interface + first adapters; (3) validation + optimization + regeneration.
- **Contracts introduced.** The **asset manifest schema** and provider-adapter
  interface — consumed by Phase 6 content (references) and Phase 7 repair
  (regenerate-by-ID).
- **Exit.** A failed asset regenerates independently and every release asset has
  valid provenance and browser budgets.
- **Risks retired / carried.** Attacks **asset inconsistency** (stable manifests,
  style references, validation, selective regeneration) and **provider dependence**
  (adapters).

### Phase 6 — Content compiler

- **Goal.** Generate complete world, cast, quest, dialogue, encounter, economy,
  and progression content from `GameSpec` within budgets.
- **Advances checkpoint.** None directly; produces the full-production content
  behind the release candidate.
- **Depends on.** Phase 4 (packs define the schemas content fills) and Phase 5
  (assets content references).
- **In scope.** Per-domain generators sharing the `GameSpec` contract: world
  layout + location graph; character schedules + relationship data; quest +
  dialogue graphs; encounters/rewards/economy; progression; runtime config; and
  generated deterministic acceptance fixtures. Enforce budgets and graph
  invariants *before* browser execution.
- **Explicitly out / deferred.** Mechanics themselves (Phase 4 packs); asset
  generation (Phase 5); *repair* of failing content (Phase 7 — this phase
  *detects* via evaluators, it does not yet close the loop).
- **Cross-cutting slice.**
  - *Evaluator:* deterministic **graph reachability, economy solvency, and
    critical-path completion** over fixed seeds.
  - *Determinism/runtime:* content generation deterministic from a recorded seed
    where practical.
- **Sub-cycles it spawns.** **Five per-domain cycles:** world/location;
  cast/schedules/relationships; quest/dialogue; encounter/economy; progression.
  Peers sharing the `GameSpec` contract, not a monolith.
- **Contracts introduced.** The generated-content project shapes per domain and
  the acceptance-fixture format.
- **Exit.** Deterministic automation can complete the generated critical path.
- **Risks retired / carried.** Directly attacks **content incoherence** (explicit
  facts, state preconditions, arcs, validation).

### Phase 7 — Closed-loop repair

- **Goal.** Wire the evaluators built incrementally in Phases 2–6 into bounded
  repair jobs.
- **Advances checkpoint.** None directly; raises autonomous reliability under all
  three.
- **Depends on.** Phases 2–6 (the evaluators it consumes must already exist — it
  builds none).
- **In scope.** Rank structural, simulation, browser, visual, narrative, and
  performance findings; change the smallest owned slice; re-run focused gates;
  escalate on repeated failure. Implement the repair table's default responses
  (schema → repair from diagnostics; test regression → isolate/revert; unreachable
  quest → graph traces; impossible combat/economy → bounded tuning; asset failure
  → regenerate by ID; budget exhaustion → cut optional before critical). Attempt
  budgets + artifact comparison + escalation to stop oscillation.
- **Explicitly out / deferred.** *Building* evaluators (all pre-built in Phases
  2–6); suppressing or weakening any hard gate or deleting tests to declare
  success (explicitly forbidden).
- **Cross-cutting slice.**
  - *Evaluator:* none new — this phase *consumes* the accumulated suite.
  - *Determinism/runtime:* repair reproduces failures from recorded seeds; repaired
    artifacts are re-verified against the same seeds.
- **Sub-cycles it spawns.** (1) finding-ranking + repair-job orchestration +
  attempt budgets; (2) the per-failure repair strategies
  (schema/test/graph/tuning/asset/budget).
- **Contracts introduced.** The repair-job contract (finding → bounded change →
  focused re-gate → escalate) over the Phase-1 findings surface.
- **Exit.** Seeded platform/content/asset defects are detected and repaired
  without human intervention.
- **Risks retired / carried.** Attacks **repair loops** (attempt budgets, artifact
  comparison, escalation).

### Phase 8 — Golden validation game

- **Goal.** Generate the compact social/crime hub game from a fresh prompt using
  only the three product checkpoints.
- **Advances checkpoint.** **All three** — the end-to-end validation exercises
  Design, Vertical-slice, and Release approval as the only human pauses.
- **Depends on.** Phases 1–7 (every subsystem plus the repair loop).
- **In scope.** Run the full pipeline on the golden prompt; measure and record
  generation time, intervention count, repair count, cost, critical-path
  completion rate, and remaining non-blocking defects; repeat across three
  consecutive fresh runs.
- **Explicitly out / deferred.** New engine/factory capability — this phase
  *validates*, it does not build. Any capability gap found is fed back as new
  pack/generator work, not patched ad hoc in the golden game.
- **Cross-cutting slice.**
  - *Evaluator:* the full accumulated suite under the release pass rule — no new
    evaluator; it widens a proven pipeline.
  - *Determinism/runtime:* three fresh seeds; each run reproducible.
- **Sub-cycles it spawns.** A single validation cycle, plus feedback loops into
  earlier phases for any gap surfaced.
- **Contracts introduced.** None new — consumes all prior contracts; produces the
  success-metrics record.
- **Exit.** Three consecutive fresh runs deliver complete one-to-two-hour games
  with no manual code edits.
- **Risks retired / carried.** The residual **evaluator-blindness** risk (a game
  passes mechanical tests yet is dull) — mitigated by keeping the human
  slice/release checkpoints until evaluation correlates with player judgment.

## 5. Sub-cycle index (ordered program)

Every independent spec→plan cycle the arc spawns — 27 in total — roughly ordered. Order within a
phase is flexible; cross-phase order follows the dependency graph. **Phase 4 and
Phase 5 cycles can interleave.** The remaining program is the part most likely to
churn as earlier phases teach the later ones what they actually need — treat it as
the current best decomposition, revised each cycle.

**Phase 0 (completed 2026-07-12):**

1. Editor entity-ID + render-timing hardening — completed
2. P4 — game-kit browser-shell extraction + scaffold template regen — completed
3. Save/reopen recovery + longer browser acceptance coverage — completed

**Phase 1 (completed 2026-07-13):**

1. Durable build-session substrate (open/swap, atomic persistence, idempotency, typed results)
2. Seeded-generation/replay harness + pack-composition runtime seam

**Phase 2 (completed 2026-07-13):**

1. `GameSpec` schema + supported-envelope definition
2. Compiler/normalization surface + design brief
3. Structural spec-validation evaluator + versioned design-checkpoint artifact

**Phase 3 (completed 2026-07-14):**

1. Vertical-slice integration (one pack + minimal content + one asset + composition + browser/critical-path smoke)

**Phase 4 (seven peers; cycles 1–3 completed — see roadmap for live status):**

1. Interaction & inventory pack — contract v2 + widening completed
2. Branching dialogue & quests pack — completed
3. Schedules & relationships pack — completed
4. Combat & enemy AI pack
5. Economy, shops & progression pack
6. Compact-hub navigation + one vehicle pack
7. Save/load integration pack

**Phase 5 (completed 2026-07-17; ran in parallel with Phase 4):**

1. Asset manifest + provenance model — completed
2. Provider-adapter interface + first adapters — completed
3. Asset validation + optimization + independent regeneration — completed

**Phase 6 (five domain peers):**

1. World layout + location graph generator
2. Cast, schedules & relationships content generator
3. Quest & dialogue graph generator
4. Encounter, rewards & economy generator
5. Progression generator

**Phase 7:**

1. Finding-ranking + repair-job orchestration + attempt budgets
2. Per-failure repair strategies (schema/test/graph/tuning/asset/budget)

**Phase 8:**

1. Golden-game generation + three-run validation + metrics record

## 6. Source of truth & redirects

- **Status & sequencing** → [`/docs/ROADMAP.md`](/docs/ROADMAP.md). Update the
  roadmap when a phase or sub-cycle changes status; do not track status here.
- **Strategy & architecture** → the
  [Autonomous Game Factory design](/docs/superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md).
  The full `GameSpec` interface, six-subsystem architecture, complete evaluator
  taxonomy, repair table, risks, and success metrics live there.
- **Phase decomposition** → **this document.** Per-phase scope, dependencies,
  cross-cutting slices, sub-cycles, contracts, and exit criteria.

**Redirects applied when this doc lands:** the founding design's "Implementation
phases" section gains a pointer to this document as the decomposition of record
(retaining its goals + exit criteria as design rationale), and ROADMAP.md §3
gains a one-line pointer here for the decomposition while remaining the source of
truth for status.
