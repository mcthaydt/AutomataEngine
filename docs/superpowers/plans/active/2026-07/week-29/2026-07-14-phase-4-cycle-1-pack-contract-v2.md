# Phase 4 Cycle 1 — Pack Contract v2 + interaction-inventory Widening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land capability-pack contract v2 (compatibility declarations, shared state slices, typed events, persistence slot), widen `pack-interaction-inventory` to the full Phase 4 pack template, and stand up the composition-matrix harness — per the [Phase 4 umbrella spec](/docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md).

**Architecture:** All contract-v2 machinery lives in `@automata/game-kit` (`packs.ts` + two new leaf modules); packs stay leafward of the registry; the editor-contribution seam is typed in game-kit so packs never depend on `@automata/editor`. `composePacks` keeps its call signature — games and the scaffold `main.ts` template are untouched at runtime. The editor preview becomes composition-aware through the existing `EditorRegistrationLoader(deps)` reader, not through new plumbing.

**Tech Stack:** TypeScript, zod v4 via `@automata/project` re-export (pack/game code) , vitest, npm workspaces.

**Progress:** 100% (9/9 tasks complete)

## Global Constraints

- Work from the repo root; never edit root `package.json` or `playwright.config.ts` per game (AGENTS.md registry convention).
- TDD: each behavior change adds/updates a focused failing test before implementation.
- Pack/game/editor code imports `z` only via `@automata/project` re-export (lint enforces this); `packages/contracts` imports `zod` directly (it is the schema leaf).
- `games/first-light` checked-in composed files must keep passing the compose-parity test (`games/first-light/tests/project/composition.test.ts`); this plan must not change `composeGame` *output files*.
- The `interaction-inventory` pack `version` stays `'1.0.0'` — the config schema does not change, and the version string is baked into the checked-in `composition.json`.
- Run `npm run ci` before claiming done; run `npm run verify:new-game` after any scaffold-template change.
- Mark each step off in this document as it completes; make every commit listed.
- Parallel-safety with the Phase 5 cycle-1 plan: this plan must not touch `packages/contracts/src/assetManifest.ts` or `games/first-light/public/assets/assets.json`. Shared files, all in distinct regions (merge, don't overwrite): `packages/game-compose/src/compose.ts` (this plan: capability-selection region only; Phase 5: asset section only), `packages/game-compose/tests/compose.test.ts` (this plan appends one test; Phase 5 edits asset assertions), and the closeout docs (`docs/ROADMAP.md` §3 — this plan owns the Phase 4 section; decomposition design §5 — this plan owns the Phase 4 block).

---

### Task 1: Typed pack event bus

**Files:**
- Create: `packages/game-kit/src/packEvents.ts`
- Test: `packages/game-kit/tests/packEvents.test.ts`
- Modify: `packages/game-kit/src/index.ts` (add export)

**Interfaces:**
- Consumes: nothing.
- Produces: `PackEventBus { emit(name: string, payload: unknown): void; on(name: string, handler: (payload: unknown) => void): () => void }` and `createPackEventBus(): PackEventBus` — Task 3 puts a bus on `PackBootContext`; Task 5's pack emits `'itemAcquired'` on it.

- [x] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/packEvents.test.ts
import { describe, expect, it } from 'vitest'
import { createPackEventBus } from '../src/packEvents'

describe('createPackEventBus (pack contract v2)', () => {
  it('delivers a payload to every subscriber of that event, in subscription order', () => {
    const bus = createPackEventBus()
    const seen: string[] = []
    bus.on('itemAcquired', (payload) => seen.push(`a:${(payload as { itemId: string }).itemId}`))
    bus.on('itemAcquired', (payload) => seen.push(`b:${(payload as { itemId: string }).itemId}`))
    bus.emit('itemAcquired', { itemId: 'item-1' })
    expect(seen).toEqual(['a:item-1', 'b:item-1'])
  })

  it('does not deliver to other event names or after unsubscribe', () => {
    const bus = createPackEventBus()
    const seen: string[] = []
    const off = bus.on('questCompleted', () => seen.push('quest'))
    bus.emit('itemAcquired', { itemId: 'item-1' })
    expect(seen).toEqual([])
    off()
    bus.emit('questCompleted', {})
    expect(seen).toEqual([])
  })

  it('emitting with no subscribers is a no-op', () => {
    expect(() => createPackEventBus().emit('anything', null)).not.toThrow()
  })

  it('a handler subscribed during an emit is not called for that emit', () => {
    const bus = createPackEventBus()
    const seen: string[] = []
    bus.on('e', () => {
      seen.push('first')
      bus.on('e', () => seen.push('late'))
    })
    bus.emit('e', null)
    expect(seen).toEqual(['first'])
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-kit/tests/packEvents.test.ts`
Expected: FAIL — `Cannot find module '../src/packEvents'` (or equivalent resolve error).

- [x] **Step 3: Write the implementation**

```ts
// packages/game-kit/src/packEvents.ts
/**
 * Typed pack event bus (pack contract v2): the only integration channel
 * between packs — direct pack→pack imports stay forbidden. Synchronous
 * fan-out in subscription order; event names and payload shapes are part of
 * each pack's public contract, listed in its compatibility declaration.
 */
export type PackEventHandler = (payload: unknown) => void

export interface PackEventBus {
  emit(name: string, payload: unknown): void
  /** Subscribe; returns an unsubscribe function. */
  on(name: string, handler: PackEventHandler): () => void
}

export function createPackEventBus(): PackEventBus {
  const handlers = new Map<string, Set<PackEventHandler>>()
  return {
    emit(name, payload) {
      const set = handlers.get(name)
      if (!set) return
      for (const handler of [...set]) handler(payload)
    },
    on(name, handler) {
      const set = handlers.get(name) ?? new Set<PackEventHandler>()
      handlers.set(name, set)
      set.add(handler)
      return () => { set.delete(handler) }
    }
  }
}
```

Add to `packages/game-kit/src/index.ts` (alongside the existing `packs` export line):

```ts
export * from './packEvents'
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/game-kit/tests/packEvents.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add packages/game-kit/src/packEvents.ts packages/game-kit/tests/packEvents.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): typed pack event bus for contract v2"
```

---

### Task 2: Shared state-slice registry

**Files:**
- Create: `packages/game-kit/src/packState.ts`
- Test: `packages/game-kit/tests/packState.test.ts`
- Modify: `packages/game-kit/src/index.ts` (add export)

**Interfaces:**
- Consumes: nothing.
- Produces: `PackStateRegistry { register(sliceId, ownerPackId, initial): void; has(sliceId): boolean; get(sliceId): unknown; set(sliceId, writerPackId, value): void; snapshot(): Record<string, unknown> }` and `createPackStateRegistry(): PackStateRegistry` — Task 3 puts a registry on `PackBootContext`; Task 5's pack owns the `'inventory'` slice.

- [x] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/packState.test.ts
import { describe, expect, it } from 'vitest'
import { createPackStateRegistry } from '../src/packState'

describe('createPackStateRegistry (pack contract v2)', () => {
  it('registers a slice with an owner and initial value, readable by anyone', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', { collected: [] })
    expect(state.has('inventory')).toBe(true)
    expect(state.get('inventory')).toEqual({ collected: [] })
  })

  it('only the owning pack may write', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', { collected: [] })
    state.set('inventory', 'interaction-inventory', { collected: ['item-1'] })
    expect(state.get('inventory')).toEqual({ collected: ['item-1'] })
    expect(() => state.set('inventory', 'dialogue-quests', { collected: [] }))
      .toThrow(/cannot write slice "inventory"/)
  })

  it('rejects double registration and unknown slices', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', null)
    expect(() => state.register('inventory', 'other-pack', null))
      .toThrow(/already owned by "interaction-inventory"/)
    expect(() => state.get('wallet')).toThrow(/Unknown state slice "wallet"/)
    expect(() => state.set('wallet', 'economy-progression', 0)).toThrow(/Unknown state slice "wallet"/)
    expect(state.has('wallet')).toBe(false)
  })

  it('snapshot returns every slice keyed by slice id', () => {
    const state = createPackStateRegistry()
    state.register('inventory', 'interaction-inventory', { collected: ['item-1'] })
    state.register('questLog', 'dialogue-quests', { active: [] })
    expect(state.snapshot()).toEqual({ inventory: { collected: ['item-1'] }, questLog: { active: [] } })
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-kit/tests/packState.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

```ts
// packages/game-kit/src/packState.ts
/**
 * Shared world-state slice registry (pack contract v2). Packs contribute
 * named slices; the registering pack is the sole writer, any pack may read.
 * Ownership is declared in the pack's compatibility block and enforced here —
 * cross-pack reads go through the registry, never through pack imports.
 */
export interface PackStateRegistry {
  register(sliceId: string, ownerPackId: string, initial: unknown): void
  has(sliceId: string): boolean
  get(sliceId: string): unknown
  set(sliceId: string, writerPackId: string, value: unknown): void
  /** Every slice keyed by slice id (persistence and diagnostics). */
  snapshot(): Record<string, unknown>
}

export function createPackStateRegistry(): PackStateRegistry {
  const slices = new Map<string, { owner: string; value: unknown }>()
  const require = (sliceId: string): { owner: string; value: unknown } => {
    const slice = slices.get(sliceId)
    if (!slice) throw new Error(`Unknown state slice "${sliceId}"`)
    return slice
  }
  return {
    register(sliceId, ownerPackId, initial) {
      const existing = slices.get(sliceId)
      if (existing) throw new Error(`State slice "${sliceId}" already owned by "${existing.owner}"`)
      slices.set(sliceId, { owner: ownerPackId, value: initial })
    },
    has: (sliceId) => slices.has(sliceId),
    get: (sliceId) => require(sliceId).value,
    set(sliceId, writerPackId, value) {
      const slice = require(sliceId)
      if (slice.owner !== writerPackId) {
        throw new Error(`Pack "${writerPackId}" cannot write slice "${sliceId}" owned by "${slice.owner}"`)
      }
      slice.value = value
    },
    snapshot: () => Object.fromEntries([...slices].map(([id, slice]) => [id, slice.value]))
  }
}
```

Add to `packages/game-kit/src/index.ts`:

```ts
export * from './packState'
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/game-kit/tests/packState.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add packages/game-kit/src/packState.ts packages/game-kit/tests/packState.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): shared state-slice registry for contract v2"
```

---

### Task 3: Contract v2 in `packs.ts` — compatibility, validation, boot context, persistence

**Files:**
- Modify: `packages/game-kit/src/packs.ts` (whole-file rewrite below)
- Test: `packages/game-kit/tests/packs.test.ts` (update + extend)

**Interfaces:**
- Consumes: `createPackEventBus` (Task 1), `createPackStateRegistry` (Task 2).
- Produces (later tasks and Phase 4 cycles rely on these exact names):
  - `PackCompatibility { requires; conflictsWith; integratesWith; stateSlices: { owns; reads }; events: { emits; consumes } }` (all `readonly string[]`)
  - `packCompatibility(partial?: Partial<PackCompatibility>): PackCompatibility` — fills empty arrays
  - `GamePack` gains **required** `compatibility: PackCompatibility`
  - `PackBootContext` gains `events: PackEventBus; state: PackStateRegistry`
  - `PackBootBase { host: GameHost; render: RenderPort }` — what `ComposedPacks.boot` now takes (games pass `{ host, render }` exactly as before)
  - `PackRuntimeHandle` gains `saveState?(): unknown; loadState?(state: unknown): void`
  - `ComposedRuntime` gains `saveState(): Record<string, unknown>` (keyed by pack id) and `loadState(saved: Record<string, unknown>): void`
  - `PackSetIssue { severity: 'error' | 'warning'; code: 'pack-duplicate-id' | 'pack-missing-requirement' | 'pack-conflict' | 'pack-duplicate-slice-owner' | 'pack-event-unproduced'; packId: string; message: string }`
  - `validatePackSet(packs: readonly GamePack[]): PackSetIssue[]`
  - `PackCompositionError extends Error { issues: PackSetIssue[] }` — thrown by `composePacks` when any error-severity issue exists

- [x] **Step 1: Update existing tests and add the new failing tests**

Rewrite `packages/game-kit/tests/packs.test.ts` to:

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost } from '../src/host'
import {
  composePacks, packCompatibility, PackCompositionError, validatePackSet,
  type GamePack, type PackBootBase, type PackRuntimeHandle
} from '../src/packs'

function base(): PackBootBase {
  const app = document.createElement('div')
  document.body.append(app)
  return { host: createGameHost(app), render: createNullRenderer().port }
}

const makePack = (id: string, overrides: Partial<GamePack> = {}): GamePack => ({
  id, version: '1.0.0', compatibility: packCompatibility(), register: () => {}, ...overrides
})

describe('validatePackSet (pack contract v2)', () => {
  it('accepts a self-consistent set with no issues', () => {
    expect(validatePackSet([makePack('a'), makePack('b')])).toEqual([])
  })

  it('flags duplicate pack ids as errors', () => {
    const issues = validatePackSet([makePack('a'), makePack('a')])
    expect(issues).toEqual([expect.objectContaining({ severity: 'error', code: 'pack-duplicate-id', packId: 'a' })])
  })

  it('flags unmet requires and present conflicts as errors', () => {
    const needsB = makePack('a', { compatibility: packCompatibility({ requires: ['b'] }) })
    const hatesC = makePack('d', { compatibility: packCompatibility({ conflictsWith: ['c'] }) })
    expect(validatePackSet([needsB])).toEqual([
      expect.objectContaining({ severity: 'error', code: 'pack-missing-requirement', packId: 'a' })
    ])
    expect(validatePackSet([hatesC, makePack('c')])).toEqual([
      expect.objectContaining({ severity: 'error', code: 'pack-conflict', packId: 'd' })
    ])
  })

  it('flags duplicate slice ownership as an error', () => {
    const a = makePack('a', { compatibility: packCompatibility({ stateSlices: { owns: ['inventory'], reads: [] } }) })
    const b = makePack('b', { compatibility: packCompatibility({ stateSlices: { owns: ['inventory'], reads: [] } }) })
    expect(validatePackSet([a, b])).toEqual([
      expect.objectContaining({ severity: 'error', code: 'pack-duplicate-slice-owner', packId: 'b' })
    ])
  })

  it('flags consumed events nobody emits as warnings', () => {
    const consumer = makePack('a', { compatibility: packCompatibility({ events: { emits: [], consumes: ['itemAcquired'] } }) })
    expect(validatePackSet([consumer])).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'pack-event-unproduced', packId: 'a' })
    ])
    const emitter = makePack('b', { compatibility: packCompatibility({ events: { emits: ['itemAcquired'], consumes: [] } }) })
    expect(validatePackSet([consumer, emitter])).toEqual([])
  })
})

describe('composePacks (pack contract v2)', () => {
  it('throws PackCompositionError carrying error-severity issues', () => {
    const pack = makePack('a')
    try {
      composePacks([pack, { ...pack }])
      throw new Error('expected composePacks to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(PackCompositionError)
      expect((error as PackCompositionError).issues[0]!.code).toBe('pack-duplicate-id')
    }
  })

  it('composes despite warning-severity issues', () => {
    const consumer = makePack('a', { compatibility: packCompatibility({ events: { emits: [], consumes: ['x'] } }) })
    expect(() => composePacks([consumer])).not.toThrow()
  })

  it('boots in declaration order, parses configs, and returns an aggregated runtime', () => {
    const calls: string[] = []
    const make = (id: string, complete: boolean): GamePack<{ tag: string }> => ({
      id, version: '1.0.0', compatibility: packCompatibility(),
      configSchema: { parse: (input) => { calls.push(`parse:${id}`); return input as { tag: string } } },
      register(_ctx, config): PackRuntimeHandle {
        calls.push(`register:${id}:${config.tag}`)
        return {
          fixedUpdate: (dt) => calls.push(`fixed:${id}:${dt}`),
          render: (alpha) => calls.push(`render:${id}:${alpha}`),
          objectivesComplete: () => complete
        }
      }
    })
    const runtime = composePacks([make('a', true), make('b', false)], { a: { tag: 'x' }, b: { tag: 'y' } }).boot(base())
    expect(runtime.packIds).toEqual(['a', 'b'])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 0, z: 0 } })
    runtime.render(0.5)
    expect(calls).toEqual([
      'parse:a', 'register:a:x', 'parse:b', 'register:b:y',
      'fixed:a:0.016', 'fixed:b:0.016', 'render:a:0.5', 'render:b:0.5'
    ])
    expect(runtime.objectivesComplete()).toBe(false)
  })

  it('gives every pack the same event bus and state registry', () => {
    const seen: unknown[] = []
    const owner = makePack('a', {
      register: (ctx) => {
        ctx.state.register('inventory', 'a', { collected: ['item-1'] })
        ctx.events.on('ping', (payload) => seen.push(payload))
        return {}
      }
    })
    const reader = makePack('b', {
      register: (ctx) => {
        seen.push(ctx.state.get('inventory'))
        ctx.events.emit('ping', 'from-b')
        return {}
      }
    })
    composePacks([owner, reader]).boot(base())
    expect(seen).toEqual([{ collected: ['item-1'] }, 'from-b'])
  })

  it('aggregates saveState/loadState by pack id, skipping packs without the slot', () => {
    let loaded: unknown = null
    const saver = makePack('a', {
      register: () => ({ saveState: () => ({ collected: ['item-1'] }), loadState: (state) => { loaded = state } })
    })
    const plain = makePack('b', { register: () => ({}) })
    const runtime = composePacks([saver, plain]).boot(base())
    expect(runtime.saveState()).toEqual({ a: { collected: ['item-1'] } })
    runtime.loadState({ a: { collected: ['item-2'] }, ignored: true })
    expect(loaded).toEqual({ collected: ['item-2'] })
  })

  it('treats packs without a gate as vacuously complete and defers dispose onto the host stack', () => {
    let disposed = 0
    const pack = makePack('a', { register: () => ({ dispose: () => { disposed += 1 } }) })
    const ctx = base()
    const runtime = composePacks([pack]).boot(ctx)
    expect(runtime.objectivesComplete()).toBe(true)
    ctx.host.dispose()
    expect(disposed).toBe(1)
  })

  it('composing zero packs yields an inert, vacuously complete runtime', () => {
    const runtime = composePacks([]).boot(base())
    expect(runtime.packIds).toEqual([])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 1, z: 2 } })
    runtime.render(0)
    expect(runtime.objectivesComplete()).toBe(true)
    expect(runtime.saveState()).toEqual({})
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-kit/tests/packs.test.ts`
Expected: FAIL — `packCompatibility`, `validatePackSet`, `PackCompositionError`, `PackBootBase` not exported.

- [x] **Step 3: Rewrite `packages/game-kit/src/packs.ts`**

```ts
import type { RenderPort } from '@automata/engine'
import type { GameHost } from './host'
import { createPackEventBus, type PackEventBus } from './packEvents'
import { createPackStateRegistry, type PackStateRegistry } from './packState'

/**
 * The capability-pack interface v2 (factory Phase 4). Packs register against a
 * boot context and hand back a runtime handle; the composed runtime is driven
 * by the game loop. Player state flows IN as an argument, win-gating flows OUT
 * via objectivesComplete. v2 adds the shared seam: compatibility declarations
 * validated at compose time, named state slices (sole-writer), a typed event
 * bus, and an optional persistence slot the save/load pack later orchestrates.
 */
export interface PackCompatibility {
  requires: readonly string[]
  conflictsWith: readonly string[]
  integratesWith: readonly string[]
  stateSlices: { owns: readonly string[]; reads: readonly string[] }
  events: { emits: readonly string[]; consumes: readonly string[] }
}

/** Fill an empty declaration; packs override only what they use. */
export function packCompatibility(partial: Partial<PackCompatibility> = {}): PackCompatibility {
  return {
    requires: partial.requires ?? [],
    conflictsWith: partial.conflictsWith ?? [],
    integratesWith: partial.integratesWith ?? [],
    stateSlices: { owns: partial.stateSlices?.owns ?? [], reads: partial.stateSlices?.reads ?? [] },
    events: { emits: partial.events?.emits ?? [], consumes: partial.events?.consumes ?? [] }
  }
}

/** What games hand to boot — unchanged from v1, so main.ts templates stay put. */
export interface PackBootBase {
  host: GameHost
  render: RenderPort
}

export interface PackBootContext extends PackBootBase {
  events: PackEventBus
  state: PackStateRegistry
}

export interface PackWorldState {
  playerPosition: { x: number; z: number }
}

export interface PackRuntimeHandle {
  fixedUpdate?(dt: number, world: PackWorldState): void
  render?(alpha: number): void
  /** Win-condition gate; the composed runtime ANDs all gates (vacuously true). */
  objectivesComplete?(): boolean
  /** Persistence slot over the pack's owned slices (contract v2, pinned now). */
  saveState?(): unknown
  loadState?(state: unknown): void
  dispose?(): void
}

export interface GamePack<TConfig = unknown> {
  id: string
  version: string
  compatibility: PackCompatibility
  /** Structural schema slot (zod-compatible); validated at boot when present. */
  configSchema?: { parse(input: unknown): TConfig }
  register(ctx: PackBootContext, config: TConfig): PackRuntimeHandle | void
}

export interface PackSetIssue {
  severity: 'error' | 'warning'
  code: 'pack-duplicate-id' | 'pack-missing-requirement' | 'pack-conflict'
    | 'pack-duplicate-slice-owner' | 'pack-event-unproduced'
  packId: string
  message: string
}

/** Compose-time validation of a selected pack set's compatibility graph. */
export function validatePackSet(packs: readonly GamePack[]): PackSetIssue[] {
  const issues: PackSetIssue[] = []
  const ids = new Set<string>()
  for (const pack of packs) {
    if (ids.has(pack.id)) {
      issues.push({ severity: 'error', code: 'pack-duplicate-id', packId: pack.id, message: `Duplicate pack id "${pack.id}"` })
    }
    ids.add(pack.id)
  }
  const sliceOwners = new Map<string, string>()
  const emitted = new Set(packs.flatMap((pack) => [...pack.compatibility.events.emits]))
  for (const pack of packs) {
    for (const required of pack.compatibility.requires) {
      if (!ids.has(required)) {
        issues.push({ severity: 'error', code: 'pack-missing-requirement', packId: pack.id, message: `Pack "${pack.id}" requires missing pack "${required}"` })
      }
    }
    for (const conflict of pack.compatibility.conflictsWith) {
      if (ids.has(conflict)) {
        issues.push({ severity: 'error', code: 'pack-conflict', packId: pack.id, message: `Pack "${pack.id}" conflicts with selected pack "${conflict}"` })
      }
    }
    for (const slice of pack.compatibility.stateSlices.owns) {
      const owner = sliceOwners.get(slice)
      if (owner) {
        issues.push({ severity: 'error', code: 'pack-duplicate-slice-owner', packId: pack.id, message: `Slice "${slice}" owned by both "${owner}" and "${pack.id}"` })
      } else {
        sliceOwners.set(slice, pack.id)
      }
    }
    for (const consumed of pack.compatibility.events.consumes) {
      if (!emitted.has(consumed)) {
        issues.push({ severity: 'warning', code: 'pack-event-unproduced', packId: pack.id, message: `Pack "${pack.id}" consumes event "${consumed}" that no selected pack emits` })
      }
    }
  }
  return issues
}

export class PackCompositionError extends Error {
  constructor(readonly issues: PackSetIssue[]) {
    super(`Pack set invalid: ${issues.map((issue) => issue.message).join('; ')}`)
    this.name = 'PackCompositionError'
  }
}

export interface ComposedRuntime {
  packIds: readonly string[]
  fixedUpdate(dt: number, world: PackWorldState): void
  render(alpha: number): void
  objectivesComplete(): boolean
  /** Saved state per pack id, from packs implementing the persistence slot. */
  saveState(): Record<string, unknown>
  loadState(saved: Record<string, unknown>): void
}

export interface ComposedPacks {
  packIds: readonly string[]
  boot(base: PackBootBase): ComposedRuntime
}

export function composePacks(packs: readonly GamePack[], configs: Record<string, unknown> = {}): ComposedPacks {
  const errors = validatePackSet(packs).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) throw new PackCompositionError(errors)
  const packIds = packs.map((pack) => pack.id)
  return {
    packIds,
    boot(base) {
      const ctx: PackBootContext = { ...base, events: createPackEventBus(), state: createPackStateRegistry() }
      const handles: Array<{ id: string; handle: PackRuntimeHandle }> = []
      for (const pack of packs) {
        const config = pack.configSchema ? pack.configSchema.parse(configs[pack.id]) : configs[pack.id]
        const handle = pack.register(ctx, config as never)
        if (!handle) continue
        handles.push({ id: pack.id, handle })
        if (handle.dispose) ctx.host.cleanup.defer(() => handle.dispose!())
      }
      return {
        packIds,
        fixedUpdate(dt, world) { for (const { handle } of handles) handle.fixedUpdate?.(dt, world) },
        render(alpha) { for (const { handle } of handles) handle.render?.(alpha) },
        objectivesComplete() { return handles.every(({ handle }) => handle.objectivesComplete?.() ?? true) },
        saveState() {
          const saved: Record<string, unknown> = {}
          for (const { id, handle } of handles) { if (handle.saveState) saved[id] = handle.saveState() }
          return saved
        },
        loadState(saved) {
          for (const { id, handle } of handles) {
            if (handle.loadState && id in saved) handle.loadState(saved[id])
          }
        }
      }
    }
  }
}
```

- [x] **Step 4: Run the game-kit suite**

Run: `npx vitest run packages/game-kit`
Expected: `packs.test.ts` PASSES. Other game-kit tests unaffected (`PackBootContext` construction only happens in packs and tests).

- [x] **Step 5: Minimal downstream migration — keep the whole workspace green in this commit**

`compatibility` is now required, so `packages/pack-interaction-inventory` fails to typecheck until it declares one. Apply the *minimal* migration here (the real declaration and widening land in Task 5):

In `packages/pack-interaction-inventory/src/pack.ts`, extend the game-kit import and add an empty declaration:

```ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
```

and inside the pack literal, directly after `version: '1.0.0',`:

```ts
  compatibility: packCompatibility(),
```

In `packages/pack-interaction-inventory/tests/pack.test.ts`, update `boot()`'s context for v2 (Task 5 extends this file further; this is just the compile fix):

```ts
import { createPackEventBus, createPackStateRegistry, type PackBootContext } from '@automata/game-kit'
// … in boot():
  const ctx: PackBootContext = { host: createGameHost(app), render: render.port, events: createPackEventBus(), state: createPackStateRegistry() }
```

Run: `npx vitest run packages/pack-interaction-inventory packages/game-compose games/first-light && npm run ci`
Expected: PASS — every checkpoint commit in this plan leaves `npm run ci` green.

- [x] **Step 6: Commit**

```bash
git add packages/game-kit/src/packs.ts packages/game-kit/tests/packs.test.ts packages/pack-interaction-inventory/src/pack.ts packages/pack-interaction-inventory/tests/pack.test.ts
git commit -m "feat(game-kit): pack contract v2 - compatibility validation, boot context, persistence"
```

---

### Task 4: Compose-time pack-set validation in `game-compose`

**Files:**
- Modify: `packages/game-compose/src/compose.ts` (capability-selection region, lines ~30–41)
- Test: `packages/game-compose/tests/compose.test.ts` (add one test)

**Interfaces:**
- Consumes: `validatePackSet` (Task 3).
- Produces: `composeGame` returns `{ ok: false, issues }` with `code: issue.code` when the selected pack set has error-severity issues — the typed-finding path Phase 4 cycles 2–7 rely on (`ComposeFailure` → `engine.addFinding` already wired in `tools/editor-mcp-server/src/composeTools.ts`).

- [x] **Step 1: Write the invariant test** (add to `packages/game-compose/tests/compose.test.ts`)

```ts
import { validatePackSet } from '@automata/game-kit'
import { interactionInventoryPack } from '@automata/pack-interaction-inventory'

it('the composed pack set passes contract-v2 validation with no issues', () => {
  expect(validatePackSet([interactionInventoryPack])).toEqual([])
})
```

This is a pin, not a behavior driver: after Task 3's minimal migration it passes immediately, and it holds the invariant the Step 2 wiring relies on. The negative path is covered by Task 3's unit tests — `composeGame` cannot select an invalid set until multiple packs exist.

- [x] **Step 2: Wire validation into `composeGame`**

Add `"@automata/game-kit": "*"` to `packages/game-compose/package.json` `dependencies` (audited: it is **not** there yet — the package currently depends only on contracts, engine, and the inventory pack). Then in `packages/game-compose/src/compose.ts`, after the `unsupported` check (line ~41) and before `const rng = createSeededRng(seed)`, insert:

```ts
  const packIssues = validatePackSet([interactionInventoryPack]).filter((issue) => issue.severity === 'error')
  if (packIssues.length > 0) {
    return { ok: false, issues: packIssues.map((issue) => ({ code: issue.code, message: issue.message })) }
  }
```

And add the import at the top of the file:

```ts
import { validatePackSet } from '@automata/game-kit'
```

- [x] **Step 3: Run to verify green**

Run: `npx vitest run packages/game-compose`
Expected: PASS — including the new invariant test.

- [x] **Step 4: Commit**

```bash
git add packages/game-compose/src/compose.ts packages/game-compose/tests/compose.test.ts packages/game-compose/package.json
git commit -m "feat(game-compose): validate the selected pack set at compose time"
```

---

### Task 5: Widen `pack-interaction-inventory` — slice, event, persistence

**Files:**
- Modify: `packages/pack-interaction-inventory/src/core.ts`
- Modify: `packages/pack-interaction-inventory/src/pack.ts`
- Modify: `packages/pack-interaction-inventory/src/index.ts` (export new names)
- Test: `packages/pack-interaction-inventory/tests/core.test.ts` (add round-trip tests)
- Test: `packages/pack-interaction-inventory/tests/pack.test.ts` (update ctx + new tests)

**Interfaces:**
- Consumes: `packCompatibility`, `createPackEventBus`, `createPackStateRegistry`, v2 `PackBootContext` (Tasks 1–3).
- Produces:
  - `INVENTORY_SLICE_ID = 'inventory'`, `ITEM_ACQUIRED_EVENT = 'itemAcquired'` (from `core.ts`, re-exported by the package)
  - `itemAcquired` payload: `{ packId: 'interaction-inventory'; itemId: string }`
  - `serializeInventory(state: InventoryState): unknown`, `deserializeInventory(raw: unknown): InventoryState` (zod-validated; throws on malformed input)
  - The pack's `compatibility`: owns `['inventory']`, emits `['itemAcquired']`
  - `saveState`/`loadState` on the pack's runtime handle; `loadState` reconciles visuals (removes collected items' renderables, updates HUD)

- [x] **Step 1: Write the failing core tests** (add to `packages/pack-interaction-inventory/tests/core.test.ts`)

```ts
import { deserializeInventory, serializeInventory, INVENTORY_SLICE_ID, ITEM_ACQUIRED_EVENT } from '../src/core'

describe('inventory persistence (contract v2 slot)', () => {
  it('exports the slice and event contract names', () => {
    expect(INVENTORY_SLICE_ID).toBe('inventory')
    expect(ITEM_ACQUIRED_EVENT).toBe('itemAcquired')
  })

  it('round-trips state through serialize/deserialize', () => {
    const state = { collected: ['item-1', 'item-2'] as readonly string[] }
    expect(deserializeInventory(serializeInventory(state))).toEqual({ collected: ['item-1', 'item-2'] })
  })

  it('rejects malformed saved state', () => {
    expect(() => deserializeInventory({ collected: 'item-1' })).toThrow()
    expect(() => deserializeInventory(null)).toThrow()
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run packages/pack-interaction-inventory/tests/core.test.ts`
Expected: FAIL — new exports missing.

- [x] **Step 3: Extend `core.ts`** (append; keep existing content unchanged)

```ts
/** Contract names: the slice this pack owns and the event it emits (v2). */
export const INVENTORY_SLICE_ID = 'inventory'
export const ITEM_ACQUIRED_EVENT = 'itemAcquired'

const savedInventorySchema = z.strictObject({
  collected: z.array(z.string().min(1).max(60)).max(8)
})

export function serializeInventory(state: InventoryState): unknown {
  return { collected: [...state.collected] }
}

export function deserializeInventory(raw: unknown): InventoryState {
  return savedInventorySchema.parse(raw)
}
```

Run: `npx vitest run packages/pack-interaction-inventory/tests/core.test.ts` — expected PASS.

- [x] **Step 4: Write the failing pack tests**

`boot()` in `packages/pack-interaction-inventory/tests/pack.test.ts` was already migrated to the v2 context in Task 3 Step 5; extend its return value so the new tests can reach the bus and registry:

```ts
function boot(config = fixtureConfig()) {
  const app = document.createElement('div')
  document.body.append(app)
  const render = createNullRenderer()
  const events = createPackEventBus()
  const state = createPackStateRegistry()
  const ctx: PackBootContext = { host: createGameHost(app), render: render.port, events, state }
  const handle = interactionInventoryPack.register(ctx, config)
  if (!handle) throw new Error('pack must return a runtime handle')
  return { ctx, render, handle, app, events, state }
}
```

New tests (existing tests keep passing unchanged). **Fixture facts (audited):** `fixtureConfig()` items are `cell-a` at `{ x: -2, z: 3 }` and `cell-b` at `{ x: 4, z: -1 }`, with `iconPath: 'assets/item-icon.svg'` — the ids below are `cell-a`/`cell-b`, not `item-1`:

```ts
it('declares contract-v2 compatibility: owns the inventory slice, emits itemAcquired', () => {
  expect(interactionInventoryPack.compatibility.stateSlices.owns).toEqual(['inventory'])
  expect(interactionInventoryPack.compatibility.events.emits).toEqual(['itemAcquired'])
  expect(interactionInventoryPack.compatibility.requires).toEqual([])
})

it('registers the inventory slice and writes it on pickup', () => {
  const { handle, state } = boot()
  expect(state.get('inventory')).toEqual({ collected: [] })
  handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
  expect(state.get('inventory')).toEqual({ collected: ['cell-a'] })
})

it('emits itemAcquired with the item id on each pickup', () => {
  const { handle, events } = boot()
  const seen: unknown[] = []
  events.on('itemAcquired', (payload) => seen.push(payload))
  handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
  expect(seen).toEqual([{ packId: 'interaction-inventory', itemId: 'cell-a' }])
})

it('saveState/loadState round-trips and reconciles renderables + HUD', () => {
  const first = boot()
  first.handle.fixedUpdate!(1 / 60, { playerPosition: { x: -2, z: 3 } })
  const saved = first.handle.saveState!()
  const second = boot()
  second.handle.loadState!(saved)
  expect(second.render.calls.filter((call) => call.op === 'remove')).toHaveLength(1)
  expect(second.app.querySelector('.inventory-hud')?.textContent).toContain('1/2')
  expect(second.state.get('inventory')).toEqual({ collected: ['cell-a'] })
  second.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 4, z: -1 } })
  expect(second.handle.objectivesComplete!()).toBe(true)
})

it('loadState rejects malformed saved state', () => {
  const { handle } = boot()
  expect(() => handle.loadState!({ collected: 42 })).toThrow()
})
```

(The core-test round-trip in Step 1 uses arbitrary ids — only these pack tests must match `fixtureConfig()`'s real `cell-a`/`cell-b`.)

- [x] **Step 5: Run to verify the new tests fail**

Run: `npx vitest run packages/pack-interaction-inventory/tests/pack.test.ts`
Expected: FAIL — no `compatibility` on the pack, no slice writes, no events, no persistence.

- [x] **Step 6: Rewrite `pack.ts`**

```ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  createInventoryState, deserializeInventory, inventoryComplete, packConfigSchema,
  serializeInventory, stepInventory, INVENTORY_SLICE_ID, ITEM_ACQUIRED_EVENT,
  type InventoryPackConfig, type InventoryState
} from './core'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ITEM_COLOR = '#ffd23f'

/** The first real capability pack: item pickups + inventory HUD over interface v2. */
export const interactionInventoryPack: GamePack<InventoryPackConfig> = {
  id: 'interaction-inventory',
  version: '1.0.0',
  compatibility: packCompatibility({
    stateSlices: { owns: [INVENTORY_SLICE_ID], reads: [] },
    events: { emits: [ITEM_ACQUIRED_EVENT], consumes: [] }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let state: InventoryState = createInventoryState()
    ctx.state.register(INVENTORY_SLICE_ID, interactionInventoryPack.id, state)
    const entities = new Map(config.items.map((item) => [item.id, { id: `inventory-item-${item.id}` }]))
    for (const item of config.items) {
      const entity = entities.get(item.id)!
      ctx.render.add(entity, { primitive: 'sphere', radius: 0.35, color: ITEM_COLOR })
      ctx.render.setPose(entity, { x: item.position.x, y: 0.35, z: item.position.z }, IDENTITY)
    }

    const hud = document.createElement('div')
    hud.className = 'inventory-hud'
    if (config.iconPath !== null) {
      const icon = document.createElement('img')
      icon.src = config.iconPath
      icon.alt = 'item'
      icon.width = 16
      icon.height = 16
      hud.append(icon)
    }
    const count = document.createElement('span')
    hud.append(count)
    const updateHud = (): void => { count.textContent = ` ${state.collected.length}/${config.items.length}` }
    updateHud()
    ctx.host.overlays.append(hud)

    /** Remove renderables for collected ids, publish the slice, refresh the HUD. */
    const applyState = (next: InventoryState): void => {
      for (const id of next.collected) {
        if (state !== next && state.collected.includes(id)) continue
        const entity = entities.get(id)
        if (entity) { ctx.render.remove(entity); entities.delete(id) }
      }
      state = next
      ctx.state.set(INVENTORY_SLICE_ID, interactionInventoryPack.id, state)
      updateHud()
    }

    return {
      fixedUpdate(_dt, world) {
        const next = stepInventory(state, world.playerPosition, config)
        if (next === state) return
        const acquired = next.collected.filter((id) => !state.collected.includes(id))
        applyState(next)
        for (const itemId of acquired) {
          ctx.events.emit(ITEM_ACQUIRED_EVENT, { packId: interactionInventoryPack.id, itemId })
        }
      },
      objectivesComplete: () => inventoryComplete(state, config),
      saveState: () => serializeInventory(state),
      loadState(raw) { applyState(deserializeInventory(raw)) },
      dispose() {
        for (const entity of entities.values()) ctx.render.remove(entity)
        entities.clear()
        hud.remove()
      }
    }
  }
}
```

Careful with `applyState` on load: when `next` comes from `loadState`, every collected id's renderable must be removed. The guard `if (state !== next && state.collected.includes(id)) continue` skips ids already applied during incremental pickup; on `loadState` the previous `state` may be fresh (`collected: []`), so all loaded ids get their renderables removed. If the diff logic reads awkwardly during implementation, split into `removeCollectedVisuals(ids)` — behavior over form; the tests are the contract.

Add re-exports to `packages/pack-interaction-inventory/src/index.ts`:

```ts
export {
  INVENTORY_SLICE_ID, ITEM_ACQUIRED_EVENT, serializeInventory, deserializeInventory
} from './core'
```

- [x] **Step 7: Run the package suite plus game-compose**

Run: `npx vitest run packages/pack-interaction-inventory packages/game-compose`
Expected: PASS — Task 4's `validatePackSet` invariant test stays green with the real declaration (owned slices and emitted events raise no issues).

- [x] **Step 8: Run first-light's tests (regression: composition.json unchanged, runtime boots)**

Run: `npx vitest run games/first-light`
Expected: PASS. `git status` must show **no changes** under `games/first-light/` — the config schema and pack version did not change.

- [x] **Step 9: Commit**

```bash
git add packages/pack-interaction-inventory packages/game-compose/tests/compose.test.ts
git commit -m "feat(pack-interaction-inventory): contract v2 - inventory slice, itemAcquired event, persistence"
```

---

### Task 6: Pack editor-contribution seam

**Files:**
- Create: `packages/game-kit/src/packEditor.ts`
- Create: `packages/pack-interaction-inventory/src/editorContribution.ts`
- Modify: `packages/game-kit/src/index.ts`, `packages/pack-interaction-inventory/src/index.ts`
- Modify: `packages/pack-registry/src/index.ts`
- Test: `packages/pack-interaction-inventory/tests/editorContribution.test.ts`
- Test: `packages/pack-registry/tests/registry.test.ts` (extend)

**Interfaces:**
- Consumes: `RenderPort` from `@automata/engine`; `CompositionManifest` from `@automata/contracts`; `packConfigSchema` (existing).
- Produces:
  - In game-kit: `PackPreviewHandle { render?(alpha: number): void; dispose(): void }`, `PackPrefabTemplate { id: string; label: string; components: Array<{ typeId: string; data: Record<string, unknown> }> }`, `PackEditorContribution { packId: string; prefabs: PackPrefabTemplate[]; createPreview?(config: unknown, render: RenderPort): PackPreviewHandle }` (structurally compatible with the editor's `PrefabRegistration` — no editor dependency).
  - In the pack: `inventoryEditorContribution: PackEditorContribution` (prefabs `[]` — items are composition-owned; scene-authored items are a logged capability gap).
  - In pack-registry: `resolveEditorContributions(composition: CompositionManifest): Array<{ contribution: PackEditorContribution; config: unknown }>` — Task 7's editor loaders call this.

- [x] **Step 1: Write the failing contribution test**

```ts
// packages/pack-interaction-inventory/tests/editorContribution.test.ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { inventoryEditorContribution } from '../src/editorContribution'
import { fixtureConfig } from './fixtures'

describe('inventory editor contribution (thin preview)', () => {
  it('declares the pack id and (deliberately) no scene prefabs', () => {
    expect(inventoryEditorContribution.packId).toBe('interaction-inventory')
    expect(inventoryEditorContribution.prefabs).toEqual([])
  })

  it('preview adds one marker per composed item and removes them on dispose', () => {
    const render = createNullRenderer()
    const handle = inventoryEditorContribution.createPreview!(fixtureConfig(), render.port)
    expect(render.calls.filter((call) => call.op === 'add')).toHaveLength(2)
    handle.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('preview validates its config through the pack schema', () => {
    const render = createNullRenderer()
    expect(() => inventoryEditorContribution.createPreview!({ bogus: true }, render.port)).toThrow()
  })
})
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run packages/pack-interaction-inventory/tests/editorContribution.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the seam**

```ts
// packages/game-kit/src/packEditor.ts
import type { RenderPort } from '@automata/engine'

/**
 * Editor-contribution seam (pack contract v2, deliberately thin per the 80/20
 * editor rule): prefab entity templates plus enough preview to SEE a pack's
 * composed entities. Typed here so packs never depend on @automata/editor;
 * PackPrefabTemplate is structurally compatible with the editor's
 * PrefabRegistration.
 */
export interface PackPreviewHandle {
  render?(alpha: number): void
  dispose(): void
}

export interface PackPrefabTemplate {
  id: string
  label: string
  components: Array<{ typeId: string; data: Record<string, unknown> }>
}

export interface PackEditorContribution {
  packId: string
  prefabs: PackPrefabTemplate[]
  /** Draw the pack's composed entities into an existing preview render port. */
  createPreview?(config: unknown, render: RenderPort): PackPreviewHandle
}
```

Add `export * from './packEditor'` to `packages/game-kit/src/index.ts`.

```ts
// packages/pack-interaction-inventory/src/editorContribution.ts
import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './core'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ITEM_COLOR = '#ffd23f'

/**
 * Thin editor preview: markers for the composed items. prefabs is empty on
 * purpose — inventory items are composition-owned, not scene-authored; making
 * them scene entities is a logged capability gap, not silently faked here.
 */
export const inventoryEditorContribution: PackEditorContribution = {
  packId: 'interaction-inventory',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities = parsed.items.map((item) => ({ id: `preview-inventory-item-${item.id}` }))
    parsed.items.forEach((item, index) => {
      const entity = entities[index]!
      render.add(entity, { primitive: 'sphere', radius: 0.35, color: ITEM_COLOR })
      render.setPose(entity, { x: item.position.x, y: 0.35, z: item.position.z }, IDENTITY)
    })
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
```

Add to `packages/pack-interaction-inventory/src/index.ts`:

```ts
export { inventoryEditorContribution } from './editorContribution'
```

In `packages/pack-registry/src/index.ts`, add:

```ts
import type { PackEditorContribution } from '@automata/game-kit'
import { inventoryEditorContribution } from '@automata/pack-interaction-inventory'

const EDITOR_CONTRIBUTIONS: Record<string, PackEditorContribution> = {
  [inventoryEditorContribution.packId]: inventoryEditorContribution
}

/** Editor contributions + configs for the packs a composition selects. */
export function resolveEditorContributions(
  composition: CompositionManifest
): Array<{ contribution: PackEditorContribution; config: unknown }> {
  return composition.packs.flatMap((entry) => {
    const contribution = EDITOR_CONTRIBUTIONS[entry.id]
    return contribution ? [{ contribution, config: entry.config }] : []
  })
}
```

(Unknown pack ids yield no contribution rather than throwing: the editor must stay usable to *inspect* a game whose packs it cannot preview; `resolvePacks` still throws at runtime boot.)

- [x] **Step 4: Extend the registry test** (add to `packages/pack-registry/tests/registry.test.ts`)

```ts
import { resolveEditorContributions } from '../src/index'

it('resolves editor contributions for composed packs and skips unknown ids', () => {
  const composition = {
    formatVersion: 1 as const, gameId: 'first-light',
    source: null,
    packs: [
      { id: 'interaction-inventory', version: '1.0.0', config: { interactRadius: 1.5, items: [{ id: 'item-1', position: { x: 0, z: 0 } }], iconPath: null } },
      { id: 'not-a-pack', version: '1.0.0', config: {} }
    ],
    assets: []
  }
  const resolved = resolveEditorContributions(composition)
  expect(resolved).toHaveLength(1)
  expect(resolved[0]!.contribution.packId).toBe('interaction-inventory')
  expect(resolved[0]!.config).toEqual(composition.packs[0]!.config)
})
```

(Note: `composition.packs` max length is 7 and this literal has 2 — fine. The `not-a-pack` entry never reaches `parseCompositionManifest`, so the literal needs no schema blessing.)

- [x] **Step 5: Run to verify green**

Run: `npx vitest run packages/pack-interaction-inventory packages/pack-registry packages/game-kit`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/game-kit/src/packEditor.ts packages/game-kit/src/index.ts \
  packages/pack-interaction-inventory/src/editorContribution.ts packages/pack-interaction-inventory/src/index.ts \
  packages/pack-interaction-inventory/tests/editorContribution.test.ts \
  packages/pack-registry/src/index.ts packages/pack-registry/tests/registry.test.ts
git commit -m "feat(packs): thin editor-contribution seam (prefab templates + preview markers)"
```

---

### Task 7: Composition-aware editor preview — first-light + scaffold template

**Files:**
- Modify: `games/first-light/src/project/editor.ts`
- Modify: `tools/scaffold/src/templates/projectFiles.ts` (the `editorTs()` template, lines ~245–283)
- Test: existing `games/first-light/tests` + `npm run verify:new-game`

**Interfaces:**
- Consumes: `resolveEditorContributions` (Task 6), `emptyComposition`/`parseCompositionManifest` from `@automata/contracts`, `EditorRegistrationLoader`'s `deps.readText` (paths relative to the game's `public/`).
- Produces: pack-aware `loadEditorRegistration` in first-light and in the scaffold template; the static `editorRegistration` export stays pack-free (tests and plain scaffolds rely on it).

- [x] **Step 1: Rewrite `games/first-light/src/project/editor.ts`**

```ts
import type { EditorProjectRegistration, EditorRegistrationLoader, ProjectPlayHandle } from '@automata/editor'
import { emptyComposition, parseCompositionManifest } from '@automata/contracts'
import { CORE_TYPE_IDS } from '@automata/project'
import { resolveEditorContributions } from '@automata/pack-registry'
import { createGameplay } from '../game/gameplay'
import { seekGoal } from '../sim/sim'
import { projectDefinition } from './definition'
import { evaluateProject } from './evaluation'
import { GAME_TYPE_IDS, type CompiledProject } from './types'

/** Declarative authoring registration; the shared editor UI supplies all DOM. */
export const editorRegistration: EditorProjectRegistration<CompiledProject> = {
  project: projectDefinition,
  prefabs: [
    {
      id: 'spawn-point',
      label: 'Spawn Point',
      components: [
        {
          typeId: CORE_TYPE_IDS.transform,
          data: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
        },
        { typeId: GAME_TYPE_IDS.spawnPoint, data: {} }
      ]
    }
  ],
  preview: {
    create(compiled, _sceneId, render): ProjectPlayHandle {
      // The preview demonstrates the sim by walking itself to the goal.
      return createGameplay({ compiled, render, control: (state) => seekGoal(state, compiled.tuning) })
    }
  },
  evaluation: { evaluate: evaluateProject }
}

/**
 * Registry convention entry: the browser editor discovers and calls this.
 * Composition-aware: composed packs contribute prefab templates and preview
 * markers; plain scaffolds (no composition.json) load the base registration.
 */
export const loadEditorRegistration: EditorRegistrationLoader = async (deps) => {
  let text: string | null = null
  try {
    text = await deps.readText('project/composition.json')
  } catch {
    text = null
  }
  const composition = text === null
    ? emptyComposition(projectDefinition.gameId)
    : parseCompositionManifest(text)
  const contributions = resolveEditorContributions(composition)
  if (contributions.length === 0) return editorRegistration
  return {
    ...editorRegistration,
    prefabs: [
      ...editorRegistration.prefabs,
      ...contributions.flatMap(({ contribution }) => contribution.prefabs)
    ],
    preview: {
      create(compiled, sceneId, render, physics): ProjectPlayHandle {
        const previewAdapter = editorRegistration.preview!
        const packHandles = contributions.flatMap(({ contribution, config }) =>
          contribution.createPreview ? [contribution.createPreview(config, render)] : [])
        const inner = previewAdapter.create(compiled, sceneId, render, physics)
        return {
          fixedUpdate: (dt) => inner.fixedUpdate(dt),
          render: (alpha, frameDt) => {
            inner.render(alpha, frameDt)
            for (const handle of packHandles) handle.render?.(alpha)
          },
          dispose: () => {
            for (const handle of packHandles) handle.dispose()
            inner.dispose()
          }
        }
      }
    }
  }
}
```

Check first that `@automata/pack-registry` and `@automata/contracts` are in `games/first-light/package.json` dependencies (`grep -E 'pack-registry|contracts' games/first-light/package.json`) — `main.ts` and `project/index.ts` already import them, so they should be; add if missing.

- [x] **Step 2: Run first-light tests**

Run: `npx vitest run games/first-light`
Expected: PASS — existing editor-registration tests target the static `editorRegistration`, which is unchanged.

- [x] **Step 3: Apply the identical change to the scaffold template**

In `tools/scaffold/src/templates/projectFiles.ts`, `editorTs()` (lines ~245–283): replace the trailing

```ts
/** Registry convention entry: the browser editor discovers and calls this. */
export const loadEditorRegistration: EditorRegistrationLoader = async () => editorRegistration
```

with the same composition-aware loader as Step 1 (adjusted: inside the template string, escape `\`` and `\${` as the surrounding template already does), and add the `emptyComposition, parseCompositionManifest` + `resolveEditorContributions` imports to the template's import block. The generated `editor.ts` must be **textually identical in structure** to first-light's (first-light was scaffold-generated; keeping them aligned is the template's contract).

Also check the scaffold's generated `package.json` template (in `tools/scaffold/src/templates/configFiles.ts`) lists `@automata/pack-registry` and `@automata/contracts` as dependencies — `main.ts` already imports pack-registry, so it will; add `@automata/contracts` if absent.

- [x] **Step 4: Verify the scaffold end-to-end**

Run: `npm run verify:new-game`
Expected: PASS — a fresh scaffold (no composition.json → `emptyComposition` → zero contributions → base registration) builds, tests, and registers cleanly.

- [x] **Step 5: Commit**

```bash
git add games/first-light/src/project/editor.ts tools/scaffold/src/templates/projectFiles.ts tools/scaffold/src/templates/configFiles.ts
git commit -m "feat(editor): composition-aware pack prefabs + preview markers in editor registration"
```

---

### Task 8: Composition-matrix harness

**Files:**
- Modify: `packages/pack-registry/src/index.ts` (add `PACK_FIXTURES`)
- Create: `packages/pack-registry/tests/compositionMatrix.test.ts`
- Modify: `packages/pack-registry/package.json` (devDependencies if needed)

**Interfaces:**
- Consumes: `STANDARD_PACKS`, `EVAL_HOOK_BUILDERS` path via `resolveEvalHooks`, `composePacks`, `validatePackSet`, `PackCompositionError` (Task 3), `createGameHost`/`createNullRenderer`.
- Produces: `PACK_FIXTURES: Record<string, () => unknown>` — a deterministic fixture config per standard pack. **Every Phase 4 pack cycle adds its pack to `STANDARD_PACKS`, `EVAL_HOOK_BUILDERS`, `EDITOR_CONTRIBUTIONS`, and `PACK_FIXTURES`; the matrix picks it up automatically.**

- [x] **Step 1: Add `PACK_FIXTURES` to `packages/pack-registry/src/index.ts`**

```ts
/**
 * Deterministic fixture config per pack, for the composition-matrix harness.
 * Every pack registered in STANDARD_PACKS MUST have a fixture here; the
 * matrix test enforces that.
 */
export const PACK_FIXTURES: Record<string, () => unknown> = {
  [interactionInventoryPack.id]: () => ({
    interactRadius: 1.5,
    items: [
      { id: 'item-1', position: { x: -2, z: 3 } },
      { id: 'item-2', position: { x: 4, z: -1 } }
    ],
    iconPath: null
  })
}
```

- [x] **Step 2: Write the matrix test**

```ts
// packages/pack-registry/tests/compositionMatrix.test.ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import {
  composePacks, createGameHost, validatePackSet, PackCompositionError,
  type GamePack, type PackEvalHook
} from '@automata/game-kit'
import { PACK_FIXTURES, STANDARD_PACKS, resolveEvalHooks } from '../src/index'

/**
 * The composition-matrix harness (Phase 4 umbrella §4): every declared-
 * compatible single and pair of standard packs must (a) compose, (b) boot
 * against a null renderer, and (c) complete headlessly via its eval hooks.
 * Declared conflicts must fail with PackCompositionError. Each pack cycle
 * adds its pack to the registry tables and this matrix widens automatically.
 */
const packs = Object.values(STANDARD_PACKS)
const ids = new Set(Object.keys(STANDARD_PACKS))

const satisfiable = (set: GamePack[]): boolean => {
  const setIds = new Set(set.map((pack) => pack.id))
  return set.every((pack) => pack.compatibility.requires.every((id) => setIds.has(id)))
}
const conflicting = (set: GamePack[]): boolean =>
  validatePackSet(set).some((issue) => issue.code === 'pack-conflict')

const singles = packs.filter((pack) => satisfiable([pack])).map((pack) => [pack] as GamePack[])
const pairs: GamePack[][] = []
const conflicts: GamePack[][] = []
for (let i = 0; i < packs.length; i += 1) {
  for (let j = i + 1; j < packs.length; j += 1) {
    const set = [packs[i]!, packs[j]!]
    if (conflicting(set)) conflicts.push(set)
    else if (satisfiable(set)) pairs.push(set)
  }
}

const fixtureComposition = (set: GamePack[]) => ({
  formatVersion: 1 as const,
  gameId: 'matrix-fixture',
  source: null,
  packs: set.map((pack) => ({ id: pack.id, version: pack.version, config: PACK_FIXTURES[pack.id]!() as Record<string, unknown> })),
  assets: []
})

/** Scripted walk: seek each hook's next target until every hook completes. */
function driveToCompletion(hooks: PackEvalHook[], maxSteps = 2000): boolean {
  const states = new Map(hooks.map((hook) => [hook.packId, hook.createState()]))
  const player = { x: -8, z: -8 }
  for (let step = 0; step < maxSteps; step += 1) {
    const pending = hooks.find((hook) => !hook.complete(states.get(hook.packId)))
    if (!pending) return true
    const target = pending.nextTarget(states.get(pending.packId), player)
    if (target) {
      const dx = target.x - player.x
      const dz = target.z - player.z
      const dist = Math.hypot(dx, dz)
      const stride = Math.min(0.5, dist)
      if (dist > 0) { player.x += (dx / dist) * stride; player.z += (dz / dist) * stride }
    }
    for (const hook of hooks) states.set(hook.packId, hook.step(states.get(hook.packId), player))
  }
  return hooks.every((hook) => hook.complete(states.get(hook.packId)))
}

/** Compose, boot, and headlessly complete one pack set. */
function runSet(set: GamePack[]): void {
  const label = set.map((pack) => pack.id).join('+')
  const composition = fixtureComposition(set)
  const configs = Object.fromEntries(composition.packs.map((entry) => [entry.id, entry.config]))
  const app = document.createElement('div')
  document.body.append(app)
  const runtime = composePacks(set, configs).boot({ host: createGameHost(app), render: createNullRenderer().port })
  expect(runtime.packIds, label).toEqual(set.map((pack) => pack.id))
  expect(driveToCompletion(resolveEvalHooks(composition)), label).toBe(true)
}

describe('composition matrix (standard packs)', () => {
  it('every standard pack has a deterministic fixture', () => {
    expect(Object.keys(PACK_FIXTURES).sort()).toEqual([...ids].sort())
  })

  it('every requires-satisfiable single composes, boots, and completes headlessly', () => {
    expect(singles.length).toBeGreaterThan(0)
    for (const set of singles) runSet(set)
  })

  // Vacuous until a second pack lands; the loops ARE the harness — each pack
  // cycle only adds registry entries and this matrix widens automatically.
  it('every declared-compatible pair composes, boots, and completes headlessly', () => {
    for (const set of pairs) runSet(set)
  })

  it('every declared conflict fails with PackCompositionError', () => {
    for (const set of conflicts) {
      expect(() => composePacks(set), set.map((pack) => pack.id).join('+')).toThrow(PackCompositionError)
    }
  })
})
```

- [x] **Step 3: Add the missing dev dependency**

Environment (audited): `packages/pack-registry/vitest.config.ts` already sets `environment: 'happy-dom'`, so `document` is available — no config change needed. Dependency (audited): `packages/pack-registry/package.json` depends only on `@automata/contracts`, `@automata/game-kit`, and the inventory pack — add a `devDependencies` block with `"@automata/engine": "*"` for the test's `createNullRenderer` import.

- [x] **Step 4: Run to verify green**

Run: `npx vitest run packages/pack-registry`
Expected: PASS — fixture coverage + the one single ("interaction-inventory") exercised; pair/conflict tests pass vacuously (empty loops) until pack cycle 2 lands.

- [x] **Step 5: Commit**

```bash
git add packages/pack-registry
git commit -m "test(pack-registry): composition-matrix harness over standard packs"
```

---

### Task 9: Full verification, roadmap bookkeeping, closeout

**Files:**
- Modify: `docs/ROADMAP.md` (§3 Phase 4 heading + body)
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` (Phase 4 sub-cycle status, §5 index)

**Interfaces:** none — verification and documentation.

- [x] **Step 1: Full CI**

Run: `npm run ci`
Expected: PASS (build, lint, typecheck, all workspaces' tests).

- [x] **Step 2: Compose parity + scaffold acceptance**

Run: `npx vitest run games/first-light/tests/project/composition.test.ts && npm run verify:new-game`
Expected: PASS; `git status` shows no unexpected changes under `games/`.

- [x] **Step 3: Update ROADMAP.md**

In `docs/ROADMAP.md` §3, change the Phase 4 heading and body to:

```markdown
### Phase 4 — Capability packs · `In progress`

Umbrella spec: [`2026-07-14-phase-4-capability-packs-design.md`](superpowers/specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md).

- **Goal:** widen from the Phase 3 slice to the initial seven reusable gameplay
  packs; each pack is its own spec→plan cycle against the umbrella spec's
  contract v2 and per-pack template. **Exit:** packs compose without
  game-specific editor or MCP changes.
- **Depends on:** Phase 3 complete. Runs in parallel with Phase 5.
- **Cycles:**
  - Cycle 1 — contract v2 + interaction-inventory widening + composition-matrix
    harness — `Shipped` (plan:
    [`2026-07-14-phase-4-cycle-1-pack-contract-v2.md`](superpowers/plans/active/2026-07/week-29/2026-07-14-phase-4-cycle-1-pack-contract-v2.md)).
  - Cycle 2 — branching dialogue & quests pack — `Next`.
  - Cycle 3 — schedules & relationships pack — `Planned`.
  - Cycle 4 — combat & enemy AI pack — `Planned`.
  - Cycle 5 — economy, shops & progression pack — `Planned`.
  - Cycle 6 — compact-hub navigation + one vehicle pack — `Planned`.
  - Cycle 7 — save/load integration pack — `Planned`.
```

- [x] **Step 4: Update the decomposition design's Phase 4 sub-cycle index**

In `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` §5, change the Phase 4 block's first line to:

```markdown
**Phase 4 (seven peers; cycle 1 completed — see roadmap for live status):**

1. Interaction & inventory pack — contract v2 + widening completed
```

(lines 2–7 unchanged).

- [x] **Step 5: Mark this plan complete and commit**

Every checkbox above should now be checked. Then:

```bash
git add docs/ROADMAP.md docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md \
  docs/superpowers/plans/active/2026-07/week-29/2026-07-14-phase-4-cycle-1-pack-contract-v2.md
git commit -m "docs: Phase 4 cycle 1 shipped - contract v2, widened inventory pack, composition matrix"
```
