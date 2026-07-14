# Phase 3 — Vertical slice · first playable — Design

Status: approved design. Date: 2026-07-13.
Scope source: [Phase 0→8 decomposition](../../2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md) §Phase 3;
status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 3.
Strategy source: [Autonomous Game Factory design](/docs/superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md)
§Core model, §Human checkpoints, §Evaluator taxonomy.

## 1. Goal and non-goals

**Goal.** Drive one minimal `GameSpec` through the thinnest version of every
layer — one capability pack, trivially generated content, one placeholder
asset through a stub asset path, composed by the runtime — into a **genuinely
playable artifact** that passes the first browser evaluation (boot, console,
frame-time) and a critical-path completion smoke, and is presented at the
**vertical-slice checkpoint** (product checkpoint 2). This retires the
factory's integration risk: prompt → spec → compose → play → evaluate is
proven end-to-end before any layer is built at scale.

Two contracts introduced here become templates the later phases widen:

1. the **capability-pack interface v1** (proven by one real pack);
2. the **runtime composition contract** (spec + pack + content + asset →
   playable).

**Non-goals (explicitly deferred).** Breadth. Exactly one pack, one asset,
minimal content — no second pack (Phase 4), no content compiler (Phase 6), no
real asset providers (Phase 5), no editor-preview awareness of pack content
(the editor keeps the base evaluate; noted as a deferred gap). The point is
the *seam*, not scale.

## 2. Decisions of record

Settled during brainstorming, binding for the plan:

- **The one pack is `interaction-inventory`** — root of the capability
  compatibility table (three other packs require it). Base player movement
  already comes from the scaffold's sim; the pack adds interactable pickups
  and a minimal inventory HUD. Critical path: collect the required items,
  then reach the goal.
- **Content is trivially generated,** not hand-authored: a deterministic
  seeded compose step (new MCP tool) maps the spec into project content, the
  composition manifest, and the placeholder asset. Proving the spec→compose
  seam is the phase's entire point.
- **The slice game is checked in** as `games/first-light`, created via
  `createGame`, participating through the registry convention (no catalogs,
  no root-file edits, `automata.devPort` in its own `package.json`).
- **Composition is data-driven.** Compose writes a composition manifest (pack
  ids + configs + spec provenance) next to the project files; the *generic*
  `main.ts` template resolves manifest pack ids against a static pack
  registry and boots them via `composePacks`. Packs compose with **no
  game-specific code changes** — pre-proving Phase 4's exit criterion.
- **The pack interface evolves breakingly.** No real pack exists and the only
  caller is the template's `composePacks([])`; evolving the seam now is
  cheaper than compatibility shims. The result is the named capability-pack
  interface v1.
- **Determinism boundary.** `compose:game` is a hash-guarded seeded step:
  same spec hash returns the cached result; `replayStep` re-runs the compose
  from the recorded seed and must reproduce the recorded output hash. The
  checked-in composed files are additionally pinned by a compose-parity test.

## 3. Architecture and data flow

```
@automata/contracts        composition-manifest + asset-manifest-stub schemas,
                           capability config schemas, compose/slice tool defs,
                           SliceEvidence, 'compose' finding source
        ▲
@automata/game-kit         capability-pack interface v1 (packs.ts),
   (+contracts dep)        PackEvalHook (packEval.ts), loadComposition
        ▲
@automata/pack-            pure inventory core + browser GamePack adapter +
  interaction-inventory    eval hook + seeded compose section + fixtures
        ▲
@automata/pack-registry    STANDARD_PACKS, resolvePacks, resolveEvalHooks —
                           the only place that knows the full pack set
        ▲ (games)                          ▲
@automata/game-compose     pure composeGame(spec, seed, specHash) and
                           renderSliceReport(evidence); no I/O
        ▲
tools/editor-mcp-server    composeGame / renderSliceReport / recordSliceDecision;
                           composes game-compose + build-session; adapter only
```

Dependency direction stays leafward: `editor-mcp-server → game-compose →
pack-interaction-inventory → game-kit → engine/contracts`; games depend on
`pack-registry → packs → game-kit`. **game-kit never depends on packs** — the
registry package inverts that, so the runtime seam stays pack-agnostic and
Phase 4 adds packs by touching packs + the registry table only. All new
packages sit flat under `packages/` (workspaces/vitest globs pick them up;
zero root-file edits). New packages join game-kit's eslint boundary regime;
`z` only via re-export.

The flow, end to end:

