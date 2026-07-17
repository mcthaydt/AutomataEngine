# Phase 4 cycle 4 — Combat & enemy AI pack — Design

Status: approved design. Date: 2026-07-17.
Umbrella: [Phase 4 — Capability packs](2026-07-14-phase-4-capability-packs-design.md)
(contract v2 §3, matrix §4, per-pack template §5). Status/sequencing:
[`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 4 cycle 4.

The fourth pack cycle: `@automata/pack-combat-ai` — proximity auto-combat,
player health with a second-wind recovery, and enemies with an
idle/chase/return state machine. It is the **first standalone pack since
inventory** (`requires: []`), which revives satisfiable pair rows in the
composition matrix, and the **first pack to exercise the contract-v2
`integratesWith` edge**: an optional weapon-boost read of the `inventory`
slice that degrades gracefully to base damage when the inventory pack is
absent. Follows the `pack-schedules-relationships` package template exactly;
deviations are called out where they occur.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Proximity auto-combat on the fixed-timestep tick.** The player
  auto-attacks the nearest alive enemy inside an attack radius; enemies deal
  damage inside their own radii on their own cooldowns. No new inputs, no
  eval-seam changes — the headless twin completes combat by walking to
  enemies, exactly like item pickup.
- **Second wind in place at zero HP.** Packs cannot move the player through
  the current contract in either twin (`world.playerPosition` flows into
  `fixedUpdate` read-only; the headless harness owns the player outright), so
  true respawn-at-spawn would require cross-cutting game-kit + `packEval` +
  walk-policy surface. Instead, damage that would reach zero refills HP where
  the player stands and opens a short invulnerability window. Deterministic
  and terminating: enemies never heal, so every engagement makes monotonic
  progress. **Pack-initiated player teleport is logged as a capability gap**
  for the umbrella, not smuggled in here.
- **Aggro chase + leash enemy AI.** Enemies idle at a post; chase in a
  straight line at constant speed when the player enters an aggro radius;
  walk back to post when the player is beyond a leash radius from the post
  (re-aggro allowed mid-return); no health regained on leash. Straight-line
  stepping reuses the cycle-3 walker idiom (arrival clamp, open arena,
  keepout-validated posts, no pathfinding).
- **Weapon boost via `integratesWith`, not `requires`.**
  `integratesWith: ['interaction-inventory']`; when the inventory slice is
  present and the designated weapon item is collected, player damage is
  multiplied; absent, base damage applies. First real exercise of the
  umbrella's graceful-degradation edge. No `validatePackSet` changes: an
  absent `integratesWith` target is legal by definition, so degradation is
  proven by tests, not the validator.
- **Loot drops are out of scope.** Combat spawning items would invert
  inventory-pack ownership of item placement/pickup. Combat emits
  `enemyDefeated` / `playerDefeated` so later cycles (economy, cycle 5) can
  attach drops, bounties, or death penalties.
- **first-light stays frozen.** Combat is not in its composition; the pack is
  proven by the matrix pair row and scenario rows. first-light must keep
  recomposing bit-identically.
- **One package, three pure cores.** `healthCore.ts`, `enemyAiCore.ts`, and
  `combatCore.ts` are separate pure modules inside one
  `@automata/pack-combat-ai` package; the pack adapter and eval hook wire
  them together.

## 2. Contracts

### 2.1 GameSpec capability config

`capabilityConfigSchemas['combat-ai']` (in `contracts/src/gameSpec.ts`)
replaces its Phase 2 stub with:

```ts
z.strictObject({
  playerMaxHealth: z.number().int().min(1).max(20).optional()
})
```

Only `playerMaxHealth` — the one difficulty-ish knob a spec author plausibly
wants. Enemy count derives from the spec's `cast` members with role
`antagonist` (bounded by `budgets.characterCount`); duplicating it here would
create two sources of truth. Per the Phase 2 hash rule the field is optional
with **no zod default**; `COMBAT_DEFAULTS` is applied by `composeSection`.

### 2.2 Compatibility declaration

```ts
packCompatibility({
  integratesWith: ['interaction-inventory'],
  stateSlices: { owns: ['combat'], reads: ['inventory'] },
  events: { emits: ['enemyDefeated', 'playerDefeated'], consumes: [] }
})
```

Matches `DEFAULT_CAPABILITY_COMPATIBILITY` (`combat-ai` requires nothing).
The `inventory` read is optional at runtime: when the slice registry has no
`inventory` slice the weapon boost simply never applies.

### 2.3 Pack config (compiled)

Strict zod schema (`packConfigSchema` composed from the three cores,
exported from the package):

- `player: { maxHealth, attackDamage, attackRadius, attackCooldownSeconds, secondWindSeconds }`
  — all positive, bounded
- `weapon: { itemId: string | null, damageMultiplier: number }` —
  multiplier ≥ 1, bounded
- `enemies: [{ id, name, post: {x, z}, maxHealth, attackDamage, attackRadius, attackCooldownSeconds, speed, aggroRadius, leashRadius }]`
  — bounded array

The schema **cross-validates via `superRefine`**: enemy ids unique, and
`aggroRadius < leashRadius` per enemy. `weapon.itemId` resolving against the
*inventory* section is validated at compose time by `composeSection` (§4.1),
the only place both sections are in scope (cycle-3 precedent).

## 3. Pure cores and browser runtime

### 3.1 `healthCore.ts`

Pure HP arithmetic plus the second wind. State: `{ hp, invulnSeconds }`.
`applyDamage(state, amount, config)`: damage while `invulnSeconds > 0` is
ignored; damage that would reach zero instead returns
`{ hp: maxHealth, invulnSeconds: secondWindSeconds }` plus
`defeated: true` (the adapter turns that into `playerDefeated`).
`tickInvuln(state, dt)` drains the window on the fixed timestep. No wall
clock — headless and browser twins agree tick-for-tick.

### 3.2 `enemyAiCore.ts`

Per-enemy state machine `idle | chase | return` over
`{ position, mode }`. `stepEnemy(enemy, config, playerPos, dt)`: aggro when
the player is within `aggroRadius` of the enemy's current position; chase
straight toward the player at constant speed; switch to `return` when the
player is beyond `leashRadius` **from the post**; walk back to post with the
exact-arrival clamp (no overshoot oscillation); re-aggro mid-return when the
player re-enters `aggroRadius`. Defeated enemies stop stepping. No
pathfinding, no collision — the open arena and keepout-validated posts make
straight lines safe.

### 3.3 `combatCore.ts`

Engagement resolution per tick with fixed-dt cooldown accumulators. The
player auto-attacks the nearest alive enemy within `attackRadius` (ties
broken by enemy id order); each enemy within its own `attackRadius` attacks
a non-invulnerable player on its own cooldown. Player damage is
`attackDamage × weapon.damageMultiplier` when `weapon.itemId` is non-null
and appears in the inventory slice's collected list, else base damage.
`enemiesDefeated` — the pack's `objectivesComplete` gate — is true when
every enemy is at zero HP. With an antagonist-free cast the gate is
vacuously true (cycle-3 zero-walker parallel; the fixture set pins the
fighting path in the matrix). Because enemies never heal and the player
always recovers via second wind, the composed headless drive terminates.

Persistence (contract v2 slot): saves
`{ player: { hp }, enemies: [{ id, hp }] }` with a strict zod schema over
the saved shape; positions and AI modes are recomputed — live enemies snap
to their post on load and the invulnerability window resets to zero
(deliberate, documented simplifications; walker-snap precedent).
`loadState` parses-or-throws (inventory precedent).

### 3.4 `pack.ts` (browser adapter)

- Enemy markers via `ctx.render`, a fourth size/color combination distinct
  from item spheres, dialogue NPC markers, and walkers (no render-port
  additions; see §7 risks). Markers are removed when an enemy is defeated.
- HP HUD chip plus a defeated-count chip, styled like the existing HUDs.
- The fixed-timestep update drives `enemyAiCore` per enemy, then
  `combatCore` resolution, then `healthCore` invulnerability drain — a fixed
  step order, covered by determinism tests.
- Writes the `combat` slice (sole writer: player hp/invulnerability,
  per-enemy hp and mode), reads the `inventory` slice when the registry has
  it, emits `enemyDefeated` (with enemy id) and `playerDefeated`.

## 4. Seeded composeSection and matrix rows

### 4.1 `composeSection`

Input: spec config (`playerMaxHealth?`), the spec's `cast`, arena geometry,
**and the composed inventory section output when the inventory capability is
selected** (ordered after it via the cycle-2 sections threading; with combat
standalone there is no upstream input). Generation, all seeded and
deterministic:

- Enemies: one per cast member with role `antagonist` (zero is legal — the
  fixture set guarantees the fighting case is always exercised in the
  matrix). Stats from `COMBAT_DEFAULTS` (player 5 HP, enemies 3 HP, fixed
  cooldowns, radii, `secondWindSeconds`); the spec's `playerMaxHealth`
  overrides the one default it names. Posts are placed with the same keepout
  pattern items, NPCs, and stations use (wall margin, spawn/goal keepout,
  separation from items, dialogue NPCs, walker stations, and each other,
  bounded draw budget with a typed exhaustion error) **plus one new
  constraint: the spawn point must lie outside each enemy's `aggroRadius`**,
  so the player is never aggro-locked at spawn.
- Weapon: when the inventory section is present, a seeded pick of one
  composed item id becomes `weapon.itemId` with `damageMultiplier: 2`;
  otherwise `itemId: null`.
- `COMBAT_DEFAULTS` is applied here, never in the spec schema.

### 4.2 Eval hook — no harness changes

- `nextTarget` returns the nearest alive enemy's current tracked position
  (chasing a chaser converges — both close distance monotonically), `null`
  once all enemies are defeated. In pairs the existing first-non-null hook
  ordering has inventory collect first, then combat fight — so the weapon is
  held before the fight.
- `step` advances `enemyAiCore`, `combatCore`, and `healthCore` (second
  wind and invulnerability drain included) with the fixed dt, reading
  the `inventory` slice from the `EvalSliceView` for the weapon boost
  exactly as the runtime reads the slice registry — graceful when absent.
- `publishSlices` exposes `combat`.
- `objectivesComplete` is `enemiesDefeated`.

All existing hooks and the harness walk policy are untouched.

## 5. Editor contribution, matrix rows, registration

- `editorContribution`: `prefabs: []` — enemies are composition-owned, same
  reasoning as items, NPCs, and walkers. `createPreview` renders enemy posts
  and their aggro/leash radii from the parsed config.
- Registry: add the pack to `STANDARD_PACKS`, a deterministic fixture to
  `PACK_FIXTURES` (two enemies with posts and radii; `weapon.itemId`
  pointing at the inventory fixture's item for the pair row), and a builder
  to `EVAL_HOOK_BUILDERS`.
- Matrix: **combat+inventory is the first satisfiable new pair row since
  cycle 2** (headless completion + null-renderer boot). combat+dialogue and
  combat+schedules are requires-unsatisfiable (dialogue needs inventory;
  schedules needs both) and are correctly skipped by the existing harness
  logic. The cycle-3 scenario table gains two rows: `[combat-ai]` **solo**
  (proves standalone operation and base-damage degradation headlessly) and
  the **full 4-pack set**
  (`interaction-inventory + dialogue-quests + schedules-relationships +
  combat-ai`) — the phase's largest composition to date. No conflicts are
  declared; the negative row stays empty.
- MCP/editor: **no game-specific changes** — the phase exit criterion. The
  pack arrives through the same registration tables as its predecessors.

## 6. Testing and gates

- `healthCore`: damage arithmetic, second-wind trigger at exactly zero,
  invulnerability ignore + drain edges, determinism.
- `enemyAiCore`: aggro/leash/re-aggro transitions, straight-line stepping,
  exact arrival clamp on return, defeated-enemy freeze, determinism across
  tick sequences.
- `combatCore`: cooldown accumulation, nearest-enemy selection + id
  tie-break, weapon multiplier on/off, completion gate, persistence
  round-trip + malformed-state rejection (including snap-to-post and
  invulnerability reset on load).
- `composeSection`: same-seed determinism, spawn-outside-aggro keepout,
  post keepouts against items/NPCs/stations, zero-antagonist case,
  placement-budget exhaustion error, weapon-id validity against the
  inventory section, standalone (`itemId: null`) case.
- `pack` (browser adapter, happy-dom): HP chip and defeated-count updates,
  marker removal on defeat, slice write + `enemyDefeated`/`playerDefeated`
  emission, save/load.
- **Weapon-boost parity test**: the runtime slice-read path and the eval
  slice-view path produce identical damage from the same fixture.
- Matrix: the combat+inventory pair row; the solo and 4-pack scenario rows.
- Gates: `npm run ci`, `verify:new-game`, and a first-light recompose
  proving bit-identical output (frozen-baseline regression).

## 7. Risks

- **Marker palette exhaustion.** A fourth distinct primitive combination may
  strain the supported render set. Checked first in implementation; fallback
  is a distinct color on an existing shape. A render-port addition would be
  its own reviewed decision, not smuggled into this cycle.
- **Second wind makes defeat toothless.** Accepted for this cycle:
  `playerDefeated` is emitted so the economy pack (cycle 5) can attach death
  penalties; real respawn waits on the teleport capability gap.
- **Two movers stepping per tick could make interleaving order matter.**
  Step order is fixed (enemy AI, then combat resolution, then
  invulnerability drain) and covered by determinism tests.
- **Capability gap logged: pack-initiated player teleport.** Real
  respawn-at-spawn needs an additive world-effect seam in game-kit and the
  eval harness; the gap feeds the umbrella rather than bespoke code.
