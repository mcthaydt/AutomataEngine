# Phase 4 cycle 2 — Branching dialogue & quests pack — Design

Status: approved design. Date: 2026-07-16.
Umbrella: [Phase 4 — Capability packs](2026-07-14-phase-4-capability-packs-design.md)
(contract v2 §3, matrix §4, per-pack template §5). Status/sequencing:
[`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 4 cycle 2.

The second pack cycle: `@automata/pack-dialogue-quests`, the first *new* pack
built against contract v2 and the first real cross-pack integration (it reads
the inventory pack's slice and consumes its event). Follows the
`pack-interaction-inventory` package template exactly; deviations from the
template are called out where they occur.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Branching conditions: quest state + inventory.** A dialogue choice or
  branch can be gated on quest status and on inventory contents (via a
  cross-pack read of the `inventory` slice). No general condition DSL —
  later packs' needs feed back into the umbrella, not forward speculation.
- **Interaction: proximity auto-open.** Walking within an NPC's talk radius
  opens the dialogue overlay; number keys (1–9) pick choices; a terminal
  choice or walking past the exit radius closes it. No interact key — this
  matches the inventory pack's no-new-inputs model.
- **Quests: talk + fetch only.** Two objective kinds. Main quests form a
  linear chain (array order; quest N+1 unlocks when N completes); side
  quests are available from the start and optional.
- **Fetch is hold-and-show, not consume.** The dialogue pack is a reader of
  `inventory` (sole-writer rule); turn-ins verify possession, never remove
  items. Item consumption, if a later pack needs it, is an inventory-owned
  API and gets logged as a capability gap.
- **first-light stays frozen.** The inventory+dialogue pairing is proven by
  the composition matrix (headless pair completion + null-renderer boot),
  not by widening the checked-in slice game. first-light must keep
  recomposing bit-identically.
- **One package, two pure cores.** `questCore.ts` and `dialogueCore.ts` are
  separate pure modules inside one `@automata/pack-dialogue-quests` package;
  the pack adapter and eval hook wire them together.

## 2. Contracts

### 2.1 GameSpec capability config

`capabilityConfigSchemas['dialogue-quests']` (in `contracts/src/gameSpec.ts`)
replaces its Phase 2 stub with:

```ts
z.strictObject({
  talkRadius: z.number().min(0.5).max(5).optional()
})
```

Only `talkRadius`. Quest counts live in `budgets`
(`mainQuestCount`/`sideQuestCount`) and the quests themselves in
`story.quests`; duplicating either here would create two sources of truth.
Per the Phase 2 hash rule the field is optional with **no zod default**;
defaults are applied by `composeSection`.

### 2.2 Compatibility declaration

```ts
packCompatibility({
  requires: ['interaction-inventory'],
  stateSlices: { owns: ['questLog'], reads: ['inventory'] },
  events: { emits: ['questCompleted', 'dialogueEnded'], consumes: ['itemAcquired'] }
})
```

Matches `DEFAULT_CAPABILITY_COMPATIBILITY` (dialogue-quests requires
interaction-inventory). Dialogue-in-progress state is internal to the pack —
slices exist for cross-pack reads, and only the quest log has a declared
future consumer (schedules & relationships requires this pack).

### 2.3 Pack config (compiled)

Strict zod schema (`packConfigSchema` in `questCore.ts`/`dialogueCore.ts`
composition, exported from the package):

- `talkRadius: number` (0.5–5)
- `npcs: [{ id, name, position: {x, z}, dialogueId }]`
- `dialogues: [{ id, start, nodes: [{ id, speaker, text, choices }] }]` —
  a choice is `{ text, next: nodeId | null, conditions?, effects? }`
  (`next: null` ends the dialogue; `conditions` is an AND-list — a fetch
  turn-in needs `questState` AND `hasItems` together)
- `quests: [{ id, kind: 'main' | 'side', title, giverNpcId, objective }]` —
  objective is `{ kind: 'talk' }` or `{ kind: 'fetch', itemIds }`; the main
  chain is implicit in array order

Each condition is a closed union: `{ kind: 'questState', questId, status }` |
`{ kind: 'hasItems', itemIds }`. Effects: `{ kind: 'acceptQuest', questId }`
| `{ kind: 'completeQuest', questId }`.

The schema **cross-validates references** (choice `next` targets exist,
`dialogueId`/`giverNpcId`/`questId` resolve, fetch `itemIds` non-empty) via
`superRefine`, so dangling references are compose-time errors with clear
messages, never runtime surprises. Fetch item ids resolving against the
*inventory* section is validated at compose time by `composeSection` (§4.1),
which is the only place both sections are in scope.

## 3. Pure cores and browser runtime

### 3.1 `questCore.ts`

Quest log state machine. State: `Record<questId, 'locked' | 'available' |
'active' | 'complete'>`. Initial state: first main quest and all side quests
`available`, remaining main quests `locked`. Pure transitions:

- `acceptQuest` — `available → active`.
- `completeQuest` — `active → complete`, only if the objective is satisfied
  (talk: always, reaching the effect is the proof; fetch: `hasItems` against
  the inventory view). Completing main quest N unlocks main quest N+1.
- `questsComplete` — true when **all main quests** are `complete` (the
  pack's `objectivesComplete` gate; side quests are optional).

Persistence (contract v2 slot): `serializeQuestLog`/`deserializeQuestLog`
with a strict zod schema over the saved shape; `loadState` parses-or-throws
(inventory precedent) and closes any open dialogue.

### 3.2 `dialogueCore.ts`

Pure tree traversal. `startDialogue(dialogue)` returns a session at the
start node; `availableChoices(session, questLog, inventoryView)` filters
choices by their conditions; `choose(session, index)` returns the next
session (or `ended`) plus the effects to apply. No RNG, no DOM, no clocks.

### 3.3 `pack.ts` (browser adapter)

- NPC markers via `ctx.render` at each NPC position, visually distinct from
  the item spheres (different size and color; whichever supported primitive
  reads best — no render-port additions for this).
- Quest HUD overlay: active main quest title + main-quest progress count
  (`k/n`), styled like the inventory HUD.
- Dialogue overlay: speaker, text, numbered choices; keydown 1–9 selects.
- Proximity with hysteresis: opens when the player is within `talkRadius`
  of an NPC; closes and re-arms only past `1.5 × talkRadius`, so the
  overlay doesn't flap at the boundary. One dialogue at a time; nearest
  NPC wins ties deterministically (id order on equal distance).
- Effects write the `questLog` slice (sole writer), publish it through
  `ctx.state`, and emit `questCompleted`/`dialogueEnded` on the event bus.
  Inventory contents come from the slice registry read; `itemAcquired`
  consumption refreshes fetch-condition checks eagerly.

## 4. Seeded composeSection and the eval-seam extension

### 4.1 `composeSection`

Input: spec config (`talkRadius?`), the spec's `story.quests` and `cast`,
arena geometry, **and the composed inventory section output** (generated
item ids/positions feed fetch objectives). Section composition is therefore
**ordered**: `game-compose` runs the inventory section first and threads its
output into the dialogue section. That ordering hook in `composeGame` is
part of this cycle (a small, general change: sections compose in registry
order and later sections receive prior outputs).

Generation, all seeded and deterministic:

- Quest-giver NPCs: one per `cast` member with role `quest-giver` (falling
  back to `ally`/`vendor` if none), capped by quest count; placed with the
  same keepout pattern items use (wall margin, spawn/goal keepout,
  separation from items and each other, bounded draw budget with a typed
  exhaustion error).
- Quests: taken from `story.quests` in order (respecting main-chain order);
  assigned round-robin to NPCs; objectives alternate talk/fetch with fetch
  capped by available inventory items (fetch quests reference concrete
  generated item ids).
- Dialogue trees: fixed per-quest template — greet → accept choice
  (`acceptQuest`) → in-progress line → turn-in choice conditioned on the
  objective (`hasItems` for fetch) firing `completeQuest` → done line. The
  progressing choice is always listed **first** (the greedy eval policy
  depends on this ordering).
- `DIALOGUE_DEFAULTS = { talkRadius: 2 }`, applied here, never in the spec
  schema.

### 4.2 Eval-seam extension (additive contract v2 change)

The matrix harness drives per-pack eval states in isolation, but a fetch
quest's completion depends on inventory contents — the headless twin needs
the same cross-pack read the runtime has. The umbrella predicted exactly
this class of gap and prescribes additive extension:

- `PackEvalHook` gains optional `publishSlices?(state): Record<string,
  unknown>`, and `nextTarget`/`step` accept an optional trailing
  `slices: Record<string, unknown>` argument.
- The harness threads the merged published-slice map through every
  `nextTarget`/`step` call each tick.
- The harness walk policy changes from "seek the first incomplete hook's
  target" to "seek the first incomplete hook **with a non-null target**":
  a blocked dialogue hook (fetch quest, items not yet held) returns `null`
  and yields the walk to the inventory hook, then produces the NPC target
  once the slice shows possession. If every incomplete hook returns `null`,
  the drive fails at the step budget as before.

The inventory hook is untouched (all additions optional); it additionally
gains `publishSlices` so the dialogue hook has something to read. The
dialogue eval hook drives conversations greedily (always the first available
choice), correct by construction given the template's choice ordering.

## 5. Editor contribution, matrix rows, registration

- `editorContribution`: `prefabs: []` — NPCs are composition-owned, same
  reasoning as inventory items; faking scene authorship would be a silent
  capability gap. `createPreview` renders NPC markers from the parsed
  config. Registered through the composition-aware editor path from cycle 1.
- Registry: add the pack to `STANDARD_PACKS`, a deterministic fixture to
  `PACK_FIXTURES` (two NPCs, one main talk quest, one main fetch quest
  referencing the inventory fixture's item, one side quest), and a builder
  to `EVAL_HOOK_BUILDERS`. This automatically activates the previously
  vacuous pair loop: inventory+dialogue must compose, boot against the null
  renderer, and complete headlessly. The dialogue-only single is
  requires-unsatisfiable and is correctly skipped by the existing harness
  logic. No conflicts are declared, so the negative row stays empty this
  cycle.
- MCP/editor: **no game-specific changes** — the phase exit criterion. The
  pack arrives through the same registration tables as inventory.

## 6. Testing and gates

- `questCore`: transitions, chain unlocking, objective validation,
  completion gate, persistence round-trip + malformed-state rejection.
- `dialogueCore`: traversal, condition filtering (both kinds), effect
  emission, end states.
- `composeSection`: same-seed determinism (identical output), cross-ref
  validity of generated config, NPC keepouts, fetch-capping behavior,
  placement-budget exhaustion error.
- `pack` (browser adapter, happy-dom like the inventory tests): overlay
  open/close hysteresis, choice keys, HUD updates, slice publication, event
  emission, save/load including the collected-after-snapshot reconcile case.
- Matrix: the widened pair row; harness slice-threading and null-target
  yielding get their own unit coverage in `pack-registry`.
- Gates: `npm run ci`, `verify:new-game`, and a first-light recompose
  proving bit-identical output (frozen-baseline regression).

## 7. Risks

- **Greedy eval policy couples harness to content templates.** The
  first-choice-progresses invariant is a `composeSection` contract; a test
  asserts it over generated trees so template edits can't silently break
  the matrix.
- **Ordered section composition is new surface.** Kept minimal: registry
  order + prior-output threading only; no general dependency graph until a
  pack actually needs one.
- **Overlay/input edge cases (multiple NPCs in radius, keys during
  closed overlay).** Deterministic nearest-NPC tie-break and
  ignore-when-closed are specified above and unit-tested.
