# Phase 4 Cycle 3 — Schedules & Relationships Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@automata/pack-schedules-relationships` — a discrete four-slot game clock, ambient walkers on straight-line station schedules, and quest-driven relationship tiers — as the third standard pack, plus the composition matrix's first 3-pack scenario suite.

**Architecture:** One package, three pure cores (`clockCore`, `scheduleCore`, `relationshipCore`) under a strict cross-referenced config schema; a browser `GamePack` adapter with a clock chip and relationships HUD panel; a seeded `composeSection` fed by the composed dialogue section; a headless eval hook that derives `questCompleted` by diffing the threaded `questLog` slice — no harness or dialogue-pack changes. Spec: [`2026-07-17-phase-4-cycle-3-schedules-relationships-design.md`](../../../specs/active/2026-07/week-29/2026-07-17-phase-4-cycle-3-schedules-relationships-design.md).

**Tech Stack:** TypeScript ESM workspaces, zod via `@automata/project` re-export, vitest (+ happy-dom for the adapter), existing `@automata/game-kit` contract v2 seams.

**Implementation progress:** 0% (0/60 steps complete).

## Global Constraints

- Packs import zod ONLY as `import { z } from '@automata/project'` (eslint enforces; no direct `zod` import).
- Direct pack→pack imports are forbidden. This pack references the dialogue pack's `questLog` slice and `questCompleted` event by string constants — never by importing `@automata/pack-dialogue-quests`. Only `pack-registry` and `game-compose` may import multiple packs.
- Spec-side capability schemas: all fields optional, NO zod defaults (`config: {}` must parse to `{}` — stored Phase-2 spec hashes must not change). Defaults live in `composeSection` only.
- `games/first-light` is frozen: its inventory-only compose output must stay bit-identical. In `composeGame`, all schedules-related RNG draws happen AFTER the existing draw order (goal → icon hues → item placements → NPC placements) and only when the spec selects `schedules-relationships`.
- Slice sole-writer rule: this pack writes only `clock` and `relationships`; it reads `questLog` and never mutates it.
- No eval-seam (`game-kit/src/packEval.ts`) or dialogue-pack changes anywhere in this plan; the hook uses only cycle-2's existing `publishSlices`/`slices` threading. Changing either file is a territory violation.
- The eval hook's completion must NOT depend on clock or walker progress (the 2000-step matrix budget cannot fit slot cycles); completion derives from questLog diffs only.
- Gates for cycle completion: `npm run ci`, `npm run verify:new-game`, composition matrix (incl. new scenario suite) green, first-light recompose bit-identical.
- Commit after every task with the repo's conventional style (`feat(pack-schedules-relationships): …`, `test(…): …`, etc.).
- Cross-plan coordination: Phase 5 cycle 3 runs in parallel. **This plan's Task 10 (composeGame wiring) must land before Phase 5 cycle 3's compose-wiring task starts** — both edit `packages/game-compose/src/compose.ts`. Expected shared-file rebases beyond that: `package-lock.json`, `docs/ROADMAP.md`. Overlap anywhere else means a territory violation.

---

### Task 1: GameSpec capability config for schedules-relationships

**Files:**
- Modify: `packages/contracts/src/gameSpec.ts:91` (the `'schedules-relationships': z.strictObject({})` stub)
- Test: `packages/contracts/tests/gameSpec.test.ts`

**Interfaces:**
- Consumes: existing `capabilityConfigSchemas` table.
- Produces: `capabilityConfigSchemas['schedules-relationships']` accepting `{ slotSeconds?: number }` (5–120), rejecting unknown keys; `{}` still parses to `{}`.

- [ ] **Step 1: Write the failing tests**

Append to the capability-config describe block in `packages/contracts/tests/gameSpec.test.ts` (match the file's existing style):

```ts
describe('schedules-relationships capability config', () => {
  it('accepts an empty config unchanged (hash rule)', () => {
    expect(capabilityConfigSchemas['schedules-relationships'].parse({})).toEqual({})
  })

  it('accepts slotSeconds within bounds', () => {
    expect(capabilityConfigSchemas['schedules-relationships'].parse({ slotSeconds: 20 }))
      .toEqual({ slotSeconds: 20 })
  })

  it('rejects slotSeconds out of bounds and unknown keys', () => {
    expect(() => capabilityConfigSchemas['schedules-relationships'].parse({ slotSeconds: 2 })).toThrow()
    expect(() => capabilityConfigSchemas['schedules-relationships'].parse({ slotSeconds: 500 })).toThrow()
    expect(() => capabilityConfigSchemas['schedules-relationships'].parse({ walkerCount: 3 })).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run --project contracts -t 'schedules-relationships capability config'`
Expected: 1 failure (the in-bounds `slotSeconds` parse — the empty-config and rejection tests already pass against the stub).

- [ ] **Step 3: Implement**

In `packages/contracts/src/gameSpec.ts` replace the stub line:

```ts
  'schedules-relationships': z.strictObject({}),
```

with:

```ts
  'schedules-relationships': z.strictObject({
    slotSeconds: z.number().min(5).max(120).optional()
  }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project contracts`
Expected: PASS (all contracts tests, including untouched spec-hash fixtures).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): real schedules-relationships capability config (slotSeconds)"
```

---

### Task 2: Package scaffold + config schema with cross-ref validation

**Files:**
- Create: `packages/pack-schedules-relationships/package.json`
- Create: `packages/pack-schedules-relationships/tsconfig.json`
- Create: `packages/pack-schedules-relationships/vitest.config.ts`
- Create: `packages/pack-schedules-relationships/src/config.ts`
- Create: `packages/pack-schedules-relationships/src/index.ts`
- Create: `packages/pack-schedules-relationships/tests/fixtures.ts`
- Test: `packages/pack-schedules-relationships/tests/config.test.ts`

**Interfaces:**
- Produces (consumed by every later task):

```ts
export const CLOCK_SLICE_ID = 'clock'
export const RELATIONSHIPS_SLICE_ID = 'relationships'
export const QUEST_LOG_SLICE_ID = 'questLog'            // read-only contract name, string on purpose
export const QUEST_COMPLETED_EVENT = 'questCompleted'    // consumed contract name, string on purpose
export const TIME_SLOT_CHANGED_EVENT = 'timeSlotChanged'
export const RELATIONSHIP_CHANGED_EVENT = 'relationshipChanged'
export const SLOT_NAMES = ['morning', 'afternoon', 'evening', 'night'] as const
export const SLOT_COUNT = 4
export interface WalkerDef { id: string; name: string; speed: number; stations: Array<{ x: number; z: number }> }
export interface TrackedRelationship { npcId: string; name: string; questIds: string[] }
export interface RelationshipsConfig {
  tracked: TrackedRelationship[]
  thresholds: { acquaintance: number; friend: number }
  gains: { questCompleted: number }
}
export interface SchedulesRelationshipsPackConfig {
  slotSeconds: number
  walkers: WalkerDef[]
  relationships: RelationshipsConfig
}
export const packConfigSchema: z.ZodType<SchedulesRelationshipsPackConfig>  // strict + cross-ref superRefine
/** Runtime slice payload shapes (also the eval hook's published shapes). */
export interface ClockSliceValue { slot: number; slotName: string }
export interface RelationshipsSliceValue { affinities: Record<string, number> }
```

`stations` has exactly `SLOT_COUNT` entries (station for slot i). Zero walkers is legal.

- [ ] **Step 1: Scaffold the package**

`packages/pack-schedules-relationships/package.json`:

```json
{
  "name": "@automata/pack-schedules-relationships",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/engine": "*",
    "@automata/game-kit": "*",
    "@automata/project": "*"
  }
}
```

`packages/pack-schedules-relationships/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/pack-schedules-relationships/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-schedules-relationships', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

`packages/pack-schedules-relationships/src/index.ts` (grows in later tasks):

```ts
export * from './config'
```

Run: `npm install` (links the workspace).

- [ ] **Step 2: Write the failing tests**

`packages/pack-schedules-relationships/tests/fixtures.ts` (shared fixture lives here, NOT in a test file — repo convention):

```ts
import type { SchedulesRelationshipsPackConfig } from '../src/config'

/** Minimal internally consistent config; tests mutate copies to break one rule at a time. */
export function validConfig(): SchedulesRelationshipsPackConfig {
  return {
    slotSeconds: 20,
    walkers: [
      {
        id: 'walker-1', name: 'Stroller', speed: 2,
        stations: [{ x: 2, z: 2 }, { x: -3, z: 4 }, { x: 5, z: -2 }, { x: 0, z: 6 }]
      }
    ],
    relationships: {
      tracked: [{ npcId: 'npc-1', name: 'The Keeper', questIds: ['q-main-1'] }],
      thresholds: { acquaintance: 1, friend: 2 },
      gains: { questCompleted: 1 }
    }
  }
}
```

