# Phase 4 cycle 5 — Economy, shops & progression pack — Design

Status: approved design. Date: 2026-07-21.
Umbrella: [Phase 4 — Capability packs](../week-29/2026-07-14-phase-4-capability-packs-design.md)
(contract v2 §3, matrix §4, per-pack template §5). Status/sequencing:
[`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 4 cycle 5.

The fifth pack cycle: `@automata/pack-economy-progression` — a wallet, buy-only
shops, and threshold-driven progression that together form one closed economic
loop: **earn currency → spend it on shop goods → cross earning thresholds that
flip the spec's progression milestones.** It is the **first pack that requires
`interaction-inventory`** (mirroring how dialogue required inventory in cycle 2),
and the **first pack whose load-bearing cross-pack effects are event-driven** —
which forces this cycle to make the contract-v2 event bus first-class in the
headless evaluator, not just the runtime. It closes the cycle-2 capability gap
(inventory-owned item consumption/grant) via the event bus. Follows the
`pack-combat-ai` package template; deviations are called out where they occur.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Scope: wallet + buy-only shops + threshold progression.** One coherent
  economic loop. Selling / two-way trade and XP-or-level progression are
  **out** (logged as capability gaps, §8). Phase 6 fills the loop with rich
  content; this cycle proves the mechanic and the seam.
- **Item grant is event-driven.** A purchase makes economy emit `itemPurchased`;
  the **inventory pack consumes it and grants the item as sole writer** of the
  `inventory` slice. This is the umbrella's event bus (§3.3) closing the cycle-2
  gap — a contract-legal cross-pack edge, not a game-specific change. Economy
  never writes the `inventory` slice.
- **Progression = cumulative-currency-earned thresholds.** The pack owns a
  `progression` slice tracking which of the spec's `progression.milestones` are
  achieved; milestones flip **in ascending threshold order** as `totalEarned`
  (monotonic — spending never reduces it) crosses seeded thresholds.
  `objectivesComplete` is "all milestones achieved **and** all shop stock
  purchased." Requiring both halves keeps the purchase→grant loop load-bearing.
- **Synergy edges, both graceful-degrade.**
  `integratesWith: ['combat-ai', 'dialogue-quests']`: `enemyDefeated` awards a
  seeded bounty when combat is present; `questCompleted` awards a seeded reward
  when dialogue is present. Absent those packs the events never fire and base
  earning (starting balance + currency pickups) stands alone.
- **Buy-only auto-purchase in shop radius.** The player auto-buys the next
  affordable, unowned stock item while inside a shop's radius — no new input, no
  eval-seam changes to the walk policy (combat auto-attack / item auto-pickup
  precedent). The headless twin completes the loop by walking to pickups and
  shops.
- **Shop stock is catalog-only.** Stock item ids are **new ids not placed in the
  world**, bounded so `placed + purchasable ≤ 8` (inventory's `collected` cap).
  This keeps `inventoryComplete` (id-based over placed items) unaffected by
  purchases and makes the grant proof unambiguous: a purchased id appears in
  `inventory.collected` that was never walked to.
- **Contract-v2 additive extension: the eval harness gains the event bus.**
  Because all three of this pack's cross-pack effects are event-shaped and the
  headless matrix currently has **no** event channel (slice views only), this
  cycle threads the existing `PackEventBus` through `PackEvalHook` and the
  matrix driver so event edges are provable in both twins. Additive and
  non-breaking; existing hooks ignore it. This is the cycle's shared-contract
  investment (comparable to cycle 1's), justified because the matrix otherwise
  proves no event edge at all.
- **first-light stays frozen.** Economy is not in its composition; the new
  inventory consume-path is inert without an emitter, so first-light must keep
  recomposing bit-identically.
- **One package, three pure cores.** `walletCore.ts`, `shopCore.ts`, and
  `progressionCore.ts` are separate pure modules; the pack adapter and eval hook
  wire them together.

## 2. Contracts

### 2.1 GameSpec capability config

`capabilityConfigSchemas['economy-progression']` (in `contracts/src/gameSpec.ts`)
replaces its Phase 2 stub with:

```ts
z.strictObject({
  startingBalance: z.number().int().min(0).max(999).optional()
})
```

Only `startingBalance` — the one economy knob a spec author plausibly wants.
Pickup count/amounts, shop stock, prices, milestone thresholds, and bounty/reward
amounts all derive in `composeSection`; duplicating them here would create two
sources of truth. Per the Phase 2 hash rule the field is optional with **no zod
default**; `ECONOMY_DEFAULTS` is applied by `composeSection`.

### 2.2 Compatibility declaration

```ts
packCompatibility({
  requires: ['interaction-inventory'],
  integratesWith: ['combat-ai', 'dialogue-quests'],
  stateSlices: { owns: ['wallet', 'progression'], reads: ['inventory'] },
  events: {
    emits: ['itemPurchased', 'milestoneReached'],
    consumes: ['enemyDefeated', 'questCompleted']
  }
})
```

Matches `DEFAULT_CAPABILITY_COMPATIBILITY` (`economy-progression` requires
`interaction-inventory`). The `enemyDefeated`/`questCompleted` consumes are
`integratesWith`-only: when economy is composed without combat/dialogue those
events are unproduced, which `validatePackSet` reports at **warning** level
(umbrella §3.1) — not a compose failure. Reading the `inventory` slice lets
economy compute unowned stock without importing the inventory pack.

### 2.3 Inventory-pack change (this cycle)

The inventory pack (cycle 1) gains a consume path — the cycle-2 gap closure:

- `events.consumes` becomes `['itemPurchased']` in its compatibility
  declaration.
- Runtime (`pack.ts`): subscribe to `itemPurchased` via `ctx.events`; on the
  event, grant `payload.itemId` into `collected` (idempotent; sole writer).
- Eval (`evalHook.ts`): `connect` to the eval bus and apply the same grant
  (§2.5).
- Core gains an idempotent `grantItem(state, itemId)`; `inventoryComplete` stays
  **id-based over placed items** so purchased catalog ids never falsely complete
  the fetch objective. The `collected` cap of 8 is honored by composeSection's
  `placed + purchasable ≤ 8` bound.

first-light has no economy pack, so nothing emits `itemPurchased`; the grant
path is inert and first-light recomposes bit-identically (§5 regression gate).

### 2.4 Pack config (compiled)

Strict zod schema (`packConfigSchema` composed from the three cores, exported
from the package):

- `wallet: { startingBalance }` — `int ≥ 0`, bounded.
- `pickups: [{ id, position: {x, z}, amount }]` — bounded array; `amount > 0`.
- `shops: [{ id, position: {x, z}, radius, stock: [{ itemId, price }] }]` —
  bounded; `price > 0`; buy-only (no sell price).
- `bounty: { perEnemy }`, `questReward: { perQuest }` — `≥ 0`, bounded; applied
  only when the emitting event fires.
- `progression: { milestones: [{ id, threshold }] }` — thresholds bounded.

The schema **cross-validates via `superRefine`**: pickup, shop, milestone, and
stock item ids unique across their whole collections; positions distinct; and
milestone thresholds strictly ascending and unique. Checks needing the spec or
the inventory section — that milestone ids match the spec's
`progression.milestones`, `stock.itemId` catalog validity, and the
`placed + purchasable ≤ 8` bound — are enforced at compose time by
`composeSection` (§4.1), the only place those inputs are in scope (cycle-3
precedent).

### 2.5 Eval-harness event bus (contract-v2 additive extension)

`PackEvalHook` (`game-kit/src/packEval.ts`) gains two optional members; existing
hooks that omit them are unchanged:

```ts
interface PackEvalHook {
  // …existing: packId, createState, nextTarget, step, complete, publishSlices
  connect?(bus: PackEventBus, ref: { get(): unknown; set(next: unknown): void }): void
  step(state, player, slices?, emit?: (name: string, payload: unknown) => void): unknown
}
```

The matrix driver (`driveToCompletion`) creates one `createPackEventBus()` per
run (the **same** synchronous bus type as the runtime — no second bus), calls
`hook.connect?.(bus, ref)` once after `createState` so hooks may subscribe and
mutate their state via `ref.set`, and passes `bus.emit` into each `step`.
Dispatch is synchronous and ordered by hook order (deterministic). This mirrors
the runtime exactly: packs subscribe at boot via `ctx.events` and emit during
`fixedUpdate`. To keep the emitter side faithful, the **combat and dialogue eval
hooks additively emit** `enemyDefeated` / `questCompleted` (already emitted in
their runtimes) so the scenario rows prove the bounty/reward edges headlessly.

## 3. Pure cores and browser runtime

### 3.1 `walletCore.ts`

State: `{ balance, totalEarned }`. `earn(state, amount)` credits both.
`spend(state, amount)` debits `balance` only when `balance ≥ amount` (returns
`{ ok, state }`; insufficient funds is a no-op `ok: false`). `totalEarned` is
monotonic — the progression signal. Starting balance seeds both fields.
Serialize/deserialize with a strict zod schema for persistence.

### 3.2 `shopCore.ts`

Buy-only selection over stock. `nextPurchase(shop, balance, ownedItemIds)`:
returns the first stock item (by `itemId` order) that is **unowned and
affordable**, or `null`. One purchase resolved per tick when the player is inside
`shop.radius`; the adapter/eval hook drives the throttle. Pure — no wall clock,
no side effects; taking a plain balance keeps this core independent of the
wallet state shape. The caller performs `walletCore.spend` and the emit.

### 3.3 `progressionCore.ts`

Config `{ milestones: [{ id, threshold }] }` sorted ascending; state
`{ achieved: readonly string[] }`. `advance(state, totalEarned, config)` returns
the updated `achieved` set plus the **newly** achieved milestone ids (in order)
so the adapter/hook can emit one `milestoneReached` per new milestone.
`progressionComplete(state, config)` is "every milestone achieved." Monotonic and
terminating: `totalEarned` never decreases, so milestones only ever flip on.

### 3.4 Persistence (contract v2 slot)

Economy saves `{ wallet: { balance, totalEarned }, progression: { achieved },
collectedPickups, purchased }` with a strict zod schema. `collectedPickups`
prevents reloads from re-earning currency; `purchased` is load-bearing for the
shop-clearance completion gate. Purchased items also round-trip through
**inventory's** `collected` because inventory owns them; economy's local
`purchased` set records the transaction/completion fact without writing the
inventory slice. `loadState` parses-or-throws before mutation and validates ids
against the compiled config, array uniqueness, milestone thresholds, and the
wallet's earning/spending invariants.

### 3.5 `pack.ts` (browser adapter)

- Currency-pickup markers and shop markers via `ctx.render` — new size/color
  combinations distinct from items, dialogue NPCs, walkers, and enemies (no
  render-port additions; see §7 risks). Pickup markers are removed on
  collection.
- Wallet HUD chip (balance) and a progression chip (achieved / total
  milestones), styled like the existing HUDs.
- The fixed-timestep update: collect pickups in range (`walletCore.earn`);
  auto-resolve one shop purchase in range (`shopCore.nextPurchase` →
  `walletCore.spend` → `emit('itemPurchased', { itemId })`); then
  `progressionCore.advance` → `emit('milestoneReached', { milestoneId })` per new
  milestone. A fixed step order, covered by determinism tests.
- Subscribes via `ctx.events`: `enemyDefeated` → `walletCore.earn(bounty.perEnemy)`;
  `questCompleted` → `walletCore.earn(questReward.perQuest)`.
- Writes the `wallet` and `progression` slices (sole writer), reads the
  `inventory` slice to compute unowned stock.
- `objectivesComplete` requires both `progressionComplete` and every shop stock
  item to appear in economy's persisted `purchased` set.

## 4. Seeded composeSection and matrix rows

### 4.1 `composeSection`

Input: spec config (`startingBalance?`), the spec's `cast` (vendor role →
shops), the spec's `progression.milestones` (milestone ids), arena geometry, and
**the composed inventory section** (ordered after it via the cycle-2 sections
threading; economy requires inventory, so the inventory section is always
present). Placement is seeded and all generated output is deterministic.
Pickup count/amount, stock size, and catalog prices are fixed
`ECONOMY_DEFAULTS` constants in this cycle rather than independent random
draws:

- **Wallet:** `startingBalance` from config or `ECONOMY_DEFAULTS`.
- **Pickups:** a fixed default count placed through seeded draws with the shared
  keepout pattern (wall
  margin, spawn/goal keepout, separation from items, dialogue NPCs, walker
  stations, enemy posts, and each other; bounded draw budget with a typed
  exhaustion error). Amounts use the fixed default.
- **Shops:** one per each of the first six cast members with role `vendor`
  (**zero is legal** — the fixture set guarantees the shopping path is always
  exercised in the matrix). Cast order is stable, so the six-shop config bound
  remains deterministic for specs with seven-to-twelve vendors. Each shop is
  placed at a keepout post; stock uses deterministic
  **catalog-only item ids** (new ids, not the inventory section's placed ids)
  and a fixed default price, bounded so `placed + purchasable ≤ 8`.
- **Progression:** every spec `progression.milestones` id gets an ascending
  seeded threshold, enforcing the **reachability invariant: the top threshold
  ≤ startingBalance + Σ pickup amounts** so the loop always completes from base
  earning alone (bounties/rewards only accelerate). A violated invariant is a
  typed compose error.
- **Affordability:** `Σ stock prices ≤ startingBalance + Σ pickup amounts`, so
  every required purchase is achievable from base earning without relying on
  optional bounty/reward integrations.
- `ECONOMY_DEFAULTS` (starting balance, pickup count/amounts, catalog price, shop
  radius, and bounty/reward amounts) is applied here, never in the schema;
  `startingBalance` from the spec overrides the one default it names.

### 4.2 Eval hook — event bus, no walk-policy changes

- `connect`: subscribe `enemyDefeated` → earn bounty; `questCompleted` → earn
  reward; update state via `ref.set`. Graceful when those packs are absent (no
  emitter, handler never runs).
- `nextTarget`: nearest uncollected currency pickup; then nearest shop with
  affordable, unowned stock (reading the `inventory` slice from the
  `EvalSliceView`); `null` once progression and shop clearance are both
  complete.
- `step`: collect pickups in range; resolve one shop purchase in range and
  `emit('itemPurchased', …)` (inventory's connected handler grants it);
  `progressionCore.advance` and `emit('milestoneReached', …)`.
- `complete`: `progressionComplete` **and** `allStockPurchased` — both are
  reachable from base earning by the §4.1 reachability and affordability
  invariants, so the composed drive terminates after proving the full loop.
- `publishSlices`: exposes `wallet` and `progression`.

The harness walk policy is untouched; only the additive event channel (§2.5) is
new.

## 5. Editor contribution, matrix rows, registration

- `editorContribution`: `prefabs: []` — pickups and shops are composition-owned,
  same reasoning as items, NPCs, walkers, and enemies. `createPreview` renders
  pickup positions and shop positions/radii from the parsed config.
- Registry (`pack-registry`): add the pack to `STANDARD_PACKS`, a deterministic
  fixture to `PACK_FIXTURES` (built from the inventory fixture output: a shop
  with catalog stock, two pickups, milestones with reachable thresholds), a
  builder to `EVAL_HOOK_BUILDERS`, and its `editorContribution`.
- **Matrix pair:** `economy-progression + interaction-inventory` is the only new
  satisfiable pair (proves base earning + purchase→grant + progression
  headlessly). All other economy pairs lack the required inventory and are
  correctly skipped by the existing `satisfiable` logic (the cycle-2/4
  precedent for requires-unsatisfiable pairs).
- **Scenarios (added to the matrix scenario table):**
  `[interaction-inventory, economy-progression]`;
  `[interaction-inventory, economy-progression, combat-ai]` (proves the bounty
  edge via `enemyDefeated`);
  `[interaction-inventory, dialogue-quests, economy-progression]` (proves the
  reward edge via `questCompleted`); and the **full 5-pack set**
  (`interaction-inventory + dialogue-quests + schedules-relationships +
  combat-ai + economy-progression`) — the phase's largest composition to date.
- No conflicts are declared; the negative row stays empty.
- MCP/editor: **no game-specific changes** — the phase exit criterion. The pack
  arrives through the same registration tables as its predecessors. The eval-bus
  and inventory/combat/dialogue eval-hook edits are pack/kit-internal, not
  editor or MCP surface.

## 6. Testing and gates

- `walletCore`: earn/spend arithmetic, insufficient-funds no-op, `totalEarned`
  monotonicity, serialize round-trip, determinism.
- `shopCore`: unowned + affordable selection with `itemId` tie-break, empty/
  exhausted stock → `null`, one-purchase-per-call.
- `progressionCore`: threshold crossing in ascending order, newly-achieved
  deltas, completion gate, determinism across earning sequences.
- `composeSection`: same-seed determinism; pickup/shop keepouts against items,
  NPCs, stations, enemy posts; the reachability invariant (top threshold ≤
  start + Σ pickups) and its violation error; catalog-stock validity and the
  `placed + purchasable ≤ 8` bound; zero-vendor case (no shop, still completes
  via pickups); placement-budget exhaustion error.
- `pack` (browser adapter, happy-dom): wallet/progression HUD updates, pickup
  collection + marker removal, auto-purchase (spend + `itemPurchased` emit),
  bounty/reward on subscribed events, slice writes, save/load round-trip.
- **Inventory changes:** grant on `itemPurchased` (adapter + eval), purchased
  ids do not alter `inventoryComplete`, `collected` cap honored, and a
  first-light recompose proving bit-identical output.
- **Eval-harness event bus:** synchronous, deterministic cross-hook dispatch;
  and a **parity test** — the runtime slice-registry path and the eval
  event-bus path produce identical wallet + inventory outcomes from the same
  fixture (extends combat's parity test to events).
- **Combat/dialogue eval hooks:** emit `enemyDefeated` / `questCompleted` in the
  eval twin without changing their own completion.
- Matrix: the economy+inventory pair; the four scenario rows.
- Gates: `npm run ci`, `verify:new-game`, and a first-light recompose proving
  bit-identical output (frozen-baseline regression).

## 7. Risks

- **Marker palette exhaustion.** Pickups and shops add the fifth and sixth
  distinct primitive combinations. Checked first in implementation; fallback is a
  distinct color on an existing shape. A render-port addition would be its own
  reviewed decision, not smuggled into this cycle.
- **Eval-bus change has wider blast radius than a normal pack cycle.** It touches
  shared `game-kit`, the matrix driver, and the inventory/combat/dialogue eval
  hooks. Mitigation: the change is additive/optional (hooks that omit `connect`/
  `emit` are unaffected), and it is pinned by the determinism + parity tests.
  This is the cycle's deliberate shared-contract investment (cycle-1 analogue),
  and it upgrades the matrix from proving **no** event edge to proving three.
- **Reachability invariant is load-bearing for headless termination.** Enforced
  at compose time with an explicit test and a typed violation error.
- **Catalog stock vs the 8-item `collected` cap.** composeSection bounds
  `placed + purchasable ≤ 8`; when placed items already fill the cap, no shop
  stock is generated (a legal, tested degenerate case).
- **`integratesWith` consumed-event warnings** when economy is composed without
  combat/dialogue are expected and warning-level by umbrella §3.1, not failures.

## 8. Capability gaps to log (umbrella §9)

- **Cycle 5 — item selling / two-way trade.** Selling requires the inventory
  pack to *remove* an owned item on an economy-emitted event (an `itemSold`
  consume path); buy-only avoids the removal seam this cycle. Logged for a future
  cycle.
- **Cycle 5 — purchasable-only catalog content.** Shop stock uses seeded
  catalog ids with no world entity or downstream reference; real purchasable
  goods (usable by dialogue turn-ins, referenced by quests) are Phase-6 content.
- **Cycle 5 — spec-authored milestone thresholds.** Thresholds are pack-derived
  under the reachability invariant; letting a spec author set per-milestone
  thresholds would be a `progression.milestones` schema extension.
