# Phase 4 cycle 6 — Compact-hub navigation + one vehicle — Design

Status: approved design. Date: 2026-07-31.
Umbrella spec: [Phase 4 — Capability packs](../../2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md)
(contract v2 §3, per-pack template §5, capability-gap log §9).
Status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 4, cycle 6.
Envelope source: [Autonomous Game Factory design](/docs/superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md)
§Supported envelope ("one compact outdoor district; several instanced interiors;
player movement and one vehicle type").

This is pack six of seven. It is the first cycle that touches **world topology**:
until now every composed game is a single flat 24×24 arena
(`ARENA = { half: 12, spawn: { x: -8, z: -8 } }`,
`packages/game-compose/src/compose.ts:18`), the player simulation is game-owned
and clamped to it, and `PackWorldState` carries `playerPosition` **inward only**
— no pack can move the player. Closing that is a precondition for both
mechanics in this cycle, and it is the gap the umbrella already logged as
*Cycle 4 — pack-initiated player teleport*.

## 1. Goal and non-goals

**Goal.** Ship `@automata/pack-hub-navigation-vehicle` per the umbrella's
per-pack template (§5), plus the minimum shared-seam work its mechanics
require: instanced locations reachable through doorways, and one vehicle that
is load-bearing rather than decorative.

**Non-goals (deferred, each logged in §9).**

- Content inside interiors. Interiors are traversable shells this cycle;
  distributing cast, shops, and quests across locations is Phase 6.
- Traversable impassable terrain. The vehicle gate is a boolean on a
  transition, not geometry.
- A vehicle handling model — acceleration, turning radius, passengers.
- Author-positioned interiors. A spec names interiors; placement is seeded.
- Retrofitting the five shipped packs to be location-aware.

## 2. Decisions of record

Settled during brainstorming, binding for this cycle:

1. **Instanced locations, district-only content.** Each location is its own
   bounded coordinate space. The district keeps today's arena exactly, so the
   five shipped packs compose unchanged; their entities are simply not present
   indoors.
2. **The vehicle is load-bearing.** Speed multiplier plus exactly one
   vehicle-gated transition, so the headless eval hook *must* mount to finish.
   A convenience-only vehicle would ship untested.
3. **A write-only effects sink** is the world-effect seam (§3), chosen over a
   `fixedUpdate` return value or a mutable `playerPosition`.
4. **The pack's objective is a location tour** — every composed location
   visited. Without an objective of its own the interiors and the gate go
   unvisited in every headless run and browser smoke.
5. **Locations come from `spec.world.locations`**, and selecting the capability
   with zero interiors is a compose-time failure with a typed finding — not a
   seeded fabrication and not silent degradation.

## 3. Shared seam: world effects in `@automata/game-kit`

The only change outside the new pack. Additive by construction.

```ts
export interface PackWorldEffects {
  teleport(to: { x: number; z: number }): void
  scaleSpeed(multiplier: number): void
  setBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): void
}

export interface PackWorldState {
  playerPosition: { x: number; z: number }   // unchanged: still read-only inbound
  effects: PackWorldEffects                  // new: write-only outbound
}

export interface ResolvedWorldEffects {
  teleport: { x: number; z: number } | null
  speedMultiplier: number
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null
}
```

`composePacks` creates a fresh sink each tick and resolves it centrally.
`ComposedRuntime.fixedUpdate` changes from returning `void` to returning
`ResolvedWorldEffects`.

**Resolution rules.**

- **teleport** — composition-order-first wins. A second contender in the same
  tick is recorded as a `pack-world-effect-contention` issue rather than
  silently dropped.
- **scaleSpeed** — multipliers compose as a product, clamped to `[0.25, 8]` so
  a buggy pack cannot produce a runaway player.
- **setBounds** — last writer wins, but only a pack declaring ownership of the
  `location` slice may call it; any other caller's write is rejected and
  recorded as an issue. World topology stays answerable from the compatibility
  declaration alone.

**Why write-only.** A pack cannot read back what it just wrote, so there is no
ordering ambiguity within a tick and no temptation to use the sink as state.
The five shipped packs never touch `world.effects`, and the new return value is
ignored at their call sites — they do not change.

**Eval-harness mirror.** `PackEvalHook.step` receives the same sink, and the
matrix driver (`packages/pack-registry/tests/compositionMatrix.test.ts`) stops
being the sole owner of the player: its fixed `stride = 0.5` becomes
`0.5 * speedMultiplier`, and a resolved teleport repositions `player` before the
next tick. Without this, doorways and the vehicle are invisible to headless
evaluation.

**Rider retrofit.** `pack-combat-ai`'s "second wind in place" becomes a real
respawn-at-spawn through `effects.teleport`. This is a handful of lines plus a
fixture update, and it is the evidence that the seam is general rather than
hub-shaped. The umbrella's *Cycle 4 — pack-initiated player teleport* gap is
struck on ship.

## 4. The pack

`@automata/pack-hub-navigation-vehicle`, mirroring
`pack-economy-progression`'s shape: `config.ts` (the compiled pack config
schema `composeSection` emits and `pack.register` parses), `locationCore.ts`,
`vehicleCore.ts`, `composeSection.ts`, `pack.ts`, `evalHook.ts`,
`editorContribution.ts`.