`packages/pack-schedules-relationships/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { packConfigSchema, SLOT_COUNT } from '../src/config'
import { validConfig } from './fixtures'

describe('schedules-relationships pack config schema', () => {
  it('parses a valid config unchanged, including zero walkers', () => {
    expect(packConfigSchema.parse(validConfig())).toEqual(validConfig())
    const empty = { ...validConfig(), walkers: [] }
    expect(packConfigSchema.parse(empty)).toEqual(empty)
  })

  it('rejects station arrays that are not exactly SLOT_COUNT long', () => {
    const short = validConfig()
    short.walkers[0]!.stations = short.walkers[0]!.stations.slice(0, SLOT_COUNT - 1)
    expect(() => packConfigSchema.parse(short)).toThrow()
    const long = validConfig()
    long.walkers[0]!.stations = [...long.walkers[0]!.stations, { x: 0, z: 0 }]
    expect(() => packConfigSchema.parse(long)).toThrow()
  })

  it('rejects duplicate walker ids and duplicate tracked npc ids', () => {
    const dupWalker = validConfig()
    dupWalker.walkers.push({ ...dupWalker.walkers[0]! })
    expect(() => packConfigSchema.parse(dupWalker)).toThrow(/duplicate/i)
    const dupTracked = validConfig()
    dupTracked.relationships.tracked.push({ ...dupTracked.relationships.tracked[0]! })
    expect(() => packConfigSchema.parse(dupTracked)).toThrow(/duplicate/i)
  })

  it('rejects a quest id tracked by two npcs', () => {
    const shared = validConfig()
    shared.relationships.tracked.push({ npcId: 'npc-2', name: 'Dockhand', questIds: ['q-main-1'] })
    expect(() => packConfigSchema.parse(shared)).toThrow(/q-main-1/)
  })

  it('rejects thresholds where friend is not above acquaintance', () => {
    const flat = validConfig()
    flat.relationships.thresholds = { acquaintance: 2, friend: 2 }
    expect(() => packConfigSchema.parse(flat)).toThrow(/friend/i)
  })

  it('rejects out-of-bounds slotSeconds and speed, and unknown keys', () => {
    expect(() => packConfigSchema.parse({ ...validConfig(), slotSeconds: 2 })).toThrow()
    const slow = validConfig()
    slow.walkers[0]!.speed = 0
    expect(() => packConfigSchema.parse(slow)).toThrow()
    expect(() => packConfigSchema.parse({ ...validConfig(), extra: true })).toThrow()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: FAIL — cannot resolve `../src/config`.

- [ ] **Step 4: Implement `src/config.ts`**

```ts
import { z } from '@automata/project'

/**
 * Compiled pack config: ambient walker schedules and quest-driven relationship
 * tracking, cross-validated so structural mistakes are compose-time errors.
 * Contract names for the slices/events this pack owns, reads, emits, and
 * consumes live here; the dialogue-pack names are deliberate string copies —
 * pack→pack imports are forbidden.
 */
export const CLOCK_SLICE_ID = 'clock'
export const RELATIONSHIPS_SLICE_ID = 'relationships'
export const QUEST_LOG_SLICE_ID = 'questLog'
export const QUEST_COMPLETED_EVENT = 'questCompleted'
export const TIME_SLOT_CHANGED_EVENT = 'timeSlotChanged'
export const RELATIONSHIP_CHANGED_EVENT = 'relationshipChanged'

export const SLOT_NAMES = ['morning', 'afternoon', 'evening', 'night'] as const
export const SLOT_COUNT = SLOT_NAMES.length

/** Runtime slice payloads — also the eval hook's published shapes. */
export interface ClockSliceValue { slot: number; slotName: string }
export interface RelationshipsSliceValue { affinities: Record<string, number> }

const idSchema = z.string().min(1).max(60)
const positionSchema = z.strictObject({ x: z.number(), z: z.number() })

const walkerSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  speed: z.number().min(0.5).max(8),
  stations: z.array(positionSchema).length(SLOT_COUNT)
})
export type WalkerDef = z.infer<typeof walkerSchema>

const trackedSchema = z.strictObject({
  npcId: idSchema,
  name: z.string().min(1).max(80),
  questIds: z.array(idSchema).min(1).max(18)
})
export type TrackedRelationship = z.infer<typeof trackedSchema>

const relationshipsSchema = z.strictObject({
  tracked: z.array(trackedSchema).max(12),
  thresholds: z.strictObject({
    acquaintance: z.number().int().min(1).max(20),
    friend: z.number().int().min(2).max(40)
  }),
  gains: z.strictObject({ questCompleted: z.number().int().min(1).max(4) })
})
export type RelationshipsConfig = z.infer<typeof relationshipsSchema>

const baseConfigSchema = z.strictObject({
  slotSeconds: z.number().min(5).max(120),
  walkers: z.array(walkerSchema).max(12),
  relationships: relationshipsSchema
})
export type SchedulesRelationshipsPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

export const packConfigSchema: z.ZodType<SchedulesRelationshipsPackConfig> = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  for (const dup of duplicates(config.walkers.map((walker) => walker.id))) issue(`duplicate walker id "${dup}"`)
  for (const dup of duplicates(config.relationships.tracked.map((entry) => entry.npcId))) issue(`duplicate tracked npc id "${dup}"`)
  const seenQuestIds = new Map<string, string>()
  for (const entry of config.relationships.tracked) {
    for (const questId of entry.questIds) {
      const owner = seenQuestIds.get(questId)
      if (owner) issue(`quest "${questId}" tracked by both "${owner}" and "${entry.npcId}"`)
      else seenQuestIds.set(questId, entry.npcId)
    }
  }
  if (config.relationships.thresholds.friend <= config.relationships.thresholds.acquaintance) {
    issue('friend threshold must be above acquaintance')
  }
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/pack-schedules-relationships package-lock.json
git commit -m "feat(pack-schedules-relationships): package scaffold + cross-validated config schema"
```

---

### Task 3: clockCore — discrete slot clock

**Files:**
- Create: `packages/pack-schedules-relationships/src/clockCore.ts`
- Test: `packages/pack-schedules-relationships/tests/clockCore.test.ts`
- Modify: `packages/pack-schedules-relationships/src/index.ts` (add `export * from './clockCore'`)

**Interfaces:**
- Produces:

```ts
export interface ClockState { slot: number; elapsedInSlot: number }
export function createClock(): ClockState                      // slot 0, elapsed 0
export function stepClock(state: ClockState, dt: number, slotSeconds: number): { state: ClockState; slotChanged: boolean }
```

`stepClock` is pure; slots wrap `SLOT_COUNT - 1 → 0`; a dt spanning multiple slots advances multiple slots (`slotChanged` true if any boundary crossed).

- [ ] **Step 1: Write the failing tests**

`packages/pack-schedules-relationships/tests/clockCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createClock, stepClock } from '../src/clockCore'