1. **Spec.** The Phase 2 surface as shipped: `createGame`, agent-drafted
   spec, `compileGameSpec`, `renderDesignBrief`, `recordDesignDecision`
   (approve freezes the spec version).
2. **Compose.** `composeGame(gameId)` gates on design approval, runs the
   seeded `compose:game` step, and writes through: composition manifest,
   seeded base content, placeholder asset, asset-manifest stub.
3. **Play.** The generic `main.ts` loads the project *and* the composition
   manifest, resolves packs from the registry, boots them via `composePacks`,
   and drives the composed runtime from the fixed-step loop. The game is
   playable at `npm run dev -w first-light`.
4. **Evaluate.** The headless `check:evaluate` becomes composition-aware and
   completes the critical path deterministically; the enriched Playwright
   smoke checks boot, console, and frame-time through `runBrowserEval`.
5. **Checkpoint.** `renderSliceReport` assembles the evidence artifact;
   `recordSliceDecision` journals `checkpoint:slice` with hash guards.
   Approval freezes the reviewed tuple (spec hash, composition hash, content
   hash); any recompile or recompose reverts status to pending automatically.

## 4. Capability-pack interface v1

In `packages/game-kit/src/packs.ts` — the named phase contract. `register`
gains a boot context and returns a runtime handle; `boot` returns a composed
runtime the game loop drives. Player state flows **in** as an argument (no
circular pack↔gameplay binding); win-gating flows **out**:

```ts
interface PackBootContext { host: GameHost; render: RenderPort }
interface PackWorldState { playerPosition: { x: number; z: number } }
interface PackRuntimeHandle {
  fixedUpdate?(dt: number, world: PackWorldState): void
  render?(alpha: number): void
  /** Win-condition gate; the composed runtime ANDs all gates (vacuously true). */
  objectivesComplete?(): boolean
  dispose?(): void // deferred onto host.cleanup
}
interface GamePack<TConfig = unknown> {
  id: string
  version: string
  configSchema?: { parse(input: unknown): TConfig }
  register(ctx: PackBootContext, config: TConfig): PackRuntimeHandle | void
}
// composePacks(packs, configs) => { packIds, boot(ctx): ComposedRuntime }
```

Kept from Phase 1: id dedupe at compose time, declaration-order boot, config
parsing through `configSchema`, cleanup deferral. `composePacks([]).boot(ctx)`
returns an inert runtime (`objectivesComplete() === true`) — pack-less games
behave exactly as today.

The headless twin, `packages/game-kit/src/packEval.ts`:

```ts
interface PackEvalHook {
  packId: string
  createState(): unknown
  /** Next waypoint the scripted evaluator should seek, or null when satisfied. */
  nextTarget(state: unknown, player: { x: number; z: number }): { x: number; z: number } | null
  step(state: unknown, player: { x: number; z: number }): unknown
  complete(state: unknown): boolean
}
```

Plus `loadComposition(reader)` in `packages/game-kit/src/composition.ts`:
reads `composition.json` through the existing project reader and parses it
with the contracts schema; missing/invalid manifests throw a diagnosable
error surfaced by `renderBootError`.

## 5. Contracts

All in `packages/contracts/src`, zod v4 strict objects per the repo rules.

- **`composition.ts` — the runtime composition contract.**
  `compositionManifestSchema`: `{ formatVersion: literal 1, gameId, source:
  { specVersion, specHash, seed } | null, packs: [{ id, version, config }]
  (≤7), assets: [{ id, path }] (≤80) }`, plus `parseCompositionManifest` and
  `emptyComposition(gameId)`. The manifest lives as a **separate file**
  `public/project/composition.json`: readable via `createProjectReader`,
  inside the session content snapshot, and — because `loadProjectFiles` reads
  only manifest-referenced files — requiring **no project formatVersion
  migration**. `source: null` marks a plain scaffold never composed from a
  spec.
- **`assetManifest.ts` — the pre-Phase-5 stub,** forward-compatible with the
  Phase 5 manifest (stable logical ID, requirement, provenance, validation
  status): entries `{ id (= spec assetRequirement id), requirement, path,
  provenance: { provider: 'stub-generator', generator, specVersion, seed },
  validation: { status: 'placeholder' | 'validated' } }`. Placeholder status
  is the hook Phase 5 uses to forbid stubs in release candidates.