### 4.1 Capability config

This is the **`GameSpec` capability config** — the small authored surface — and
is distinct from the compiled pack config in `config.ts`.

Replaces the `z.strictObject({})` stub at
`packages/contracts/src/gameSpec.ts:100`, staying as small as its peers:

```ts
'hub-navigation-vehicle': z.strictObject({
  vehicleSpeedMultiplier: z.number().min(1.5).max(4).optional(),  // default 2.5
  doorwayRadius: z.number().min(0.5).max(5).optional()            // default 1.5
})
```

Pack-internal defaults (mount radius, interior box extents, gate placement)
live in the pack, not the spec schema, so stored spec hashes stay stable — the
same rule cycle 5 followed.

### 4.2 World model

- The first spec `district` is the hub and keeps today's arena bounds exactly
  (`half: 12`, spawn `(-8, -8)`). Nothing about the existing district changes.
- Each spec `interior` becomes a small bounded box with an entry anchor, in its
  own coordinate space.
- Doorways are paired transition points. Entering within `doorwayRadius` fires
  `effects.teleport` to the paired anchor and `effects.setBounds` to the
  destination's bounds. The camera follows bounds, so entering an interior
  reframes rather than showing a floating box beside the district.

### 4.3 The crossing

Exactly one seeded interior is reached through a **gated doorway** — the
causeway gate — that opens only while mounted. Modelling an impassable band as
real geometry would require region-level keepout negotiated with five shipped
compose sections; a boolean gate on the transition is deterministic, needs no
geometry math, and leaves every other pack's placement untouched. The vehicle
retains traversal character inside the district through the speed multiplier.

With the minimum viable spec — one district, one interior — that single
interior sits behind the gate, so the smallest fixture exercises a doorway, a
teleport, a mount, and the tour.

### 4.4 Vehicle

One instance, parked at a seeded district position. Mount and dismount within
the pack's mount radius. While mounted, the pack calls
`effects.scaleSpeed(vehicleSpeedMultiplier)` each tick. Entering any interior
auto-dismounts; the vehicle stays parked at the gate.

### 4.5 Contract surface (umbrella §3)

- **Owns** slices `location` (`{ currentLocationId, visited[], locations[] }`)
  and `vehicle` (`{ mounted, parkedAt }`). **Reads** none.
- **Emits** `locationEntered`, `vehicleMounted`, `vehicleDismounted`.
  **Consumes** none.
- `requires: []`, `conflictsWith: []`, `integratesWith:` the five shipped packs.
  It composes with everything and degrades to a pure district-plus-interiors
  tour when alone.
- `objectivesComplete()` — true when every composed location has been visited.
- `saveState` / `loadState` over both owned slices, with the round-trip fixture
  the template requires.

### 4.6 Compose

`composeHubSection` runs **last** in `composeGame`, so no existing game's
seeded RNG stream shifts and first-light stays bit-identical. Selecting the
capability with zero `interior` locations returns the typed
`compose-hub-missing-interior` finding. Interiors are capped at **four**
instanced boxes although `world.locations` permits up to eight alongside a
district — a bounded-presentation cap in the same spirit as economy's six-shop
cap (§9).

first-light does not select this capability and is unaffected. Were it to
adopt the pack later, its spec would need an interior added.