describe('clockCore', () => {
  it('accumulates within a slot without change', () => {
    const { state, slotChanged } = stepClock(createClock(), 5, 20)
    expect(state).toEqual({ slot: 0, elapsedInSlot: 5 })
    expect(slotChanged).toBe(false)
  })

  it('advances and wraps on boundaries', () => {
    let clock = createClock()
    for (let slot = 1; slot <= 4; slot += 1) {
      const step = stepClock(clock, 20, 20)
      expect(step.slotChanged).toBe(true)
      expect(step.state.slot).toBe(slot % 4)
      clock = step.state
    }
    expect(clock).toEqual({ slot: 0, elapsedInSlot: 0 })
  })

  it('handles a dt spanning multiple slots', () => {
    const { state, slotChanged } = stepClock(createClock(), 45, 20)
    expect(state).toEqual({ slot: 2, elapsedInSlot: 5 })
    expect(slotChanged).toBe(true)
  })

  it('is deterministic across split ticks (10×2 === 1×20 boundary)', () => {
    let split = createClock()
    for (let i = 0; i < 10; i += 1) split = stepClock(split, 2, 20).state
    expect(split).toEqual(stepClock(createClock(), 20, 20).state)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-schedules-relationships -t clockCore`
Expected: FAIL — cannot resolve `../src/clockCore`.

- [ ] **Step 3: Implement `src/clockCore.ts`**

```ts
import { SLOT_COUNT } from './config'

/** Pure fixed-dt slot clock: no wall clock, no Date — headless twin identical. */
export interface ClockState { slot: number; elapsedInSlot: number }

export function createClock(): ClockState {
  return { slot: 0, elapsedInSlot: 0 }
}

export function stepClock(state: ClockState, dt: number, slotSeconds: number): { state: ClockState; slotChanged: boolean } {
  let slot = state.slot
  let elapsed = state.elapsedInSlot + dt
  let slotChanged = false
  while (elapsed >= slotSeconds) {
    elapsed -= slotSeconds
    slot = (slot + 1) % SLOT_COUNT
    slotChanged = true
  }
  return { state: { slot, elapsedInSlot: elapsed }, slotChanged }
}
```

Add to `src/index.ts`:

```ts
export * from './clockCore'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-schedules-relationships
git commit -m "feat(pack-schedules-relationships): pure discrete slot clock"
```

---

### Task 4: scheduleCore — straight-line walker movement

**Files:**
- Create: `packages/pack-schedules-relationships/src/scheduleCore.ts`
- Test: `packages/pack-schedules-relationships/tests/scheduleCore.test.ts`
- Modify: `packages/pack-schedules-relationships/src/index.ts` (add `export * from './scheduleCore'`)

**Interfaces:**
- Consumes: `WalkerDef` from `./config`.
- Produces:

```ts
export interface WalkerPosition { x: number; z: number }
export function walkerTarget(walker: WalkerDef, slot: number): WalkerPosition
export function stepWalker(position: WalkerPosition, target: WalkerPosition, speed: number, dt: number): WalkerPosition
export function initialWalkerPositions(walkers: readonly WalkerDef[], slot: number): Record<string, WalkerPosition>
```

`stepWalker` moves straight toward the target at `speed` units/sec, clamping to exact arrival (no overshoot; at the target it returns the target).

- [ ] **Step 1: Write the failing tests**

`packages/pack-schedules-relationships/tests/scheduleCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { initialWalkerPositions, stepWalker, walkerTarget } from '../src/scheduleCore'
import { validConfig } from './fixtures'

describe('scheduleCore', () => {
  const walker = validConfig().walkers[0]!

  it('targets the station for the given slot', () => {
    expect(walkerTarget(walker, 0)).toEqual({ x: 2, z: 2 })
    expect(walkerTarget(walker, 3)).toEqual({ x: 0, z: 6 })
  })

  it('moves straight toward the target at speed', () => {
    const next = stepWalker({ x: 0, z: 0 }, { x: 10, z: 0 }, 2, 0.5)
    expect(next).toEqual({ x: 1, z: 0 })
  })

  it('clamps to exact arrival with no overshoot, then stays put', () => {
    const arrived = stepWalker({ x: 9.9, z: 0 }, { x: 10, z: 0 }, 2, 1)
    expect(arrived).toEqual({ x: 10, z: 0 })
    expect(stepWalker(arrived, { x: 10, z: 0 }, 2, 1)).toEqual({ x: 10, z: 0 })
  })

  it('is deterministic across split ticks (arrival independent of tick size)', () => {
    let a = { x: 0, z: 0 }
    for (let i = 0; i < 100; i += 1) a = stepWalker(a, { x: 3, z: 4 }, 2, 0.05)
    const b = stepWalker({ x: 0, z: 0 }, { x: 3, z: 4 }, 2, 5)
    expect(a).toEqual(b)   // both clamped at the target
  })

  it('snapshots initial positions at the given slot', () => {
    expect(initialWalkerPositions([walker], 2)).toEqual({ 'walker-1': { x: 5, z: -2 } })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-schedules-relationships -t scheduleCore`
Expected: FAIL — cannot resolve `../src/scheduleCore`.

- [ ] **Step 3: Implement `src/scheduleCore.ts`**

```ts
import type { WalkerDef } from './config'

/** Pure straight-line walker movement; walkers are decorative (no collision). */
export interface WalkerPosition { x: number; z: number }

export function walkerTarget(walker: WalkerDef, slot: number): WalkerPosition {
  const station = walker.stations[slot]
  if (!station) throw new Error(`Walker "${walker.id}" has no station for slot ${slot}`)
  return station
}

export function stepWalker(position: WalkerPosition, target: WalkerPosition, speed: number, dt: number): WalkerPosition {
  const dx = target.x - position.x
  const dz = target.z - position.z
  const dist = Math.hypot(dx, dz)
  const stride = speed * dt
  if (dist <= stride) return { x: target.x, z: target.z }
  return { x: position.x + (dx / dist) * stride, z: position.z + (dz / dist) * stride }
}

export function initialWalkerPositions(walkers: readonly WalkerDef[], slot: number): Record<string, WalkerPosition> {
  return Object.fromEntries(walkers.map((walker) => [walker.id, { ...walkerTarget(walker, slot) }]))
}
```

Add to `src/index.ts`:

```ts
export * from './scheduleCore'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-schedules-relationships
git commit -m "feat(pack-schedules-relationships): straight-line walker movement core"
```

---

### Task 5: relationshipCore — affinity, tiers, completion gate, persistence

**Files:**
- Create: `packages/pack-schedules-relationships/src/relationshipCore.ts`
- Test: `packages/pack-schedules-relationships/tests/relationshipCore.test.ts`
- Modify: `packages/pack-schedules-relationships/src/index.ts` (add `export * from './relationshipCore'`)

**Interfaces:**
- Consumes: `RelationshipsConfig`, `SchedulesRelationshipsPackConfig` from `./config`; `ClockState` from `./clockCore`.
- Produces:

```ts
export type RelationshipTier = 'stranger' | 'acquaintance' | 'friend'
export type Affinities = Readonly<Record<string, number>>
export function createAffinities(config: RelationshipsConfig): Affinities   // zeros for every tracked npc
export function applyQuestCompleted(affinities: Affinities, questId: string, config: RelationshipsConfig): Affinities  // same ref if untracked
export function tierOf(affinity: number, thresholds: RelationshipsConfig['thresholds']): RelationshipTier
export function relationshipsComplete(affinities: Affinities, config: RelationshipsConfig): boolean  // every tracked ≥ acquaintance
export interface SchedulesSavedState { clock: ClockState; affinities: Record<string, number> }
export function serializeSchedulesState(clock: ClockState, affinities: Affinities): unknown
export function deserializeSchedulesState(raw: unknown, config: SchedulesRelationshipsPackConfig): SchedulesSavedState  // parse-or-throw
```

- [ ] **Step 1: Write the failing tests**

`packages/pack-schedules-relationships/tests/relationshipCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyQuestCompleted, createAffinities, deserializeSchedulesState, relationshipsComplete,
  serializeSchedulesState, tierOf
} from '../src/relationshipCore'
import { validConfig } from './fixtures'

const config = validConfig()
const rel = config.relationships

describe('relationshipCore', () => {
  it('starts every tracked npc at zero (stranger), incomplete', () => {
    const affinities = createAffinities(rel)
    expect(affinities).toEqual({ 'npc-1': 0 })
    expect(tierOf(0, rel.thresholds)).toBe('stranger')
    expect(relationshipsComplete(affinities, rel)).toBe(false)
  })

  it('bumps the tracking npc on its quest; untracked quests are ignored (same ref)', () => {
    const zero = createAffinities(rel)
    const bumped = applyQuestCompleted(zero, 'q-main-1', rel)
    expect(bumped).toEqual({ 'npc-1': 1 })
    expect(applyQuestCompleted(zero, 'q-side-9', rel)).toBe(zero)
  })

  it('maps thresholds to tiers and completes at acquaintance everywhere', () => {
    expect(tierOf(1, rel.thresholds)).toBe('acquaintance')
    expect(tierOf(2, rel.thresholds)).toBe('friend')
    expect(relationshipsComplete({ 'npc-1': 1 }, rel)).toBe(true)
  })

  it('is vacuously complete with no tracked npcs', () => {
    expect(relationshipsComplete({}, { ...rel, tracked: [] })).toBe(true)
  })

  it('round-trips saved state and rejects malformed or mismatched saves', () => {
    const saved = serializeSchedulesState({ slot: 2, elapsedInSlot: 3.5 }, { 'npc-1': 1 })
    expect(deserializeSchedulesState(saved, config)).toEqual({
      clock: { slot: 2, elapsedInSlot: 3.5 }, affinities: { 'npc-1': 1 }
    })
    expect(() => deserializeSchedulesState(42, config)).toThrow()
    expect(() => deserializeSchedulesState(
      serializeSchedulesState({ slot: 9, elapsedInSlot: 0 }, { 'npc-1': 0 }), config)).toThrow()
    expect(() => deserializeSchedulesState(
      serializeSchedulesState({ slot: 0, elapsedInSlot: 0 }, { 'npc-9': 0 }), config)).toThrow(/npc-9/)
    expect(() => deserializeSchedulesState(
      serializeSchedulesState({ slot: 0, elapsedInSlot: 0 }, {}), config)).toThrow(/npc-1/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-schedules-relationships -t relationshipCore`
Expected: FAIL — cannot resolve `../src/relationshipCore`.

- [ ] **Step 3: Implement `src/relationshipCore.ts`**

```ts
import { z } from '@automata/project'
import { SLOT_COUNT, type RelationshipsConfig, type SchedulesRelationshipsPackConfig } from './config'
import type { ClockState } from './clockCore'

/** Pure relationship state: affinity per tracked npc, driven by quest completion. */
export type RelationshipTier = 'stranger' | 'acquaintance' | 'friend'
export type Affinities = Readonly<Record<string, number>>

export function createAffinities(config: RelationshipsConfig): Affinities {
  return Object.fromEntries(config.tracked.map((entry) => [entry.npcId, 0]))
}

export function applyQuestCompleted(affinities: Affinities, questId: string, config: RelationshipsConfig): Affinities {
  const tracker = config.tracked.find((entry) => entry.questIds.includes(questId))
  if (!tracker) return affinities
  return { ...affinities, [tracker.npcId]: (affinities[tracker.npcId] ?? 0) + config.gains.questCompleted }
}

export function tierOf(affinity: number, thresholds: RelationshipsConfig['thresholds']): RelationshipTier {
  if (affinity >= thresholds.friend) return 'friend'
  if (affinity >= thresholds.acquaintance) return 'acquaintance'
  return 'stranger'
}

/** The pack's objectivesComplete gate: every tracked npc at least acquaintance. */
export function relationshipsComplete(affinities: Affinities, config: RelationshipsConfig): boolean {
  return config.tracked.every((entry) => (affinities[entry.npcId] ?? 0) >= config.thresholds.acquaintance)
}

const savedStateSchema = z.strictObject({
  clock: z.strictObject({
    slot: z.number().int().min(0).max(SLOT_COUNT - 1),
    elapsedInSlot: z.number().min(0)
  }),
  affinities: z.record(z.string().min(1).max(60), z.number().int().min(0))
})
export type SchedulesSavedState = z.infer<typeof savedStateSchema>

export function serializeSchedulesState(clock: ClockState, affinities: Affinities): unknown {
  return { clock: { ...clock }, affinities: { ...affinities } }
}

/** Parse-or-throw; saved affinity keys must exactly match the tracked set. */
export function deserializeSchedulesState(raw: unknown, config: SchedulesRelationshipsPackConfig): SchedulesSavedState {
  const parsed = savedStateSchema.parse(raw)
  const expected = new Set(config.relationships.tracked.map((entry) => entry.npcId))
  for (const id of Object.keys(parsed.affinities)) {
    if (!expected.has(id)) throw new Error(`Saved schedules state has unknown npc "${id}"`)
  }
  for (const id of expected) {
    if (!(id in parsed.affinities)) throw new Error(`Saved schedules state missing npc "${id}"`)
  }
  return parsed
}
```

Add to `src/index.ts`:

```ts
export * from './relationshipCore'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-schedules-relationships
git commit -m "feat(pack-schedules-relationships): relationship affinity core with persistence"
```

---

### Task 6: Browser adapter (pack.ts)

**Files:**
- Create: `packages/pack-schedules-relationships/src/pack.ts`
- Test: `packages/pack-schedules-relationships/tests/pack.test.ts`
- Modify: `packages/pack-schedules-relationships/src/index.ts` (add `export * from './pack'`)

**Interfaces:**
- Consumes: all cores + config; `GamePack`, `PackRuntimeHandle`, `packCompatibility` from `@automata/game-kit`.
- Produces: `schedulesRelationshipsPack: GamePack<SchedulesRelationshipsPackConfig>` with id `'schedules-relationships'`, version `'1.0.0'`, the spec §2.2 compatibility declaration, `configSchema: packConfigSchema`.

Behavior contract: walkers render as spheres (radius 0.35, color `#3ddc84`) at their current-slot station and walk on slot change; a `.clock-hud` chip shows the slot name; a `.relationships-hud` panel shows `name: tier` per tracked npc; consuming `questCompleted` bumps affinity, writes the `relationships` slice, and emits `relationshipChanged`; slot changes write the `clock` slice and emit `timeSlotChanged`; `objectivesComplete` is `relationshipsComplete`; save/load round-trips clock + affinities and snaps walkers to their current-slot station.

- [ ] **Step 1: Write the failing tests**

`packages/pack-schedules-relationships/tests/pack.test.ts` (happy-dom; mirrors the dialogue pack's adapter-test setup — `createGameHost` + `createNullRenderer`):

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { composePacks, createGameHost } from '@automata/game-kit'
import { schedulesRelationshipsPack } from '../src/pack'
import {
  CLOCK_SLICE_ID, QUEST_COMPLETED_EVENT, QUEST_LOG_SLICE_ID, RELATIONSHIPS_SLICE_ID,
  RELATIONSHIP_CHANGED_EVENT, TIME_SLOT_CHANGED_EVENT
} from '../src/config'
import { validConfig } from './fixtures'

/** Stand-in for the dialogue pack: owns questLog and emits questCompleted. */
const questLogStub = {
  id: 'dialogue-quests',
  version: '0.0.0-test',
  compatibility: {
    requires: [], conflictsWith: [], integratesWith: [],
    stateSlices: { owns: [QUEST_LOG_SLICE_ID], reads: [] },
    events: { emits: [QUEST_COMPLETED_EVENT], consumes: [] }
  },
  register(ctx: { state: { register(id: string, owner: string, v: unknown): void } }) {
    ctx.state.register(QUEST_LOG_SLICE_ID, 'dialogue-quests', { 'q-main-1': 'available' })
  }
}

function boot(config = validConfig()) {
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  const composed = composePacks([questLogStub as never, schedulesRelationshipsPack as never], {
    'schedules-relationships': config
  })
  // The composed boot context is created inside boot(); reach events/state via the pack's slices.
  const runtime = composed.boot({ host, render: render.port })
  return { app, host, render, runtime }
}

describe('schedules-relationships pack adapter', () => {
  it('boots with walker markers, clock chip, and relationships panel', () => {
    const { app, host, render } = boot()
    expect(render.port.objectCount).toBe(1)   // one walker
    expect(app.querySelector('.clock-hud')?.textContent).toBe('morning')
    expect(app.querySelector('.relationships-hud')?.textContent).toContain('The Keeper: stranger')
    host.dispose()
    expect(render.port.objectCount).toBe(0)
    app.remove()
  })

  it('advances the slot on fixedUpdate and walks the walker toward the new station', () => {
    const { app, host, runtime } = boot()
    runtime.fixedUpdate(20, { playerPosition: { x: 0, z: 0 } })   // one full slot
    expect(app.querySelector('.clock-hud')?.textContent).toBe('afternoon')
    host.dispose(); app.remove()
  })

  it('objectivesComplete flips when questCompleted bumps every tracked npc to acquaintance', () => {
    const { app, host, runtime } = boot()
    expect(runtime.objectivesComplete()).toBe(false)
    host.events.emit(QUEST_COMPLETED_EVENT, { packId: 'dialogue-quests', questId: 'q-main-1' })
    expect(runtime.objectivesComplete()).toBe(true)
    expect(app.querySelector('.relationships-hud')?.textContent).toContain('The Keeper: acquaintance')
    host.dispose(); app.remove()
  })

  it('saves and restores clock + affinities, snapping walkers to the restored slot', () => {
    const { app, host, runtime } = boot()
    runtime.fixedUpdate(45, { playerPosition: { x: 0, z: 0 } })   // slot 2
    const saved = runtime.saveState()
    const fresh = boot()
    fresh.runtime.loadState(saved)
    expect(fresh.app.querySelector('.clock-hud')?.textContent).toBe('evening')
    expect(() => fresh.runtime.loadState({ 'schedules-relationships': { junk: true } })).toThrow()
    host.dispose(); app.remove(); fresh.host.dispose(); fresh.app.remove()
  })
})
```

**Note:** the composed runtime does not expose the boot context's event bus. Give the test access by having the stub capture `ctx.events` into a module-level variable, OR — simpler and matching the dialogue pack's own adapter tests — read the dialogue pack's test file `packages/pack-dialogue-quests/tests/pack.test.ts` FIRST and mirror its established host/event access pattern exactly (including how it emits events into the composed context). Adjust the test skeleton above to that pattern; keep the assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-schedules-relationships -t adapter`
Expected: FAIL — cannot resolve `../src/pack`.

- [ ] **Step 3: Implement `src/pack.ts`**

```ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  CLOCK_SLICE_ID, QUEST_COMPLETED_EVENT, QUEST_LOG_SLICE_ID, RELATIONSHIPS_SLICE_ID,
  RELATIONSHIP_CHANGED_EVENT, SLOT_NAMES, TIME_SLOT_CHANGED_EVENT,
  packConfigSchema, type ClockSliceValue, type RelationshipsSliceValue,
  type SchedulesRelationshipsPackConfig
} from './config'
import { createClock, stepClock, type ClockState } from './clockCore'
import { initialWalkerPositions, stepWalker, walkerTarget, type WalkerPosition } from './scheduleCore'
import {
  applyQuestCompleted, createAffinities, deserializeSchedulesState, relationshipsComplete,
  serializeSchedulesState, tierOf, type Affinities
} from './relationshipCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const WALKER_COLOR = '#3ddc84'
const WALKER_RADIUS = 0.35

/** The third standard pack: ambient schedules plus quest-driven relationships. */
export const schedulesRelationshipsPack: GamePack<SchedulesRelationshipsPackConfig> = {
  id: 'schedules-relationships',
  version: '1.0.0',
  compatibility: packCompatibility({
    requires: ['dialogue-quests'],
    stateSlices: { owns: [CLOCK_SLICE_ID, RELATIONSHIPS_SLICE_ID], reads: [QUEST_LOG_SLICE_ID] },
    events: { emits: [TIME_SLOT_CHANGED_EVENT, RELATIONSHIP_CHANGED_EVENT], consumes: [QUEST_COMPLETED_EVENT] }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let clock: ClockState = createClock()
    let affinities: Affinities = createAffinities(config.relationships)
    let positions: Record<string, WalkerPosition> = initialWalkerPositions(config.walkers, clock.slot)

    const clockValue = (): ClockSliceValue => ({ slot: clock.slot, slotName: SLOT_NAMES[clock.slot]! })
    const relationshipsValue = (): RelationshipsSliceValue => ({ affinities: { ...affinities } })
    ctx.state.register(CLOCK_SLICE_ID, schedulesRelationshipsPack.id, clockValue())
    ctx.state.register(RELATIONSHIPS_SLICE_ID, schedulesRelationshipsPack.id, relationshipsValue())

    const entities = new Map(config.walkers.map((walker) => [walker.id, { id: `schedules-walker-${walker.id}` }]))
    for (const walker of config.walkers) {
      const entity = entities.get(walker.id)!
      ctx.render.add(entity, { primitive: 'sphere', radius: WALKER_RADIUS, color: WALKER_COLOR })
      ctx.host.cleanup.defer(() => ctx.render.remove(entity))
    }
    const renderWalkers = (): void => {
      for (const walker of config.walkers) {
        const position = positions[walker.id]!
        ctx.render.setPose(entities.get(walker.id)!, { x: position.x, y: WALKER_RADIUS, z: position.z }, IDENTITY)
      }
    }
    renderWalkers()

    const clockHud = document.createElement('div')
    clockHud.className = 'clock-hud'
    ctx.host.overlays.append(clockHud)
    const relationshipsHud = document.createElement('div')
    relationshipsHud.className = 'relationships-hud'
    ctx.host.overlays.append(relationshipsHud)
    const updateHuds = (): void => {
      clockHud.textContent = SLOT_NAMES[clock.slot]!
      relationshipsHud.textContent = config.relationships.tracked
        .map((entry) => `${entry.name}: ${tierOf(affinities[entry.npcId] ?? 0, config.relationships.thresholds)}`)
        .join(' · ')
    }
    updateHuds()

    const setClock = (next: ClockState): void => {
      clock = next
      ctx.state.set(CLOCK_SLICE_ID, schedulesRelationshipsPack.id, clockValue())
    }
    const setAffinities = (next: Affinities): void => {
      affinities = next
      ctx.state.set(RELATIONSHIPS_SLICE_ID, schedulesRelationshipsPack.id, relationshipsValue())
    }

    const offQuestCompleted = ctx.events.on(QUEST_COMPLETED_EVENT, (payload) => {
      const questId = (payload as { questId?: string } | undefined)?.questId
      if (!questId) return
      const next = applyQuestCompleted(affinities, questId, config.relationships)
      if (next === affinities) return
      setAffinities(next)
      ctx.events.emit(RELATIONSHIP_CHANGED_EVENT, { packId: schedulesRelationshipsPack.id, affinities: { ...next } })
      updateHuds()
    })

    return {
      fixedUpdate(dt) {
        const step = stepClock(clock, dt, config.slotSeconds)
        if (step.slotChanged) {
          setClock(step.state)
          ctx.events.emit(TIME_SLOT_CHANGED_EVENT, { packId: schedulesRelationshipsPack.id, ...clockValue() })
          updateHuds()
        } else {
          clock = step.state
        }
        for (const walker of config.walkers) {
          positions[walker.id] = stepWalker(positions[walker.id]!, walkerTarget(walker, clock.slot), walker.speed, dt)
        }
        renderWalkers()
      },
      objectivesComplete: () => relationshipsComplete(affinities, config.relationships),
      saveState: () => serializeSchedulesState(clock, affinities),
      loadState(raw) {
        const restored = deserializeSchedulesState(raw, config)
        setClock(restored.clock)
        setAffinities(restored.affinities)
        positions = initialWalkerPositions(config.walkers, clock.slot)   // documented snap-to-station
        renderWalkers()
        updateHuds()
      },
      dispose() {
        offQuestCompleted()
        clockHud.remove()
        relationshipsHud.remove()
      }
    }
  }
}
```

Add to `src/index.ts`:

```ts
export * from './pack'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-schedules-relationships
git commit -m "feat(pack-schedules-relationships): browser adapter with clock chip and relationships HUD"
```

---

### Task 7: Headless eval hook (questLog-diff driven; no harness changes)

**Files:**
- Create: `packages/pack-schedules-relationships/src/evalHook.ts`
- Test: `packages/pack-schedules-relationships/tests/evalHook.test.ts`
- Modify: `packages/pack-schedules-relationships/src/index.ts` (add `export * from './evalHook'`)

**Interfaces:**
- Consumes: cores + config; `PackEvalHook`, `EvalSliceView` from `@automata/game-kit` (UNCHANGED — no game-kit edits).
- Produces: `createSchedulesRelationshipsEvalHook(config: SchedulesRelationshipsPackConfig): PackEvalHook`. Behavior contract (the matrix relies on it): `nextTarget` is always `null` (the pack asks nothing of the walk and yields); `step` advances clock/walkers by a fixed internal tick and applies `questCompleted` derived from `questLog`-slice transitions to `'complete'`; `complete` is `relationshipsComplete` — it must never depend on clock or walker progress.

- [ ] **Step 1: Write the failing tests**

`packages/pack-schedules-relationships/tests/evalHook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSchedulesRelationshipsEvalHook, EVAL_TICK_DT } from '../src/evalHook'
import { validConfig } from './fixtures'

const player = { x: 0, z: 0 }

describe('schedules-relationships eval hook', () => {
  it('never requests a walk target and starts incomplete', () => {
    const hook = createSchedulesRelationshipsEvalHook(validConfig())
    const state = hook.createState()
    expect(hook.nextTarget(state, player, {})).toBeNull()
    expect(hook.complete(state)).toBe(false)
  })

  it('completes when the questLog slice shows its tracked quest complete', () => {
    const hook = createSchedulesRelationshipsEvalHook(validConfig())
    let state = hook.createState()
    state = hook.step(state, player, { questLog: { 'q-main-1': 'active' } })
    expect(hook.complete(state)).toBe(false)
    state = hook.step(state, player, { questLog: { 'q-main-1': 'complete' } })
    expect(hook.complete(state)).toBe(true)
    expect(hook.publishSlices!(state)).toMatchObject({ relationships: { affinities: { 'npc-1': 1 } } })
  })

  it('does not double-count a quest that stays complete across ticks', () => {
    const hook = createSchedulesRelationshipsEvalHook(validConfig())
    let state = hook.createState()
    state = hook.step(state, player, { questLog: { 'q-main-1': 'complete' } })
    state = hook.step(state, player, { questLog: { 'q-main-1': 'complete' } })
    expect(hook.publishSlices!(state)).toMatchObject({ relationships: { affinities: { 'npc-1': 1 } } })
  })

  it('advances the published clock slice deterministically with its fixed tick', () => {
    const config = { ...validConfig(), slotSeconds: 5 }
    const hook = createSchedulesRelationshipsEvalHook(config)
    let state = hook.createState()
    const ticks = Math.ceil(5 / EVAL_TICK_DT)
    for (let i = 0; i < ticks; i += 1) state = hook.step(state, player, {})
    expect((hook.publishSlices!(state) as { clock: { slot: number } }).clock.slot).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-schedules-relationships -t 'eval hook'`
Expected: FAIL — cannot resolve `../src/evalHook`.

- [ ] **Step 3: Implement `src/evalHook.ts`**

```ts
import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import {
  QUEST_LOG_SLICE_ID, SLOT_NAMES, type SchedulesRelationshipsPackConfig
} from './config'
import { createClock, stepClock, type ClockState } from './clockCore'
import { initialWalkerPositions, stepWalker, walkerTarget, type WalkerPosition } from './scheduleCore'
import {
  applyQuestCompleted, createAffinities, relationshipsComplete, type Affinities
} from './relationshipCore'

/** One harness tick == one fixed simulation step for the headless clock. */
export const EVAL_TICK_DT = 1 / 60

interface EvalState {
  clock: ClockState
  positions: Record<string, WalkerPosition>
  affinities: Affinities
  seenComplete: readonly string[]
}

const questLogView = (slices?: EvalSliceView): Record<string, string> =>
  (slices?.[QUEST_LOG_SLICE_ID] as Record<string, string> | undefined) ?? {}

/**
 * Headless twin. Events do not cross the eval seam — slices do: questCompleted
 * is derived by diffing the threaded questLog slice (a quest newly 'complete'
 * is exactly one runtime questCompleted emission; both twins share
 * relationshipCore, so the resulting state is identical). Completion never
 * depends on clock or walker progress — the matrix step budget cannot fit
 * slot cycles.
 */
export function createSchedulesRelationshipsEvalHook(config: SchedulesRelationshipsPackConfig): PackEvalHook {
  return {
    packId: 'schedules-relationships',
    createState: (): EvalState => ({
      clock: createClock(),
      positions: initialWalkerPositions(config.walkers, 0),
      affinities: createAffinities(config.relationships),
      seenComplete: []
    }),
    nextTarget: () => null,
    step(state, _player, slices) {
      const evalState = state as EvalState
      const clock = stepClock(evalState.clock, EVAL_TICK_DT, config.slotSeconds).state
      const positions = Object.fromEntries(config.walkers.map((walker) => [
        walker.id,
        stepWalker(evalState.positions[walker.id]!, walkerTarget(walker, clock.slot), walker.speed, EVAL_TICK_DT)
      ]))
      const log = questLogView(slices)
      let affinities = evalState.affinities
      const seen = new Set(evalState.seenComplete)
      for (const [questId, status] of Object.entries(log)) {
        if (status !== 'complete' || seen.has(questId)) continue
        seen.add(questId)
        affinities = applyQuestCompleted(affinities, questId, config.relationships)
      }
      return { clock, positions, affinities, seenComplete: [...seen] } satisfies EvalState
    },
    complete: (state) => relationshipsComplete((state as EvalState).affinities, config.relationships),
    publishSlices: (state) => {
      const evalState = state as EvalState
      return {
        clock: { slot: evalState.clock.slot, slotName: SLOT_NAMES[evalState.clock.slot]! },
        relationships: { affinities: { ...evalState.affinities } }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-schedules-relationships
git commit -m "feat(pack-schedules-relationships): headless eval hook driven by questLog slice diffs"
```

---

### Task 8: Seeded composeSection

**Files:**
- Create: `packages/pack-schedules-relationships/src/composeSection.ts`
- Test: `packages/pack-schedules-relationships/tests/composeSection.test.ts`
- Modify: `packages/pack-schedules-relationships/src/index.ts` (add `export * from './composeSection'`)

**Interfaces:**
- Consumes: `SeededRng` from `@automata/engine`; config + schema from Task 2.
- Produces:

```ts
export const SCHEDULE_DEFAULTS = { slotSeconds: 20, walkerSpeed: 2 } as const
export interface SchedulesComposeInput {
  specConfig: { slotSeconds?: number }
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> }
  dialogue: {
    npcs: ReadonlyArray<{ id: string; name: string; position: { x: number; z: number } }>
    quests: ReadonlyArray<{ id: string; kind: 'main' | 'side'; giverNpcId: string }>
  }
}
export function composeSchedulesSection(input: SchedulesComposeInput, rng: SeededRng): SchedulesRelationshipsPackConfig
```

Guarantees later tasks rely on: output parses under `packConfigSchema`; same input + seed ⇒ deep-equal output; walkers exist only for `ambient` cast members; tracked relationships are exactly the distinct main-quest givers (in first-appearance order) with their main-quest ids.

- [ ] **Step 1: Write the failing tests**

`packages/pack-schedules-relationships/tests/composeSection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { packConfigSchema } from '../src/config'
import { composeSchedulesSection, type SchedulesComposeInput } from '../src/composeSection'

const input = (): SchedulesComposeInput => ({
  specConfig: {},
  cast: [
    { id: 'c-player', name: 'You', role: 'player' },
    { id: 'c-keeper', name: 'The Keeper', role: 'quest-giver' },
    { id: 'c-stroller', name: 'Stroller', role: 'ambient' },
    { id: 'c-lounger', name: 'Lounger', role: 'ambient' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: { items: [{ id: 'item-1', position: { x: -2, z: 3 } }] },
  dialogue: {
    npcs: [{ id: 'npc-1', name: 'The Keeper', position: { x: 5, z: 5 } }],
    quests: [
      { id: 'q-main-1', kind: 'main', giverNpcId: 'npc-1' },
      { id: 'q-main-2', kind: 'main', giverNpcId: 'npc-1' },
      { id: 'q-side-1', kind: 'side', giverNpcId: 'npc-1' }
    ]
  }
})

describe('composeSchedulesSection', () => {
  it('is deterministic and schema-valid, with defaults applied here', () => {
    const a = composeSchedulesSection(input(), createSeededRng(7))
    const b = composeSchedulesSection(input(), createSeededRng(7))
    expect(a).toEqual(b)
    expect(() => packConfigSchema.parse(a)).not.toThrow()
    expect(a.slotSeconds).toBe(20)
  })

  it('creates one walker per ambient cast member with four keepout-clear stations', () => {
    const config = composeSchedulesSection(input(), createSeededRng(7))
    expect(config.walkers.map((walker) => walker.name)).toEqual(['Stroller', 'Lounger'])
    const keepouts = [
      input().arena.spawn, input().arena.goal,
      ...input().inventory.items.map((item) => item.position),
      ...input().dialogue.npcs.map((npc) => npc.position)
    ]
    for (const walker of config.walkers) {
      expect(walker.stations).toHaveLength(4)
      for (const station of walker.stations) {
        expect(Math.abs(station.x)).toBeLessThanOrEqual(11)
        expect(Math.abs(station.z)).toBeLessThanOrEqual(11)
        for (const point of keepouts) {
          expect(Math.hypot(station.x - point.x, station.z - point.z)).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('tracks exactly the distinct main-quest givers with their main quests (sides untracked)', () => {
    const config = composeSchedulesSection(input(), createSeededRng(7))
    expect(config.relationships.tracked).toEqual([
      { npcId: 'npc-1', name: 'The Keeper', questIds: ['q-main-1', 'q-main-2'] }
    ])
    expect(config.relationships.thresholds).toEqual({ acquaintance: 1, friend: 2 })
    expect(config.relationships.gains).toEqual({ questCompleted: 1 })
  })

  it('composes legally with zero ambient cast members', () => {
    const noAmbient = input()
    ;(noAmbient as { cast: unknown }).cast = input().cast.filter((member) => member.role !== 'ambient')
    const config = composeSchedulesSection(noAmbient, createSeededRng(7))
    expect(config.walkers).toEqual([])
    expect(() => packConfigSchema.parse(config)).not.toThrow()
  })

  it('throws a typed error when station placement exhausts the draw budget', () => {
    const cramped = input()
    ;(cramped as { arena: unknown }).arena = { half: 2, spawn: { x: 0, z: 0 }, goal: { x: 1, z: 1 } }
    expect(() => composeSchedulesSection(cramped, createSeededRng(7))).toThrow(/budget/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-schedules-relationships -t composeSchedulesSection`
Expected: FAIL — cannot resolve `../src/composeSection`.

- [ ] **Step 3: Implement `src/composeSection.ts`**

```ts
import type { SeededRng } from '@automata/engine'
import {
  SLOT_COUNT, packConfigSchema,
  type SchedulesRelationshipsPackConfig, type TrackedRelationship, type WalkerDef
} from './config'

export const SCHEDULE_DEFAULTS = { slotSeconds: 20, walkerSpeed: 2 } as const

export interface SchedulesComposeInput {
  specConfig: { slotSeconds?: number }
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> }
  dialogue: {
    npcs: ReadonlyArray<{ id: string; name: string; position: { x: number; z: number } }>
    quests: ReadonlyArray<{ id: string; kind: 'main' | 'side'; giverNpcId: string }>
  }
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const DRAW_BUDGET = 200

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Seeded walker stations + the tracked-giver table; defaults live here, not in GameSpec. */
export function composeSchedulesSection(input: SchedulesComposeInput, rng: SeededRng): SchedulesRelationshipsPackConfig {
  const slotSeconds = input.specConfig.slotSeconds ?? SCHEDULE_DEFAULTS.slotSeconds
  const ambient = input.cast.filter((member) => member.role === 'ambient')

  const extent = input.arena.half - WALL_MARGIN
  const hardKeepouts = [input.arena.spawn, input.arena.goal]
  const softKeepouts = [
    ...input.inventory.items.map((item) => item.position),
    ...input.dialogue.npcs.map((npc) => npc.position)
  ]
  const placedPerSlot: Array<Array<{ x: number; z: number }>> =
    Array.from({ length: SLOT_COUNT }, () => [])

  const walkers: WalkerDef[] = ambient.map((member, index) => {
    const stations: Array<{ x: number; z: number }> = []
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      let station: { x: number; z: number } | null = null
      for (let draw = 0; draw < DRAW_BUDGET && !station; draw += 1) {
        const candidate = {
          x: round2((rng.next() * 2 - 1) * extent),
          z: round2((rng.next() * 2 - 1) * extent)
        }
        if (!hardKeepouts.every((point) => far(candidate, point, KEEPOUT))) continue
        if (!softKeepouts.every((point) => far(candidate, point, SEPARATION))) continue
        if (!placedPerSlot[slot]!.every((other) => far(candidate, other, SEPARATION))) continue
        station = candidate
      }
      if (!station) {
        throw new Error(`Walker station placement budget exhausted: walker ${index + 1}, slot ${slot}`)
      }
      placedPerSlot[slot]!.push(station)
      stations.push(station)
    }
    return { id: `walker-${index + 1}`, name: member.name, speed: SCHEDULE_DEFAULTS.walkerSpeed, stations }
  })

  // Distinct main-quest givers in first-appearance order; sides are untracked by design.
  const tracked: TrackedRelationship[] = []
  for (const quest of input.dialogue.quests) {
    if (quest.kind !== 'main') continue
    const existing = tracked.find((entry) => entry.npcId === quest.giverNpcId)
    if (existing) {
      existing.questIds.push(quest.id)
      continue
    }
    const npc = input.dialogue.npcs.find((entry) => entry.id === quest.giverNpcId)
    if (!npc) throw new Error(`composeSchedulesSection: main quest "${quest.id}" giver "${quest.giverNpcId}" not in dialogue npcs`)
    tracked.push({ npcId: npc.id, name: npc.name, questIds: [quest.id] })
  }

  return packConfigSchema.parse({
    slotSeconds,
    walkers,
    relationships: {
      tracked,
      thresholds: { acquaintance: 1, friend: 2 },
      gains: { questCompleted: 1 }
    }
  })
}
```

Add to `src/index.ts`:

```ts
export * from './composeSection'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-schedules-relationships`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-schedules-relationships
git commit -m "feat(pack-schedules-relationships): seeded composeSection with per-slot keepout stations"
```

---

### Task 9: Editor contribution + registry tables

**Files:**
- Create: `packages/pack-schedules-relationships/src/editorContribution.ts`
- Modify: `packages/pack-schedules-relationships/src/index.ts` (add `export * from './editorContribution'`)
- Modify: `packages/pack-registry/src/index.ts` (all four tables)
- Test: `packages/pack-registry/tests/registry.test.ts` (extend in the file's existing style)

**Interfaces:**
- Consumes: everything the package exports; the registry's `STANDARD_PACKS` / `PACK_FIXTURES` / `EVAL_HOOK_BUILDERS` / `EDITOR_CONTRIBUTIONS` tables.
- Produces: `schedulesRelationshipsEditorContribution: PackEditorContribution` (`prefabs: []`, preview renders walkers at slot-0 stations); registry entries for the new pack. The matrix's `every standard pack has a deterministic fixture` test passes; pairs containing this pack are requires-unsatisfiable and skipped by existing harness logic.

- [ ] **Step 1: Implement `src/editorContribution.ts`** (thin, mirrors the dialogue pack's)

```ts
import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const WALKER_COLOR = '#3ddc84'
const WALKER_RADIUS = 0.35

/**
 * Thin editor preview for composed walkers at their slot-0 stations. The empty
 * prefab set is deliberate: walkers are composition-owned, not scene-authored.
 */
export const schedulesRelationshipsEditorContribution: PackEditorContribution = {
  packId: 'schedules-relationships',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities = parsed.walkers.map((walker) => ({ id: `preview-schedules-walker-${walker.id}` }))
    parsed.walkers.forEach((walker, index) => {
      const entity = entities[index]!
      const station = walker.stations[0]!
      render.add(entity, { primitive: 'sphere', radius: WALKER_RADIUS, color: WALKER_COLOR })
      render.setPose(entity, { x: station.x, y: WALKER_RADIUS, z: station.z }, IDENTITY)
    })
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
```

Add to `src/index.ts`:

```ts
export * from './editorContribution'
```

- [ ] **Step 2: Write the failing registry test**

Append to `packages/pack-registry/tests/registry.test.ts` (match its existing style — read the file first for import/describe conventions):

```ts
it('registers schedules-relationships with fixture, eval hook, and editor contribution', () => {
  expect(Object.keys(STANDARD_PACKS)).toContain('schedules-relationships')
  const fixture = PACK_FIXTURES['schedules-relationships']!()
  expect(fixture).toEqual(PACK_FIXTURES['schedules-relationships']!())   // deterministic
  const composition = {
    formatVersion: 1 as const,
    gameId: 'registry-test',
    source: null,
    packs: [{ id: 'schedules-relationships', version: '1.0.0', config: fixture as Record<string, unknown> }],
    assets: []
  }
  expect(resolveEvalHooks(composition)).toHaveLength(1)
  expect(resolveEditorContributions(composition)).toHaveLength(1)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project pack-registry -t 'schedules-relationships'`
Expected: FAIL — `STANDARD_PACKS` has no such key.

- [ ] **Step 4: Register the pack**

In `packages/pack-registry/src/index.ts` add the imports:

```ts
import {
  composeSchedulesSection, createSchedulesRelationshipsEvalHook,
  schedulesRelationshipsEditorContribution, schedulesRelationshipsPack,
  packConfigSchema as schedulesConfigSchema
} from '@automata/pack-schedules-relationships'
```

Add to `STANDARD_PACKS`:

```ts
  [schedulesRelationshipsPack.id]: schedulesRelationshipsPack as GamePack
```

Add the fixture AFTER the existing dialogue fixture assignment (it composes over the dialogue fixture's output — two ambient walkers guarantee the moving case is always matrix-exercised):

```ts
PACK_FIXTURES[schedulesRelationshipsPack.id] = () => {
  const dialogue = PACK_FIXTURES[dialogueQuestsPack.id]!() as {
    npcs: Array<{ id: string; name: string; position: { x: number; z: number } }>
    quests: Array<{ id: string; kind: 'main' | 'side'; giverNpcId: string }>
  }
  return composeSchedulesSection({
    specConfig: {},
    cast: [
      { id: 'c-stroller', name: 'Stroller', role: 'ambient' },
      { id: 'c-lounger', name: 'Lounger', role: 'ambient' }
    ],
    arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
    inventory: {
      items: (PACK_FIXTURES[interactionInventoryPack.id]!() as {
        items: Array<{ id: string; position: { x: number; z: number } }>
      }).items
    },
    dialogue: { npcs: dialogue.npcs, quests: dialogue.quests }
  }, createSeededRng(43))
}
```

Add to `EVAL_HOOK_BUILDERS`:

```ts
  [schedulesRelationshipsPack.id]: (config) => createSchedulesRelationshipsEvalHook(schedulesConfigSchema.parse(config))
```

Add to `EDITOR_CONTRIBUTIONS`:

```ts
  [schedulesRelationshipsEditorContribution.packId]: schedulesRelationshipsEditorContribution
```

Also add `"@automata/pack-schedules-relationships": "*"` to `packages/pack-registry/package.json` dependencies and run `npm install`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project pack-registry`
Expected: PASS — including the matrix's fixture-coverage test; pairs containing schedules are requires-unsatisfiable and skipped.

- [ ] **Step 6: Commit**

```bash
git add packages/pack-schedules-relationships packages/pack-registry package-lock.json
git commit -m "feat(pack-registry): register schedules-relationships pack + editor preview"
```

---

### Task 10: Scenario suite — the first 3-pack matrix row

**Files:**
- Modify: `packages/pack-registry/tests/compositionMatrix.test.ts`

**Interfaces:**
- Consumes: the existing `runSet` helper and registry tables (no harness policy changes).
- Produces: a table-driven `SCENARIOS` list of named pack-id sets run through the same compose/boot/complete machinery as pairs; first row is the triple. Later cycles add rows, not code.

- [ ] **Step 1: Write the failing test**

Append inside the existing describe block in `compositionMatrix.test.ts`:

```ts
/** Named 3+-pack scenario suites (umbrella §4): same machinery as pairs. */
const SCENARIOS: ReadonlyArray<readonly string[]> = [
  ['interaction-inventory', 'dialogue-quests', 'schedules-relationships']
]

it('every scenario composes, boots, and completes headlessly', () => {
  for (const scenario of SCENARIOS) {
    const set = scenario.map((id) => {
      const pack = STANDARD_PACKS[id]
      if (!pack) throw new Error(`Scenario references unknown pack "${id}"`)
      return pack
    })
    runSet(set)
  }
})
```

- [ ] **Step 2: Run the test — it should already pass if Tasks 1–9 are correct; verify it actually exercises the triple**

Run: `npx vitest run --project pack-registry -t scenario`
Expected: PASS. Then temporarily break it to prove it bites: in `packages/pack-schedules-relationships/src/relationshipCore.ts`, flip `>=` to `>` in `relationshipsComplete`, rerun, and confirm the scenario test FAILS (drive cannot complete). Revert the flip and rerun to green. This break-detect step is mandatory — a scenario that cannot fail is not a gate.

- [ ] **Step 3: Commit**

```bash
git add packages/pack-registry
git commit -m "test(pack-registry): 3-pack scenario suite (inventory+dialogue+schedules)"
```

---

### Task 11: composeGame wiring (ordered after dialogue) + first-light frozen proof

**Files:**
- Modify: `packages/game-compose/src/compose.ts`
- Modify: `packages/game-compose/package.json` (add `"@automata/pack-schedules-relationships": "*"`)
- Test: `packages/game-compose/tests/compose.test.ts`

**Interfaces:**
- Consumes: `composeSchedulesSection`, `schedulesRelationshipsPack` from the package; the existing compose flow.
- Produces: `composeGame` accepts specs selecting `schedules-relationships` (requires dialogue), composes its section AFTER dialogue with the threaded outputs, and appends its RNG draws last. Inventory-only and inventory+dialogue outputs are byte-identical to before this task.

- [ ] **Step 1: Write the failing tests**

In `packages/game-compose/tests/compose.test.ts`, first READ the file and locate the existing fixture-spec helpers (cycle 2 added dialogue-selecting spec fixtures — reuse their builder pattern). Add:

```ts
it('composes the schedules section after dialogue with tracked givers from the dialogue section', () => {
  const spec = specWithCapabilities(['interaction-inventory', 'dialogue-quests', 'schedules-relationships'])
  // Ensure the fixture spec's cast includes at least one member with role 'ambient'
  // (extend the builder if it does not already).
  const result = composeGame({ spec, seed: 11, specHash: 'hash-11' })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.composition.packs.map((pack) => pack.id))
    .toEqual(['interaction-inventory', 'dialogue-quests', 'schedules-relationships'])
  const schedules = result.composition.packs[2]!.config as {
    walkers: unknown[]
    relationships: { tracked: Array<{ npcId: string }> }
  }
  const dialogue = result.composition.packs[1]!.config as {
    npcs: Array<{ id: string }>
    quests: Array<{ id: string; kind: string; giverNpcId: string }>
  }
  const giverIds = new Set(dialogue.quests.filter((quest) => quest.kind === 'main').map((quest) => quest.giverNpcId))
  expect(schedules.relationships.tracked.map((entry) => entry.npcId).sort()).toEqual([...giverIds].sort())
})

it('rejects schedules-relationships without dialogue-quests via pack-set validation', () => {
  const spec = specWithCapabilities(['interaction-inventory', 'schedules-relationships'])
  const result = composeGame({ spec, seed: 11, specHash: 'hash-11' })
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.issues.some((issue) => issue.code === 'pack-missing-requirement')).toBe(true)
})

it('keeps inventory+dialogue output bit-identical when schedules is not selected (frozen rule)', () => {
  const spec = specWithCapabilities(['interaction-inventory', 'dialogue-quests'])
  const before = composeGame({ spec, seed: 11, specHash: 'hash-11' })
  // Golden capture: serialize and compare against the pre-task output committed
  // as a fixture — record JSON.stringify(before) into tests/fixtures/ BEFORE
  // making any compose.ts change (see Step 2), then assert equality here.
  expect(before.ok).toBe(true)
})
```

- [ ] **Step 2: Capture the frozen baseline BEFORE touching compose.ts**

On the pre-change tree, run a one-off script to write the golden:

```bash
node --experimental-strip-types -e "
import { composeGame } from './packages/game-compose/src/compose.ts'
// import the same specWithCapabilities fixture builder the tests use
" # If import gymnastics fight back, add a temporary test that writes
  # JSON.stringify(result) to packages/game-compose/tests/fixtures/frozen-inv-dlg.json
  # and delete the temp test after capture.
```

Simplest reliable route: add the capture as a normal vitest test that writes the fixture file when it does not exist and asserts equality when it does (a self-priming golden). Commit the fixture in this task.

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run --project game-compose`
Expected: the schedules-composition test FAILS (`compose-unsupported-capability`); the frozen test passes (baseline just captured).

- [ ] **Step 4: Implement the wiring in `compose.ts`**

- Add the import: `import { composeSchedulesSection, schedulesRelationshipsPack } from '@automata/pack-schedules-relationships'`.
- Add `schedulesRelationshipsPack.id` to the `supported` set and to the `selectedPacks` flatMap (return `[schedulesRelationshipsPack]` for its id) so `validatePackSet` sees it.
- After the `if (wantsDialogue) { … }` block, extend it: capture `dialogueConfig` in a variable scoped outside the block, then:

```ts
  const wantsSchedules = spec.capabilities.some((entry) => entry.id === schedulesRelationshipsPack.id)
  if (wantsSchedules) {
    const schedulesSelection = spec.capabilities.find((entry) => entry.id === schedulesRelationshipsPack.id)!
    const schedulesConfig = composeSchedulesSection({
      specConfig: schedulesSelection.config as { slotSeconds?: number },
      cast: spec.cast,
      arena: { half: ARENA.half, spawn: ARENA.spawn, goal },
      inventory: { items: packConfig.items },
      dialogue: {
        npcs: dialogueConfig!.npcs,
        quests: dialogueConfig!.quests.map((quest) => ({ id: quest.id, kind: quest.kind, giverNpcId: quest.giverNpcId }))
      }
    }, rng)
    packs.push({
      id: schedulesRelationshipsPack.id,
      version: schedulesRelationshipsPack.version,
      config: schedulesConfig as unknown as Record<string, unknown>
    })
  }
```

(`dialogueConfig!` is safe: `validatePackSet` already rejected schedules-without-dialogue. The RNG draw-order comment at the top of `composeGame` must be updated to `goal → icon hues → item placements → NPC placements → walker stations`.)

- Update the cycle-2 error message string `'Phase 4 cycle 2 composes only […]'` to `'Phase 4 cycle 3 composes only […]'` (the supported list now includes schedules).

- [ ] **Step 5: Run tests to verify everything passes, including the frozen golden**

Run: `npx vitest run --project game-compose`
Expected: PASS — new tests green AND the frozen inventory+dialogue golden unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/game-compose package-lock.json
git commit -m "feat(game-compose): compose schedules section after dialogue (frozen baselines intact)"
```

---

### Task 12: Cycle gates + docs close

**Files:**
- Modify: `docs/ROADMAP.md` (Phase 4 cycle 3 → `Shipped`, promote cycle 4 to `Next`)
- Modify: `docs/superpowers/plans/active/2026-07/week-29/2026-07-17-phase-4-cycle-3-schedules-relationships.md` (progress header)

- [ ] **Step 1: Run the full gate set**

```bash
npm run ci
npm run verify:new-game
npx vitest run --project pack-registry
```

Expected: all green. If `npm run ci` runs eslint, confirm no direct `zod` imports slipped into the new package.

- [ ] **Step 2: first-light recompose proof**

Regenerate first-light's composition through the repo's established recompose flow (see `games/first-light/scripts/` — cycle 2 used the same proof) and run `git status --porcelain games/first-light`.
Expected: empty output — bit-identical.

- [ ] **Step 3: Update docs**

- `docs/ROADMAP.md` Phase 4 cycles: cycle 3 → `Shipped` (date + plan link), cycle 4 (combat & enemy AI) → `Next`.
- This plan's `**Implementation progress:**` line → 100%.
- `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` §sub-cycle index: mark `Schedules & relationships pack — completed`.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: Phase 4 cycle 3 shipped - schedules & relationships pack"
```
