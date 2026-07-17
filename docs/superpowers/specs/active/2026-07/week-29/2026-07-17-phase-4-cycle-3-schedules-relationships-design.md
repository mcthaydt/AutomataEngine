# Phase 4 cycle 3 — Schedules & relationships pack — Design

Status: approved design. Date: 2026-07-17.
Umbrella: [Phase 4 — Capability packs](2026-07-14-phase-4-capability-packs-design.md)
(contract v2 §3, matrix §4, per-pack template §5). Status/sequencing:
[`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 4 cycle 3.

The third pack cycle: `@automata/pack-schedules-relationships`, the "living
world" pack — a discrete game clock, small scheduled ambient crowds, and
per-NPC relationship tiers driven by quest completion. It is the first pack
whose pair rows are structurally unsatisfiable (it requires `dialogue-quests`,
which requires `interaction-inventory`), so this cycle also stands up the
matrix harness's **first 3-pack scenario suite** — the umbrella's answer to
"pairwise green ≠ full-set green". Follows the `pack-interaction-inventory` /
`pack-dialogue-quests` package template exactly; deviations are called out
where they occur.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Discrete time slots on a game clock.** A fixed four-slot cycle —
  morning, afternoon, evening, night — advanced deterministically by the
  fixed-timestep loop (`slotSeconds` per slot). No continuous day clock, no
  interpolated waypoint routes.
- **Straight-line walks at constant speed.** On slot change a scheduled NPC
  walks directly toward its new station (the arena is open; stations are
  keepout-validated at compose time). Arrival is deterministic; walkers idle
  at their station until the next slot change.
- **Only `ambient` cast members are scheduled.** Quest-giver NPCs stay
  static: the dialogue pack owns their markers, positions, and talk radius,
  and moving them would require shared NPC-position ownership across packs
  (a new slice plus dialogue-pack changes). Moving quest-givers is **logged
  as a capability gap** for a later cycle, not smuggled in here.
- **Relationships change via `questCompleted` only.** Affinity is tracked
  per main-quest giver and raised by consuming the dialogue pack's
  `questCompleted` event (+1 to that quest's giver). The `dialogueEnded`
  gain is deferred: dialogue-in-progress state is internal to the dialogue
  pack, so the headless twin cannot observe it without a further eval-seam
  extension — that feeds back into the umbrella if a later cycle needs it.
- **No dialogue-pack changes.** Relationship-gated dialogue choices (a
  `relationship` condition kind) are deferred; the `relationships` slice
  exists precisely so a later cycle or Phase 6 content can light that up via
  a cross-pack read.
- **first-light stays frozen.** The triple composition is proven by the
  scenario suite (headless completion + null-renderer boot), not by widening
  the checked-in slice game. first-light must keep recomposing
  bit-identically.
- **One package, three pure cores.** `clockCore.ts`, `scheduleCore.ts`, and
  `relationshipCore.ts` are separate pure modules inside one
  `@automata/pack-schedules-relationships` package; the pack adapter and
  eval hook wire them together.

## 2. Contracts

### 2.1 GameSpec capability config

`capabilityConfigSchemas['schedules-relationships']` (in
`contracts/src/gameSpec.ts`) replaces its Phase 2 stub with:

```ts
z.strictObject({
  slotSeconds: z.number().min(5).max(120).optional()
})
```

Only `slotSeconds`. Ambient crowd size derives from the spec's `cast`
(bounded by `budgets.characterCount`); duplicating it here would create two
sources of truth. Per the Phase 2 hash rule the field is optional with **no
zod default**; `SCHEDULE_DEFAULTS = { slotSeconds: 20 }` is applied by
`composeSection`.

### 2.2 Compatibility declaration

```ts
packCompatibility({
  requires: ['dialogue-quests'],
  stateSlices: { owns: ['clock', 'relationships'], reads: ['questLog'] },
  events: { emits: ['timeSlotChanged', 'relationshipChanged'], consumes: ['questCompleted'] }
})
```

Matches `DEFAULT_CAPABILITY_COMPATIBILITY` (schedules-relationships requires
dialogue-quests). The cycle-2 spec already named this pack as the `questLog`
slice's declared future consumer; the read is exercised by the eval twin
(§4.2). `clock` is a slice (not internal state) because later packs — combat
encounters, shop hours — are plausible time-of-day readers.

### 2.3 Pack config (compiled)

Strict zod schema (`packConfigSchema` composed from the three cores,
exported from the package):

- `slotSeconds: number` (5–120)
- `slotCount: 4` (literal; slot names morning/afternoon/evening/night are a
  fixed exported tuple, not config)
- `walkers: [{ id, name, speed, stations: [{x, z}] }]` — `stations` has
  exactly `slotCount` entries (station for slot i); `speed` in units/sec,
  bounded
- `relationships: { tracked: [{ npcId, questIds }], thresholds: { acquaintance, friend }, gains: { questCompleted } }`
  — `tracked` lists main-quest givers with the quest ids they give;
  thresholds are strictly increasing positive integers

The schema **cross-validates references** via `superRefine`: walker ids
unique, station arrays exactly `slotCount` long, tracked `npcId`/`questIds`
non-empty and unique. Tracked givers and quest ids resolving against the
*dialogue* section is validated at compose time by `composeSection` (§4.1),
the only place both sections are in scope.

## 3. Pure cores and browser runtime

### 3.1 `clockCore.ts`

Pure fixed-dt accumulator. State: `{ slot: 0..3, elapsedInSlot: number }`.
`stepClock(state, dt, slotSeconds)` returns the next state plus
`slotChanged: boolean` (wrapping 3 → 0). No wall clock, no `Date` — time
advances only through the fixed-timestep loop, so headless and browser twins
agree tick-for-tick.

### 3.2 `scheduleCore.ts`

Pure walker movement. `walkerTarget(walker, slot)` is the station for the
current slot; `stepWalker(position, target, speed, dt)` moves straight
toward the target, clamping to exact arrival (no overshoot oscillation).
Walkers are decorative: no collision with the player or each other, no
pathfinding — the open arena and keepout-validated stations make straight
lines safe.

### 3.3 `relationshipCore.ts`

Affinity map keyed by tracked npc id, all starting at 0.
`applyQuestCompleted(state, questId, config)` bumps the giver of that quest
(unknown quest ids are ignored — side quests are untracked by design).
`tierOf(affinity, thresholds)` maps to `'stranger' | 'acquaintance' |
'friend'`. `relationshipsComplete` — the pack's `objectivesComplete` gate —
is true when **every tracked giver is at least `acquaintance`**. Because
tracked givers are exactly the main-quest givers and gains come from
completing their quests, the gate is reachable precisely when the dialogue
pack's own all-main-quests gate is — the composed headless drive terminates.

Persistence (contract v2 slot): saves `{ clock, affinities }` with a strict
zod schema over the saved shape; walker positions are recomputed from the
restored slot (walkers snap to their current-slot station on load — a
deliberate, documented simplification). `loadState` parses-or-throws
(inventory precedent).

### 3.4 `pack.ts` (browser adapter)

- Walker markers via `ctx.render`, visually distinct from item spheres and
  dialogue NPC markers (third size/color combination from the supported
  primitives; no render-port additions).
- Clock HUD chip: current slot name, styled like the existing HUDs.
- Relationships HUD panel: tracked giver name + tier, updated on change.
- Consumes `questCompleted` from the event bus → `relationshipCore` →
  writes the `relationships` slice (sole writer), publishes through
  `ctx.state`, emits `relationshipChanged`.
- The fixed-timestep update drives `clockCore` (emitting `timeSlotChanged`
  on slot change and writing the `clock` slice) and `scheduleCore` for each
  walker.

## 4. Seeded composeSection and the scenario suite

### 4.1 `composeSection`

Input: spec config (`slotSeconds?`), the spec's `cast`, arena geometry,
**and the composed dialogue section output** (NPC ids and quest assignments
feed the tracked-relationships table). Runs **after** the dialogue section
via the cycle-2 ordered-sections threading — no new compose surface.

Generation, all seeded and deterministic:

- Walkers: one per cast member with role `ambient` (zero is legal — the
  clock and relationships still run with no walkers; the fixture set
  guarantees the moving case is always exercised in the matrix). Speed is a
  fixed default; stations are placed per slot with the same keepout pattern
  items and NPCs use (wall margin, spawn/goal keepout, separation from
  items, dialogue NPCs, and each other, bounded draw budget with a typed
  exhaustion error).
- Relationships table: tracked entries derived from the dialogue section's
  composed quests — one per distinct **main**-quest giver with its quest
  ids; `thresholds: { acquaintance: 1, friend: 2 }`; `gains:
  { questCompleted: 1 }`.
- `SCHEDULE_DEFAULTS = { slotSeconds: 20 }`, applied here, never in the
  spec schema.

### 4.2 Eval hook — no harness changes

The headless twin needs `questCompleted` occurrences, but events don't
cross the eval seam — slices do (cycle 2's `publishSlices` threading). The
hook therefore **derives** quest completion by diffing the threaded
`questLog` slice between ticks: any quest transitioning to `complete` is
applied through `relationshipCore` exactly as the runtime applies the
event. The mapping is deterministic and identical because both twins share
the quest→giver table from config.

- `nextTarget` always returns `null` — the pack asks nothing of the walk
  and yields to the inventory/dialogue hooks (cycle 2's non-null-target
  policy, unchanged).
- `step` advances `clockCore`/`scheduleCore` with the fixed dt and applies
  the questLog diff.
- `publishSlices` exposes `clock` and `relationships`.
- `objectivesComplete` is `relationshipsComplete`.

All existing hooks and the harness walk policy are untouched.

## 5. Editor contribution, matrix rows, registration

- `editorContribution`: `prefabs: []` — walkers are composition-owned, same
  reasoning as items and NPCs. `createPreview` renders walker markers and
  their per-slot stations from the parsed config.
- Registry: add the pack to `STANDARD_PACKS`, a deterministic fixture to
  `PACK_FIXTURES` (two ambient walkers with four stations each; tracked
  givers matching the dialogue fixture's main quests), and a builder to
  `EVAL_HOOK_BUILDERS`.
- Matrix: every pair containing this pack is requires-unsatisfiable
  (needs both dialogue and inventory) and is correctly skipped by the
  existing harness logic — so this cycle adds the harness's **scenario
  suite**: named 3+-pack compositions run through the same headless
  completion + null-renderer boot machinery as pairs. First scenario:
  `interaction-inventory + dialogue-quests + schedules-relationships`.
  The suite is table-driven so later cycles (and the golden-game set) add
  rows, not code. No conflicts are declared; the negative row stays empty.
- MCP/editor: **no game-specific changes** — the phase exit criterion. The
  pack arrives through the same registration tables as its predecessors.

## 6. Testing and gates

- `clockCore`: slot advance, wrap, `slotChanged` edges, dt accumulation
  determinism.
- `scheduleCore`: target selection per slot, straight-line stepping, exact
  arrival clamp, determinism across tick sequences.
- `relationshipCore`: gains, tier thresholds, untracked-quest ignore,
  completion gate, persistence round-trip + malformed-state rejection
  (including walker snap-to-station on load).
- `composeSection`: same-seed determinism, cross-ref validity of generated
  config against the dialogue section, station keepouts,
  zero-ambient-cast case, placement-budget exhaustion error.
- `pack` (browser adapter, happy-dom): clock chip updates, walker movement
  on slot change, `questCompleted` consumption → slice write + HUD +
  `relationshipChanged` emission, save/load.
- Matrix: the 3-pack scenario row (headless completion + boot); scenario-
  suite plumbing gets its own unit coverage in `pack-registry`.
- Gates: `npm run ci`, `verify:new-game`, and a first-light recompose
  proving bit-identical output (frozen-baseline regression).

## 7. Risks

- **Deriving events from slice diffs could drift from the runtime's event
  consumption.** Both paths share `relationshipCore` and the config's
  quest→giver table; a test completes the same quest via both paths and
  asserts identical relationship state.
- **Scenario suite is new harness surface.** Kept minimal: a table of named
  pack-id sets riding the existing pair machinery; no new walk policy.
- **Zero-ambient-cast specs make the pack visually inert.** Accepted: the
  clock chip and relationships panel still render; the matrix fixture pins
  the moving-walker path. Phase 6's cast generator is the real fix.
- **Walker snap-on-load loses mid-walk positions.** Documented
  simplification; positions are decorative and recomputable, and the
  persistence schema stays minimal.