## 5. Scaffold template

`tools/scaffold/src/templates/srcFiles.ts` clamps to a symmetric `arenaHalf`
and pins the camera at arena centre. Both become location-driven:

- `stepGame` clamps to the bounds returned by `runtime.fixedUpdate`, falling
  back to `arenaHalf` when `bounds` is `null`.
- A resolved `teleport` overrides position for that tick.
- `moveSpeed` is multiplied by `speedMultiplier`.
- The camera frames the active bounds.

`testFiles.ts` and `projectFiles.ts` follow. A game with no hub pack resolves to
`{ teleport: null, speedMultiplier: 1, bounds: null }` and behaves
bit-identically; `npm run verify:new-game` is the proof.

## 6. Evaluation

- Register the pack in `pack-registry` with a deterministic fixture; the pair
  loop in `compositionMatrix.test.ts` then widens to all six packs
  automatically.
- New scenario rows: `hub + interaction-inventory + economy-progression` (the
  vehicle-gated tour alongside purchases), and the full six-pack composition.
- No conflicts are declared, so there is no new negative composition row. The
  negative coverage this cycle is the `compose-hub-missing-interior` finding
  and the world-effect issues (contention, bounds-ownership violation), both
  unit-tested.
- Pure-core tests for `locationCore` and `vehicleCore`; a seeded
  `composeSection` replay test; eval-hook tests including the persistence
  round-trip; effects-resolution tests in `game-kit`; browser boot smoke
  through the existing seam.
- Gates: `npm run ci`, `npm run coverage`, `npm run verify:new-game`, and a
  green composition matrix.

## 7. Editor

Thin, per the umbrella's §1 non-goal and the 80/20 editor rule: a
`PackEditorContribution` whose `createPreview` draws the vehicle, each doorway
(with its radius), and each interior box outline — enough to *see* the hub and
confirm placement. Following the shipped packs, `prefabs` stays empty; the
pack's entities are composed, not hand-placed. No location-graph editor.

## 8. Exit criteria

- All seven per-pack template items (umbrella §5) land for
  `hub-navigation-vehicle`.
- The world-effect seam is in `game-kit` with documented resolution rules, is
  mirrored in the eval harness, and is exercised by a second consumer
  (`pack-combat-ai` respawn).
- The composition matrix is green across all six packs, including the two new
  scenario rows.
- A spec selecting the capability with no interior fails compose with
  `compose-hub-missing-interior`.
- `npm run ci`, `npm run coverage`, and `npm run verify:new-game` pass;
  first-light recomposes bit-identically.

## 9. Capability-gap log (append to the umbrella §9 on ship)

- **Cycle 6 — interiors are empty.** Content is district-only; interiors are
  traversable shells until Phase 6 distributes cast, shops, and quests across
  locations.
- **Cycle 6 — four-interior presentation cap.** `world.locations` permits up to
  eight interiors alongside a district; compose and the runtime present the
  first four in stable spec order.
- **Cycle 6 — the crossing is a gated doorway, not terrain.** Real impassable
  geometry needs region-level keepout negotiated with every compose section.
- **Cycle 6 — one vehicle instance, no handling model.** No acceleration,
  turning radius, or passengers.
- **Cycle 6 — interior placement is seeded, not authored.** A spec author can
  name interiors but cannot position them.

Struck on ship: **Cycle 4 — pack-initiated player teleport**, closed by §3.

## 10. Risks

- **Template change breaks existing games.** Mitigation: the no-hub resolution
  is the exact prior behavior, pinned by `verify:new-game` and first-light's
  bit-identical recompose.
- **Camera reframing on transition reads as a glitch.** Mitigation: bounds are
  set on the same tick as the teleport, so the frame never shows the player
  outside the active location; the browser smoke asserts a clean console and
  the frame-time budget across a transition.
- **Interiors feel empty to a reviewer at the slice checkpoint.** Accepted and
  disclosed — it is decision 1 and gap 1, not a defect.

## 11. Docs on ship

- `docs/ROADMAP.md` §3 Phase 4: cycle 6 → `Shipped` with the date; promote
  cycle 7 (save/load) to `Next`.
- `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`:
  Phase 4 cycle counters.
- Umbrella §9: append the five gaps above, strike the cycle-4 teleport gap.
