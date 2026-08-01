# Phase 4 Cycle 6 — Hub Navigation + Vehicle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@automata/pack-hub-navigation-vehicle` — instanced locations reachable through doorways plus one load-bearing vehicle — along with the world-effect seam in `@automata/game-kit` that lets any pack move the player, scale their speed, and set their bounds.

**Architecture:** `PackWorldState` keeps `playerPosition` inbound and gains a **write-only** `effects` sink. `composePacks` builds a fresh sink each tick, hands each pack its own attributed view, resolves all writes under documented rules, and returns a `ResolvedWorldEffects` the game applies on the next fixed step. The new pack owns two slices (`location`, `vehicle`), consumes `spec.world.locations`, places interiors in far-offset coordinate spaces reached by doorways, and gates exactly one interior behind mounting the vehicle.

**Tech Stack:** TypeScript, npm workspaces, vitest (jsdom), zod v4 via `@automata/project`, three.js behind `@automata/engine` ports.

**Spec:** [`2026-07-31-phase-4-cycle-6-hub-navigation-vehicle-design.md`](../../../../specs/active/2026-07/week-31/2026-07-31-phase-4-cycle-6-hub-navigation-vehicle-design.md)
**Umbrella:** [`2026-07-14-phase-4-capability-packs-design.md`](../../../../specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md)

## Global Constraints

- **Never `import { z } from 'zod'`.** Import `z` from `@automata/project`, which re-exports zod v4. Lint enforces this.
- **Roots and nested objects are `z.strictObject({...})`.** Exclusive bounds (`.gt`/`.lt`/`.positive`/`.negative`) are rejected — use `.min()`/`.max()`.
- **No pack→pack imports.** Cross-pack slice IDs and event names are deliberate string copies, exactly as `pack-economy-progression/src/config.ts` does it.
- **Vitest project filters use the directory name, not the package name:** `npx vitest run --project pack-economy-progression` works; `--project @automata/pack-economy-progression` fails with "No projects matched the filter". Every command below follows this.
- **No git worktrees** (AGENTS.md ground rule).
- **Run `npm run ci` before claiming the cycle is ready**, and `npm run coverage` because this touches engine-adjacent `game-kit` code.
- **Mark each step off in this document as it completes**, and make each documented commit.
- **Interiors sit at least 50 world units from the district.** This invariant is what keeps the five shipped packs' radius checks from firing while the player is indoors; several tasks depend on it.
- **`composeHubSection` runs last in `composeGame`** so no existing game's seeded RNG stream shifts.

---

### Task 1: World-effect seam in `@automata/game-kit`

The core contract change. Split `WorldSnapshot` (what the *game* passes) from `PackWorldState` (what *packs* receive), so `games/first-light/src/main.ts:61` and the scaffold template keep compiling untouched.

**Files:**
- Create: `packages/game-kit/src/worldEffects.ts`
- Modify: `packages/game-kit/src/packs.ts` (lines 44-46 `PackWorldState`, 123-131 `ComposedRuntime`, 154-158 the boot loop)
- Modify: `packages/game-kit/src/index.ts` (add the export line)
- Modify: `packages/game-kit/src/testing.ts` (add the `worldState` helper)
- Test: `packages/game-kit/tests/worldEffects.test.ts` (create)
- Test: `packages/game-kit/tests/packs.test.ts` (extend)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WorldBounds`, `PackWorldEffects`, `ResolvedWorldEffects`, `WorldEffectIssue`, `createWorldEffectsSink`, `LOCATION_SLICE_ID`, and the test helper `worldState(position?)`. Tasks 2, 3, 9, 10 and 14 all depend on these exact names.

- [ ] **Step 1: Write the failing test for the effects sink**

Create `packages/game-kit/tests/worldEffects.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createWorldEffectsSink } from '../src/worldEffects'