- **`gameSpec.ts` — the first real capability config.**
  `capabilitySelectionSchema` becomes a discriminated union on `id`;
  `capabilityConfigSchemas['interaction-inventory'] = strictObject({
  requiredItems?: int 1..8, interactRadius?: number 0.5..5 })`; the other six
  stay empty stubs. **All fields optional, no `.default()`** — `config: {}`
  still parses to itself, so stored specs, fixtures, and checkpoint hashes
  are untouched; compose applies `INVENTORY_DEFAULTS = { requiredItems: 1,
  interactRadius: 1.5 }` instead.
- **`session.ts`.** Add `'compose'` to `findingSourceSchema` (additive; old
  sessions still parse).
- **`composeTools.ts`.** Tool defs and arg parsing for `composeGame`,
  `renderSliceReport`, `recordSliceDecision`; unified dispatch order becomes
  workspace → session → spec → compose → project.
- **`sliceReport.ts`.** `SliceEvidence { gameId, specVersion, specHash,
  compositionHash, seed, packIds, contentHash, gates: [{ kind: build | test |
  browser | evaluate, status: passed | failed | missing | stale, stepId? }],
  acceptance, evalMetrics, howToPlay }` — shared by the server (assembler)
  and game-compose (renderer).

## 6. Interaction-inventory pack v0

`packages/pack-interaction-inventory/src`:

- **`core.ts` (pure — no DOM/clock/RNG).** `InventoryPackConfig {
  interactRadius, items: [{ id, position: {x, z} }], iconPath: string | null }`,
  `createInventoryState`, `stepInventory` (pickup within `interactRadius`),
  `inventoryComplete`, `nextItemTarget` (nearest uncollected), and the strict
  `packConfigSchema` validated at boot.
- **`pack.ts` (browser adapter).** `interactionInventoryPack: GamePack` — id
  `interaction-inventory`, version `1.0.0`. Registers one small sphere
  renderable per item via `ctx.render.add`, appends an inventory HUD div to
  `host.overlays` (icon `<img>` when `iconPath` is set, `0/N` count). The
  returned handle steps inventory from `world.playerPosition`, removes
  collected renderables, updates the HUD; `objectivesComplete` delegates to
  `inventoryComplete`; `dispose` removes renderables and HUD.
- **`evalHook.ts`.** `createInventoryEvalHook(config): PackEvalHook` over the
  pure core (`nextTarget = nextItemTarget`, `complete = inventoryComplete`).
- **`composeSection.ts` (pure, seeded).**
  `composeInventorySection({ specConfig, arena, iconPath }, rng)` — seeded
  item placement inside the arena with minimum separation from spawn, goal,
  and each other (rejection sampling with a deterministic step budget).
- **Deterministic fixtures** shared by unit tests and the critical-path
  smoke.

## 7. Compose engine

`packages/game-compose/src` — pure functions, no I/O, mirroring
`@automata/game-spec`'s discipline:

- **`composeGame({ spec, seed, specHash }): ComposeResult`** — creates its
  own `createSeededRng(seed)`; rejects specs selecting capabilities other
  than `interaction-inventory` with the typed issue
  `compose-unsupported-capability` (the Phase 3 breadth guard). Emits
  `files: [{ path, text }]` relative to the game dir:
  - `public/project/composition.json` — `source: { specVersion, specHash,
    seed }`, one pack entry with the fully composed `InventoryPackConfig`
    (spec config + defaults + generated items + `iconPath`), asset refs;
  - `public/project/resources/tuning.resource.json` — seeded goal position:
    real generated base content, serialized byte-stable exactly like
    `projectFilesFromSnapshot`;
  - `public/assets/item-icon.svg` — a deterministic generated SVG (spec asset
    kind `ui`; hue/shape drawn from the rng). Chosen because `RenderPort` has
    no texture support — a texture/model placeholder would demand engine
    render changes, which is over-scope. The SVG still exercises the whole
    stub path: requirement → generator → file → manifest with provenance →
    referenced by id → loaded in the browser and asserted by e2e;
  - `public/assets/assets.json` — the asset-manifest stub.
- **`renderSliceReport(evidence): string`** — markdown mirroring
  `renderDesignBrief`: identity header; spec/composition/content hashes and
  seed; the gate table (build/test/browser/evaluate with status and step
  ids); acceptance criteria grouped by kind with the evaluator covering each
  (`structural → spec:compile`, `simulation → check:evaluate`, `browser →
  check:browser`, `manual → this checkpoint`); eval metrics; and "How to
  play" (`npm run dev -w first-light`, URL, controls).

## 8. MCP tool surface

