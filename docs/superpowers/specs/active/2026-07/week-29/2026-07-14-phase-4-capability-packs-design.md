# Phase 4 — Capability packs — Design (umbrella)

Status: approved design. Date: 2026-07-14.
Scope source: [Phase 0→8 decomposition](../../2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md) §Phase 4;
status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 4.
Strategy source: [Autonomous Game Factory design](/docs/superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md)
§Core model, §Evaluator taxonomy, §Risks (capability combinatorics).

This is the **phase umbrella spec**: it pins the shared contracts every pack
cycle builds against and the per-pack template that makes the seven cycles
fill-in-the-blanks peers. Each pack cycle gets its own implementation plan;
only cycle 1's plan is written with this spec. Phase 4 runs **in parallel with
Phase 5** — the two touch disjoint code except `@automata/contracts`, where
Phase 5 owns `assetManifest.ts` and Phase 4 does not touch it.

## 1. Goal and non-goals

**Goal.** Widen from the Phase 3 slice to the initial seven reusable gameplay
packs — interaction/inventory, dialogue/quests, schedules/relationships,
combat/enemy AI, economy/shops/progression, compact-hub navigation + one
vehicle, save/load integration — such that **packs compose without
game-specific editor or MCP changes** (the phase exit).

**Non-goals (explicitly deferred).**

- Bespoke game-specific TypeScript — an escape hatch only; every escape is
  logged as a capability gap.
- Packs beyond the seven.
- Content *generation* at scale (Phase 6): packs define mechanics and schemas
  plus a seeded minimal `composeSection`; the content compiler that fills
  them richly is Phase 6.
- Asset pipeline work (Phase 5, parallel).
- Rich per-pack editor UI. Per the 80/20 editor rule, each pack ships prefab
  entity templates and enough preview to *see* its entities — the editor is a
  trust/correction surface, not an authoring engine.

## 2. Decisions of record

Settled during brainstorming, binding for all seven cycles:

- **Umbrella + per-cycle plans.** This spec pins shared contracts; each pack
  is its own spec→plan cycle referencing this document. Later packs may add a
  short per-pack design note only if their mechanics demand decisions this
  umbrella does not cover.
- **Cycle 1 widens `interaction-inventory`** to the full template before any
  new pack is built — it finalizes the template on the best-known pack and
  carries the contract-v2 work.
- **Contract v2 lands whole in cycle 1** (compatibility declarations, state
  slices, events, persistence slot) so packs 2–7 build against a stable seam.
  Evolving `GamePack` breakingly is acceptable now exactly once: the only
  real pack is `interaction-inventory` and cycle 1 migrates it in the same
  change.
- **Persistence slot is pinned in cycle 1** even though the save/load pack
  ships last: every pack implements `saveState`/`loadState` over its owned
  slices as it lands, so the save/load cycle is orchestration, not a
  seven-pack retrofit.
- **Cycle order** (after cycle 1): dialogue & quests; schedules &
  relationships; combat & enemy AI; economy/shops/progression; compact-hub
  navigation + vehicle; save/load integration. Order within the phase is
  flexible where dependencies allow; the compatibility table (not the
  calendar) is the true constraint.

## 3. Pack contract v2 (the shared seam)

Four additions to the Phase 3 `GamePack` interface in
`packages/game-kit/src/packs.ts`, all defined in cycle 1.

### 3.1 Compatibility declarations

Each pack gains a declaration consumed at compose time:

```ts
interface PackCompatibility {
  requires: readonly string[]        // pack ids that must be present
  conflictsWith: readonly string[]   // pack ids that must be absent
  integratesWith: readonly string[]  // optional synergy; degrades gracefully
  stateSlices: { owns: readonly string[]; reads: readonly string[] }
  events: { emits: readonly string[]; consumes: readonly string[] }
}
```

`composePacks` validates the declared graph of the selected set — missing
requirements, conflicts, duplicate slice ownership, consumed events nobody
emits (warning-level for `integratesWith`-only edges) — and fails with a
typed finding. This is the decomposition's named answer to
capability-combinatorics risk, enforced mechanically at compose time.

### 3.2 Shared world-state slices

`PackWorldState` stops growing ad hoc. Packs contribute **named state
slices** to a typed registry keyed by slice id (e.g. `inventory`,
`questLog`, `relationships`, `wallet`). A pack declares which slices it
*owns* (sole writer) and which it *reads*; ownership collisions are
compose-time errors. Cross-pack reads go through the slice registry — the
dialogue pack reads `inventory` without importing the inventory pack. The
engine-owned world basics (`playerPosition`) remain on `PackWorldState`;
slices carry pack-domain state.

### 3.3 Typed pack events