describe('world effects sink', () => {
  it('resolves to inert defaults when no pack writes', () => {
    const sink = createWorldEffectsSink(new Set())
    expect(sink.resolve()).toEqual({
      teleport: null,
      speedMultiplier: 1,
      bounds: null,
      issues: []
    })
  })

  it('lets the first pack in composition order win a contended teleport', () => {
    const sink = createWorldEffectsSink(new Set())
    sink.forPack('pack-a').teleport({ x: 1, z: 2 })
    sink.forPack('pack-b').teleport({ x: 9, z: 9 })
    const resolved = sink.resolve()
    expect(resolved.teleport).toEqual({ x: 1, z: 2 })
    expect(resolved.issues).toEqual([{
      code: 'pack-world-effect-contention',
      packId: 'pack-b',
      message: 'Pack "pack-b" teleported the player after "pack-a" already did this tick'
    }])
  })

  it('composes speed multipliers as a product, clamped to [0.25, 8]', () => {
    const sink = createWorldEffectsSink(new Set())
    sink.forPack('pack-a').scaleSpeed(2.5)
    sink.forPack('pack-b').scaleSpeed(2)
    expect(sink.resolve().speedMultiplier).toBe(5)

    const clamped = createWorldEffectsSink(new Set())
    clamped.forPack('pack-a').scaleSpeed(100)
    expect(clamped.resolve().speedMultiplier).toBe(8)

    const floored = createWorldEffectsSink(new Set())
    floored.forPack('pack-a').scaleSpeed(0.01)
    expect(floored.resolve().speedMultiplier).toBe(0.25)
  })

  it('accepts bounds only from a declared location-slice owner', () => {
    const sink = createWorldEffectsSink(new Set(['hub']))
    sink.forPack('hub').setBounds({ minX: -1, maxX: 1, minZ: -2, maxZ: 2 })
    expect(sink.resolve().bounds).toEqual({ minX: -1, maxX: 1, minZ: -2, maxZ: 2 })

    const rejected = createWorldEffectsSink(new Set(['hub']))
    rejected.forPack('economy-progression').setBounds({ minX: -1, maxX: 1, minZ: -2, maxZ: 2 })
    const resolved = rejected.resolve()
    expect(resolved.bounds).toBeNull()
    expect(resolved.issues).toEqual([{
      code: 'pack-world-effect-unowned-bounds',
      packId: 'economy-progression',
      message: 'Pack "economy-progression" set world bounds without owning the "location" slice'
    }])
  })

  it('lets the last owner win contended bounds without an issue', () => {
    const sink = createWorldEffectsSink(new Set(['hub']))
    sink.forPack('hub').setBounds({ minX: -1, maxX: 1, minZ: -1, maxZ: 1 })
    sink.forPack('hub').setBounds({ minX: -5, maxX: 5, minZ: -5, maxZ: 5 })
    const resolved = sink.resolve()
    expect(resolved.bounds).toEqual({ minX: -5, maxX: 5, minZ: -5, maxZ: 5 })
    expect(resolved.issues).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project game-kit worldEffects`
Expected: FAIL — cannot resolve `../src/worldEffects`.

- [ ] **Step 3: Implement the sink**

Create `packages/game-kit/src/worldEffects.ts`:

```ts
/**
 * The world-effect seam (Phase 4 cycle 6). `PackWorldState.playerPosition`
 * flows inward and stays read-only; this sink is the write-only outward
 * channel. A pack cannot read back what it wrote, so there is no intra-tick
 * ordering ambiguity and no temptation to use the sink as state.
 */
export interface WorldBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface PackWorldEffects {
  teleport(to: { x: number; z: number }): void
  scaleSpeed(multiplier: number): void
  setBounds(bounds: WorldBounds): void
}

export interface WorldEffectIssue {
  code: 'pack-world-effect-contention' | 'pack-world-effect-unowned-bounds'
  packId: string
  message: string
}

export interface ResolvedWorldEffects {
  teleport: { x: number; z: number } | null
  speedMultiplier: number
  bounds: WorldBounds | null
  issues: readonly WorldEffectIssue[]
}

/** Only the pack owning this slice may set world bounds. */
export const LOCATION_SLICE_ID = 'location'

const SPEED_MIN = 0.25
const SPEED_MAX = 8

export interface WorldEffectsSink {
  /** A view attributed to one pack; composePacks hands each pack its own. */
  forPack(packId: string): PackWorldEffects
  resolve(): ResolvedWorldEffects
}

/**
 * `boundsOwners` is the set of pack ids declaring ownership of the `location`
 * slice. Keeping the check here means "who owns world topology" is answerable
 * from the compatibility declaration alone.
 */
export function createWorldEffectsSink(boundsOwners: ReadonlySet<string>): WorldEffectsSink {
  let teleport: { x: number; z: number } | null = null
  let teleportOwner: string | null = null
  let speedMultiplier = 1
  let bounds: WorldBounds | null = null
  const issues: WorldEffectIssue[] = []

  return {
    forPack(packId) {
      return {
        teleport(to) {
          if (teleportOwner !== null) {
            issues.push({
              code: 'pack-world-effect-contention',
              packId,
              message: `Pack "${packId}" teleported the player after "${teleportOwner}" already did this tick`
            })
            return
          }
          teleportOwner = packId
          teleport = { x: to.x, z: to.z }
        },
        scaleSpeed(multiplier) {
          speedMultiplier *= multiplier
        },
        setBounds(next) {
          if (!boundsOwners.has(packId)) {
            issues.push({
              code: 'pack-world-effect-unowned-bounds',
              packId,
              message: `Pack "${packId}" set world bounds without owning the "${LOCATION_SLICE_ID}" slice`
            })
            return
          }
          bounds = { ...next }
        }
      }
    },
    resolve: () => ({
      teleport,
      speedMultiplier: Math.min(SPEED_MAX, Math.max(SPEED_MIN, speedMultiplier)),
      bounds,
      issues
    })
  }
}
```

- [ ] **Step 4: Run the sink tests and confirm they pass**

Run: `npx vitest run --project game-kit worldEffects`
Expected: PASS (5 tests).

- [ ] **Step 5: Split the world types and wire the sink into `composePacks`**

In `packages/game-kit/src/packs.ts`, add the import at the top (after the existing `packState` import on line 4):

```ts
import {
  createWorldEffectsSink, LOCATION_SLICE_ID,
  type PackWorldEffects, type ResolvedWorldEffects
} from './worldEffects'
```

Replace the `PackWorldState` interface (lines 44-46) with:

```ts
/** What the game hands the composed runtime each fixed step. */
export interface WorldSnapshot {
  playerPosition: { x: number; z: number }
}

/** What each pack receives: the snapshot plus its own write-only effects view. */
export interface PackWorldState extends WorldSnapshot {
  effects: PackWorldEffects
}
```

In `ComposedRuntime` (lines 123-131), change the `fixedUpdate` signature:

```ts
  fixedUpdate(dt: number, world: WorldSnapshot): ResolvedWorldEffects
```

In `composePacks`, compute the bounds owners once, just after `const packIds = packs.map(...)` (line 141):

```ts
  const boundsOwners = new Set(
    packs
      .filter((pack) => pack.compatibility.stateSlices.owns.includes(LOCATION_SLICE_ID))
      .map((pack) => pack.id)
  )
```

Replace the returned `fixedUpdate` (line 156) with:

```ts
        fixedUpdate(dt, world) {
          const sink = createWorldEffectsSink(boundsOwners)
          for (const { id, handle } of handles) {
            handle.fixedUpdate?.(dt, { playerPosition: world.playerPosition, effects: sink.forPack(id) })
          }
          return sink.resolve()
        },
```

Add the export to `packages/game-kit/src/index.ts` after line 10 (`export * from './packs'`):

```ts
export * from './worldEffects'
```

- [ ] **Step 6: Add the `worldState` test helper**

Append to `packages/game-kit/src/testing.ts`:

```ts
import { createWorldEffectsSink } from './worldEffects'
import type { PackWorldState } from './packs'

/**
 * A throwaway PackWorldState for pack tests. The sink is inert unless the test
 * inspects it, so existing tests only need the position they already pass.
 */
export function worldState(position: { x: number; z: number } = { x: 0, z: 0 }): PackWorldState {
  return { playerPosition: position, effects: createWorldEffectsSink(new Set()).forPack('test') }
}
```

Fold the two new `import` statements into the file's existing import block rather than appending them at the bottom.

- [ ] **Step 7: Extend the composePacks tests**

Append to `packages/game-kit/tests/packs.test.ts`:

```ts
describe('composed runtime world effects', () => {
  const boundsPack = (id: string, owns: string[]): GamePack => ({
    id,
    version: '1.0.0',
    compatibility: packCompatibility({ stateSlices: { owns, reads: [] } }),
    register: () => ({
      fixedUpdate(_dt, world) {
        world.effects.scaleSpeed(2)
        world.effects.setBounds({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 })
      }
    })
  })

  it('returns inert effects when no pack writes any', () => {
    const silent: GamePack = {
      id: 'silent',
      version: '1.0.0',
      compatibility: packCompatibility(),
      register: () => ({ fixedUpdate() {} })
    }
    const app = document.createElement('div')
    document.body.append(app)
    const host = createGameHost(app)
    const render = createNullRenderer()
    try {
      const runtime = composePacks([silent], {}).boot({ host, render: render.port })
      expect(runtime.fixedUpdate(1 / 60, { playerPosition: { x: 0, z: 0 } })).toEqual({
        teleport: null, speedMultiplier: 1, bounds: null, issues: []
      })
    } finally {
      host.dispose()
      app.remove()
    }
  })

  it('accepts bounds from a location-slice owner and rejects them otherwise', () => {
    const app = document.createElement('div')
    document.body.append(app)
    const host = createGameHost(app)
    const render = createNullRenderer()
    try {
      const owner = composePacks([boundsPack('hub', ['location'])], {}).boot({ host, render: render.port })
      const ownerResult = owner.fixedUpdate(1 / 60, { playerPosition: { x: 0, z: 0 } })
      expect(ownerResult.bounds).toEqual({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 })
      expect(ownerResult.issues).toEqual([])

      const stranger = composePacks([boundsPack('other', [])], {}).boot({ host, render: render.port })
      const strangerResult = stranger.fixedUpdate(1 / 60, { playerPosition: { x: 0, z: 0 } })
      expect(strangerResult.bounds).toBeNull()
      expect(strangerResult.issues.map((issue) => issue.code)).toEqual(['pack-world-effect-unowned-bounds'])
    } finally {
      host.dispose()
      app.remove()
    }
  })
})
```

Fold `packCompatibility`, `composePacks`, `createGameHost`, `createNullRenderer`, and the `GamePack` type into the file's existing imports — most are already there. Delete the first test above if `packs.test.ts` already covers the inert case; the second is the one that must exist.

- [ ] **Step 8: Fix every direct `handle.fixedUpdate` call site in pack tests**

These files construct a `PackWorldState` literal and now need `effects`:

- `packages/pack-dialogue-quests/tests/pack.test.ts`
- `packages/pack-economy-progression/tests/pack.test.ts`
- `packages/pack-combat-ai/tests/pack.test.ts`
- `packages/pack-schedules-relationships/tests/pack.test.ts`
- `packages/pack-interaction-inventory/tests/pack.test.ts`
- `packages/pack-registry/tests/economyParity.test.ts`

In each, import `worldState` from `@automata/game-kit` and replace literals of the form `{ playerPosition: { x: 1, z: 2 } }` with `worldState({ x: 1, z: 2 })`. Do **not** change `games/first-light/src/main.ts` or the scaffold template — they pass a `WorldSnapshot`, which is still exactly `{ playerPosition }`.

- [ ] **Step 9: Run the full game-kit and pack suites**

Run: `npx vitest run --project game-kit --project pack-interaction-inventory --project pack-dialogue-quests --project pack-schedules-relationships --project pack-combat-ai --project pack-economy-progression --project pack-registry`
Expected: PASS, no type errors.

Run: `npm run typecheck -w @automata/game-kit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/game-kit packages/pack-*/tests packages/pack-registry/tests
git commit -m "feat(game-kit): write-only world-effect seam for packs"
```

---

### Task 2: Mirror the seam in the eval harness

Without this, doorways and the vehicle are invisible to headless evaluation — the matrix driver owns the player outright.

**Files:**
- Modify: `packages/game-kit/src/packEval.ts` (the `PackEvalHook.step` signature)
- Modify: `packages/pack-registry/tests/compositionMatrix.test.ts` (`driveToCompletion`, lines 50-90)
- Test: `packages/game-kit/tests/evalWorldEffects.test.ts` (create)

**Interfaces:**
- Consumes: `PackWorldEffects`, `createWorldEffectsSink`, `ResolvedWorldEffects` from Task 1.
- Produces: `PackEvalHook.step(state, player, slices?, emit?, effects?)` — a fifth optional parameter, so the five existing hooks compile untouched. Task 10's hook uses it.

- [ ] **Step 1: Write the failing test**

Create `packages/game-kit/tests/evalWorldEffects.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createWorldEffectsSink } from '../src/worldEffects'
import type { PackEvalHook } from '../src/packEval'

/** A hook that teleports itself somewhere on its third step. */
const jumper: PackEvalHook = {
  packId: 'jumper',
  createState: () => ({ steps: 0 }),
  nextTarget: (state) => ((state as { steps: number }).steps >= 3 ? null : { x: 0, z: 0 }),
  step(state, _player, _slices, _emit, effects) {
    const steps = (state as { steps: number }).steps + 1
    if (steps === 3) effects?.teleport({ x: 50, z: 50 })
    return { steps }
  },
  complete: (state) => (state as { steps: number }).steps >= 3
}

describe('eval hooks can write world effects', () => {
  it('surfaces a hook teleport through the shared sink', () => {
    let state = jumper.createState()
    const player = { x: 0, z: 0 }
    for (let step = 0; step < 3; step += 1) {
      const sink = createWorldEffectsSink(new Set(['jumper']))
      state = jumper.step(state, player, {}, undefined, sink.forPack('jumper'))
      const resolved = sink.resolve()
      if (resolved.teleport) {
        player.x = resolved.teleport.x
        player.z = resolved.teleport.z
      }
    }
    expect(player).toEqual({ x: 50, z: 50 })
    expect(jumper.complete(state)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project game-kit evalWorldEffects`
Expected: FAIL — `step` takes four parameters; the fifth argument is a type error.

- [ ] **Step 3: Widen the hook signature**

In `packages/game-kit/src/packEval.ts`, add the import and replace the `step` member of `PackEvalHook`:

```ts
import type { PackWorldEffects } from './worldEffects'
```

```ts
  /**
   * `emit` fans out synchronously to connected hooks, mirroring the runtime bus.
   * `effects` is the headless twin of the runtime's world-effect sink: hooks
   * that teleport the player or scale their speed do it here.
   */
  step(
    state: unknown,
    player: { x: number; z: number },
    slices?: EvalSliceView,
    emit?: (name: string, payload: unknown) => void,
    effects?: PackWorldEffects
  ): unknown
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --project game-kit evalWorldEffects`
Expected: PASS.

- [ ] **Step 5: Teach the matrix driver to honour effects**

In `packages/pack-registry/tests/compositionMatrix.test.ts`, add `createWorldEffectsSink` to the `@automata/game-kit` import, then replace the body of `driveToCompletion`'s main loop (currently lines 64-84) with:

```ts
  const player = { x: -8, z: -8 }
  const boundsOwners = new Set(
    hooks.flatMap((hook) => (hook.packId === 'hub-navigation-vehicle' ? [hook.packId] : []))
  )
  for (let step = 0; step < maxSteps; step += 1) {
    const slices: Record<string, unknown> = {}
    for (const hook of hooks) Object.assign(slices, hook.publishSlices?.(states.get(hook.packId)) ?? {})
    const incomplete = hooks.filter((hook) => !hook.complete(states.get(hook.packId)))
    if (incomplete.length === 0) return { complete: true, states }

    const sink = createWorldEffectsSink(boundsOwners)
    // Speed is resolved from the previous tick's writes, mirroring the browser
    // loop where the game steps before the composed runtime.
    const stride = 0.5 * speedMultiplier
    for (const hook of incomplete) {
      const target = hook.nextTarget(states.get(hook.packId), player, slices)
      if (!target) continue
      const dx = target.x - player.x
      const dz = target.z - player.z
      const dist = Math.hypot(dx, dz)
      const move = Math.min(stride, dist)
      if (dist > 0) { player.x += (dx / dist) * move; player.z += (dz / dist) * move }
      break
    }
    for (const hook of hooks) {
      states.set(
        hook.packId,
        hook.step(states.get(hook.packId), player, slices, emit, sink.forPack(hook.packId))
      )
    }
    const resolved = sink.resolve()
    expect(resolved.issues, `world-effect issues at step ${step}`).toEqual([])
    if (resolved.teleport) { player.x = resolved.teleport.x; player.z = resolved.teleport.z }
    speedMultiplier = resolved.speedMultiplier
  }
```

Declare `let speedMultiplier = 1` immediately above `const player = { x: -8, z: -8 }`. Note the existing `stride` clamp against remaining distance stays — it moved into `const move = Math.min(stride, dist)`.

- [ ] **Step 6: Confirm the existing matrix still passes**

Run: `npx vitest run --project pack-registry`
Expected: PASS — the five existing packs write no effects, so `speedMultiplier` stays 1 and `teleport` stays null; behaviour is identical to before.

- [ ] **Step 7: Commit**

```bash
git add packages/game-kit packages/pack-registry
git commit -m "feat(game-kit): world-effect sink in the headless eval harness"
```

---

### Task 3: Retrofit combat-ai respawn onto the seam

Proof the seam is general rather than hub-shaped, and it closes the umbrella's *Cycle 4 — pack-initiated player teleport* gap.

**Files:**
- Modify: `packages/pack-combat-ai/src/healthCore.ts:10-25` (the doc comment and the second-wind branch)
- Modify: `packages/pack-combat-ai/src/pack.ts:72` (the `fixedUpdate` body)
- Modify: `packages/pack-combat-ai/src/composeSection.ts:5` (add `spawn` to the compiled player config) and `packages/pack-combat-ai/src/config.ts:29` area
- Test: `packages/pack-combat-ai/tests/pack.test.ts`, `packages/pack-combat-ai/tests/healthCore.test.ts`

**Interfaces:**
- Consumes: `PackWorldState.effects` (Task 1), `worldState` test helper (Task 1).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `packages/pack-combat-ai/tests/pack.test.ts`:

```ts
it('teleports the player to spawn when the second wind triggers', () => {
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  try {
    const parsed = packConfigSchema.parse(config())
    const handle = combatAiPack.register(
      { host, render: render.port, events: createPackEventBus(), state: createPackStateRegistry() },
      parsed
    )!
    const sink = createWorldEffectsSink(new Set())
    const effects = sink.forPack(combatAiPack.id)
    // Stand on an enemy post until HP drains through the second wind.
    const post = parsed.enemies[0]!.post
    for (let tick = 0; tick < 1200; tick += 1) {
      handle.fixedUpdate!(1 / 60, { playerPosition: { x: post.x, z: post.z }, effects })
      if (sink.resolve().teleport) break
    }
    expect(sink.resolve().teleport).toEqual({ x: parsed.player.spawn.x, z: parsed.player.spawn.z })
  } finally {
    host.dispose()
    app.remove()
  }
})
```

Fold `createWorldEffectsSink` into the file's `@automata/game-kit` import. The helper is `const config = (): CombatPackConfig => ({ ... })` at `packages/pack-combat-ai/tests/pack.test.ts:10`. **It returns an object literal, not a `composeCombatSection` result**, so Step 3's new required `player.spawn` field breaks it until you add `spawn: { x: -8, z: -8 }` to its `player` block — do that in Step 3, not here, or this test fails on a schema error rather than the missing teleport.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project pack-combat-ai pack`
Expected: FAIL — `config.player.spawn` does not exist, and no teleport is ever recorded.

- [ ] **Step 3: Add `spawn` to the compiled player config**

In `packages/pack-combat-ai/src/config.ts`, inside the player object schema alongside `secondWindSeconds` (line 29):

```ts
  spawn: z.strictObject({ x: z.number(), z: z.number() })
```

In `packages/pack-combat-ai/src/composeSection.ts:5`, add `spawn` to the defaults object and populate it from the compose input's `arena.spawn`:

```ts
  player: {
    maxHealth: 5, attackDamage: 1, attackRadius: 1.5,
    attackCooldownSeconds: 0.5, secondWindSeconds: 2,
    spawn: { x: 0, z: 0 }
  },
```

…then, where the function builds the emitted player config, set `spawn: { x: input.arena.spawn.x, z: input.arena.spawn.z }`. Follow the file's existing rounding idiom if it rounds positions.

Also add `spawn: { x: -8, z: -8 }` to the `player` literal in `packages/pack-combat-ai/tests/pack.test.ts:10` (`const config = (): CombatPackConfig => ({ ... })`). That helper hand-writes its config rather than calling `composeCombatSection`, so it does not pick the new field up automatically and every test in the file fails schema validation until it does.

- [ ] **Step 4: Make the second wind a real respawn**

Replace the doc comment and branch in `packages/pack-combat-ai/src/healthCore.ts:10-25`:

```ts
/**
 * Damage while invulnerable is ignored. Damage that would reach zero triggers
 * a respawn: full HP, an invulnerability window, and — since Phase 4 cycle 6
 * gave packs a world-effect seam — an actual teleport back to spawn, requested
 * by the caller when `defeated` is true.
 */
```

The pure core keeps its current return shape; the teleport is the caller's job. In `packages/pack-combat-ai/src/pack.ts`, inside `fixedUpdate` where `applyPlayerDamage` reports `defeated`, add:

```ts
        if (damage.defeated) {
          world.effects.teleport({ x: config.player.spawn.x, z: config.player.spawn.z })
        }
```

Place it immediately after the existing state assignment for the defeated branch, so the pack's own bookkeeping is unchanged.

- [ ] **Step 5: Run the combat suite**

Run: `npx vitest run --project pack-combat-ai`
Expected: PASS. Update any fixture in `packages/pack-combat-ai/tests/` that constructs a player config literal to include `spawn`.

- [ ] **Step 6: Run the registry matrix, which composes combat**

Run: `npx vitest run --project pack-registry`
Expected: PASS. `PACK_FIXTURES[combatAiPack.id]` builds through `composeCombatSection`, so it picks up `spawn` automatically.

- [ ] **Step 7: Commit**

```bash
git add packages/pack-combat-ai packages/pack-registry
git commit -m "feat(pack-combat-ai): respawn at spawn via the world-effect seam"
```

---

### Task 4: Capability config schema in `@automata/contracts`

**Files:**
- Modify: `packages/contracts/src/gameSpec.ts:100`
- Test: `packages/contracts/tests/gameSpec.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `hub-navigation-vehicle` capability config shape `{ vehicleSpeedMultiplier?: number; doorwayRadius?: number }`, read by Tasks 8 and 13.

- [ ] **Step 1: Write the failing test**

Append to `packages/contracts/tests/gameSpec.test.ts`:

```ts
describe('hub-navigation-vehicle capability config', () => {
  const schema = capabilityConfigSchemas['hub-navigation-vehicle']

  it('accepts an empty config', () => {
    expect(schema.parse({})).toEqual({})
  })

  it('accepts in-range tuning', () => {
    expect(schema.parse({ vehicleSpeedMultiplier: 2.5, doorwayRadius: 1.5 }))
      .toEqual({ vehicleSpeedMultiplier: 2.5, doorwayRadius: 1.5 })
  })

  it('rejects an out-of-range multiplier', () => {
    expect(() => schema.parse({ vehicleSpeedMultiplier: 1.2 })).toThrow()
    expect(() => schema.parse({ vehicleSpeedMultiplier: 5 })).toThrow()
  })

  it('rejects unknown keys', () => {
    expect(() => schema.parse({ interiorCount: 3 })).toThrow()
  })
})
```

Fold `capabilityConfigSchemas` into the file's existing `@automata/contracts` (or relative `../src/gameSpec`) import, matching whichever the file already uses.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project contracts gameSpec`
Expected: FAIL — the empty stub rejects both tuning keys.

- [ ] **Step 3: Replace the stub**

In `packages/contracts/src/gameSpec.ts`, replace line 100:

```ts
  'hub-navigation-vehicle': z.strictObject({
    vehicleSpeedMultiplier: z.number().min(1.5).max(4).optional(),
    doorwayRadius: z.number().min(0.5).max(5).optional()
  }),
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project contracts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): hub-navigation-vehicle capability config"
```

---

### Task 5: Package scaffold + `locationCore`

**Files:**
- Create: `packages/pack-hub-navigation-vehicle/package.json`
- Create: `packages/pack-hub-navigation-vehicle/tsconfig.json` (copy `packages/pack-economy-progression/tsconfig.json` verbatim)
- Create: `packages/pack-hub-navigation-vehicle/vitest.config.ts` (copy `packages/pack-economy-progression/vitest.config.ts` verbatim — both files exist in that package and are required; the root config does not cover packages on its own)
- Create: `packages/pack-hub-navigation-vehicle/src/locationCore.ts`
- Create: `packages/pack-hub-navigation-vehicle/src/index.ts`
- Test: `packages/pack-hub-navigation-vehicle/tests/locationCore.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `WorldBounds` re-use from game-kit, plus `LocationDef`, `DoorwayDef`, `LocationState`, `createLocationState`, `enterLocation`, `doorwayInReach`, `tourComplete`, `locationById`. Tasks 7-11 use these exact names.

- [ ] **Step 1: Create the package manifest**

`packages/pack-hub-navigation-vehicle/package.json`:

```json
{
  "name": "@automata/pack-hub-navigation-vehicle",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/engine": "*",
    "@automata/game-kit": "*",
    "@automata/project": "*"
  }
}
```

Then run `npm install` from the repo root so the workspace link is created.

- [ ] **Step 2: Write the failing test**

Create `packages/pack-hub-navigation-vehicle/tests/locationCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createLocationState, doorwayInReach, enterLocation, locationById, tourComplete,
  type DoorwayDef, type LocationDef
} from '../src/locationCore'

const LOCATIONS: LocationDef[] = [
  {
    id: 'harbor', name: 'Harbor', kind: 'district',
    bounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }, entry: { x: -8, z: -8 }
  },
  {
    id: 'vault', name: 'Vault', kind: 'interior',
    bounds: { minX: 96, maxX: 104, minZ: -4, maxZ: 4 }, entry: { x: 100, z: 0 }
  }
]

const DOORWAYS: DoorwayDef[] = [
  { id: 'd-in', fromLocationId: 'harbor', toLocationId: 'vault', at: { x: 5, z: 5 }, requiresVehicle: true },
  { id: 'd-out', fromLocationId: 'vault', toLocationId: 'harbor', at: { x: 100, z: 3 }, requiresVehicle: false }
]

describe('locationCore', () => {
  it('starts in the district and counts it visited', () => {
    const state = createLocationState('harbor')
    expect(state.currentLocationId).toBe('harbor')
    expect(state.visited).toEqual(['harbor'])
  })

  it('finds a doorway only within radius and only from the current location', () => {
    expect(doorwayInReach(DOORWAYS, 'harbor', { x: 5, z: 5.4 }, 1.5, true)?.id).toBe('d-in')
    expect(doorwayInReach(DOORWAYS, 'harbor', { x: 5, z: 9 }, 1.5, true)).toBeNull()
    expect(doorwayInReach(DOORWAYS, 'vault', { x: 5, z: 5 }, 1.5, true)).toBeNull()
  })

  it('keeps a vehicle-gated doorway shut on foot', () => {
    expect(doorwayInReach(DOORWAYS, 'harbor', { x: 5, z: 5 }, 1.5, false)).toBeNull()
    expect(doorwayInReach(DOORWAYS, 'harbor', { x: 5, z: 5 }, 1.5, true)?.id).toBe('d-in')
  })

  it('records each newly entered location once', () => {
    let state = createLocationState('harbor')
    state = enterLocation(state, 'vault')
    expect(state).toEqual({ currentLocationId: 'vault', visited: ['harbor', 'vault'] })
    state = enterLocation(state, 'harbor')
    expect(state).toEqual({ currentLocationId: 'harbor', visited: ['harbor', 'vault'] })
  })

  it('completes the tour only when every location has been visited', () => {
    const start = createLocationState('harbor')
    expect(tourComplete(start, LOCATIONS)).toBe(false)
    expect(tourComplete(enterLocation(start, 'vault'), LOCATIONS)).toBe(true)
  })

  it('looks a location up by id', () => {
    expect(locationById(LOCATIONS, 'vault')?.name).toBe('Vault')
    expect(locationById(LOCATIONS, 'nowhere')).toBeNull()
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: FAIL — cannot resolve `../src/locationCore`.

- [ ] **Step 4: Implement `locationCore`**

Create `packages/pack-hub-navigation-vehicle/src/locationCore.ts`:

```ts
import type { WorldBounds } from '@automata/game-kit'

/**
 * Pure location topology. Each location is its own coordinate space; interiors
 * are placed far from the district so no other pack's radius check can fire
 * while the player is indoors. No clocks, no RNG, no DOM.
 */
export interface LocationDef {
  id: string
  name: string
  kind: 'district' | 'interior'
  bounds: WorldBounds
  /** Where the player lands on entering, in this location's own space. */
  entry: { x: number; z: number }
}

export interface DoorwayDef {
  id: string
  fromLocationId: string
  toLocationId: string
  /** Trigger point, in `fromLocationId`'s space. */
  at: { x: number; z: number }
  requiresVehicle: boolean
}

export interface LocationState {
  currentLocationId: string
  visited: readonly string[]
}

export function createLocationState(startLocationId: string): LocationState {
  return { currentLocationId: startLocationId, visited: [startLocationId] }
}

export function locationById(
  locations: readonly LocationDef[],
  id: string
): LocationDef | null {
  return locations.find((location) => location.id === id) ?? null
}

/**
 * The doorway the player is standing on, or null. A gated doorway stays shut
 * on foot — that is the vehicle's load-bearing role.
 */
export function doorwayInReach(
  doorways: readonly DoorwayDef[],
  currentLocationId: string,
  player: { x: number; z: number },
  radius: number,
  mounted: boolean
): DoorwayDef | null {
  for (const doorway of doorways) {
    if (doorway.fromLocationId !== currentLocationId) continue
    if (doorway.requiresVehicle && !mounted) continue
    const distance = Math.hypot(doorway.at.x - player.x, doorway.at.z - player.z)
    if (distance <= radius) return doorway
  }
  return null
}

export function enterLocation(state: LocationState, locationId: string): LocationState {
  const visited = state.visited.includes(locationId)
    ? state.visited
    : [...state.visited, locationId]
  return { currentLocationId: locationId, visited }
}

export function tourComplete(
  state: LocationState,
  locations: readonly LocationDef[]
): boolean {
  const visited = new Set(state.visited)
  return locations.every((location) => visited.has(location.id))
}
```

Create `packages/pack-hub-navigation-vehicle/src/index.ts`:

```ts
export * from './locationCore'
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/pack-hub-navigation-vehicle package-lock.json
git commit -m "feat(pack-hub-navigation-vehicle): scaffold package + locationCore"
```

---

### Task 6: `vehicleCore`

**Files:**
- Create: `packages/pack-hub-navigation-vehicle/src/vehicleCore.ts`
- Modify: `packages/pack-hub-navigation-vehicle/src/index.ts`
- Test: `packages/pack-hub-navigation-vehicle/tests/vehicleCore.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `VehicleState`, `createVehicleState`, `withinMountRadius`, `setMounted`. Tasks 7, 9, 10 use these.

- [ ] **Step 1: Write the failing test**

Create `packages/pack-hub-navigation-vehicle/tests/vehicleCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createVehicleState, setMounted, withinMountRadius } from '../src/vehicleCore'

describe('vehicleCore', () => {
  it('starts dismounted', () => {
    expect(createVehicleState()).toEqual({ mounted: false })
  })

  it('reports whether the player is in mount range', () => {
    expect(withinMountRadius({ x: 3, z: 4 }, { x: 3, z: 5 }, 1.5)).toBe(true)
    expect(withinMountRadius({ x: 3, z: 4 }, { x: 3, z: 9 }, 1.5)).toBe(false)
  })

  it('mounts and dismounts idempotently', () => {
    const parked = createVehicleState()
    const mounted = setMounted(parked, true)
    expect(mounted).toEqual({ mounted: true })
    expect(setMounted(mounted, true)).toBe(mounted)
    expect(setMounted(mounted, false)).toEqual({ mounted: false })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project pack-hub-navigation-vehicle vehicleCore`
Expected: FAIL — cannot resolve `../src/vehicleCore`.

- [ ] **Step 3: Implement `vehicleCore`**

Create `packages/pack-hub-navigation-vehicle/src/vehicleCore.ts`:

```ts
/**
 * The one vehicle. Traversal only: a speed multiplier while mounted and a key
 * to exactly one gated doorway. No acceleration, turning radius, or passengers
 * (logged capability gap).
 */
export interface VehicleState {
  mounted: boolean
}

export function createVehicleState(): VehicleState {
  return { mounted: false }
}

export function withinMountRadius(
  parkedAt: { x: number; z: number },
  player: { x: number; z: number },
  radius: number
): boolean {
  return Math.hypot(parkedAt.x - player.x, parkedAt.z - player.z) <= radius
}

/** Returns the same object when nothing changes, so callers can skip republishing. */
export function setMounted(state: VehicleState, mounted: boolean): VehicleState {
  return state.mounted === mounted ? state : { mounted }
}
```

Add to `packages/pack-hub-navigation-vehicle/src/index.ts`:

```ts
export * from './vehicleCore'
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/pack-hub-navigation-vehicle
git commit -m "feat(pack-hub-navigation-vehicle): vehicleCore mount state"
```

---

### Task 7: Compiled pack config + persistence

**Files:**
- Create: `packages/pack-hub-navigation-vehicle/src/config.ts`
- Modify: `packages/pack-hub-navigation-vehicle/src/index.ts`
- Test: `packages/pack-hub-navigation-vehicle/tests/config.test.ts`

**Interfaces:**
- Consumes: `LocationDef`/`DoorwayDef` shapes from Task 5.
- Produces: `LOCATION_SLICE_ID`, `VEHICLE_SLICE_ID`, `LOCATION_ENTERED_EVENT`, `VEHICLE_MOUNTED_EVENT`, `VEHICLE_DISMOUNTED_EVENT`, `HubPackConfig`, `packConfigSchema`, `SavedHub`, `parseSavedHub`, `MAX_INTERIORS`. Tasks 8-13 use these.

- [ ] **Step 1: Write the failing test**

Create `packages/pack-hub-navigation-vehicle/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { packConfigSchema, parseSavedHub, type HubPackConfig } from '../src/config'

const valid = (): unknown => ({
  doorwayRadius: 1.5,
  locations: [
    {
      id: 'harbor', name: 'Harbor', kind: 'district',
      bounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }, entry: { x: -8, z: -8 }
    },
    {
      id: 'vault', name: 'Vault', kind: 'interior',
      bounds: { minX: 96, maxX: 104, minZ: -4, maxZ: 4 }, entry: { x: 100, z: 0 }
    }
  ],
  doorways: [
    { id: 'd-in', fromLocationId: 'harbor', toLocationId: 'vault', at: { x: 5, z: 5 }, requiresVehicle: true },
    { id: 'd-out', fromLocationId: 'vault', toLocationId: 'harbor', at: { x: 100, z: 3 }, requiresVehicle: false }
  ],
  vehicle: { parkedAt: { x: -4, z: 2 }, speedMultiplier: 2.5, mountRadius: 1.5 }
})

describe('hub pack config', () => {
  it('accepts a well-formed hub', () => {
    expect(() => packConfigSchema.parse(valid())).not.toThrow()
  })

  it('requires exactly one district', () => {
    const twoDistricts = valid() as { locations: Array<{ kind: string }> }
    twoDistricts.locations[1]!.kind = 'district'
    expect(() => packConfigSchema.parse(twoDistricts)).toThrow(/exactly one district/)
  })

  it('rejects duplicate location ids', () => {
    const dupe = valid() as { locations: Array<{ id: string }> }
    dupe.locations[1]!.id = 'harbor'
    expect(() => packConfigSchema.parse(dupe)).toThrow(/duplicate location id/)
  })

  it('rejects a doorway pointing at an unknown location', () => {
    const broken = valid() as { doorways: Array<{ toLocationId: string }> }
    broken.doorways[0]!.toLocationId = 'nowhere'
    expect(() => packConfigSchema.parse(broken)).toThrow(/unknown location/)
  })

  it('requires every interior to be reachable from the district', () => {
    const stranded = valid() as { doorways: unknown[] }
    stranded.doorways = []
    expect(() => packConfigSchema.parse(stranded)).toThrow(/unreachable interior/)
  })

  it('requires exactly one vehicle-gated doorway when interiors exist', () => {
    const ungated = valid() as { doorways: Array<{ requiresVehicle: boolean }> }
    ungated.doorways[0]!.requiresVehicle = false
    expect(() => packConfigSchema.parse(ungated)).toThrow(/exactly one vehicle-gated doorway/)
  })

  it('round-trips a saved hub', () => {
    const config = packConfigSchema.parse(valid()) as HubPackConfig
    const saved = parseSavedHub(
      { currentLocationId: 'vault', visited: ['harbor', 'vault'], vehicle: { mounted: true } },
      config
    )
    expect(saved.visited).toEqual(['harbor', 'vault'])
  })

  it('rejects a saved hub naming an unknown location', () => {
    const config = packConfigSchema.parse(valid()) as HubPackConfig
    expect(() => parseSavedHub(
      { currentLocationId: 'nowhere', visited: ['harbor'], vehicle: { mounted: false } },
      config
    )).toThrow(/unknown location/)
  })

  it('rejects a saved hub whose current location was never visited', () => {
    const config = packConfigSchema.parse(valid()) as HubPackConfig
    expect(() => parseSavedHub(
      { currentLocationId: 'vault', visited: ['harbor'], vehicle: { mounted: false } },
      config
    )).toThrow(/current location/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project pack-hub-navigation-vehicle config`
Expected: FAIL — cannot resolve `../src/config`.

- [ ] **Step 3: Implement the compiled config**

Create `packages/pack-hub-navigation-vehicle/src/config.ts`:

```ts
import { z } from '@automata/project'

/**
 * Compiled hub config. `LOCATION_SLICE_ID` is also the slice game-kit checks
 * before honouring a `setBounds` call, so the string must match game-kit's
 * own constant — it is duplicated deliberately, like every other cross-package
 * slice id in the pack set.
 */
export const LOCATION_SLICE_ID = 'location'
export const VEHICLE_SLICE_ID = 'vehicle'
export const LOCATION_ENTERED_EVENT = 'locationEntered'
export const VEHICLE_MOUNTED_EVENT = 'vehicleMounted'
export const VEHICLE_DISMOUNTED_EVENT = 'vehicleDismounted'

/** Bounded presentation cap: one district plus at most four interiors. */
export const MAX_INTERIORS = 4

/** Runtime slice payloads, also published by the eval twin. */
export interface LocationSliceValue {
  currentLocationId: string
  visited: readonly string[]
}

export interface VehicleSliceValue {
  mounted: boolean
}

const idSchema = z.string().min(1).max(60)
const pointSchema = z.strictObject({ x: z.number(), z: z.number() })
const boundsSchema = z.strictObject({
  minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number()
})

const baseConfigSchema = z.strictObject({
  doorwayRadius: z.number().min(0.5).max(5),
  locations: z.array(z.strictObject({
    id: idSchema,
    name: z.string().min(1).max(80),
    kind: z.enum(['district', 'interior']),
    bounds: boundsSchema,
    entry: pointSchema
  })).min(1).max(MAX_INTERIORS + 1),
  doorways: z.array(z.strictObject({
    id: idSchema,
    fromLocationId: idSchema,
    toLocationId: idSchema,
    at: pointSchema,
    requiresVehicle: z.boolean()
  })).max(MAX_INTERIORS * 2),
  vehicle: z.strictObject({
    parkedAt: pointSchema,
    speedMultiplier: z.number().min(1.5).max(4),
    mountRadius: z.number().min(0.5).max(5)
  })
})

export type HubPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

export const packConfigSchema: z.ZodType<HubPackConfig> =
  baseConfigSchema.superRefine((config, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: 'custom', message })
    }

    for (const id of duplicates(config.locations.map((location) => location.id))) {
      issue(`duplicate location id "${id}"`)
    }
    for (const id of duplicates(config.doorways.map((doorway) => doorway.id))) {
      issue(`duplicate doorway id "${id}"`)
    }

    const districts = config.locations.filter((location) => location.kind === 'district')
    if (districts.length !== 1) {
      issue(`hub must contain exactly one district, found ${districts.length}`)
    }
    const interiors = config.locations.filter((location) => location.kind === 'interior')
    if (interiors.length > MAX_INTERIORS) {
      issue(`hub supports at most ${MAX_INTERIORS} interiors, found ${interiors.length}`)
    }

    const known = new Set(config.locations.map((location) => location.id))
    for (const doorway of config.doorways) {
      for (const endpoint of [doorway.fromLocationId, doorway.toLocationId]) {
        if (!known.has(endpoint)) {
          issue(`doorway "${doorway.id}" references unknown location "${endpoint}"`)
        }
      }
    }

    // Every interior must be reachable from the district, and returnable.
    const district = districts[0]
    if (district) {
      const reachable = new Set([district.id])
      let grew = true
      while (grew) {
        grew = false
        for (const doorway of config.doorways) {
          if (reachable.has(doorway.fromLocationId) && !reachable.has(doorway.toLocationId)) {
            reachable.add(doorway.toLocationId)
            grew = true
          }
        }
      }
      for (const interior of interiors) {
        if (!reachable.has(interior.id)) {
          issue(`unreachable interior "${interior.id}"`)
        }
        const returns = config.doorways.some(
          (doorway) => doorway.fromLocationId === interior.id && doorway.toLocationId === district.id
        )
        if (!returns) issue(`interior "${interior.id}" has no doorway back to the district`)
      }
    }

    const gated = config.doorways.filter((doorway) => doorway.requiresVehicle)
    if (interiors.length > 0 && gated.length !== 1) {
      issue(`hub must contain exactly one vehicle-gated doorway, found ${gated.length}`)
    }
  })

/** Contract-v2 persistence slot over the two owned slices. */
export const savedHubSchema = z.strictObject({
  currentLocationId: idSchema,
  visited: z.array(idSchema).min(1).max(MAX_INTERIORS + 1),
  vehicle: z.strictObject({ mounted: z.boolean() })
})

export type SavedHub = z.infer<typeof savedHubSchema>

/** Validate against both the structural schema and the compiled hub that owns it. */
export function parseSavedHub(raw: unknown, config: HubPackConfig): SavedHub {
  const saved = savedHubSchema.parse(raw)
  const known = new Set(config.locations.map((location) => location.id))

  if (new Set(saved.visited).size !== saved.visited.length) {
    throw new Error('Saved hub contains duplicate visited location ids')
  }
  for (const id of [saved.currentLocationId, ...saved.visited]) {
    if (!known.has(id)) throw new Error(`Saved hub references unknown location "${id}"`)
  }
  if (!saved.visited.includes(saved.currentLocationId)) {
    throw new Error('Saved hub current location is not among the visited locations')
  }
  const district = config.locations.find((location) => location.kind === 'district')!
  if (saved.vehicle.mounted && saved.currentLocationId !== district.id) {
    throw new Error('Saved hub is mounted inside an interior')
  }
  return saved
}
```

Add to `packages/pack-hub-navigation-vehicle/src/index.ts`:

```ts
export * from './config'
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: PASS (18 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/pack-hub-navigation-vehicle
git commit -m "feat(pack-hub-navigation-vehicle): compiled config + persistence schema"
```

---

### Task 8: Seeded `composeSection`

**Files:**
- Create: `packages/pack-hub-navigation-vehicle/src/composeSection.ts`
- Modify: `packages/pack-hub-navigation-vehicle/src/index.ts`
- Test: `packages/pack-hub-navigation-vehicle/tests/composeSection.test.ts`

**Interfaces:**
- Consumes: `HubPackConfig`, `packConfigSchema`, `MAX_INTERIORS` (Task 7).
- Produces: `composeHubSection(input: HubComposeInput, rng: SeededRng): HubPackConfig`, `HUB_DEFAULTS`, `INTERIOR_ORIGIN_X`, `INTERIOR_SPACING`, `INTERIOR_HALF`. Tasks 12 and 13 call it.

- [ ] **Step 1: Write the failing test**

Create `packages/pack-hub-navigation-vehicle/tests/composeSection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { packConfigSchema } from '../src/config'
import { composeHubSection, INTERIOR_ORIGIN_X } from '../src/composeSection'

const input = (interiorCount: number) => ({
  specConfig: {},
  locations: [
    { id: 'harbor', name: 'Harbor', kind: 'district' as const },
    ...Array.from({ length: interiorCount }, (_, index) => ({
      id: `interior-${index}`, name: `Interior ${index}`, kind: 'interior' as const
    }))
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  occupied: []
})

describe('composeHubSection', () => {
  it('emits a schema-valid hub', () => {
    const config = composeHubSection(input(2), createSeededRng(7))
    expect(() => packConfigSchema.parse(config)).not.toThrow()
  })

  it('replays bit-identically from the same seed', () => {
    const first = composeHubSection(input(3), createSeededRng(11))
    const second = composeHubSection(input(3), createSeededRng(11))
    expect(first).toEqual(second)
  })

  it('keeps the district on the existing arena bounds', () => {
    const config = composeHubSection(input(1), createSeededRng(7))
    const district = config.locations.find((location) => location.kind === 'district')!
    expect(district.bounds).toEqual({ minX: -12, maxX: 12, minZ: -12, maxZ: 12 })
    expect(district.entry).toEqual({ x: -8, z: -8 })
  })

  it('places every interior at least 50 units from the district', () => {
    const config = composeHubSection(input(4), createSeededRng(7))
    for (const location of config.locations.filter((entry) => entry.kind === 'interior')) {
      expect(location.bounds.minX).toBeGreaterThanOrEqual(INTERIOR_ORIGIN_X)
      expect(INTERIOR_ORIGIN_X).toBeGreaterThanOrEqual(50 + 12)
    }
  })

  it('gates exactly one doorway behind the vehicle', () => {
    const config = composeHubSection(input(3), createSeededRng(7))
    expect(config.doorways.filter((doorway) => doorway.requiresVehicle)).toHaveLength(1)
  })

  it('gives every interior an inbound and an outbound doorway', () => {
    const config = composeHubSection(input(3), createSeededRng(7))
    for (const interior of config.locations.filter((entry) => entry.kind === 'interior')) {
      expect(config.doorways.some((d) => d.toLocationId === interior.id)).toBe(true)
      expect(config.doorways.some((d) => d.fromLocationId === interior.id)).toBe(true)
    }
  })

  it('caps interiors at the presentation limit', () => {
    const config = composeHubSection(input(8), createSeededRng(7))
    expect(config.locations.filter((entry) => entry.kind === 'interior')).toHaveLength(4)
    expect(() => packConfigSchema.parse(config)).not.toThrow()
  })

  it('honours spec tuning', () => {
    const tuned = composeHubSection(
      { ...input(1), specConfig: { vehicleSpeedMultiplier: 3.5, doorwayRadius: 2 } },
      createSeededRng(7)
    )
    expect(tuned.vehicle.speedMultiplier).toBe(3.5)
    expect(tuned.doorwayRadius).toBe(2)
  })

  it('keeps the vehicle and doorways clear of occupied district points', () => {
    const config = composeHubSection(
      { ...input(2), occupied: [{ x: 0, z: 0 }, { x: 4, z: 4 }] },
      createSeededRng(7)
    )
    const points = [config.vehicle.parkedAt, ...config.doorways
      .filter((d) => d.fromLocationId === 'harbor')
      .map((d) => d.at)]
    for (const point of points) {
      for (const taken of [{ x: 0, z: 0 }, { x: 4, z: 4 }]) {
        expect(Math.hypot(point.x - taken.x, point.z - taken.z)).toBeGreaterThanOrEqual(2)
      }
    }
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project pack-hub-navigation-vehicle composeSection`
Expected: FAIL — cannot resolve `../src/composeSection`.

- [ ] **Step 3: Implement the compose section**

Create `packages/pack-hub-navigation-vehicle/src/composeSection.ts`:

```ts
import type { SeededRng } from '@automata/engine'
import { MAX_INTERIORS, type HubPackConfig } from './config'

export const HUB_DEFAULTS = {
  vehicleSpeedMultiplier: 2.5,
  doorwayRadius: 1.5,
  mountRadius: 1.5
} as const

/**
 * Interiors live in their own coordinate spaces, far enough from the district
 * that no other pack's radius check can fire while the player is indoors.
 * With a district half-extent of 12 this leaves a 76-unit gap.
 */
export const INTERIOR_ORIGIN_X = 100
export const INTERIOR_SPACING = 40
export const INTERIOR_HALF = 4

export interface HubComposeInput {
  specConfig: { vehicleSpeedMultiplier?: number; doorwayRadius?: number }
  /** Spec locations in authored order; the first district becomes the hub. */
  locations: ReadonlyArray<{ id: string; name: string; kind: 'district' | 'interior' }>
  arena: {
    half: number
    spawn: { x: number; z: number }
    goal: { x: number; z: number }
  }
  /** Soft keepout points from NPCs, walker stations, enemy posts, and shops. */
  occupied: ReadonlyArray<{ x: number; z: number }>
}

const WALL_MARGIN = 2
const SEPARATION = 2
const MAX_DRAWS = 200

const round2 = (value: number): number => Math.round(value * 100) / 100

const far = (
  left: { x: number; z: number },
  right: { x: number; z: number },
  minimum: number
): boolean => Math.hypot(left.x - right.x, left.z - right.z) >= minimum

/**
 * Seed the district hub, its interiors, the doorways between them, and the
 * parked vehicle. Every draw comes from the supplied RNG; fixed defaults live
 * here rather than in the GameSpec schema so stored spec hashes stay stable.
 */
export function composeHubSection(input: HubComposeInput, rng: SeededRng): HubPackConfig {
  const districtSpec = input.locations.find((location) => location.kind === 'district')
  if (!districtSpec) throw new Error('composeHubSection requires a district location')
  const interiorSpecs = input.locations
    .filter((location) => location.kind === 'interior')
    .slice(0, MAX_INTERIORS)
  if (interiorSpecs.length === 0) {
    throw new Error('composeHubSection requires at least one interior location')
  }

  const limit = input.arena.half - WALL_MARGIN
  const taken: Array<{ x: number; z: number }> = [
    input.arena.spawn,
    input.arena.goal,
    ...input.occupied
  ]

  /** Draw a district point clear of everything already placed. */
  const drawDistrictPoint = (): { x: number; z: number } => {
    for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
      const point = {
        x: round2((rng.next() * 2 - 1) * limit),
        z: round2((rng.next() * 2 - 1) * limit)
      }
      if (taken.every((other) => far(point, other, SEPARATION))) {
        taken.push(point)
        return point
      }
    }
    // Deterministic fallback: the arena corner furthest from spawn.
    const fallback = { x: round2(limit), z: round2(limit) }
    taken.push(fallback)
    return fallback
  }

  const district = {
    id: districtSpec.id,
    name: districtSpec.name,
    kind: 'district' as const,
    bounds: {
      minX: -input.arena.half, maxX: input.arena.half,
      minZ: -input.arena.half, maxZ: input.arena.half
    },
    entry: { x: input.arena.spawn.x, z: input.arena.spawn.z }
  }

  const gatedIndex = Math.floor(rng.next() * interiorSpecs.length)
  const locations: HubPackConfig['locations'] = [district]
  const doorways: HubPackConfig['doorways'] = []

  interiorSpecs.forEach((spec, index) => {
    const centerX = INTERIOR_ORIGIN_X + index * INTERIOR_SPACING
    const bounds = {
      minX: centerX - INTERIOR_HALF, maxX: centerX + INTERIOR_HALF,
      minZ: -INTERIOR_HALF, maxZ: INTERIOR_HALF
    }
    const entry = { x: centerX, z: round2(-INTERIOR_HALF + 1) }
    locations.push({
      id: spec.id, name: spec.name, kind: 'interior', bounds, entry
    })
    doorways.push({
      id: `door-to-${spec.id}`,
      fromLocationId: district.id,
      toLocationId: spec.id,
      at: drawDistrictPoint(),
      requiresVehicle: index === gatedIndex
    })
    doorways.push({
      id: `door-from-${spec.id}`,
      fromLocationId: spec.id,
      toLocationId: district.id,
      at: { x: centerX, z: round2(-INTERIOR_HALF + 0.5) },
      requiresVehicle: false
    })
  })

  return {
    doorwayRadius: input.specConfig.doorwayRadius ?? HUB_DEFAULTS.doorwayRadius,
    locations,
    doorways,
    vehicle: {
      parkedAt: drawDistrictPoint(),
      speedMultiplier:
        input.specConfig.vehicleSpeedMultiplier ?? HUB_DEFAULTS.vehicleSpeedMultiplier,
      mountRadius: HUB_DEFAULTS.mountRadius
    }
  }
}
```

Add to `packages/pack-hub-navigation-vehicle/src/index.ts`:

```ts
export * from './composeSection'
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: PASS (27 tests total).

Note the inbound doorway `at` is drawn *before* the vehicle, and both come from the same `drawDistrictPoint` keepout list — so the vehicle can never spawn on a doorway.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-hub-navigation-vehicle
git commit -m "feat(pack-hub-navigation-vehicle): seeded composeSection"
```

---

### Task 9: Browser adapter (`pack.ts`)

**Files:**
- Create: `packages/pack-hub-navigation-vehicle/src/pack.ts`
- Modify: `packages/pack-hub-navigation-vehicle/src/index.ts`
- Test: `packages/pack-hub-navigation-vehicle/tests/pack.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5-8, plus `packCompatibility` and `PackWorldState.effects` from Task 1.
- Produces: `hubNavigationVehiclePack: GamePack<HubPackConfig>` with `id: 'hub-navigation-vehicle'`, `version: '1.0.0'`. Tasks 12 and 13 import it.

- [ ] **Step 1: Write the failing test**

Create `packages/pack-hub-navigation-vehicle/tests/pack.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import {
  createGameHost, createPackEventBus, createPackStateRegistry, createWorldEffectsSink,
  type PackRuntimeHandle
} from '@automata/game-kit'
import { createSeededRng } from '@automata/engine'
import { composeHubSection } from '../src/composeSection'
import { packConfigSchema, LOCATION_SLICE_ID, VEHICLE_SLICE_ID } from '../src/config'
import { hubNavigationVehiclePack } from '../src/pack'

const config = () => packConfigSchema.parse(composeHubSection({
  specConfig: {},
  locations: [
    { id: 'harbor', name: 'Harbor', kind: 'district' },
    { id: 'vault', name: 'Vault', kind: 'interior' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  occupied: []
}, createSeededRng(7)))

describe('hub-navigation-vehicle pack', () => {
  let app: HTMLDivElement
  let host: ReturnType<typeof createGameHost>
  let render: ReturnType<typeof createNullRenderer>
  let state: ReturnType<typeof createPackStateRegistry>
  let handle: PackRuntimeHandle

  const boot = (): void => {
    app = document.createElement('div')
    document.body.append(app)
    host = createGameHost(app)
    render = createNullRenderer()
    state = createPackStateRegistry()
    handle = hubNavigationVehiclePack.register(
      { host, render: render.port, events: createPackEventBus(), state },
      config()
    )!
  }

  const tick = (x: number, z: number) => {
    const sink = createWorldEffectsSink(new Set([hubNavigationVehiclePack.id]))
    handle.fixedUpdate!(1 / 60, {
      playerPosition: { x, z },
      effects: sink.forPack(hubNavigationVehiclePack.id)
    })
    return sink.resolve()
  }

  beforeEach(boot)

  it('publishes both owned slices at boot', () => {
    expect(state.get(LOCATION_SLICE_ID)).toEqual({ currentLocationId: 'harbor', visited: ['harbor'] })
    expect(state.get(VEHICLE_SLICE_ID)).toEqual({ mounted: false })
  })

  it('sets district bounds every tick', () => {
    expect(tick(0, 0).bounds).toEqual({ minX: -12, maxX: 12, minZ: -12, maxZ: 12 })
  })

  it('does not open the gated doorway on foot', () => {
    const door = config().doorways.find((entry) => entry.requiresVehicle)!
    expect(tick(door.at.x, door.at.z).teleport).toBeNull()
    expect(state.get(LOCATION_SLICE_ID)).toEqual({ currentLocationId: 'harbor', visited: ['harbor'] })
  })

  it('mounts the vehicle, scales speed, then crosses the gate', () => {
    const cfg = config()
    const mountResult = tick(cfg.vehicle.parkedAt.x, cfg.vehicle.parkedAt.z)
    expect(mountResult.speedMultiplier).toBe(cfg.vehicle.speedMultiplier)
    expect(state.get(VEHICLE_SLICE_ID)).toEqual({ mounted: true })

    const door = cfg.doorways.find((entry) => entry.requiresVehicle)!
    const interior = cfg.locations.find((entry) => entry.id === door.toLocationId)!
    const crossResult = tick(door.at.x, door.at.z)
    expect(crossResult.teleport).toEqual(interior.entry)
    expect(state.get(LOCATION_SLICE_ID)).toEqual({
      currentLocationId: 'vault', visited: ['harbor', 'vault']
    })
    // Entering an interior auto-dismounts; the vehicle stays parked.
    expect(state.get(VEHICLE_SLICE_ID)).toEqual({ mounted: false })
  })

  it('completes the tour once every location is visited', () => {
    const cfg = config()
    expect(handle.objectivesComplete!()).toBe(false)
    tick(cfg.vehicle.parkedAt.x, cfg.vehicle.parkedAt.z)
    const door = cfg.doorways.find((entry) => entry.requiresVehicle)!
    tick(door.at.x, door.at.z)
    expect(handle.objectivesComplete!()).toBe(true)
  })

  it('round-trips its persistence slot', () => {
    const cfg = config()
    tick(cfg.vehicle.parkedAt.x, cfg.vehicle.parkedAt.z)
    const door = cfg.doorways.find((entry) => entry.requiresVehicle)!
    tick(door.at.x, door.at.z)
    const saved = handle.saveState!()

    host.dispose()
    app.remove()
    boot()
    expect(handle.objectivesComplete!()).toBe(false)
    handle.loadState!(saved)
    expect(handle.objectivesComplete!()).toBe(true)
    expect(state.get(LOCATION_SLICE_ID)).toEqual({
      currentLocationId: 'vault', visited: ['harbor', 'vault']
    })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project pack-hub-navigation-vehicle pack`
Expected: FAIL — cannot resolve `../src/pack`.

- [ ] **Step 3: Implement the browser adapter**

Create `packages/pack-hub-navigation-vehicle/src/pack.ts`:

```ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  LOCATION_ENTERED_EVENT, LOCATION_SLICE_ID, VEHICLE_DISMOUNTED_EVENT,
  VEHICLE_MOUNTED_EVENT, VEHICLE_SLICE_ID, packConfigSchema, parseSavedHub,
  type HubPackConfig
} from './config'
import {
  createLocationState, doorwayInReach, enterLocation, locationById, tourComplete,
  type LocationState
} from './locationCore'
import { createVehicleState, setMounted, withinMountRadius, type VehicleState } from './vehicleCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const DOORWAY_COLOR = '#7ae7ff'
const DOORWAY_RADIUS = 0.35
const VEHICLE_COLOR = '#ffb347'
const VEHICLE_RADIUS = 0.55

/** The sixth standard pack: instanced locations plus one load-bearing vehicle. */
export const hubNavigationVehiclePack: GamePack<HubPackConfig> = {
  id: 'hub-navigation-vehicle',
  version: '1.0.0',
  compatibility: packCompatibility({
    integratesWith: [
      'interaction-inventory', 'dialogue-quests', 'schedules-relationships',
      'combat-ai', 'economy-progression'
    ],
    stateSlices: { owns: [LOCATION_SLICE_ID, VEHICLE_SLICE_ID], reads: [] },
    events: {
      emits: [LOCATION_ENTERED_EVENT, VEHICLE_MOUNTED_EVENT, VEHICLE_DISMOUNTED_EVENT],
      consumes: []
    }
  }),
  configSchema: packConfigSchema,

  register(ctx, config): PackRuntimeHandle {
    const district = config.locations.find((location) => location.kind === 'district')!
    let location: LocationState = createLocationState(district.id)
    let vehicle: VehicleState = createVehicleState()

    const publishLocation = (): void => {
      ctx.state.set(LOCATION_SLICE_ID, hubNavigationVehiclePack.id, {
        currentLocationId: location.currentLocationId,
        visited: [...location.visited]
      })
    }
    const publishVehicle = (): void => {
      ctx.state.set(VEHICLE_SLICE_ID, hubNavigationVehiclePack.id, { mounted: vehicle.mounted })
    }
    ctx.state.register(LOCATION_SLICE_ID, hubNavigationVehiclePack.id, {
      currentLocationId: location.currentLocationId,
      visited: [...location.visited]
    })
    ctx.state.register(VEHICLE_SLICE_ID, hubNavigationVehiclePack.id, { mounted: vehicle.mounted })

    const entities = new Map<string, { id: string }>()
    const addMarker = (
      key: string, x: number, z: number, radius: number, color: string
    ): void => {
      const entity = { id: key }
      entities.set(key, entity)
      ctx.render.add(entity, { primitive: 'sphere', radius, color })
      ctx.render.setPose(entity, { x, y: radius, z }, IDENTITY)
    }
    for (const doorway of config.doorways) {
      addMarker(`hub-door-${doorway.id}`, doorway.at.x, doorway.at.z, DOORWAY_RADIUS, DOORWAY_COLOR)
    }
    addMarker(
      'hub-vehicle', config.vehicle.parkedAt.x, config.vehicle.parkedAt.z,
      VEHICLE_RADIUS, VEHICLE_COLOR
    )

    const hud = document.createElement('div')
    hud.className = 'hub-hud'
    ctx.host.overlays.append(hud)
    const updateHud = (): void => {
      const current = locationById(config.locations, location.currentLocationId)
      hud.textContent =
        `${current?.name ?? location.currentLocationId} · ${location.visited.length}/${config.locations.length} visited` +
        (vehicle.mounted ? ' · driving' : '')
    }
    updateHud()

    return {
      fixedUpdate(_dt, world) {
        const current = locationById(config.locations, location.currentLocationId)!
        world.effects.setBounds(current.bounds)

        // Mounting is district-only: the vehicle never parks inside an interior.
        if (current.kind === 'district' && !vehicle.mounted) {
          if (withinMountRadius(config.vehicle.parkedAt, world.playerPosition, config.vehicle.mountRadius)) {
            vehicle = setMounted(vehicle, true)
            publishVehicle()
            ctx.events.emit(VEHICLE_MOUNTED_EVENT, { packId: hubNavigationVehiclePack.id })
          }
        }
        if (vehicle.mounted) world.effects.scaleSpeed(config.vehicle.speedMultiplier)

        const doorway = doorwayInReach(
          config.doorways, location.currentLocationId, world.playerPosition,
          config.doorwayRadius, vehicle.mounted
        )
        if (doorway) {
          const destination = locationById(config.locations, doorway.toLocationId)!
          location = enterLocation(location, destination.id)
          world.effects.teleport({ x: destination.entry.x, z: destination.entry.z })
          world.effects.setBounds(destination.bounds)
          publishLocation()
          ctx.events.emit(LOCATION_ENTERED_EVENT, {
            packId: hubNavigationVehiclePack.id, locationId: destination.id
          })
          if (destination.kind === 'interior' && vehicle.mounted) {
            vehicle = setMounted(vehicle, false)
            publishVehicle()
            ctx.events.emit(VEHICLE_DISMOUNTED_EVENT, { packId: hubNavigationVehiclePack.id })
          }
        }
        updateHud()
      },

      objectivesComplete: () => tourComplete(location, config.locations),

      saveState: () => ({
        currentLocationId: location.currentLocationId,
        visited: [...location.visited],
        vehicle: { mounted: vehicle.mounted }
      }),

      loadState(raw) {
        const saved = parseSavedHub(raw, config)
        location = { currentLocationId: saved.currentLocationId, visited: saved.visited }
        vehicle = { mounted: saved.vehicle.mounted }
        publishLocation()
        publishVehicle()
        updateHud()
      },

      dispose() {
        for (const entity of entities.values()) ctx.render.remove(entity)
        entities.clear()
        hud.remove()
      }
    }
  }
}
```

Add to `packages/pack-hub-navigation-vehicle/src/index.ts`:

```ts
export * from './pack'
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: PASS.

If the "mounts then crosses the gate" test fails because the seeded vehicle and the gated doorway happen to be within `doorwayRadius` of each other, the keepout in Task 8 (`SEPARATION = 2`) is doing its job at 2 units while `doorwayRadius` defaults to 1.5 — they cannot overlap. If it still fails, the bug is in `drawDistrictPoint`'s keepout list, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-hub-navigation-vehicle
git commit -m "feat(pack-hub-navigation-vehicle): browser adapter"
```

---

### Task 10: Headless eval hook

**Files:**
- Create: `packages/pack-hub-navigation-vehicle/src/evalHook.ts`
- Modify: `packages/pack-hub-navigation-vehicle/src/index.ts`
- Test: `packages/pack-hub-navigation-vehicle/tests/evalHook.test.ts`

**Interfaces:**
- Consumes: Tasks 5-8, plus the `effects` parameter added to `PackEvalHook.step` in Task 2.
- Produces: `createHubNavigationVehicleEvalHook(config: HubPackConfig): PackEvalHook`. Task 12 registers it.

- [ ] **Step 1: Write the failing test**

Create `packages/pack-hub-navigation-vehicle/tests/evalHook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { createWorldEffectsSink } from '@automata/game-kit'
import { composeHubSection } from '../src/composeSection'
import { packConfigSchema, LOCATION_SLICE_ID, VEHICLE_SLICE_ID } from '../src/config'
import { createHubNavigationVehicleEvalHook } from '../src/evalHook'

const config = (interiors: number) => packConfigSchema.parse(composeHubSection({
  specConfig: {},
  locations: [
    { id: 'harbor', name: 'Harbor', kind: 'district' },
    ...Array.from({ length: interiors }, (_, index) => ({
      id: `room-${index}`, name: `Room ${index}`, kind: 'interior' as const
    }))
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  occupied: []
}, createSeededRng(7)))

/** Same seek-and-step loop the composition matrix runs, for one hook. */
const drive = (interiors: number) => {
  const hook = createHubNavigationVehicleEvalHook(config(interiors))
  let state = hook.createState()
  const player = { x: -8, z: -8 }
  let speedMultiplier = 1
  for (let step = 0; step < 4000; step += 1) {
    if (hook.complete(state)) return { hook, state, steps: step }
    const sink = createWorldEffectsSink(new Set([hook.packId]))
    const target = hook.nextTarget(state, player)
    if (target) {
      const dx = target.x - player.x
      const dz = target.z - player.z
      const dist = Math.hypot(dx, dz)
      const move = Math.min(0.5 * speedMultiplier, dist)
      if (dist > 0) { player.x += (dx / dist) * move; player.z += (dz / dist) * move }
    }
    state = hook.step(state, player, {}, undefined, sink.forPack(hook.packId))
    const resolved = sink.resolve()
    expect(resolved.issues).toEqual([])
    if (resolved.teleport) { player.x = resolved.teleport.x; player.z = resolved.teleport.z }
    speedMultiplier = resolved.speedMultiplier
  }
  throw new Error('hub eval hook did not complete')
}

describe('hub eval hook', () => {
  it('completes the tour with one interior', () => {
    expect(drive(1).steps).toBeGreaterThan(0)
  })

  it('completes the tour with the maximum interiors', () => {
    expect(drive(4).steps).toBeGreaterThan(0)
  })

  it('publishes both owned slices', () => {
    const { hook, state } = drive(2)
    const slices = hook.publishSlices!(state)
    expect(slices[VEHICLE_SLICE_ID]).toEqual({ mounted: false })
    expect((slices[LOCATION_SLICE_ID] as { visited: string[] }).visited).toHaveLength(3)
  })

  it('never reports complete before every location is visited', () => {
    const hook = createHubNavigationVehicleEvalHook(config(3))
    expect(hook.complete(hook.createState())).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project pack-hub-navigation-vehicle evalHook`
Expected: FAIL — cannot resolve `../src/evalHook`.

- [ ] **Step 3: Implement the eval hook**

Create `packages/pack-hub-navigation-vehicle/src/evalHook.ts`:

```ts
import type { PackEvalHook } from '@automata/game-kit'
import { LOCATION_SLICE_ID, VEHICLE_SLICE_ID, type HubPackConfig } from './config'
import {
  createLocationState, doorwayInReach, enterLocation, locationById, tourComplete,
  type LocationState
} from './locationCore'
import { createVehicleState, setMounted, withinMountRadius, type VehicleState } from './vehicleCore'

interface EvalState {
  location: LocationState
  vehicle: VehicleState
}

/**
 * Headless twin of the browser adapter. Because the hub composes last, this
 * hook is the last one the matrix driver consults — the other packs finish
 * their district work before the tour begins, so no pack steers the player
 * while they are in an interior coordinate space.
 */
export function createHubNavigationVehicleEvalHook(config: HubPackConfig): PackEvalHook {
  const district = config.locations.find((location) => location.kind === 'district')!
  const complete = (state: EvalState): boolean => tourComplete(state.location, config.locations)

  /** The next doorway to walk to, preferring an unvisited destination. */
  const pendingDoorway = (state: EvalState) => {
    const visited = new Set(state.location.visited)
    const here = state.location.currentLocationId
    const unvisited = config.doorways.find(
      (doorway) => doorway.fromLocationId === here && !visited.has(doorway.toLocationId)
    )
    if (unvisited) return unvisited
    // Nothing new from here: head back to the district to reach the rest.
    return config.doorways.find(
      (doorway) => doorway.fromLocationId === here && doorway.toLocationId === district.id
    ) ?? null
  }

  return {
    packId: 'hub-navigation-vehicle',

    createState: (): EvalState => ({
      location: createLocationState(district.id),
      vehicle: createVehicleState()
    }),

    nextTarget(state) {
      const evalState = state as EvalState
      if (complete(evalState)) return null
      const doorway = pendingDoorway(evalState)
      if (!doorway) return null
      // A gated doorway is unreachable on foot: fetch the vehicle first.
      if (doorway.requiresVehicle && !evalState.vehicle.mounted) {
        return { ...config.vehicle.parkedAt }
      }
      return { ...doorway.at }
    },

    step(state, player, _slices, emit, effects) {
      const evalState = state as EvalState
      let { location, vehicle } = evalState
      const current = locationById(config.locations, location.currentLocationId)!

      if (current.kind === 'district' && !vehicle.mounted &&
        withinMountRadius(config.vehicle.parkedAt, player, config.vehicle.mountRadius)) {
        vehicle = setMounted(vehicle, true)
        emit?.('vehicleMounted', { packId: 'hub-navigation-vehicle' })
      }
      if (vehicle.mounted) effects?.scaleSpeed(config.vehicle.speedMultiplier)

      const doorway = doorwayInReach(
        config.doorways, location.currentLocationId, player,
        config.doorwayRadius, vehicle.mounted
      )
      if (doorway) {
        const destination = locationById(config.locations, doorway.toLocationId)!
        location = enterLocation(location, destination.id)
        effects?.teleport({ x: destination.entry.x, z: destination.entry.z })
        emit?.('locationEntered', {
          packId: 'hub-navigation-vehicle', locationId: destination.id
        })
        if (destination.kind === 'interior' && vehicle.mounted) {
          vehicle = setMounted(vehicle, false)
          emit?.('vehicleDismounted', { packId: 'hub-navigation-vehicle' })
        }
      }
      return { location, vehicle } satisfies EvalState
    },

    complete: (state) => complete(state as EvalState),

    publishSlices: (state) => ({
      [LOCATION_SLICE_ID]: {
        currentLocationId: (state as EvalState).location.currentLocationId,
        visited: [...(state as EvalState).location.visited]
      },
      [VEHICLE_SLICE_ID]: { mounted: (state as EvalState).vehicle.mounted }
    })
  }
}
```

Add to `packages/pack-hub-navigation-vehicle/src/index.ts`:

```ts
export * from './evalHook'
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: PASS.

If `drive(4)` exceeds 4000 steps, the cause is the round trip between district and interiors: each interior needs an outbound walk plus a return. Raise the loop bound in the test rather than shortening the tour — the browser has no step budget, and the matrix's own 2000-step limit is addressed in Task 12.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-hub-navigation-vehicle
git commit -m "feat(pack-hub-navigation-vehicle): headless eval hook"
```

---

### Task 11: Editor contribution

**Files:**
- Create: `packages/pack-hub-navigation-vehicle/src/editorContribution.ts`
- Modify: `packages/pack-hub-navigation-vehicle/src/index.ts`
- Test: `packages/pack-hub-navigation-vehicle/tests/editorContribution.test.ts`

**Interfaces:**
- Consumes: `packConfigSchema`, `HubPackConfig` (Task 7).
- Produces: `hubNavigationVehicleEditorContribution: PackEditorContribution`. Task 12 registers it.

- [ ] **Step 1: Write the failing test**

Create `packages/pack-hub-navigation-vehicle/tests/editorContribution.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer, createSeededRng } from '@automata/engine'
import { composeHubSection } from '../src/composeSection'
import { packConfigSchema } from '../src/config'
import { hubNavigationVehicleEditorContribution } from '../src/editorContribution'

const config = () => packConfigSchema.parse(composeHubSection({
  specConfig: {},
  locations: [
    { id: 'harbor', name: 'Harbor', kind: 'district' },
    { id: 'vault', name: 'Vault', kind: 'interior' },
    { id: 'loft', name: 'Loft', kind: 'interior' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  occupied: []
}, createSeededRng(7)))

describe('hub editor contribution', () => {
  it('declares the pack id and ships no prefabs', () => {
    expect(hubNavigationVehicleEditorContribution.packId).toBe('hub-navigation-vehicle')
    expect(hubNavigationVehicleEditorContribution.prefabs).toEqual([])
  })

  it('previews the vehicle, every doorway, and every interior outline', () => {
    const render = createNullRenderer()
    const cfg = config()
    hubNavigationVehicleEditorContribution.createPreview!(cfg, render.port)
    // 1 vehicle + 4 doorways + 4 corner dots per interior (2 interiors)
    expect(render.port.objectCount).toBe(1 + cfg.doorways.length + 2 * 4)
  })

  it('cleans up after itself', () => {
    const render = createNullRenderer()
    const preview = hubNavigationVehicleEditorContribution.createPreview!(config(), render.port)
    preview.dispose()
    expect(render.port.objectCount).toBe(0)
  })
})
```

`createPreview` is **optional** on `PackEditorContribution` (`packages/game-kit/src/packEditor.ts:25`), so the `!` above is required or the test will not typecheck — the shipped `pack-economy-progression` test uses the same `createPreview!(...)` form. It returns a `PackPreviewHandle` with a required `dispose()` and an optional `render(alpha)`, so all three tests above are correct as written.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project pack-hub-navigation-vehicle editorContribution`
Expected: FAIL — cannot resolve `../src/editorContribution`.

- [ ] **Step 3: Implement the contribution**

Create `packages/pack-hub-navigation-vehicle/src/editorContribution.ts`, following `packages/pack-economy-progression/src/editorContribution.ts` exactly for the `PackEditorContribution` shape, `IDENTITY`, and the `dot` helper. Draw:

- one `VEHICLE` sphere at `config.vehicle.parkedAt`,
- one `DOORWAY` sphere at each `config.doorways[].at`,
- four `CORNER` dots per interior at its `bounds` corners.

```ts
import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const VEHICLE = { radius: 0.55, color: '#ffb347' }
const DOORWAY = { radius: 0.35, color: '#7ae7ff' }
const CORNER = { radius: 0.15, color: '#9bb0c9' }

/** Thin preview: the vehicle, every doorway, and each interior's footprint. */
export const hubNavigationVehicleEditorContribution: PackEditorContribution = {
  packId: 'hub-navigation-vehicle',
  prefabs: [],

  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities: Array<{ id: string }> = []
    const dot = (
      id: string, x: number, z: number, spec: { radius: number; color: string }
    ): void => {
      const entity = { id }
      entities.push(entity)
      render.add(entity, { primitive: 'sphere', radius: spec.radius, color: spec.color })
      render.setPose(entity, { x, y: spec.radius, z }, IDENTITY)
    }

    dot('hub-preview-vehicle', parsed.vehicle.parkedAt.x, parsed.vehicle.parkedAt.z, VEHICLE)
    for (const doorway of parsed.doorways) {
      dot(`hub-preview-door-${doorway.id}`, doorway.at.x, doorway.at.z, DOORWAY)
    }
    for (const location of parsed.locations) {
      if (location.kind !== 'interior') continue
      const { minX, maxX, minZ, maxZ } = location.bounds
      const corners: Array<[number, number]> = [
        [minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]
      ]
      corners.forEach(([x, z], index) => {
        dot(`hub-preview-${location.id}-corner-${index}`, x, z, CORNER)
      })
    }

    return {
      dispose() {
        for (const entity of entities) render.remove(entity)
        entities.length = 0
      }
    }
  }
}
```

Add to `packages/pack-hub-navigation-vehicle/src/index.ts`:

```ts
export * from './editorContribution'
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project pack-hub-navigation-vehicle`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-hub-navigation-vehicle
git commit -m "feat(pack-hub-navigation-vehicle): thin editor preview"
```

---

### Task 12: Register the pack and widen the composition matrix

**Files:**
- Modify: `packages/pack-registry/package.json` (add the dependency)
- Modify: `packages/pack-registry/src/index.ts` (four tables)
- Modify: `packages/pack-registry/tests/compositionMatrix.test.ts` (`SCENARIOS`, step budget)
- Test: `packages/pack-registry/tests/compositionMatrix.test.ts`

**Interfaces:**
- Consumes: `hubNavigationVehiclePack`, `composeHubSection`, `createHubNavigationVehicleEvalHook`, `hubNavigationVehicleEditorContribution`, `packConfigSchema` (Tasks 7-11).
- Produces: the pack visible to `resolvePacks`, `resolveEvalHooks`, and `resolveEditorContributions`.

- [ ] **Step 1: Add the workspace dependency**

In `packages/pack-registry/package.json`, add `"@automata/pack-hub-navigation-vehicle": "*"` to `dependencies`, then run `npm install` from the repo root.

- [ ] **Step 2: Write the failing test**

Append a scenario to `SCENARIOS` in `packages/pack-registry/tests/compositionMatrix.test.ts`:

```ts
    // Cycle 6: the pair loop already covers hub with each single pack. These
    // rows prove the vehicle-gated tour alongside district content, and the
    // full six-pack composition.
    ['hub-navigation-vehicle'],
    ['interaction-inventory', 'economy-progression', 'hub-navigation-vehicle'],
    [
      'interaction-inventory',
      'dialogue-quests',
      'schedules-relationships',
      'combat-ai',
      'economy-progression',
      'hub-navigation-vehicle'
    ]
```

Raise `driveToCompletion`'s `maxSteps` default from `2000` to `8000` — the hub tour walks a round trip per interior on top of every other pack's work.

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run --project pack-registry`
Expected: FAIL — `Unknown pack id "hub-navigation-vehicle"`, and the "every standard pack has a deterministic fixture" assertion.

- [ ] **Step 4: Register the pack in all four tables**

In `packages/pack-registry/src/index.ts`, add the import (alphabetically, after the economy import):

```ts
import {
  composeHubSection, createHubNavigationVehicleEvalHook,
  hubNavigationVehicleEditorContribution, hubNavigationVehiclePack,
  packConfigSchema as hubConfigSchema
} from '@automata/pack-hub-navigation-vehicle'
```

Add to `STANDARD_PACKS`:

```ts
  [hubNavigationVehiclePack.id]: hubNavigationVehiclePack as GamePack
```

Add the fixture after the economy fixture block:

```ts
PACK_FIXTURES[hubNavigationVehiclePack.id] = () => composeHubSection({
  specConfig: {},
  locations: [
    { id: 'harbor', name: 'Harbor', kind: 'district' },
    { id: 'vault', name: 'Vault', kind: 'interior' }
  ],
  arena: {
    half: 12,
    spawn: { x: -8, z: -8 },
    goal: { x: 6, z: 6 }
  },
  occupied: []
}, createSeededRng(46))
```

Add to `EVAL_HOOK_BUILDERS`:

```ts
  [hubNavigationVehiclePack.id]: (config) =>
    createHubNavigationVehicleEvalHook(hubConfigSchema.parse(config))
```

Add to `EDITOR_CONTRIBUTIONS`:

```ts
  [hubNavigationVehicleEditorContribution.packId]:
    hubNavigationVehicleEditorContribution
```

- [ ] **Step 5: Run the matrix**

Run: `npx vitest run --project pack-registry`
Expected: PASS — all six singles, every compatible pair, and the three new scenarios.

If a mixed scenario stalls, confirm the hub hook is last in `resolveEvalHooks` order (it is, because `composition.packs` follows compose order and the hub composes last). If a district pack's `nextTarget` keeps firing while the player is at interior coordinates, that pack is not complete yet — which means the hub started its tour early; check that `pendingDoorway` returns `null` once `complete` is true.

- [ ] **Step 6: Commit**

```bash
git add packages/pack-registry package.json package-lock.json
git commit -m "feat(pack-registry): register hub pack, widen matrix"
```

---

### Task 13: Thread the hub section through `composeGame`

**Files:**
- Modify: `packages/game-compose/package.json` (add the dependency)
- Modify: `packages/game-compose/src/compose.ts` (lines 5-9 imports, 31-44 supported set, 52-59 selected packs, and a new section after the economy block at line 174)
- Test: `packages/game-compose/tests/compose.test.ts`

**Interfaces:**
- Consumes: `hubNavigationVehiclePack`, `composeHubSection` (Tasks 8-9); the capability config from Task 4.
- Produces: the `compose-hub-missing-interior` issue code.

- [ ] **Step 1: Add the workspace dependency**

Add `"@automata/pack-hub-navigation-vehicle": "*"` to `packages/game-compose/package.json` dependencies, then `npm install` from the repo root.

- [ ] **Step 2: Write the failing test**

`packages/game-compose/tests/compose.test.ts` has three fixture helpers — `sliceSpec()`, `specWithCapabilities(capabilities)`, and `specWithAssets(assets)` (lines 7-33). **None of them can override `world.locations`**, which this task needs, so add a fourth helper next to them:

```ts
function specWithHub(locations: GameSpec['world']['locations']): GameSpec {
  return gameSpecSchema.parse({
    ...sliceSpec(),
    capabilities: [{ id: 'hub-navigation-vehicle', config: {}, requirements: [] }],
    world: { locations }
  })
}
```

Then append the tests:

```ts
describe('hub-navigation-vehicle composition', () => {
  const DISTRICT = { id: 'harbor', name: 'Harbor', kind: 'district' as const, description: 'The harbor.' }
  const INTERIOR = { id: 'vault', name: 'Vault', kind: 'interior' as const, description: 'A locked vault.' }

  it('fails with a typed finding when the spec declares no interior', async () => {
    const result = await composeGame({ spec: specWithHub([DISTRICT]), seed: 7, specHash: 'hash' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual([{
      code: 'compose-hub-missing-interior',
      message: 'Capability "hub-navigation-vehicle" requires at least one interior location; the spec declares none'
    }])
  })

  it('composes a hub section when an interior exists', async () => {
    const result = await composeGame({
      spec: specWithHub([DISTRICT, INTERIOR]), seed: 7, specHash: 'hash'
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.packIds).toContain('hub-navigation-vehicle')
  })

  it('leaves a hub-free composition unchanged across runs', async () => {
    const before = await composeGame({ spec: sliceSpec(), seed: 7, specHash: 'hash' })
    const after = await composeGame({ spec: sliceSpec(), seed: 7, specHash: 'hash' })
    expect(before).toEqual(after)
  })
})
```

`sliceSpec()` builds the `first-light` spec, whose sole capability is `interaction-inventory` — so the third test is the guard that adding the hub branch did not perturb an existing composition. `gameSpecSchema` and the `GameSpec` type are already imported at the top of the file.

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run --project game-compose`
Expected: FAIL — `compose-unsupported-capability` is returned instead.

- [ ] **Step 4: Thread the section**

In `packages/game-compose/src/compose.ts`, add the import after the economy import (line 7):

```ts
import { composeHubSection, hubNavigationVehiclePack } from '@automata/pack-hub-navigation-vehicle'
```

Add to the `supported` set (line 31-34):

```ts
    combatAiPack.id, economyProgressionPack.id, hubNavigationVehiclePack.id
```

Update the "Phase 4 cycle 5 composes only" message to say `Phase 4 cycle 6`.

Add the `wants` flag alongside the others (line 49):

```ts
  const wantsHub = spec.capabilities.some((entry) => entry.id === hubNavigationVehiclePack.id)
```

Add to the `selectedPacks` flatMap (before the trailing `return []`):

```ts
    if (entry.id === hubNavigationVehiclePack.id) return [hubNavigationVehiclePack]
```

Add the interior precondition immediately after the `packIssues` early return (line 63), so it fails before any asset generation work:

```ts
  if (wantsHub && !spec.world.locations.some((location) => location.kind === 'interior')) {
    return {
      ok: false,
      issues: [{
        code: 'compose-hub-missing-interior',
        message: `Capability "${hubNavigationVehiclePack.id}" requires at least one interior location; the spec declares none`
      }]
    }
  }
```

Add the section **last**, immediately after the economy block closes (line 174) and before `const composition: CompositionManifest = {`:

```ts
  if (wantsHub) {
    const hubSelection = spec.capabilities.find(
      (entry) => entry.id === hubNavigationVehiclePack.id
    )!
    const hubConfig = composeHubSection({
      specConfig: hubSelection.config as {
        vehicleSpeedMultiplier?: number
        doorwayRadius?: number
      },
      locations: spec.world.locations.map(({ id, name, kind }) => ({ id, name, kind })),
      arena: { half: ARENA.half, spawn: ARENA.spawn, goal },
      occupied: [
        ...(dialogueConfig?.npcs.map((npc) => npc.position) ?? []),
        ...(schedulesConfig?.walkers.flatMap((walker) => walker.stations) ?? []),
        ...(combatConfig?.enemies.map((enemy) => enemy.post) ?? [])
      ]
    }, rng)
    packs.push({
      id: hubNavigationVehiclePack.id,
      version: hubNavigationVehiclePack.version,
      config: hubConfig as unknown as Record<string, unknown>
    })
  }
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run --project game-compose`
Expected: PASS.

- [ ] **Step 6: Confirm first-light still recomposes bit-identically**

Run: `npx vitest run --project first-light --project game-compose --project pack-registry`
Expected: PASS. first-light selects no hub capability, so `wantsHub` is false and the RNG stream is untouched.

- [ ] **Step 7: Commit**

```bash
git add packages/game-compose package.json package-lock.json
git commit -m "feat(game-compose): thread hub-navigation-vehicle into compose"
```

---

### Task 14: Location-driven clamp and camera in the scaffold template

**Files:**
- Modify: `tools/scaffold/src/templates/srcFiles.ts` (`simTs` lines 17-67, `gameplayTs` lines 71-136, `mainTs` lines 168-216)
- Modify: `tools/scaffold/src/templates/testFiles.ts` (the `SimTuning` fixture on line 7)
- Modify: `games/first-light/src/main.ts:61` and its `src/sim`/`src/game` copies if the game does not re-import from the template
- Test: `tools/scaffold/tests/` (the template snapshot/compile tests), plus `npm run verify:new-game`

**Interfaces:**
- Consumes: `ResolvedWorldEffects`, `WorldBounds` (Task 1).
- Produces: `SimWorld`, `step(state, control, dt, tuning, world?)`, `GameplayDeps.worldEffects`.

- [ ] **Step 1: Write the failing test**

Append to `tools/scaffold/src/templates/testFiles.ts`'s generated sim test (the string this function returns), so every scaffolded game gets it:

```ts
  it('clamps to world bounds when a pack supplies them', () => {
    const world = { bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }, speedMultiplier: 1, teleport: null }
    const state = { position: { x: 0, z: 0 }, elapsedS: 0, status: 'running' as const }
    const next = step(state, { x: 1, z: 0 }, 1, tuning, world)
    expect(next.position.x).toBe(2)
  })

  it('scales speed and applies a teleport before moving', () => {
    const state = { position: { x: 0, z: 0 }, elapsedS: 0, status: 'running' as const }
    const teleported = step(state, { x: 0, z: 0 }, 1 / 60, tuning, {
      bounds: null, speedMultiplier: 1, teleport: { x: 5, z: 5 }
    })
    expect(teleported.position).toEqual({ x: 5, z: 5 })

    const fast = step(state, { x: 1, z: 0 }, 1 / 60, tuning, {
      bounds: null, speedMultiplier: 2, teleport: null
    })
    const normal = step(state, { x: 1, z: 0 }, 1 / 60, tuning)
    expect(fast.position.x).toBeCloseTo(normal.position.x * 2)
  })
```

- [ ] **Step 2: Regenerate a game and run its tests to see the failure**

Run: `npm run new-game hubcheck && npx vitest run --project hubcheck`
Expected: FAIL — `step` accepts four arguments.

- [ ] **Step 3: Make the sim world-aware**

In `tools/scaffold/src/templates/srcFiles.ts`, inside `simTs()`'s template string, add after the `SimControl` interface:

```ts
/** Resolved pack world effects, sampled once per fixed step. */
export interface SimWorld {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null
  speedMultiplier: number
  teleport: { x: number; z: number } | null
}
```

Replace the `clamp` helper and `step`:

```ts
const clampTo = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Advance one fixed step. Pure and deterministic: no clocks, RNG, or DOM. */
export function step(
  state: SimState, control: SimControl, dt: number, tuning: SimTuning, world?: SimWorld
): SimState {
  if (state.status !== 'running') return state
  const bounds = world?.bounds ?? {
    minX: -tuning.arenaHalf, maxX: tuning.arenaHalf,
    minZ: -tuning.arenaHalf, maxZ: tuning.arenaHalf
  }
  // A pack teleport wins outright: it repositions before any control is applied.
  const from = world?.teleport ?? state.position
  const magnitude = Math.hypot(control.x, control.z)
  const base = tuning.moveSpeed * (world?.speedMultiplier ?? 1)
  const speed = magnitude > 1 ? base / magnitude : base
  const moved = world?.teleport
    ? { x: from.x, z: from.z }
    : { x: from.x + control.x * speed * dt, z: from.z + control.z * speed * dt }
  const position = {
    x: clampTo(moved.x, bounds.minX, bounds.maxX),
    z: clampTo(moved.z, bounds.minZ, bounds.maxZ)
  }
  const elapsedS = state.elapsedS + dt
  const distance = Math.hypot(tuning.goal.x - position.x, tuning.goal.z - position.z)
  const status = distance <= tuning.goalRadius ? 'succeeded' : elapsedS >= tuning.timeLimitS ? 'failed' : 'running'
  return { position, elapsedS, status }
}
```

- [ ] **Step 4: Make gameplay sample the effects and reframe the camera**

In `gameplayTs()`, add to `GameplayDeps`:

```ts
  /** Resolved pack world effects from the previous fixed step. */
  worldEffects?: () => SimWorld
```

Import `SimWorld` alongside the other sim imports in that template string. In `createGameplay`, replace the `fixedUpdate` body and track the active bounds:

```ts
  let framedBounds: string | null = null
  const frameCamera = (bounds: SimWorld['bounds']): void => {
    const box = bounds ?? {
      minX: -tuning.arenaHalf, maxX: tuning.arenaHalf,
      minZ: -tuning.arenaHalf, maxZ: tuning.arenaHalf
    }
    const key = \`\${box.minX},\${box.maxX},\${box.minZ},\${box.maxZ}\`
    if (key === framedBounds) return
    framedBounds = key
    const centerX = (box.minX + box.maxX) / 2
    const centerZ = (box.minZ + box.maxZ) / 2
    const extent = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2
    render.setCamera(
      { x: centerX, y: extent * 1.5, z: centerZ + extent * 1.9 },
      { x: centerX, y: 0, z: centerZ }
    )
  }
  frameCamera(null)
```

Delete the old `render.setCamera(...)` call on line 115 — `frameCamera(null)` replaces it and produces identical values when `arenaHalf` is centred at the origin.

```ts
    fixedUpdate(dt) {
      const world = deps.worldEffects?.()
      let next = step(state, deps.control(state), dt, tuning, world)
      if (next.status === 'succeeded' && deps.objectiveGate && !deps.objectiveGate()) {
        next = { ...next, status: 'running' }
      }
      state = next
      frameCamera(world?.bounds ?? null)
    },
```

- [ ] **Step 5: Feed the resolved effects back in `mainTs`**

In `mainTs()`, before `const game = createGameplay({...})`:

```ts
    let world = { bounds: null, speedMultiplier: 1, teleport: null }
```

Add `worldEffects: () => world` to the `createGameplay` argument object, and replace the `fixedUpdate` in `startGameLoop`:

```ts
      fixedUpdate: (dt) => {
        game.fixedUpdate(dt)
        const resolved = runtime.fixedUpdate(dt, { playerPosition: { x: game.state.position.x, z: game.state.position.z } })
        // The game steps before the runtime, so effects apply on the next tick.
        world = { bounds: resolved.bounds, speedMultiplier: resolved.speedMultiplier, teleport: resolved.teleport }
        hud.textContent = STATUS_TEXT[game.state.status]
      },
```

Apply the same three edits to `games/first-light/src/main.ts`, `games/first-light/src/sim/sim.ts`, and `games/first-light/src/game/gameplay.ts` — first-light was scaffolded from this template and carries its own copies.

- [ ] **Step 6: Run the scaffold acceptance**

Run: `npx vitest run --project hubcheck --project first-light --project scaffold`
Expected: PASS.

Run: `npm run verify:new-game`
Expected: PASS.

- [ ] **Step 7: Remove the throwaway game and commit**

```bash
rm -rf games/hubcheck
git add tools/scaffold games/first-light package.json package-lock.json
git commit -m "feat(scaffold): location-driven clamp and camera from world effects"
```

Confirm `git status` is clean of `games/hubcheck` before committing; `npm run new-game` also touches `package-lock.json`.

---

### Task 15: Full gates and ship documentation

**Files:**
- Modify: `docs/ROADMAP.md` (§1 Shipped, §3 Phase 4 cycles list)
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` (§3 phase-map Phase 4 row, §5 Phase 4 list)
- Modify: `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md` (§9 capability-gap log)
- Modify: this plan (check every box)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: nothing.

- [ ] **Step 1: Run the full gates**

```bash
npm run ci
npm run coverage
npm run verify:new-game
```

Expected: all PASS. Fix anything red before continuing — do not proceed to the docs step with a failing gate.

- [ ] **Step 2: Strike the closed gap and append the new ones**

In `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md` §9, delete the `**Cycle 4 — pack-initiated player teleport.**` bullet and append:

```markdown
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
```

- [ ] **Step 3: Update the roadmap**

In `docs/ROADMAP.md` §3 Phase 4 cycles, change the cycle 6 line to:

```markdown
  - Cycle 6 — compact-hub navigation + one vehicle pack — `Shipped` (2026-07-31, plan:
    [`2026-07-31-phase-4-cycle-6-hub-navigation-vehicle.md`](superpowers/plans/active/2026-07/week-31/2026-07-31-phase-4-cycle-6-hub-navigation-vehicle.md)).
```

Change cycle 7 from `Planned` to `Next`. Add a Phase 4 entry at the top of §1 Shipped only when the whole phase ships — cycle 7 still remains, so **do not** move Phase 4 to Shipped.

- [ ] **Step 4: Update the decomposition counters**

In `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`: bump the §3 phase-map Phase 4 row from `5 of 7 completed (2026-07-28)` to `6 of 7 completed (2026-07-31)`, and mark item 6 (`Compact-hub navigation + one vehicle pack`) completed in the §5 Phase 4 list.

- [ ] **Step 5: Check every box in this plan**

Every `- [ ]` above must be `- [x]`.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: mark Phase 4 cycle 6 (hub navigation + vehicle) shipped"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3 effects sink, resolution rules, write-only rationale | Task 1 |
| §3 eval-harness mirror | Task 2 |
| §3 combat-ai respawn rider; cycle-4 gap struck | Tasks 3, 15 |
| §4.1 capability config | Task 4 |
| §4.1 compiled pack config distinct from capability config | Task 7 |
| §4.2 world model, bounds, entry anchors, camera reframe | Tasks 5, 8, 9, 14 |
| §4.3 gated crossing, minimum-spec exercise | Tasks 5, 7, 8, 9, 10 |
| §4.4 vehicle mount/dismount, speed, auto-dismount | Tasks 6, 9, 10 |
| §4.5 slices, events, compatibility, objectives, persistence | Tasks 7, 9 |
| §4.6 compose last, `compose-hub-missing-interior`, four-interior cap | Tasks 8, 13 |
| §5 scaffold template | Task 14 |
| §6 registry, matrix, scenarios, negative coverage, gates | Tasks 12, 15 |
| §7 editor | Task 11 |
| §8 exit criteria | Task 15 |
| §9 gap log | Task 15 |
| §11 docs on ship | Task 15 |

**Deliberate deviations from the spec, recorded here:**

- Spec §3 says `PackWorldState` "gains" `effects`. The plan splits `WorldSnapshot` (what the game passes) from `PackWorldState` (what packs receive). This is strictly better: `games/first-light/src/main.ts:61` and the scaffold template keep passing `{ playerPosition }` with no change, and only the six pack test files that call `handle.fixedUpdate` directly need the `worldState()` helper. Fold this refinement back into the spec on ship.
- Spec §4.2 implies the camera follows bounds continuously. The plan reframes only when the bounds key changes, so a static district costs one `setCamera` call at boot — identical to today's behavior.
- The one-tick latency between a pack writing an effect and the game applying it is inherent to the existing loop order (`game.fixedUpdate` then `runtime.fixedUpdate`). It is documented in Task 14 Step 5 rather than reordered, because reordering would change every existing game's frame semantics.

**Placeholder scan:** none. Every code step carries complete, runnable code. An audit pass (2026-08-01) resolved the three spots that previously deferred to a sibling file, pinning each against the real source: Task 3 uses `config()` at `pack-combat-ai/tests/pack.test.ts:10` and calls out that its hand-written literal needs the new `spawn` field; Task 11 uses `createPreview!(...)` because `PackEditorContribution.createPreview` is optional (`game-kit/src/packEditor.ts:25`) and returns a `PackPreviewHandle` with a required `dispose()`; Task 13 adds a `specWithHub` helper because none of `compose.test.ts`'s three existing fixtures can override `world.locations`.

**Command audit:** every test command uses `npx vitest run --project <directory-name>`, verified against this repo — `--project pack-economy-progression` passes, `--project @automata/pack-economy-progression` fails with "No projects matched the filter". Root gates are `npm run ci`, `npm run coverage`, `npm run verify:new-game`.

**Type consistency:** `PackWorldEffects`, `ResolvedWorldEffects`, `WorldBounds`, `WorldEffectIssue`, `createWorldEffectsSink`, `LOCATION_SLICE_ID` are defined once in Task 1 and imported identically in Tasks 2, 3, 9, 10, 14. `LOCATION_SLICE_ID` is `'location'` in both `game-kit/src/worldEffects.ts` and `pack-hub-navigation-vehicle/src/config.ts` — deliberately duplicated per the no-pack-imports rule, and Task 7's doc comment says so. `HubPackConfig`, `packConfigSchema`, `parseSavedHub`, `MAX_INTERIORS` come from Task 7 and are used unchanged in Tasks 8-13. `composeHubSection(input, rng)`, `createHubNavigationVehicleEvalHook(config)`, `hubNavigationVehiclePack`, and `hubNavigationVehicleEditorContribution` have the same signatures in their defining task and in Tasks 12 and 13. The pack `id` `'hub-navigation-vehicle'` and `version` `'1.0.0'` are consistent across Tasks 9, 10, 11, 12, 13.

**Ordering note:** Tasks 4-11 touch only new files plus one contracts line and can be reordered freely. Tasks 1-2 must precede 3, 9, 10, 12, 14. Task 12 must precede 13 (compose resolves packs the registry knows). Task 15 is last.