Wired in `tools/editor-mcp-server/src/composeTools.ts`, mirroring
`specTools.ts` (seeded steps, checkpoint guards, atomic writes):

| Tool | Behavior |
|---|---|
| `composeGame` | Read spec (fail with guidance if missing) → gate on `designCheckpointStatus === 'approved'` → `runSeededStep('compose:game', { specHash }, (_rng, seed) => composeGame(...))`, cached by spec hash and replay-safe → atomic write-through of every composed file under `games/<id>/` → `noteContentHash` (the session must not flag its own writes as out-of-band) → `autoResolve('compose')`. Failures return typed findings (`compose-failed`, `compose-unsupported-capability`, `compose-requires-approval`) and write nothing. |
| `renderSliceReport` | Assemble `SliceEvidence` from the ledger — latest `compose:game` step (fail if none) and latest build/test/browser/evaluate steps, each classified passed/failed/stale/missing against the current content hash → `runSeededStep('slice:report', { evidenceHash }, …)` → write `artifacts/slice-report.md`. The report renders even with red or missing gates; only the decision is gated. |
| `recordSliceDecision` | Require a `slice:report` step for the current evidence hash (report-covers-decision guard); on **approve**, additionally require all four gates `passed`; `journalStep('checkpoint:slice', { result: { decision, reason, specVersion, specHash, compositionHash, contentHash } })`. |

`sliceCheckpointStatus(engine, { specHash, compositionHash })` mirrors
`designCheckpointStatus`. **Approval freezes the reviewed tuple** (spec hash,
composition hash, content hash): a spec recompile (which already requires
`changeReason` post-design-approval) or a recompose changes the hashes, so
the slice checkpoint reverts to pending automatically — no extra state.

## 9. Scaffold template evolution

All template changes are generic — no game names in logic; run
`npm run verify:new-game` after:

- **`mainTs()`** — `loadComposition(createProjectReader())` →
  `resolvePacks(ids)` + per-pack configs → `composePacks(...).boot({ host,
  render })`; gameplay receives `objectiveGate: () =>
  runtime.objectivesComplete()`; the loop calls `runtime.fixedUpdate(dt,
  { playerPosition })` and `runtime.render(alpha)`.
- **`gameplayTs()`** — optional `objectiveGate`: reaching the goal while the
  gate is false holds `running` (position/elapsed advance; the sim stays
  pure and untouched).
- **`evaluationTs()`** — `evaluateProject(snapshot, opts, composition =
  emptyComposition(id))`: scripted control seeks the first non-null
  `hook.nextTarget(...)`, else `seekGoal`; success requires every hook
  complete; metrics gain `itemsCollected` / `objectivesComplete`. An empty
  composition reproduces today's behavior byte-for-byte.
- **`projectIndexTs()`** — `loadHeadlessRegistration` reads the composition
  (or empty) so `check:evaluate` is composition-aware with no MCP plumbing.
  The editor registration keeps the base evaluate (deferred gap, §1).
- **`plan.ts` / `configFiles.ts`** — emit `composition.json` =
  `emptyComposition(name)`; add the `@automata/pack-registry` dependency.
- **`testFiles.ts`** — gameplay gate tests; eval-hook routing test; and the
  **enriched e2e smoke**: `page.on('console')` error capture alongside
  `pageerror`, frame-time via a rAF sampling loop (120 frames after the
  canvas is visible) with a **p95 < 50 ms** budget — deliberately generous
  for SwiftShader CI; fallback if flaky in practice: move the frame-time
  assertion to the slice's own spec.

## 10. Demo slice game — `first-light`

Scaffolded via `createGame`; themed as "relight the beacon." Its spec draft
ships as the fixture `firstLightGameSpecDraft()` in
`packages/contracts/src/gameSpecFixtures.ts` and compiles to
`games/first-light/gamespec.json`:

- budgets `{ targetMinutes: 30, districtCount: 1, interiorCount: 0,
  characterCount: 1, mainQuestCount: 2, sideQuestCount: 0, enemyTypeCount: 0,
  assetBudget: 1, buildTimeMinutes: 30 }`;
- capabilities `[{ id: 'interaction-inventory', config: { requiredItems: 2,
  interactRadius: 1.5 }, requirements: [...] }]`;
- one district, player-only cast, beginning/ending beats, two main quests
  (`q-cells`, `q-beacon`), one `ui` asset requirement (`item-icon`), and
  acceptance criteria of all four kinds (structural, simulation, browser,
  manual).