A minimal synchronous event bus in `game-kit`: packs emit and subscribe to
named events with typed payloads (`itemAcquired`, `questCompleted`,
`dialogueEnded`, …). Event names and payload schemas are part of a pack's
public contract and are listed in its compatibility declaration. Events are
the integration mechanism between packs; direct pack→pack imports remain
forbidden (registry stays the only module that knows the full set).

### 3.4 Persistence slot

`PackRuntimeHandle` gains optional `saveState(): unknown` /
`loadState(state: unknown): void` over the pack's owned slices, with a
per-pack zod schema for the saved shape. The save/load pack (cycle 7)
orchestrates: gather slices → versioned save blob → restore. Until then the
slot is exercised by each pack's headless eval fixtures (save → mutate →
load → assert round-trip).

## 4. Evaluation: composition-matrix harness

Cycle 1 stands up a generated composition-matrix harness in
`pack-registry`'s test tree (it is the one module that already knows the full
pack set; promote to a sibling package only if it outgrows that home): for
every *declared-compatible* pack pair, compose both
packs with their deterministic fixtures and run

1. headless simulation through each pack's `PackEvalHook`, and
2. a browser boot smoke of the composed pair (existing browser-eval seam).

Each pack cycle adds its row; by pack seven the harness covers all
compatible pairs automatically. Scenario suites (3+ packs, e.g. the
first-light composition, later the golden-game set) ride the same harness.
Conflicting pairs get a *negative* test: composing them must fail with the
typed compatibility finding. This is the phase's evaluator slice — it grows
with each pack instead of arriving late.

## 5. The per-pack cycle template

The umbrella pins what "done" means for any pack cycle:

1. Real `GameSpec` capability config schema replacing the Phase 2 stub in
   `capabilityConfigSchemas` (`contracts/src/gameSpec.ts`).
2. Project component/resource schemas (zod, via `@automata/project`
   re-export) + compiler/runtime systems as a pure core with a browser
   `GamePack` adapter — the `pack-interaction-inventory` package shape.
3. Seeded `composeSection` generating the pack's minimal content
   deterministically from spec + seed.
4. Headless eval hook + deterministic fixtures (including persistence
   round-trip).
5. Editor prefab templates + preview (thin, §1 non-goals).
6. Compatibility declaration + its rows (positive and negative) in the
   composition matrix.
7. Generated acceptance tests wired into the existing build/test/browser/
   evaluate gates.

A pack cycle is complete when all seven items land and `npm run ci`,
`verify:new-game`, and the composition matrix are green.

## 6. Cycle 1 scope (plan: 2026-07-14-phase-4-cycle-1-pack-contract-v2.md)

1. Contract v2 in `game-kit` (§3, all four parts) + `composePacks`
   compose-time validation with typed findings.
2. Widen `pack-interaction-inventory` to the full template: `inventory`
   state slice, `itemAcquired` event, persistence slot, editor prefab
   templates + preview, compatibility declaration.
3. Composition-matrix harness (§4) — initially a one-pack matrix that
   first-light's composition rides.
4. Regression proof: `games/first-light` recomposes bit-identically (or
   with a reviewed diff) under contract v2; all existing gates stay green.

## 7. Exit criteria

- All seven packs land per the template (§5).
- Packs compose without game-specific editor or MCP changes; any bespoke
  TypeScript escape is logged as a capability gap.
- The composition matrix runs all declared-compatible pairs green and all
  declared conflicts red-with-typed-finding.
- Every pack's persistence round-trip passes headlessly; the save/load pack
  round-trips a full multi-pack composition.

## 8. Risks

- **Contract v2 under-specifies a later pack's needs** (combat timing,
  vehicle physics). Mitigation: contract v2 is additive-extensible (new
  optional handle methods, new slices/events); the escape-hatch log feeds
  gaps back into the umbrella rather than into bespoke code.
- **Pairwise green ≠ full-set green.** Mitigation: scenario suites on the
  same harness from cycle 2 onward; the golden-game set is the final
  scenario.
- **Editor prefab scope creep.** Mitigation: §1 non-goal is binding; prefab
  templates + visibility only.

## 9. Capability-gap log

- **Cycle 2 — inventory-owned item consumption.** Dialogue fetch turn-ins can
  verify possession but cannot consume items without an inventory-owned API.
- **Cycle 3 — shared quest-giver movement.** Moving dialogue-owned quest givers
  needs shared NPC-position ownership rather than a second pack mutating them.
- **Cycle 4 — pack-initiated player teleport.** Real respawn-at-spawn needs an
  additive world-effect seam in game-kit and the eval harness; second wind in
  place is the deterministic interim behavior.