The composed artifacts are checked in: `composition.json` with the recorded
seed, the seeded tuning resource, the SVG, and the asset-manifest stub.
Game-local test change (the one deliberate deviation from the template): the
template-parity content test is replaced by a **compose-parity test** —
checked-in composed files must equal `composeGame(spec, recordedSeed,
recordedSpecHash)` byte-for-byte — plus `e2e/slice.spec.ts` (inventory HUD
shows `0/2`, the icon loads, `composition.json` fetch succeeds).

## 11. Error handling

- Every failure is a typed finding through the P5 surface: compose gating
  (`compose-requires-approval`), unsupported capabilities, and write errors
  from `composeGame`; unknown pack ids fail `resolvePacks` with a typed
  message; a missing/invalid `composition.json` throws a diagnosable boot
  error rendered by `renderBootError`.
- Composed writes are atomic (tmp + rename, the `writeGameSpec` pattern) —
  a crash mid-compose cannot leave torn files; nothing is written on
  validation failure; cached re-runs return `cached: true`.
- Approving a slice whose evidence hash no longer matches the ledger (spec
  recompiled, content recomposed, checks stale) is refused; the checkpoint
  reverts to pending by construction (§8).

## 12. Testing

TDD throughout, per AGENTS.md; commit after each verified milestone.

- **Unit.** Contracts schema cases (parse/reject/round-trip; `config: {}`
  unchanged for every capability; interaction-inventory bounds); pack pure
  core state machine + adapter against `createNullRenderer()` and happy-dom
  (renderable add/remove, HUD text, gate flips, dispose-to-zero); seeded
  compose-section placement determinism and constraints; `composeGame`
  determinism and byte-stability; slice-report rendering; pack-registry
  resolve/unknown-id/eval-hooks; game-kit pack interface v1 (order, config
  parse, dispose defer, gate aggregation, inert empty runtime).
- **Integration (`tools/editor-mcp-server`).** The composeFlow acceptance
  test over a real session with the existing injectable seams (fs, spawner,
  headless host, seedSource, clock): createGame → compileGameSpec → brief →
  approve → composeGame (files written; cached on repeat; rejected before
  design approval) → evaluate (passes the critical path) → checks via fake
  spawner → renderSliceReport (hashes + gate table in the artifact) →
  recordSliceDecision (approve; plus the reject path, red-gate refusal, and
  stale-after-recompose reopening) → `replayStep` on the compose step
  reproduces the recorded hash.
- **Slice game.** Compose-parity test pins the checked-in bytes; slice e2e
  covers HUD/icon/composition; the enriched shared smoke covers
  boot/console/frame-time.
- **Gates.** `npm run ci`, `npm run verify:new-game`,
  `PLAYWRIGHT_ONLY=first-light npx playwright test games/first-light/e2e`,
  `npm run coverage` for the game-kit changes.

## 13. Exit criteria

Matching the decomposition doc:

- A thin but genuinely playable artifact (`games/first-light`) runs
  end-to-end from a minimal `GameSpec`: spec → seeded compose → data-driven
  pack composition → playable in the browser.
- The first browser evaluation (boot, console, frame-time) and the
  critical-path completion smoke both pass through the session's typed
  findings surface.
- `compose:game` replays deterministically from its recorded seed with an
  identical output hash, and the checked-in composed artifacts match a fresh
  compose byte-for-byte.
- The vertical-slice checkpoint round-trips over MCP: evidence report
  rendered, decision recorded, approval freezes the reviewed tuple, and any
  spec/composition change reopens the checkpoint.

## 14. Risks retired / carried

**Retires the integration risk** — the reason this phase exists: every seam
the factory depends on (spec → compose → pack runtime → asset path →
evaluators → checkpoint) is exercised end-to-end on one thin playable before
Phases 4–6 invest at scale. Also pre-proves Phase 4's composition exit
criterion (packs compose data-driven, without game-specific code) and gives
Phase 5 a forward-compatible asset-manifest shape with provenance and a
placeholder-status hook.

**Carries forward:** pack content lives in the composition manifest's config,
not pack-owned project component types — definition-merging is Phase 4
machinery; editor preview of pack content is deferred with it. The asset stub
is one `ui` SVG — real providers, budgets, and visual-family validation are
Phase 5's. The critical-path smoke drives the scaffold's seek-control — real
quest-graph traversal arrives with Phase 6 content. Cut candidates recorded
during design (default = keep): the seeded tuning rewrite, frame-time in the
shared template, the design-approval gate on compose, the `manual` acceptance
criterion.
