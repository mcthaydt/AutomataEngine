# Phase 4 Cycle 5 — Economy, Shops & Progression Pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@automata/pack-economy-progression` — a wallet, buy-only shops, and currency-threshold progression forming one closed economic loop — and make the contract-v2 event bus first-class in the headless evaluator so the pack's event-driven cross-pack effects are provable in both twins.

**Architecture:** Follows the `pack-combat-ai` package template (three pure cores + browser adapter + eval hook + seeded composeSection + editor contribution). Purchases emit `itemPurchased`; the inventory pack consumes it and grants the item as sole writer (closing the cycle-2 gap). Progression flips the spec's `progression.milestones` as cumulative `totalEarned` crosses seeded ascending thresholds, and the pack's objective is complete only once every milestone is achieved **and** every shop's stock is bought — see the spec-defect note in Task 5. Bounties (`enemyDefeated`) and quest rewards (`questCompleted`) are graceful-degrade `integratesWith` edges. Because the headless composition matrix has no event channel, this cycle additively threads the existing `PackEventBus` through `PackEvalHook`/the matrix driver.

**Tech Stack:** TypeScript (npm workspaces monorepo), zod v4 via `@automata/project` re-export, vitest + happy-dom, `@automata/engine` `SeededRng`.

**Spec:** [`2026-07-21-phase-4-cycle-5-economy-progression-design.md`](../../specs/active/2026-07/week-30/2026-07-21-phase-4-cycle-5-economy-progression-design.md)
**Umbrella:** [`2026-07-14-phase-4-capability-packs-design.md`](../../specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md)

**Implementation progress:** 65% (51/79 steps; 11/16 tasks complete)

## Global Constraints

- **Never import `zod` directly.** Import `z` from `@automata/project`. Lint enforces this.
- **Never import one pack from another.** Cross-pack integration goes through the slice registry (reads) and the event bus (emits/consumes). Slice ids and event names shared across packs are **deliberate string copies**, not imports (the combat-pack precedent: `INVENTORY_SLICE_ID = 'inventory'`).
- **Capability config fields are optional with NO zod default.** Defaults live in `ECONOMY_DEFAULTS`, applied by `composeSection`, never by the schema. This preserves stored-spec content hashes (Phase 2 hash rule).
- **Zod authoring rules:** roots are `z.strictObject`; use `.min()`/`.max()` (exclusive bounds are rejected); `.meta()` before `.optional()`.
- **Determinism:** cores use no wall clock, no `Math.random`. Composition draws come only from the passed `SeededRng` (`rng.next()` → `[0, 1)`). One fixed eval tick = `1/60` s.
- **first-light must recompose bit-identically.** Economy is not in its composition; verify at the end.
- **Verification:** `npm run ci`, `npm run coverage`, and `npm run verify:new-game` must pass before the cycle is claimed done.
- **Per-package test invocation.** Most packages this cycle touches declare **no
  `test` script** — `npm test -w <package>` fails with "Missing script" for
  `pack-registry`, `pack-interaction-inventory`, `pack-dialogue-quests`,
  `game-compose`, and `contracts` (`contracts` and `game-kit` have `typecheck`
  only; `pack-combat-ai` is the one pack with a `test` script). Use the root
  vitest project names instead — `npx vitest run --project <name> <filter>` —
  where the name is each package's `vitest.config.ts` `test.name`. The new
  `pack-economy-progression` package.json declares `test`/`typecheck` (Task 4),
  so `npm test -w @automata/pack-economy-progression` does work for it.

---

### Task 1: Eval-harness event bus (contract-v2 additive extension)

Thread the existing `PackEventBus` through the headless evaluator so hooks can emit and consume events in the matrix, mirroring the runtime. Additive and non-breaking: hooks that omit the new members are unchanged.

**Files:**
- Modify: `packages/game-kit/src/packEval.ts`
- Modify: `packages/pack-registry/tests/compositionMatrix.test.ts` (the `driveToCompletion` driver)
- Test: `packages/game-kit/tests/evalEventBus.test.ts` (new)

> The harness test lives in **game-kit**, not pack-registry: it exercises a
> game-kit contract and imports nothing else. game-kit also has a `typecheck`
> script, so the new `connect`/`emit` signatures are type-checked in CI.

**Interfaces:**
- Consumes: `PackEventBus`, `createPackEventBus` from `@automata/game-kit` (`packEvents.ts`).
- Produces: `PackEvalHook.connect?(bus, ref)` and a 4th optional `emit` param on `step`; a `driveToCompletion` that creates one bus per run, connects each hook, and passes `bus.emit` into every `step`.

- [x] **Step 1: Write the failing harness test**

Create `packages/game-kit/tests/evalEventBus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createPackEventBus, type PackEvalHook } from '@automata/game-kit'

/** Minimal driver mirror: create bus, connect hooks, pass emit into step. */
function drive(hooks: PackEvalHook[], ticks: number): Map<string, unknown> {
  const states = new Map(hooks.map((h) => [h.packId, h.createState()]))
  const bus = createPackEventBus()
  for (const h of hooks) {
    h.connect?.(bus, { get: () => states.get(h.packId), set: (s) => states.set(h.packId, s) })
  }
  const emit = (name: string, payload: unknown): void => bus.emit(name, payload)
  const player = { x: 0, z: 0 }
  for (let t = 0; t < ticks; t += 1) {
    for (const h of hooks) states.set(h.packId, h.step(states.get(h.packId), player, {}, emit))
  }
  return states
}

it('delivers an emitted event to a connected consumer synchronously', () => {
  const emitter: PackEvalHook = {
    packId: 'emitter', createState: () => ({ fired: false }),
    nextTarget: () => null,
    step: (state, _p, _s, emit) => {
      if (!(state as { fired: boolean }).fired) emit?.('ping', { n: 7 })
      return { fired: true }
    },
    complete: () => true
  }
  const consumer: PackEvalHook = {
    packId: 'consumer', createState: () => ({ total: 0 }),
    connect: (bus, ref) => {
      bus.on('ping', (payload) => {
        const cur = ref.get() as { total: number }
        ref.set({ total: cur.total + (payload as { n: number }).n })
      })
    },
    nextTarget: () => null,
    step: (state) => state,
    complete: () => true
  }
  const states = drive([emitter, consumer], 3)
  expect((states.get('consumer') as { total: number }).total).toBe(7)
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project game-kit evalEventBus`
Expected: FAIL on the assertion (`total` is 0, not 7). Note vitest strips types
rather than typechecking, so the missing `connect` is a silent no-op at runtime
and the missing 4th param leaves `emit` undefined — the optional calls swallow
both and the expectation is what actually fails. `npm run typecheck -w @automata/game-kit`
is the step that surfaces the type errors.

> **Implementation note (2026-07-28):** The prescribed Vitest assertion passes
> before implementation because the local test driver already supplies the
> runtime behavior and TypeScript interfaces are erased. The valid red gate is
> `npm run typecheck -w @automata/game-kit`, which failed on the missing
> `connect` member and fourth `step` parameter before the contract was extended.

- [x] **Step 3: Extend `PackEvalHook` in game-kit**

In `packages/game-kit/src/packEval.ts`, add the import and the two optional members. Replace the interface body:

```ts
import type { PackEventBus } from './packEvents'

export type EvalSliceView = Readonly<Record<string, unknown>>

/** Reference to a single hook's own state, given to `connect` for event-driven mutation. */
export interface EvalStateRef {
  get(): unknown
  set(next: unknown): void
}

export interface PackEvalHook {
  packId: string
  createState(): unknown
  /** Subscribe to the shared eval bus and mutate own state via `ref` (contract v2). */
  connect?(bus: PackEventBus, ref: EvalStateRef): void
  /** Next waypoint to seek; null when satisfied or blocked on another pack. */
  nextTarget(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): { x: number; z: number } | null
  /** `emit` fans out synchronously to connected hooks, mirroring the runtime bus. */
  step(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView, emit?: (name: string, payload: unknown) => void): unknown
  complete(state: unknown): boolean
  /** Slices this hook's state exposes to other hooks. */
  publishSlices?(state: unknown): Record<string, unknown>
}
```

- [x] **Step 4: Thread the bus through the matrix driver**

In `packages/pack-registry/tests/compositionMatrix.test.ts`, update the imports and `driveToCompletion`. Add `createPackEventBus` to the `@automata/game-kit` import, then replace the function:

```ts
function driveToCompletion(hooks: PackEvalHook[], maxSteps = 2000): boolean {
  const states = new Map(hooks.map((hook) => [hook.packId, hook.createState()]))
  const bus = createPackEventBus()
  for (const hook of hooks) {
    hook.connect?.(bus, { get: () => states.get(hook.packId), set: (s) => states.set(hook.packId, s) })
  }
  const emit = (name: string, payload: unknown): void => bus.emit(name, payload)
  const player = { x: -8, z: -8 }
  for (let step = 0; step < maxSteps; step += 1) {
    const slices: Record<string, unknown> = {}
    for (const hook of hooks) Object.assign(slices, hook.publishSlices?.(states.get(hook.packId)) ?? {})
    const incomplete = hooks.filter((hook) => !hook.complete(states.get(hook.packId)))
    if (incomplete.length === 0) return true
    for (const hook of incomplete) {
      const target = hook.nextTarget(states.get(hook.packId), player, slices)
      if (!target) continue
      const dx = target.x - player.x
      const dz = target.z - player.z
      const dist = Math.hypot(dx, dz)
      const stride = Math.min(0.5, dist)
      if (dist > 0) { player.x += (dx / dist) * stride; player.z += (dz / dist) * stride }
      break
    }
    for (const hook of hooks) states.set(hook.packId, hook.step(states.get(hook.packId), player, slices, emit))
  }
  return hooks.every((hook) => hook.complete(states.get(hook.packId)))
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project game-kit evalEventBus && npx vitest run --project pack-registry compositionMatrix`
Expected: PASS (existing matrix rows unaffected; new event-bus test green).

- [x] **Step 6: Typecheck game-kit and commit**

```bash
npm run typecheck -w @automata/game-kit
git add packages/game-kit/src/packEval.ts packages/game-kit/tests/evalEventBus.test.ts packages/pack-registry/tests/compositionMatrix.test.ts
git commit -m "feat(game-kit): thread pack event bus through the headless eval harness"
```

---

### Task 2: Inventory grant path (closes the cycle-2 capability gap)

Give the inventory pack a consume path: on `itemPurchased`, grant the item into `collected` as sole writer, in both the runtime and the eval twin. Fix the HUD to count only placed items so purchased catalog goods don't read as `3/2`.

**Files:**
- Modify: `packages/pack-interaction-inventory/src/core.ts`
- Modify: `packages/pack-interaction-inventory/src/pack.ts`
- Modify: `packages/pack-interaction-inventory/src/evalHook.ts`
- Test: `packages/pack-interaction-inventory/tests/core.test.ts` (add), `packages/pack-interaction-inventory/tests/pack.test.ts` (add)

**Interfaces:**
- Consumes: the eval event bus from Task 1.
- Produces: `grantItem(state, itemId)`, `ITEM_PURCHASED_EVENT = 'itemPurchased'` from `@automata/pack-interaction-inventory`; inventory pack now declares `events.consumes: ['itemPurchased']`.

- [x] **Step 1: Write the failing core test**

Add to `packages/pack-interaction-inventory/tests/core.test.ts`:

```ts
import { grantItem, createInventoryState } from '../src/core'

it('grantItem appends an id and is idempotent', () => {
  const s0 = createInventoryState()
  const s1 = grantItem(s0, 'catalog-1')
  expect(s1.collected).toEqual(['catalog-1'])
  const s2 = grantItem(s1, 'catalog-1')
  expect(s2).toBe(s1) // idempotent: same reference, no growth
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project pack-interaction-inventory core`
Expected: FAIL — `grantItem` is not exported.

- [x] **Step 3: Implement `grantItem` + the event-name constant**

In `packages/pack-interaction-inventory/src/core.ts`, add after `ITEM_ACQUIRED_EVENT`:

```ts
/** Consumed from the economy pack (contract v2): a purchase grants ownership. */
export const ITEM_PURCHASED_EVENT = 'itemPurchased'

/** Grant an owned item id (from a purchase); idempotent, sole writer of the slice. */
export function grantItem(state: InventoryState, itemId: string): InventoryState {
  if (state.collected.includes(itemId)) return state
  return { collected: [...state.collected, itemId] }
}
```

- [x] **Step 4: Wire the runtime consume path + HUD fix**

In `packages/pack-interaction-inventory/src/pack.ts`:

1. Extend the imports from `./core` to include `grantItem` and `ITEM_PURCHASED_EVENT`.
2. In `compatibility`, change the events line to declare the consume:

```ts
    events: { emits: [ITEM_ACQUIRED_EVENT], consumes: [ITEM_PURCHASED_EVENT] },
```

3. Fix `updateHud` to count only placed items collected (purchased catalog ids are owned but not part of the fetch objective):

```ts
    const updateHud = (): void => {
      const placedCollected = config.items.filter((item) => state.collected.includes(item.id)).length
      count.textContent = ` ${placedCollected}/${config.items.length}`
    }
```

4. Inside `register`, **immediately before the `return`** (i.e. after the `applyState` declaration at `pack.ts:50` — the handler closes over it), subscribe to purchases:

```ts
    ctx.events.on(ITEM_PURCHASED_EVENT, (payload) => {
      const itemId = (payload as { itemId: string }).itemId
      applyState(grantItem(state, itemId))
    })
```

(`applyState` already reconciles renderables — a purchased catalog id has no entry in `config.items`, so it adds no marker, exactly as intended — publishes the slice, and refreshes the HUD.)

- [x] **Step 5: Wire the eval consume path**

In `packages/pack-interaction-inventory/src/evalHook.ts`, add `grantItem`, `ITEM_PURCHASED_EVENT` to the `./core` import and a `connect` member to the returned hook:

```ts
  return {
    packId: 'interaction-inventory',
    createState: () => createInventoryState(),
    connect: (bus, ref) => {
      bus.on(ITEM_PURCHASED_EVENT, (payload) => {
        const state = ref.get() as InventoryState
        ref.set(grantItem(state, (payload as { itemId: string }).itemId))
      })
    },
    nextTarget: (state, player) => nextItemTarget(state as InventoryState, player, config),
    step: (state, player) => stepInventory(state as InventoryState, player, config),
    complete: (state) => inventoryComplete(state as InventoryState, config),
    publishSlices: (state) => ({ inventory: { collected: [...(state as InventoryState).collected] } })
  }
```

- [x] **Step 6: Write the failing pack test (runtime grant + completion unaffected)**

Add to `packages/pack-interaction-inventory/tests/pack.test.ts`, reusing the
file's existing `boot()` helper (`pack.test.ts:7-17`). That helper builds a
`PackBootContext` directly — `createGameHost` + `createNullRenderer` +
`createPackEventBus` + `createPackStateRegistry` — and calls
`interactionInventoryPack.register(ctx, config)`. **Do not use `composePacks`
here**: it returns the bus privately, so the test could never emit onto it.

```ts
import { ITEM_PURCHASED_EVENT } from '../src/core'

it('grants a purchased catalog id on itemPurchased, idempotently', () => {
  const { handle, events, state, app, ctx } = boot()
  events.emit(ITEM_PURCHASED_EVENT, { packId: 'economy-progression', itemId: 'catalog-1' })
  expect((handle.saveState!() as { collected: string[] }).collected).toEqual(['catalog-1'])
  // Idempotent: a duplicate purchase event must not grow the slice.
  events.emit(ITEM_PURCHASED_EVENT, { packId: 'economy-progression', itemId: 'catalog-1' })
  expect((handle.saveState!() as { collected: string[] }).collected).toEqual(['catalog-1'])
  // Sole-writer publication reached the slice registry.
  expect((state.get('inventory') as { collected: string[] }).collected).toEqual(['catalog-1'])
  // A purchased catalog id is NOT part of the fetch objective.
  expect(handle.objectivesComplete!()).toBe(false)
  ctx.host.dispose(); app.remove()
})

it('counts only placed items in the HUD when a catalog id is owned', () => {
  const { handle, events, app, ctx } = boot()
  events.emit(ITEM_PURCHASED_EVENT, { packId: 'economy-progression', itemId: 'catalog-1' })
  const hud = document.querySelector('.inventory-hud span')!
  expect(hud.textContent).toBe(` 0/${fixtureConfig().items.length}`)
  ctx.host.dispose(); app.remove()
})
```

> These two tests are the **only** coverage of the runtime grant path — Task 13's
> parity test proves the eval twin. Do not weaken them into a "nothing happened"
> assertion; the whole point of this task is that an emitted `itemPurchased`
> mutates the inventory slice.

- [x] **Step 7: Run tests to verify they pass**

Run: `npx vitest run --project pack-interaction-inventory`
Expected: PASS (all existing inventory tests + the new core and pack tests).

- [x] **Step 8: Commit**

```bash
git add packages/pack-interaction-inventory/src packages/pack-interaction-inventory/tests
git commit -m "feat(pack-interaction-inventory): grant items on itemPurchased (closes cycle-2 gap)"
```

---

### Task 3: GameSpec economy capability config schema

Replace the Phase 2 empty stub with the one real knob.

**Files:**
- Modify: `packages/contracts/src/gameSpec.ts:97`
- Test: `packages/contracts/tests/gameSpec.test.ts` (add)

**Interfaces:**
- Produces: `capabilityConfigSchemas['economy-progression']` accepting `{ startingBalance?: int 0..999 }`.

- [x] **Step 1: Write the failing test**

Add to `packages/contracts/tests/gameSpec.test.ts`:

```ts
import { capabilityConfigSchemas } from '../src/gameSpec'

it('economy-progression config accepts an optional startingBalance and rejects extras', () => {
  const schema = capabilityConfigSchemas['economy-progression']
  expect(schema.parse({})).toEqual({})
  expect(schema.parse({ startingBalance: 12 })).toEqual({ startingBalance: 12 })
  expect(() => schema.parse({ startingBalance: -1 })).toThrow()
  expect(() => schema.parse({ startingBalance: 1.5 })).toThrow()
  expect(() => schema.parse({ nope: 1 })).toThrow()
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project contracts gameSpec`
Expected: FAIL — `{ startingBalance: 12 }` throws against the empty `z.strictObject({})`.

- [x] **Step 3: Implement**

In `packages/contracts/src/gameSpec.ts`, replace line 97:

```ts
  'economy-progression': z.strictObject({
    startingBalance: z.number().int().min(0).max(999).optional()
  }),
```

- [x] **Step 4: Run test to verify it passes + commit**

Run: `npx vitest run --project contracts gameSpec`
Expected: PASS

```bash
git add packages/contracts/src/gameSpec.ts packages/contracts/tests/gameSpec.test.ts
git commit -m "feat(contracts): economy-progression capability config (startingBalance)"
```

---

### Task 4: Package skeleton + `walletCore`

Scaffold `@automata/pack-economy-progression` and its first pure core.

**Files:**
- Create: `packages/pack-economy-progression/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/pack-economy-progression/src/walletCore.ts`
- Test: `packages/pack-economy-progression/tests/walletCore.test.ts`

**Interfaces:**
- Produces: `WalletState`, `createWalletState`, `earn`, `spend` (`{ ok, state }`), `serializeWallet`, `deserializeWallet`.

- [x] **Step 1: Scaffold the package**

`packages/pack-economy-progression/package.json`:

```json
{
  "name": "@automata/pack-economy-progression",
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

`packages/pack-economy-progression/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/pack-economy-progression/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-economy-progression', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

`packages/pack-economy-progression/src/index.ts`:

```ts
export * from './walletCore'
```

Then install the workspace so the new package resolves:

```bash
npm install
```

- [x] **Step 2: Write the failing walletCore test**

`packages/pack-economy-progression/tests/walletCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createWalletState, earn, spend, serializeWallet, deserializeWallet } from '../src/walletCore'

describe('walletCore', () => {
  it('seeds balance and totalEarned from the starting balance', () => {
    expect(createWalletState(5)).toEqual({ balance: 5, totalEarned: 5 })
  })
  it('earn credits both balance and totalEarned; non-positive is a no-op', () => {
    const s = earn(createWalletState(0), 7)
    expect(s).toEqual({ balance: 7, totalEarned: 7 })
    expect(earn(s, 0)).toBe(s)
  })
  it('spend debits balance only when affordable; totalEarned never drops', () => {
    const s = earn(createWalletState(0), 10)
    const ok = spend(s, 4)
    expect(ok).toEqual({ ok: true, state: { balance: 6, totalEarned: 10 } })
    const broke = spend(s, 99)
    expect(broke).toEqual({ ok: false, state: s })
  })
  it('round-trips through serialize/deserialize', () => {
    const s = earn(createWalletState(3), 5)
    expect(deserializeWallet(serializeWallet(s))).toEqual(s)
    expect(() => deserializeWallet({ balance: -1, totalEarned: 0 })).toThrow()
  })
})
```

- [x] **Step 3: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- walletCore`
Expected: FAIL — module not found.

- [x] **Step 4: Implement `walletCore.ts`**

```ts
import { z } from '@automata/project'

/** Pure currency arithmetic. `totalEarned` is monotonic — the progression signal. */
export interface WalletState { balance: number; totalEarned: number }

export function createWalletState(startingBalance: number): WalletState {
  return { balance: startingBalance, totalEarned: startingBalance }
}

export function earn(state: WalletState, amount: number): WalletState {
  if (amount <= 0) return state
  return { balance: state.balance + amount, totalEarned: state.totalEarned + amount }
}

export interface SpendResult { ok: boolean; state: WalletState }

export function spend(state: WalletState, amount: number): SpendResult {
  if (amount <= 0 || state.balance < amount) return { ok: false, state }
  return { ok: true, state: { balance: state.balance - amount, totalEarned: state.totalEarned } }
}

export const savedWalletSchema = z.strictObject({
  balance: z.number().int().min(0),
  totalEarned: z.number().int().min(0)
})

export function serializeWallet(state: WalletState): unknown { return { balance: state.balance, totalEarned: state.totalEarned } }
export function deserializeWallet(raw: unknown): WalletState { return savedWalletSchema.parse(raw) }
```

- [x] **Step 5: Run test to verify it passes + commit**

Run: `npm test -w @automata/pack-economy-progression -- walletCore`
Expected: PASS

```bash
git add packages/pack-economy-progression package-lock.json
git commit -m "feat(pack-economy-progression): scaffold package + walletCore"
```

---

### Task 5: `shopCore`

Buy-only stock selection: the next unowned, affordable item and an in-radius test.

**Files:**
- Create: `packages/pack-economy-progression/src/shopCore.ts`
- Modify: `packages/pack-economy-progression/src/index.ts` (add `export * from './shopCore'`)
- Test: `packages/pack-economy-progression/tests/shopCore.test.ts`

**Interfaces:**
- Produces: `ShopStockItem`, `ShopDef`, `nextPurchase(shop, balance, owned)`, `inRadius(shop, player)`, `allStockPurchased(shops, purchased)`, `totalStockPrice(shops)`.

> **Deviation from spec §3.2 (deliberate).** The spec writes
> `nextPurchase(shop, wallet, ownedItemIds)`; this takes a plain `balance` number
> so the core never depends on `walletCore`'s shape. Fold back into the spec on ship.

> **`allStockPurchased` exists to fix a spec defect.** Spec §4.2 defines
> `complete` as `progressionComplete` alone and `nextTarget` as "pickups, then
> shops, `null` once all milestones are achieved" — while §4.1 sets the top
> threshold at `≤ startingBalance + Σ pickups`. Those are contradictory: the last
> pickup satisfies the top milestone, `complete` flips true, and the shop branch
> of `nextTarget` is **unreachable dead code**, so the headless twin never buys
> anything and the purchase→grant loop is unprovable. This cycle therefore makes
> the economy objective "all milestones achieved **and** all shop stock
> purchased", with a matching compose-time affordability invariant (Task 8).
> Fold both back into the spec on ship.

- [x] **Step 1: Write the failing test**

`packages/pack-economy-progression/tests/shopCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nextPurchase, inRadius, allStockPurchased, totalStockPrice, type ShopDef } from '../src/shopCore'

const shop: ShopDef = {
  id: 's1', position: { x: 0, z: 0 }, radius: 1.5,
  stock: [{ itemId: 'catalog-2', price: 4 }, { itemId: 'catalog-1', price: 3 }, { itemId: 'catalog-3', price: 99 }]
}

describe('shopCore', () => {
  it('returns the first unowned affordable item in itemId order', () => {
    expect(nextPurchase(shop, 10, new Set())).toEqual({ itemId: 'catalog-1', price: 3 })
  })
  it('skips owned items and unaffordable items', () => {
    expect(nextPurchase(shop, 10, new Set(['catalog-1']))).toEqual({ itemId: 'catalog-2', price: 4 })
    expect(nextPurchase(shop, 3, new Set(['catalog-1', 'catalog-2']))).toBeNull()
  })
  it('inRadius respects the shop radius', () => {
    expect(inRadius(shop, { x: 1, z: 0 })).toBe(true)
    expect(inRadius(shop, { x: 5, z: 0 })).toBe(false)
  })
  it('allStockPurchased is true only when every stock id is owned', () => {
    expect(allStockPurchased([shop], new Set())).toBe(false)
    expect(allStockPurchased([shop], new Set(['catalog-1', 'catalog-2']))).toBe(false)
    expect(allStockPurchased([shop], new Set(['catalog-1', 'catalog-2', 'catalog-3']))).toBe(true)
  })
  it('allStockPurchased is vacuously true with no shops or empty stock', () => {
    expect(allStockPurchased([], new Set())).toBe(true)
    expect(allStockPurchased([{ ...shop, stock: [] }], new Set())).toBe(true)
  })
  it('totalStockPrice sums every shop', () => {
    expect(totalStockPrice([shop])).toBe(106)
    expect(totalStockPrice([])).toBe(0)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- shopCore`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `shopCore.ts`**

```ts
/** Buy-only shop stock. Ids are catalog-only (not placed items) — see composeSection. */
export interface ShopStockItem { itemId: string; price: number }
export interface ShopDef {
  id: string
  position: { x: number; z: number }
  radius: number
  stock: readonly ShopStockItem[]
}

const byItemId = (a: ShopStockItem, b: ShopStockItem): number =>
  a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0

/** First unowned, affordable stock item by itemId order; null if none qualify. */
export function nextPurchase(shop: ShopDef, balance: number, owned: ReadonlySet<string>): ShopStockItem | null {
  return [...shop.stock]
    .filter((entry) => !owned.has(entry.itemId) && entry.price <= balance)
    .sort(byItemId)[0] ?? null
}

export function inRadius(shop: ShopDef, player: { x: number; z: number }): boolean {
  return Math.hypot(shop.position.x - player.x, shop.position.z - player.z) <= shop.radius
}

/** Half of the economy objective: every shop's stock has been bought. */
export function allStockPurchased(shops: readonly ShopDef[], purchased: ReadonlySet<string>): boolean {
  return shops.every((shop) => shop.stock.every((entry) => purchased.has(entry.itemId)))
}

/** Compose-time affordability input: the currency needed to clear every shop. */
export function totalStockPrice(shops: readonly ShopDef[]): number {
  return shops.reduce((sum, shop) => sum + shop.stock.reduce((inner, entry) => inner + entry.price, 0), 0)
}
```

Add `export * from './shopCore'` to `src/index.ts`.

- [x] **Step 4: Run test to verify it passes + commit**

Run: `npm test -w @automata/pack-economy-progression -- shopCore`
Expected: PASS

```bash
git add packages/pack-economy-progression/src packages/pack-economy-progression/tests
git commit -m "feat(pack-economy-progression): shopCore buy-only selection"
```

---

### Task 6: `progressionCore`

Milestones flip in ascending-threshold order as `totalEarned` crosses them.

**Files:**
- Create: `packages/pack-economy-progression/src/progressionCore.ts`
- Modify: `packages/pack-economy-progression/src/index.ts` (add `export * from './progressionCore'`)
- Test: `packages/pack-economy-progression/tests/progressionCore.test.ts`

**Interfaces:**
- Produces: `MilestoneDef`, `ProgressionState`, `createProgressionState`, `advance(state, totalEarned, milestones) → { state, newlyAchieved }`, `progressionComplete(state, milestones)`, `savedProgressionSchema`, `serializeProgression`, `deserializeProgression`.

- [x] **Step 1: Write the failing test**

`packages/pack-economy-progression/tests/progressionCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  advance, createProgressionState, progressionComplete, serializeProgression, deserializeProgression,
  type MilestoneDef
} from '../src/progressionCore'

const milestones: MilestoneDef[] = [{ id: 'm2', threshold: 10 }, { id: 'm1', threshold: 5 }]

describe('progressionCore', () => {
  it('flips milestones in ascending threshold order and reports only new ones', () => {
    const r1 = advance(createProgressionState(), 6, milestones)
    expect(r1.newlyAchieved).toEqual(['m1'])
    const r2 = advance(r1.state, 12, milestones)
    expect(r2.newlyAchieved).toEqual(['m2'])
    expect(advance(r2.state, 99, milestones).newlyAchieved).toEqual([])
  })
  it('completes only when every milestone is achieved', () => {
    const r = advance(createProgressionState(), 99, milestones)
    expect(progressionComplete(r.state, milestones)).toBe(true)
    expect(progressionComplete(createProgressionState(), milestones)).toBe(false)
  })
  it('round-trips', () => {
    const r = advance(createProgressionState(), 6, milestones)
    expect(deserializeProgression(serializeProgression(r.state))).toEqual(r.state)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- progressionCore`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `progressionCore.ts`**

```ts
import { z } from '@automata/project'

export interface MilestoneDef { id: string; threshold: number }
export interface ProgressionState { achieved: readonly string[] }

export function createProgressionState(): ProgressionState { return { achieved: [] } }

export interface AdvanceResult { state: ProgressionState; newlyAchieved: readonly string[] }

/** Flip every milestone whose threshold <= totalEarned, in ascending threshold order. */
export function advance(state: ProgressionState, totalEarned: number, milestones: readonly MilestoneDef[]): AdvanceResult {
  const already = new Set(state.achieved)
  const newlyAchieved = [...milestones]
    .sort((a, b) => a.threshold - b.threshold)
    .filter((milestone) => totalEarned >= milestone.threshold && !already.has(milestone.id))
    .map((milestone) => milestone.id)
  if (newlyAchieved.length === 0) return { state, newlyAchieved: [] }
  return { state: { achieved: [...state.achieved, ...newlyAchieved] }, newlyAchieved }
}

export function progressionComplete(state: ProgressionState, milestones: readonly MilestoneDef[]): boolean {
  const achieved = new Set(state.achieved)
  return milestones.every((milestone) => achieved.has(milestone.id))
}

export const savedProgressionSchema = z.strictObject({
  achieved: z.array(z.string().min(1).max(40)).max(12)
})

export function serializeProgression(state: ProgressionState): unknown { return { achieved: [...state.achieved] } }
export function deserializeProgression(raw: unknown): ProgressionState { return savedProgressionSchema.parse(raw) }
```

Add `export * from './progressionCore'` to `src/index.ts`.

- [x] **Step 4: Run test to verify it passes + commit**

Run: `npm test -w @automata/pack-economy-progression -- progressionCore`
Expected: PASS

```bash
git add packages/pack-economy-progression/src packages/pack-economy-progression/tests
git commit -m "feat(pack-economy-progression): progressionCore threshold milestones"
```

---

### Task 7: `config.ts` — compiled pack config + contract names

The strict zod schema over the three cores, plus the slice ids and event names (deliberate string copies).

**Files:**
- Create: `packages/pack-economy-progression/src/config.ts`
- Modify: `packages/pack-economy-progression/src/index.ts` (add `export * from './config'`)
- Test: `packages/pack-economy-progression/tests/config.test.ts`

**Interfaces:**
- Produces: `WALLET_SLICE_ID`, `PROGRESSION_SLICE_ID`, `INVENTORY_SLICE_ID`, `ITEM_PURCHASED_EVENT`, `MILESTONE_REACHED_EVENT`, `ENEMY_DEFEATED_EVENT`, `QUEST_COMPLETED_EVENT`, `WalletSliceValue`, `ProgressionSliceValue`, `EconomyPackConfig`, `packConfigSchema`.

- [x] **Step 1: Write the failing test**

`packages/pack-economy-progression/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { packConfigSchema } from '../src/config'

const base = () => ({
  wallet: { startingBalance: 5 },
  pickups: [{ id: 'p1', position: { x: 1, z: 1 }, amount: 5 }],
  shops: [{ id: 's1', position: { x: 2, z: 2 }, radius: 1.5, stock: [{ itemId: 'catalog-1', price: 8 }] }],
  bounty: { perEnemy: 3 },
  questReward: { perQuest: 6 },
  progression: { milestones: [{ id: 'm1', threshold: 5 }, { id: 'm2', threshold: 12 }] }
})

describe('packConfigSchema', () => {
  it('accepts a well-formed config', () => {
    expect(() => packConfigSchema.parse(base())).not.toThrow()
  })
  it('rejects non-ascending or duplicate milestone thresholds', () => {
    const bad = base(); bad.progression.milestones = [{ id: 'm1', threshold: 12 }, { id: 'm2', threshold: 5 }]
    expect(() => packConfigSchema.parse(bad)).toThrow()
  })
  it('rejects duplicate pickup ids', () => {
    const bad = base(); bad.pickups = [bad.pickups[0]!, { ...bad.pickups[0]!, position: { x: 9, z: 9 } }]
    expect(() => packConfigSchema.parse(bad)).toThrow()
  })
  it('rejects duplicate shop ids', () => {
    const bad = base(); bad.shops = [bad.shops[0]!, { ...bad.shops[0]!, position: { x: 9, z: 9 } }]
    expect(() => packConfigSchema.parse(bad)).toThrow()
  })
  it('rejects duplicate milestone ids', () => {
    const bad = base()
    bad.progression.milestones = [{ id: 'm1', threshold: 5 }, { id: 'm1', threshold: 12 }]
    expect(() => packConfigSchema.parse(bad)).toThrow()
  })
  it('rejects coincident pickup/shop positions (spec §2.4 "positions distinct")', () => {
    const bad = base(); bad.shops[0]!.position = { ...bad.pickups[0]!.position }
    expect(() => packConfigSchema.parse(bad)).toThrow()
  })
  it('rejects unknown keys (strict)', () => {
    expect(() => packConfigSchema.parse({ ...base(), extra: 1 })).toThrow()
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- config`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `config.ts`**

```ts
import { z } from '@automata/project'
import { savedWalletSchema } from './walletCore'
import { savedProgressionSchema } from './progressionCore'

/**
 * Compiled economy config. Slice ids and consumed event names are deliberate
 * string copies of other packs' contracts — pack-to-pack imports are forbidden
 * and the reads/consumes degrade gracefully when those packs are absent.
 */
export const WALLET_SLICE_ID = 'wallet'
export const PROGRESSION_SLICE_ID = 'progression'
export const INVENTORY_SLICE_ID = 'inventory'
export const ITEM_PURCHASED_EVENT = 'itemPurchased'
export const MILESTONE_REACHED_EVENT = 'milestoneReached'
export const ENEMY_DEFEATED_EVENT = 'enemyDefeated'
export const QUEST_COMPLETED_EVENT = 'questCompleted'

/** Runtime slice payloads — also the eval hook's published shapes. */
export interface WalletSliceValue { balance: number; totalEarned: number }
export interface ProgressionSliceValue { achieved: readonly string[] }

const idSchema = z.string().min(1).max(60)
const positionSchema = z.strictObject({ x: z.number(), z: z.number() })

const baseConfigSchema = z.strictObject({
  wallet: z.strictObject({ startingBalance: z.number().int().min(0).max(999) }),
  pickups: z.array(z.strictObject({
    id: idSchema, position: positionSchema, amount: z.number().int().min(1).max(500)
  })).max(12),
  shops: z.array(z.strictObject({
    id: idSchema, position: positionSchema, radius: z.number().min(0.5).max(5),
    stock: z.array(z.strictObject({ itemId: idSchema, price: z.number().int().min(1).max(999) })).max(8)
  })).max(6),
  bounty: z.strictObject({ perEnemy: z.number().int().min(0).max(500) }),
  questReward: z.strictObject({ perQuest: z.number().int().min(0).max(500) }),
  progression: z.strictObject({
    milestones: z.array(z.strictObject({
      id: z.string().min(1).max(40), threshold: z.number().int().min(0).max(99999)
    })).min(1).max(12)
  })
})
export type EconomyPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] => ids.filter((id, index) => ids.indexOf(id) !== index)

export const packConfigSchema: z.ZodType<EconomyPackConfig> = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  for (const dup of duplicates(config.pickups.map((p) => p.id))) issue(`duplicate pickup id "${dup}"`)
  for (const dup of duplicates(config.shops.map((s) => s.id))) issue(`duplicate shop id "${dup}"`)
  for (const dup of duplicates(config.progression.milestones.map((m) => m.id))) issue(`duplicate milestone id "${dup}"`)
  // Spec §2.4: pickup and shop positions must all be distinct.
  const points = [...config.pickups.map((p) => p.position), ...config.shops.map((s) => s.position)]
  for (const dup of duplicates(points.map((point) => `${point.x},${point.z}`))) {
    issue(`duplicate pickup/shop position "${dup}"`)
  }
  const thresholds = config.progression.milestones.map((m) => m.threshold)
  for (let i = 1; i < thresholds.length; i += 1) {
    if (thresholds[i]! <= thresholds[i - 1]!) issue('milestone thresholds must be strictly ascending')
  }
})

/**
 * Saved shape (contract-v2 persistence slot). `collectedPickups` and
 * `purchased` ARE persisted — a deviation from spec §3.4, which assumed both
 * were recomputable bookkeeping. Neither is: without `collectedPickups` a
 * reload lets the player re-earn every pickup, and `purchased` is now
 * load-bearing for `objectivesComplete` (Task 5). Fold back into the spec.
 */
export const savedEconomySchema = z.strictObject({
  wallet: savedWalletSchema,
  progression: savedProgressionSchema,
  collectedPickups: z.array(idSchema).max(12),
  purchased: z.array(idSchema).max(8)
})
export type SavedEconomy = z.infer<typeof savedEconomySchema>
```

Add `export * from './config'` to `src/index.ts`.

- [x] **Step 4: Run test to verify it passes + commit**

Run: `npm test -w @automata/pack-economy-progression -- config`
Expected: PASS

```bash
git add packages/pack-economy-progression/src packages/pack-economy-progression/tests
git commit -m "feat(pack-economy-progression): compiled pack config schema"
```

---

### Task 8: `composeSection` — seeded generation + reachability + catalog cap

Deterministic pickup/shop placement, catalog stock bounded by inventory's 8-item cap, and milestone thresholds that always complete from base earning.

**Files:**
- Create: `packages/pack-economy-progression/src/composeSection.ts`
- Modify: `packages/pack-economy-progression/src/index.ts` (add `export * from './composeSection'`)
- Test: `packages/pack-economy-progression/tests/composeSection.test.ts`

**Interfaces:**
- Consumes: `SeededRng` from `@automata/engine`, `packConfigSchema`/`EconomyPackConfig` from `./config`.
- Produces: `ECONOMY_DEFAULTS`, `EconomyComposeInput`, `composeEconomySection(input, rng) → EconomyPackConfig`.

- [x] **Step 1: Write the failing test**

`packages/pack-economy-progression/tests/composeSection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { composeEconomySection, ECONOMY_DEFAULTS, type EconomyComposeInput } from '../src/composeSection'

const input = (over: Partial<EconomyComposeInput> = {}): EconomyComposeInput => ({
  specConfig: {},
  cast: [{ id: 'c-shop', name: 'Trader', role: 'vendor' }],
  milestones: [{ id: 'm1' }, { id: 'm2' }],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: { items: [{ id: 'item-1', position: { x: 2, z: 3 } }] },
  occupied: [],
  ...over
})

describe('composeEconomySection', () => {
  it('is deterministic for a fixed seed', () => {
    const a = composeEconomySection(input(), createSeededRng(7))
    const b = composeEconomySection(input(), createSeededRng(7))
    expect(a).toEqual(b)
  })
  it('keeps the top threshold reachable from starting balance + pickups', () => {
    const cfg = composeEconomySection(input(), createSeededRng(7))
    const base = cfg.wallet.startingBalance + cfg.pickups.reduce((sum, p) => sum + p.amount, 0)
    const top = Math.max(...cfg.progression.milestones.map((m) => m.threshold))
    expect(top).toBeLessThanOrEqual(base)
    expect(cfg.progression.milestones.map((m) => m.id)).toEqual(['m1', 'm2'])
  })
  it('keeps placed + purchasable within the inventory 8-item cap', () => {
    const placed = 6
    const items = Array.from({ length: placed }, (_, i) => ({ id: `item-${i + 1}`, position: { x: i, z: 0 } }))
    const cfg = composeEconomySection(input({ inventory: { items } }), createSeededRng(7))
    const purchasable = cfg.shops.reduce((sum, s) => sum + s.stock.length, 0)
    expect(placed + purchasable).toBeLessThanOrEqual(8)
  })
  it('produces no shop when the cast has no vendor', () => {
    const cfg = composeEconomySection(input({ cast: [] }), createSeededRng(7))
    expect(cfg.shops).toEqual([])
  })
  it('keeps every stocked item affordable from base earning', () => {
    // Completion now requires buying out every shop (Task 5), so the compose
    // step must guarantee the currency exists.
    const cast = Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, role: 'vendor' }))
    const cfg = composeEconomySection(input({ cast }), createSeededRng(7))
    const base = cfg.wallet.startingBalance + cfg.pickups.reduce((sum, p) => sum + p.amount, 0)
    expect(totalStockPrice(cfg.shops)).toBeLessThanOrEqual(base)
  })
  it('honours soft keepouts from other composed sections', () => {
    const occupied = [{ x: 5, z: 5 }, { x: -4, z: 2 }]
    const cfg = composeEconomySection(input({ occupied }), createSeededRng(7))
    const placed = [...cfg.pickups.map((p) => p.position), ...cfg.shops.map((s) => s.position)]
    for (const point of placed) {
      for (const keepout of occupied) {
        expect(Math.hypot(point.x - keepout.x, point.z - keepout.z)).toBeGreaterThanOrEqual(2)
      }
    }
  })
  it('throws a typed error when the placement budget is exhausted', () => {
    // extent = half - WALL_MARGIN = 0.5, so no two draws can be 2 apart.
    expect(() => composeEconomySection(
      input({ arena: { half: 1.5, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } } }),
      createSeededRng(7)
    )).toThrow(/placement budget exhausted/)
  })
})
```

> Add `totalStockPrice` to the `../src/shopCore` imports at the top of this file.

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- composeSection`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `composeSection.ts`**

```ts
import type { SeededRng } from '@automata/engine'
import { packConfigSchema, type EconomyPackConfig } from './config'
import { totalStockPrice } from './shopCore'

export const ECONOMY_DEFAULTS = {
  startingBalance: 5,
  pickupCount: 3,
  pickupAmount: 5,
  shopRadius: 1.5,
  catalogPrice: 8,
  bountyPerEnemy: 3,
  questRewardPerQuest: 6
} as const

export interface EconomyComposeInput {
  specConfig: { startingBalance?: number }
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  /** Spec progression milestones — ids get seeded ascending thresholds here. */
  milestones: ReadonlyArray<{ id: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  /** Required: economy requires interaction-inventory. Placed item ids bound the catalog. */
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> }
  /** Soft-keepout points from other composed sections (dialogue NPCs, walker stations, enemy posts). */
  occupied: ReadonlyArray<{ x: number; z: number }>
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const DRAW_BUDGET = 200
const INVENTORY_CAP = 8

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Seeded currency pickups, vendor shops with catalog stock, and reachable milestone thresholds. */
export function composeEconomySection(input: EconomyComposeInput, rng: SeededRng): EconomyPackConfig {
  const startingBalance = input.specConfig.startingBalance ?? ECONOMY_DEFAULTS.startingBalance
  const extent = input.arena.half - WALL_MARGIN
  const placed = input.inventory.items.map((item) => item.position)
  const soft: Array<{ x: number; z: number }> = [...placed, ...input.occupied]
  const taken: Array<{ x: number; z: number }> = []

  const drawPosition = (label: string): { x: number; z: number } => {
    for (let draw = 0; draw < DRAW_BUDGET; draw += 1) {
      const candidate = { x: round2((rng.next() * 2 - 1) * extent), z: round2((rng.next() * 2 - 1) * extent) }
      if (!far(candidate, input.arena.spawn, KEEPOUT)) continue
      if (!far(candidate, input.arena.goal, KEEPOUT)) continue
      if (!soft.every((point) => far(candidate, point, SEPARATION))) continue
      if (!taken.every((point) => far(candidate, point, SEPARATION))) continue
      taken.push(candidate)
      return candidate
    }
    throw new Error(`Economy placement budget exhausted: ${label}`)
  }

  const pickups = Array.from({ length: ECONOMY_DEFAULTS.pickupCount }, (_, index) => ({
    id: `currency-${index + 1}`,
    position: drawPosition(`pickup ${index + 1}`),
    amount: ECONOMY_DEFAULTS.pickupAmount
  }))

  const totalBase = startingBalance + pickups.reduce((sum, pickup) => sum + pickup.amount, 0)

  const vendors = input.cast.filter((member) => member.role === 'vendor')
  // Catalog goods are new ids (never placed) and are bounded twice: by
  // inventory's `collected` cap, and by the currency base earning can actually
  // produce — economy's objective includes buying every stocked item, so
  // unaffordable stock would make the composition uncompletable.
  const affordBudget = Math.floor(totalBase / ECONOMY_DEFAULTS.catalogPrice)
  let catalogBudget = Math.max(0, Math.min(INVENTORY_CAP - input.inventory.items.length, affordBudget))
  let catalogIndex = 0
  const shops = vendors.map((vendor, index) => {
    const stock = catalogBudget > 0
      ? [{ itemId: `catalog-${(catalogIndex += 1)}`, price: ECONOMY_DEFAULTS.catalogPrice }]
      : []
    if (stock.length > 0) catalogBudget -= 1
    return {
      id: `shop-${index + 1}`,
      position: drawPosition(`shop ${index + 1} (${vendor.name})`),
      radius: ECONOMY_DEFAULTS.shopRadius,
      stock
    }
  })

  const count = input.milestones.length
  // Defensive: unreachable with the current fixed constants (totalBase >= 20,
  // count <= 12), but the two are independently tunable.
  if (count === 0 || totalBase < count) {
    throw new Error(`Economy progression unreachable: totalBase ${totalBase} < ${count} milestones`)
  }
  let previous = 0
  const milestones = input.milestones.map((milestone, index) => {
    let threshold = Math.round(((index + 1) / count) * totalBase)
    if (threshold <= previous) threshold = previous + 1
    previous = threshold
    return { id: milestone.id, threshold }
  })
  const top = milestones[milestones.length - 1]!.threshold
  if (top > totalBase) throw new Error(`Economy reachability invariant violated: top ${top} > base ${totalBase}`)
  const stockCost = totalStockPrice(shops)
  if (stockCost > totalBase) {
    throw new Error(`Economy affordability invariant violated: stock ${stockCost} > base ${totalBase}`)
  }

  return packConfigSchema.parse({
    wallet: { startingBalance },
    pickups,
    shops,
    bounty: { perEnemy: ECONOMY_DEFAULTS.bountyPerEnemy },
    questReward: { perQuest: ECONOMY_DEFAULTS.questRewardPerQuest },
    progression: { milestones }
  })
}
```

Add `export * from './composeSection'` to `src/index.ts`.

- [x] **Step 4: Run test to verify it passes + commit**

Run: `npm test -w @automata/pack-economy-progression -- composeSection`
Expected: PASS

```bash
git add packages/pack-economy-progression/src packages/pack-economy-progression/tests
git commit -m "feat(pack-economy-progression): seeded composeSection with reachability + catalog cap"
```

---

### Task 9: `pack.ts` — browser adapter

Owns `wallet` + `progression`; collects pickups, auto-buys in shop radius (emitting `itemPurchased`), advances progression (emitting `milestoneReached`), and earns from subscribed `enemyDefeated` / `questCompleted`.

**Files:**
- Create: `packages/pack-economy-progression/src/pack.ts`
- Modify: `packages/pack-economy-progression/src/index.ts` (add `export * from './pack'`)
- Test: `packages/pack-economy-progression/tests/pack.test.ts`

**Interfaces:**
- Consumes: `GamePack`, `PackRuntimeHandle`, `packCompatibility` from `@automata/game-kit`; the three cores + `config.ts`.
- Produces: `economyProgressionPack: GamePack<EconomyPackConfig>`.

- [x] **Step 1: Write the failing test**

`packages/pack-economy-progression/tests/pack.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import {
  createGameHost, createPackEventBus, createPackStateRegistry, type PackBootContext
} from '@automata/game-kit'
import { economyProgressionPack } from '../src/pack'

const config = () => ({
  wallet: { startingBalance: 0 },
  pickups: [{ id: 'currency-1', position: { x: 0, z: 0 }, amount: 5 }],
  shops: [],
  bounty: { perEnemy: 3 },
  questReward: { perQuest: 6 },
  progression: { milestones: [{ id: 'm1', threshold: 5 }] }
})

const shopConfig = () => ({
  ...config(),
  wallet: { startingBalance: 10 },
  pickups: [],
  shops: [{ id: 'shop-1', position: { x: 0, z: 0 }, radius: 1.5, stock: [{ itemId: 'catalog-1', price: 8 }] }],
  progression: { milestones: [{ id: 'm1', threshold: 10 }] }
})

/**
 * Direct register, NOT composePacks: economy declares
 * `requires: ['interaction-inventory']`, so composePacks on a single-pack set
 * throws PackCompositionError (`game-kit/src/packs.ts:96,140`). Registering
 * directly also hands the test the bus and slice registry, which composePacks
 * keeps private. Mirrors `pack-interaction-inventory/tests/pack.test.ts:7-17`.
 */
function boot(cfg: unknown = config()) {
  const app = document.createElement('div')
  document.body.append(app)
  const render = createNullRenderer()
  const events = createPackEventBus()
  const state = createPackStateRegistry()
  // Stand in for the inventory pack, the real owner of this slice.
  state.register('inventory', 'interaction-inventory', { collected: [] })
  const ctx: PackBootContext = { host: createGameHost(app), render: render.port, events, state }
  const handle = economyProgressionPack.register(ctx, economyProgressionPack.configSchema!.parse(cfg))
  if (!handle) throw new Error('pack must return a runtime handle')
  return { ctx, render, handle, app, events, state }
}
type Booted = ReturnType<typeof boot>
const teardown = (h: Booted): void => { h.handle.dispose?.(); h.ctx.host.dispose(); h.app.remove() }
const saved = (h: Booted) => h.handle.saveState!() as {
  wallet: { balance: number; totalEarned: number }
  progression: { achieved: string[] }
  collectedPickups: string[]
  purchased: string[]
}

describe('economyProgressionPack', () => {
  it('collects a pickup, earns currency, completes progression, and updates the HUD', () => {
    const h = boot()
    expect(h.ctx.host.overlays.querySelector('.economy-hud')!.textContent).toBe('¤ 0 · milestones 0/1')
    h.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    expect(saved(h).wallet.totalEarned).toBe(5)
    expect(h.handle.objectivesComplete!()).toBe(true)
    expect(h.ctx.host.overlays.querySelector('.economy-hud')!.textContent).toBe('¤ 5 · milestones 1/1')
    teardown(h)
  })

  it('removes the pickup marker on collection and leaves nothing behind on dispose', () => {
    const h = boot()
    expect(h.render.port.objectCount).toBe(1)
    h.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    expect(h.render.port.objectCount).toBe(0)
    teardown(h)
    expect(h.render.port.objectCount).toBe(0)
  })

  it('writes the wallet and progression slices it owns', () => {
    const h = boot()
    h.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    expect(h.state.get('wallet')).toEqual({ balance: 5, totalEarned: 5 })
    expect(h.state.get('progression')).toEqual({ achieved: ['m1'] })
    teardown(h)
  })

  it('auto-buys in shop radius, emits itemPurchased, and gates completion on stock', () => {
    const h = boot(shopConfig())
    const purchases: unknown[] = []
    const milestones: unknown[] = []
    h.events.on('itemPurchased', (payload) => purchases.push(payload))
    h.events.on('milestoneReached', (payload) => milestones.push(payload))
    // Progression is already satisfiable from the starting balance, but the
    // objective is not complete until the stock is bought.
    expect(h.handle.objectivesComplete!()).toBe(false)
    h.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    expect(purchases).toEqual([{ packId: 'economy-progression', itemId: 'catalog-1' }])
    expect(milestones).toEqual([{ packId: 'economy-progression', milestoneId: 'm1' }])
    expect(saved(h).wallet).toEqual({ balance: 2, totalEarned: 10 })
    expect(h.handle.objectivesComplete!()).toBe(true)
    // Second tick must not re-buy: `purchased` is folded into the owned set.
    h.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    expect(purchases).toHaveLength(1)
    expect(saved(h).wallet.balance).toBe(2)
    teardown(h)
  })

  it('does not buy what it cannot afford', () => {
    const h = boot({ ...shopConfig(), wallet: { startingBalance: 3 } })
    h.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    expect(saved(h).purchased).toEqual([])
    expect(saved(h).wallet.balance).toBe(3)
    teardown(h)
  })

  it('earns a bounty and a quest reward from subscribed events', () => {
    const h = boot()
    h.events.emit('enemyDefeated', { packId: 'combat-ai', enemyId: 'e1' })
    h.events.emit('questCompleted', { packId: 'dialogue-quests', questId: 'q1' })
    expect(saved(h).wallet).toEqual({ balance: 9, totalEarned: 9 })
    teardown(h)
  })

  it('round-trips wallet, progression, pickups, and purchases through save/load', () => {
    const first = boot(shopConfig())
    first.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    const snapshot = first.handle.saveState!()
    teardown(first)

    const fresh = boot(shopConfig())
    fresh.handle.loadState!(snapshot)
    expect(fresh.handle.objectivesComplete!()).toBe(true)
    expect(saved(fresh)).toEqual(snapshot)
    // A reload must not let the player re-earn a collected pickup.
    const reloaded = boot()
    reloaded.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    const afterPickup = reloaded.handle.saveState!()
    const again = boot()
    again.handle.loadState!(afterPickup)
    again.handle.fixedUpdate!(1 / 60, { playerPosition: { x: 0, z: 0 } })
    expect(saved(again).wallet.totalEarned).toBe(5)
    teardown(fresh); teardown(reloaded); teardown(again)
  })

  it('rejects a malformed saved state', () => {
    const h = boot()
    expect(() => h.handle.loadState!({ wallet: { balance: -1, totalEarned: 0 } })).toThrow()
    teardown(h)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- pack`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `pack.ts`**

```ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  WALLET_SLICE_ID, PROGRESSION_SLICE_ID, INVENTORY_SLICE_ID,
  ITEM_PURCHASED_EVENT, MILESTONE_REACHED_EVENT, ENEMY_DEFEATED_EVENT, QUEST_COMPLETED_EVENT,
  packConfigSchema, savedEconomySchema, type EconomyPackConfig
} from './config'
import { createWalletState, earn, spend, type WalletState } from './walletCore'
import { allStockPurchased, inRadius, nextPurchase } from './shopCore'
import {
  advance, createProgressionState, progressionComplete, type MilestoneDef, type ProgressionState
} from './progressionCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const PICKUP_COLOR = '#3ddc97'
const PICKUP_RADIUS = 0.3
const SHOP_COLOR = '#c77dff'
const SHOP_RADIUS = 0.5

/** The fifth standard pack: wallet + buy-only shops + threshold progression. */
export const economyProgressionPack: GamePack<EconomyPackConfig> = {
  id: 'economy-progression',
  version: '1.0.0',
  compatibility: packCompatibility({
    requires: ['interaction-inventory'],
    integratesWith: ['combat-ai', 'dialogue-quests'],
    stateSlices: { owns: [WALLET_SLICE_ID, PROGRESSION_SLICE_ID], reads: [INVENTORY_SLICE_ID] },
    events: {
      emits: [ITEM_PURCHASED_EVENT, MILESTONE_REACHED_EVENT],
      consumes: [ENEMY_DEFEATED_EVENT, QUEST_COMPLETED_EVENT]
    }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    const milestones: MilestoneDef[] = config.progression.milestones.map((m) => ({ id: m.id, threshold: m.threshold }))
    let wallet: WalletState = createWalletState(config.wallet.startingBalance)
    let progression: ProgressionState = createProgressionState()
    let collectedPickups = new Set<string>()
    // Economy's own record of what it bought. Ownership still lives in the
    // inventory slice (economy never writes it), but completion must be
    // answerable from state alone — PackEvalHook.complete gets no slice view.
    let purchased = new Set<string>()

    ctx.state.register(WALLET_SLICE_ID, economyProgressionPack.id, { balance: wallet.balance, totalEarned: wallet.totalEarned })
    ctx.state.register(PROGRESSION_SLICE_ID, economyProgressionPack.id, { achieved: [...progression.achieved] })

    const entities = new Map<string, { id: string }>()
    const addMarker = (key: string, x: number, z: number, radius: number, color: string): void => {
      const entity = { id: key }
      entities.set(key, entity)
      ctx.render.add(entity, { primitive: 'sphere', radius, color })
      ctx.render.setPose(entity, { x, y: radius, z }, IDENTITY)
    }
    for (const pickup of config.pickups) addMarker(`economy-pickup-${pickup.id}`, pickup.position.x, pickup.position.z, PICKUP_RADIUS, PICKUP_COLOR)
    for (const shop of config.shops) addMarker(`economy-shop-${shop.id}`, shop.position.x, shop.position.z, SHOP_RADIUS, SHOP_COLOR)

    const hud = document.createElement('div')
    hud.className = 'economy-hud'
    ctx.host.overlays.append(hud)
    const updateHud = (): void => {
      hud.textContent = `¤ ${wallet.balance} · milestones ${progression.achieved.length}/${milestones.length}`
    }
    updateHud()

    const publishWallet = (): void => ctx.state.set(WALLET_SLICE_ID, economyProgressionPack.id, { balance: wallet.balance, totalEarned: wallet.totalEarned })
    const publishProgression = (): void => ctx.state.set(PROGRESSION_SLICE_ID, economyProgressionPack.id, { achieved: [...progression.achieved] })

    /** Recompute progression from totalEarned and emit one event per new milestone. */
    const advanceProgression = (): void => {
      const result = advance(progression, wallet.totalEarned, milestones)
      if (result.newlyAchieved.length === 0) return
      progression = result.state
      publishProgression()
      for (const milestoneId of result.newlyAchieved) {
        ctx.events.emit(MILESTONE_REACHED_EVENT, { packId: economyProgressionPack.id, milestoneId })
      }
    }

    /**
     * Ownership = inventory's granted set ∪ economy's own purchases. The union
     * matters twice: it keeps the pack correct when composed without a granting
     * inventory (no re-buying every tick), and it makes the runtime agree with
     * the eval twin, which reads a tick-start slice snapshot.
     */
    const ownedItems = (): ReadonlySet<string> => {
      const owned = new Set(purchased)
      if (!ctx.state.has(INVENTORY_SLICE_ID)) return owned
      const collected = (ctx.state.get(INVENTORY_SLICE_ID) as { collected?: readonly string[] }).collected ?? []
      for (const id of collected) owned.add(id)
      return owned
    }

    // Bounty and reward: earn on subscribed events; progression catches up next fixedUpdate.
    ctx.events.on(ENEMY_DEFEATED_EVENT, () => { wallet = earn(wallet, config.bounty.perEnemy); publishWallet(); updateHud() })
    ctx.events.on(QUEST_COMPLETED_EVENT, () => { wallet = earn(wallet, config.questReward.perQuest); publishWallet(); updateHud() })

    return {
      fixedUpdate(_dt, world) {
        // 1. Collect pickups in range.
        for (const pickup of config.pickups) {
          if (collectedPickups.has(pickup.id)) continue
          if (Math.hypot(pickup.position.x - world.playerPosition.x, pickup.position.z - world.playerPosition.z) > PICKUP_RADIUS + 0.5) continue
          collectedPickups.add(pickup.id)
          wallet = earn(wallet, pickup.amount)
          const entity = entities.get(`economy-pickup-${pickup.id}`)
          if (entity) { ctx.render.remove(entity); entities.delete(`economy-pickup-${pickup.id}`) }
        }
        // 2. Auto-buy one item per in-range shop (emit is synchronous: inventory grants, ownedItems() updates same tick).
        for (const shop of config.shops) {
          if (!inRadius(shop, world.playerPosition)) continue
          const purchase = nextPurchase(shop, wallet.balance, ownedItems())
          if (!purchase) continue
          const result = spend(wallet, purchase.price)
          if (!result.ok) continue
          wallet = result.state
          purchased.add(purchase.itemId)
          ctx.events.emit(ITEM_PURCHASED_EVENT, { packId: economyProgressionPack.id, itemId: purchase.itemId })
        }
        publishWallet()
        advanceProgression()
        updateHud()
      },
      // The objective is the whole loop: earn past every threshold AND clear
      // every shop. Milestones alone would leave the shop unreachable — see the
      // spec-defect note in Task 5.
      objectivesComplete: () =>
        progressionComplete(progression, milestones) && allStockPurchased(config.shops, purchased),
      saveState: () => ({
        wallet: { balance: wallet.balance, totalEarned: wallet.totalEarned },
        progression: { achieved: [...progression.achieved] },
        collectedPickups: [...collectedPickups],
        purchased: [...purchased]
      }),
      loadState(raw) {
        const saved = savedEconomySchema.parse(raw)
        wallet = saved.wallet
        progression = { achieved: saved.progression.achieved }
        collectedPickups = new Set(saved.collectedPickups)
        purchased = new Set(saved.purchased)
        // Reconcile markers to the restored state (inventory's applyState precedent).
        for (const pickup of config.pickups) {
          const key = `economy-pickup-${pickup.id}`
          const entity = entities.get(key)
          if (collectedPickups.has(pickup.id)) {
            if (entity) { ctx.render.remove(entity); entities.delete(key) }
          } else if (!entity) {
            addMarker(key, pickup.position.x, pickup.position.z, PICKUP_RADIUS, PICKUP_COLOR)
          }
        }
        publishWallet()
        publishProgression()
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

> Note: `requires: ['interaction-inventory']` is a deliberate string literal, not an import — the string-copy comment in `config.ts` documents why.

- [x] **Step 4: Run test to verify it passes + commit**

Run: `npm test -w @automata/pack-economy-progression -- pack`
Expected: PASS

```bash
git add packages/pack-economy-progression/src packages/pack-economy-progression/tests
git commit -m "feat(pack-economy-progression): browser adapter (wallet/shops/progression)"
```

---

### Task 10: `evalHook.ts` — headless twin

Mirrors the adapter: collect pickups, auto-buy (emit `itemPurchased`), advance progression (emit `milestoneReached`), earn on `connect`-subscribed `enemyDefeated`/`questCompleted`.

**Files:**
- Create: `packages/pack-economy-progression/src/evalHook.ts`
- Modify: `packages/pack-economy-progression/src/index.ts` (add `export * from './evalHook'`)
- Test: `packages/pack-economy-progression/tests/evalHook.test.ts`

**Interfaces:**
- Consumes: `PackEvalHook`, `EvalSliceView` from `@automata/game-kit`; the three cores + `config.ts`.
- Produces: `createEconomyProgressionEvalHook(config) → PackEvalHook`, `EVAL_TICK_DT`.

- [x] **Step 1: Write the failing test**

`packages/pack-economy-progression/tests/evalHook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createPackEventBus, type PackEvalHook } from '@automata/game-kit'
import { createEconomyProgressionEvalHook } from '../src/evalHook'

const config = () => ({
  wallet: { startingBalance: 0 },
  pickups: [{ id: 'currency-1', position: { x: 0, z: 0 }, amount: 5 }],
  shops: [],
  bounty: { perEnemy: 3 },
  questReward: { perQuest: 6 },
  progression: { milestones: [{ id: 'm1', threshold: 5 }] }
})

function drive(hook: PackEvalHook, ticks: number): unknown {
  let state = hook.createState()
  const bus = createPackEventBus()
  hook.connect?.(bus, { get: () => state, set: (s) => { state = s } })
  const emit = (name: string, payload: unknown): void => bus.emit(name, payload)
  const player = { x: 0, z: 0 }
  for (let t = 0; t < ticks; t += 1) state = hook.step(state, player, {}, emit)
  return state
}

describe('createEconomyProgressionEvalHook', () => {
  it('collects the pickup and completes progression', () => {
    const hook = createEconomyProgressionEvalHook(config())
    const state = drive(hook, 3)
    expect(hook.complete(state)).toBe(true)
  })
  it('earns a bounty from a consumed enemyDefeated event', () => {
    const cfg = config(); cfg.pickups = []; cfg.progression.milestones = [{ id: 'm1', threshold: 3 }]
    const hook = createEconomyProgressionEvalHook(cfg)
    let state = hook.createState()
    const bus = createPackEventBus()
    hook.connect?.(bus, { get: () => state, set: (s) => { state = s } })
    bus.emit('enemyDefeated', { enemyId: 'e1' }) // +3 bounty
    state = hook.step(state, { x: 0, z: 0 }, {}, (n, p) => bus.emit(n, p)) // progression advances
    expect(hook.complete(state)).toBe(true)
  })
  it('does not complete until the shop stock is bought, and targets the shop to do it', () => {
    const cfg = { ...config(), wallet: { startingBalance: 10 }, pickups: [],
      shops: [{ id: 'shop-1', position: { x: 4, z: 0 }, radius: 1.5, stock: [{ itemId: 'catalog-1', price: 8 }] }],
      progression: { milestones: [{ id: 'm1', threshold: 10 }] } }
    const hook = createEconomyProgressionEvalHook(cfg)
    let state = hook.createState()
    const emitted: Array<[string, unknown]> = []
    const emit = (name: string, payload: unknown): void => { emitted.push([name, payload]) }
    // Milestone m1 is satisfied by the starting balance alone…
    state = hook.step(state, { x: 0, z: 0 }, {}, emit)
    expect(hook.complete(state)).toBe(false)
    // …and nextTarget must still route to the shop (the branch spec §4.2 left dead).
    expect(hook.nextTarget(state, { x: 0, z: 0 }, {})).toEqual({ x: 4, z: 0 })
    state = hook.step(state, { x: 4, z: 0 }, {}, emit)
    expect(emitted.map(([name]) => name)).toContain('itemPurchased')
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, { x: 4, z: 0 }, {})).toBeNull()
  })
})
```

> This test is the regression pin for the reachability fix. If it ever passes
> with `complete` defined as `progressionComplete` alone, the shop branch has
> gone dead again and Task 13's parity test will fail silently-then-loudly.

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- evalHook`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `evalHook.ts`**

```ts
import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import {
  WALLET_SLICE_ID, PROGRESSION_SLICE_ID, INVENTORY_SLICE_ID,
  ITEM_PURCHASED_EVENT, MILESTONE_REACHED_EVENT, ENEMY_DEFEATED_EVENT, QUEST_COMPLETED_EVENT,
  type EconomyPackConfig
} from './config'
import { createWalletState, earn, spend, type WalletState } from './walletCore'
import { allStockPurchased, inRadius, nextPurchase } from './shopCore'
import { advance, createProgressionState, progressionComplete, type MilestoneDef, type ProgressionState } from './progressionCore'

/** One harness tick equals one fixed simulation step. */
export const EVAL_TICK_DT = 1 / 60

interface EvalState {
  wallet: WalletState
  progression: ProgressionState
  collected: readonly string[]
  /** Mirrors the adapter: completion must be answerable without a slice view. */
  purchased: readonly string[]
}

/** Ownership = inventory's granted set ∪ own purchases, exactly as the adapter computes it. */
const ownedView = (state: EvalState, slices?: EvalSliceView): ReadonlySet<string> => {
  const owned = new Set(state.purchased)
  const granted = (slices?.[INVENTORY_SLICE_ID] as { collected?: readonly string[] } | undefined)?.collected ?? []
  for (const id of granted) owned.add(id)
  return owned
}

/** Must match the adapter's `PICKUP_RADIUS + 0.5`, or the twins disagree. */
const PICKUP_REACH = 0.8

/** Headless twin. Subscribes to bounty/reward events via connect; emits purchases/milestones via step. */
export function createEconomyProgressionEvalHook(config: EconomyPackConfig): PackEvalHook {
  const milestones: MilestoneDef[] = config.progression.milestones.map((m) => ({ id: m.id, threshold: m.threshold }))
  const complete = (state: EvalState): boolean =>
    progressionComplete(state.progression, milestones) &&
    allStockPurchased(config.shops, new Set(state.purchased))

  return {
    packId: 'economy-progression',
    createState: (): EvalState => ({
      wallet: createWalletState(config.wallet.startingBalance),
      progression: createProgressionState(),
      collected: [],
      purchased: []
    }),
    connect(bus, ref) {
      const bump = (amount: number): void => {
        const state = ref.get() as EvalState
        ref.set({ ...state, wallet: earn(state.wallet, amount) })
      }
      bus.on(ENEMY_DEFEATED_EVENT, () => bump(config.bounty.perEnemy))
      bus.on(QUEST_COMPLETED_EVENT, () => bump(config.questReward.perQuest))
    },
    nextTarget(state, player, slices) {
      const evalState = state as EvalState
      if (complete(evalState)) return null
      const collected = new Set(evalState.collected)
      let best: { x: number; z: number } | null = null
      let bestDist = Infinity
      for (const pickup of config.pickups) {
        if (collected.has(pickup.id)) continue
        const dist = Math.hypot(pickup.position.x - player.x, pickup.position.z - player.z)
        if (dist < bestDist) { bestDist = dist; best = pickup.position }
      }
      if (best) return { ...best }
      // Reachable because `complete` also requires the stock to be cleared.
      const owned = ownedView(evalState, slices)
      for (const shop of config.shops) {
        if (nextPurchase(shop, evalState.wallet.balance, owned)) { best = shop.position; break }
      }
      return best ? { ...best } : null
    },
    step(state, player, slices, emit) {
      const evalState = state as EvalState
      let wallet = evalState.wallet
      const collected = new Set(evalState.collected)
      for (const pickup of config.pickups) {
        if (collected.has(pickup.id)) continue
        if (Math.hypot(pickup.position.x - player.x, pickup.position.z - player.z) > PICKUP_REACH) continue
        collected.add(pickup.id)
        wallet = earn(wallet, pickup.amount)
      }
      const purchased = new Set(evalState.purchased)
      for (const shop of config.shops) {
        if (!inRadius(shop, player)) continue
        // Recompute per shop so a second shop sees the first shop's purchase,
        // matching the adapter's live slice re-read.
        const purchase = nextPurchase(shop, wallet.balance, ownedView({ ...evalState, purchased: [...purchased] }, slices))
        if (!purchase) continue
        const result = spend(wallet, purchase.price)
        if (!result.ok) continue
        wallet = result.state
        purchased.add(purchase.itemId)
        emit?.(ITEM_PURCHASED_EVENT, { packId: 'economy-progression', itemId: purchase.itemId })
      }
      const advanced = advance(evalState.progression, wallet.totalEarned, milestones)
      for (const milestoneId of advanced.newlyAchieved) emit?.(MILESTONE_REACHED_EVENT, { packId: 'economy-progression', milestoneId })
      return {
        wallet, progression: advanced.state, collected: [...collected], purchased: [...purchased]
      } satisfies EvalState
    },
    complete: (state) => complete(state as EvalState),
    publishSlices: (state) => ({
      [WALLET_SLICE_ID]: { balance: (state as EvalState).wallet.balance, totalEarned: (state as EvalState).wallet.totalEarned },
      [PROGRESSION_SLICE_ID]: { achieved: [...(state as EvalState).progression.achieved] }
    })
  }
}
```

- [x] **Step 4: Run test to verify it passes + commit**

Run: `npm test -w @automata/pack-economy-progression -- evalHook`
Expected: PASS

```bash
git add packages/pack-economy-progression/src packages/pack-economy-progression/tests
git commit -m "feat(pack-economy-progression): headless eval hook with event edges"
```

---

### Task 11: `editorContribution.ts` — thin preview

Prefab-less; previews pickups and shop radii from the parsed config (combat precedent).

**Files:**
- Create: `packages/pack-economy-progression/src/editorContribution.ts`
- Modify: `packages/pack-economy-progression/src/index.ts` (add `export * from './editorContribution'`)
- Test: `packages/pack-economy-progression/tests/editorContribution.test.ts`

**Interfaces:**
- Consumes: `PackEditorContribution` from `@automata/game-kit`; `packConfigSchema`.
- Produces: `economyProgressionEditorContribution`.

- [x] **Step 1: Write the failing test**

`packages/pack-economy-progression/tests/editorContribution.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { economyProgressionEditorContribution } from '../src/editorContribution'

describe('economyProgressionEditorContribution', () => {
  it('has no prefabs (composition-owned entities)', () => {
    expect(economyProgressionEditorContribution.prefabs).toEqual([])
    expect(economyProgressionEditorContribution.packId).toBe('economy-progression')
  })
  it('adds and disposes preview entities', () => {
    const added: string[] = []; const removed: string[] = []
    const render = {
      add: (e: { id: string }) => { added.push(e.id) },
      setPose: () => {},
      remove: (e: { id: string }) => { removed.push(e.id) }
    }
    const config = {
      wallet: { startingBalance: 5 },
      pickups: [{ id: 'currency-1', position: { x: 1, z: 1 }, amount: 5 }],
      shops: [{ id: 'shop-1', position: { x: 2, z: 2 }, radius: 1.5, stock: [] }],
      bounty: { perEnemy: 3 }, questReward: { perQuest: 6 },
      progression: { milestones: [{ id: 'm1', threshold: 5 }] }
    }
    // `createPreview` is optional on PackEditorContribution — the bang matches
    // every existing pack's editorContribution test and is required under strict.
    const preview = economyProgressionEditorContribution.createPreview!(config, render as never)
    expect(added.length).toBeGreaterThan(0)
    preview.dispose()
    expect(removed.length).toBe(added.length)
  })
  it('rejects a config that fails the pack schema', () => {
    const render = { add: () => {}, setPose: () => {}, remove: () => {} }
    expect(() => economyProgressionEditorContribution.createPreview!({ bogus: true }, render as never)).toThrow()
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-economy-progression -- editorContribution`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `editorContribution.ts`**

```ts
import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const PICKUP = { radius: 0.3, color: '#3ddc97' }
const SHOP = { radius: 0.5, color: '#c77dff' }
const RADIUS_DOT = { radius: 0.08, color: '#e0aaff' }

/** Thin preview: pickup markers plus four compass dots on each shop radius. */
export const economyProgressionEditorContribution: PackEditorContribution = {
  packId: 'economy-progression',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities: Array<{ id: string }> = []
    const dot = (id: string, x: number, z: number, spec: { radius: number; color: string }): void => {
      const entity = { id }
      entities.push(entity)
      render.add(entity, { primitive: 'sphere', radius: spec.radius, color: spec.color })
      render.setPose(entity, { x, y: spec.radius, z }, IDENTITY)
    }
    for (const pickup of parsed.pickups) dot(`preview-economy-pickup-${pickup.id}`, pickup.position.x, pickup.position.z, PICKUP)
    for (const shop of parsed.shops) {
      dot(`preview-economy-shop-${shop.id}`, shop.position.x, shop.position.z, SHOP)
      const compass = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
      compass.forEach(([dx, dz], index) => {
        dot(`preview-economy-radius-${shop.id}-${index}`, shop.position.x + dx * shop.radius, shop.position.z + dz * shop.radius, RADIUS_DOT)
      })
    }
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
```

Add `export * from './editorContribution'` to `src/index.ts`.

- [x] **Step 4: Run test to verify it passes + typecheck + commit**

Run: `npm test -w @automata/pack-economy-progression && npm run typecheck -w @automata/pack-economy-progression`
Expected: PASS / no type errors.

```bash
git add packages/pack-economy-progression/src packages/pack-economy-progression/tests
git commit -m "feat(pack-economy-progression): thin editor preview"
```

---

### Task 12: Emit `enemyDefeated` / `questCompleted` from the combat & dialogue eval hooks

So the bounty and reward edges are provable headlessly in the scenario rows.

**Files:**
- Modify: `packages/pack-combat-ai/src/evalHook.ts`
- Modify: `packages/pack-dialogue-quests/src/evalHook.ts`
- Test: `packages/pack-combat-ai/tests/evalHook.test.ts` (add), `packages/pack-dialogue-quests/tests/evalHook.test.ts` (add)

**Interfaces:**
- Consumes: the eval `emit` param from Task 1.
- Produces: combat eval `step` emits `enemyDefeated` (`{ enemyId }`) per newly defeated enemy; dialogue eval `step` emits `questCompleted` (`{ questId }`) per newly completed quest. Existing completion behavior unchanged.

- [ ] **Step 1: Write the failing combat test**

Add to `packages/pack-combat-ai/tests/evalHook.test.ts` a test that drives the hook to defeat an enemy and asserts an `enemyDefeated` emission is captured. Use the package's existing fixture/driver if present; otherwise:

```ts
import { createCombatAiEvalHook } from '../src/evalHook'
import { composeCombatSection } from '../src/composeSection'
import { createSeededRng } from '@automata/engine'

it('emits enemyDefeated when an enemy is defeated', () => {
  const config = composeCombatSection({
    specConfig: {}, cast: [{ id: 'c1', name: 'Foe', role: 'antagonist' }],
    arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } }, inventory: null, occupied: []
  }, createSeededRng(1))
  const hook = createCombatAiEvalHook(config)
  let state = hook.createState()
  const events: string[] = []
  const emit = (name: string): void => { events.push(name) }
  const enemyPos = config.enemies[0]!.post
  // Stand on the enemy and step until it dies.
  for (let t = 0; t < 2000 && !hook.complete(state); t += 1) state = hook.step(state, enemyPos, {}, emit)
  expect(hook.complete(state)).toBe(true)
  expect(events).toContain('enemyDefeated')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/pack-combat-ai -- evalHook`
Expected: FAIL — no `enemyDefeated` emitted (the eval `step` currently discards `defeatedEnemyIds`).

- [ ] **Step 3: Implement the combat eval emit**

In `packages/pack-combat-ai/src/evalHook.ts`, change `step` to capture the result and emit. Replace the `step` method:

```ts
    step(state, player, slices, emit) {
      const combat = (state as EvalState).combat
      const held = isWeaponHeld(config, collectedView(slices))
      const result = stepCombat(combat, player, config, EVAL_TICK_DT, held)
      for (const enemyId of result.defeatedEnemyIds) emit?.(ENEMY_DEFEATED_EVENT, { packId: 'combat-ai', enemyId })
      if (result.playerDefeated) emit?.(PLAYER_DEFEATED_EVENT, { packId: 'combat-ai' })
      return { combat: result.state } satisfies EvalState
    },
```

Add `ENEMY_DEFEATED_EVENT, PLAYER_DEFEATED_EVENT` to the `./config` import in that file.

- [ ] **Step 4: Write the failing dialogue test**

Add to `packages/pack-dialogue-quests/tests/evalHook.test.ts` a test that drives a quest to completion (reuse the file's existing fixture/compose helper) and asserts a `questCompleted` emission. Follow the existing test setup in that file for building `config`; the assertion is:

```ts
// after driving the hook with a captured `emit` until questsComplete:
expect(emittedEvents).toContain('questCompleted')
```

- [ ] **Step 5: Implement the dialogue eval emit**

In `packages/pack-dialogue-quests/src/evalHook.ts`, add `QUEST_COMPLETED_EVENT` to the `./config` import and emit for quests that transition to `'complete'`. Replace the `step` method's return region so it diffs the log:

```ts
    step(state, player, slices, emit) {
      const evalState = state as EvalState
      const inventory = inventoryView(slices)
      const npc = config.npcs.find((entry) =>
        Math.hypot(entry.position.x - player.x, entry.position.z - player.z) <= config.talkRadius)
      if (!npc) return state
      const dialogue = config.dialogues.find((entry) => entry.id === npc.dialogueId)!
      const before = evalState.questLog
      let questLog = before
      let session: ReturnType<typeof startDialogue> | null = startDialogue(dialogue)
      for (let turns = 0; session && turns < CONVERSATION_BUDGET; turns += 1) {
        if (availableChoices(dialogue, session, questLog, inventory).length === 0) break
        const outcome = choose(dialogue, session, 0, questLog, inventory)
        questLog = applyEffects(questLog, outcome.effects, inventory)
        session = outcome.session
      }
      if (questLog === before) return state
      for (const quest of config.quests) {
        if (before[quest.id] !== 'complete' && questLog[quest.id] === 'complete') {
          emit?.(QUEST_COMPLETED_EVENT, { packId: 'dialogue-quests', questId: quest.id })
        }
      }
      return { questLog }
    },
```

(Confirm `QUEST_COMPLETED_EVENT` is exported from `packages/pack-dialogue-quests/src/config.ts` — it is: `export const QUEST_COMPLETED_EVENT = 'questCompleted'`.)

- [ ] **Step 6: Run both packages' tests + commit**

Run: `npm test -w @automata/pack-combat-ai -- evalHook && npx vitest run --project pack-dialogue-quests evalHook`
Expected: PASS

```bash
git add packages/pack-combat-ai/src/evalHook.ts packages/pack-combat-ai/tests packages/pack-dialogue-quests/src/evalHook.ts packages/pack-dialogue-quests/tests
git commit -m "feat(packs): emit enemyDefeated/questCompleted from combat & dialogue eval hooks"
```

---

### Task 13: Registry wiring + matrix scenarios + parity test

Register the pack, add its fixture, and widen the matrix. Add the runtime-vs-eval parity test for the purchase→grant loop.

**Files:**
- Modify: `packages/pack-registry/src/index.ts`
- Modify: `packages/pack-registry/tests/compositionMatrix.test.ts`
- Create: `packages/pack-registry/tests/economyParity.test.ts`
- Modify: `packages/pack-registry/package.json` (add the dependency)

**Interfaces:**
- Consumes: `economyProgressionPack`, `composeEconomySection`, `createEconomyProgressionEvalHook`, `economyProgressionEditorContribution`, `packConfigSchema as economyConfigSchema` from `@automata/pack-economy-progression`.
- Produces: economy in `STANDARD_PACKS`, `PACK_FIXTURES`, `EVAL_HOOK_BUILDERS`, `EDITOR_CONTRIBUTIONS`; four new matrix scenarios.

- [ ] **Step 1: Add the workspace dependency**

In `packages/pack-registry/package.json`, add to `dependencies`:

```json
    "@automata/pack-economy-progression": "*",
```

Then:

```bash
npm install
```

- [ ] **Step 2: Register the pack in `pack-registry/src/index.ts`**

Add the import (alongside the other pack imports):

```ts
import {
  composeEconomySection, createEconomyProgressionEvalHook, economyProgressionEditorContribution,
  economyProgressionPack, packConfigSchema as economyConfigSchema
} from '@automata/pack-economy-progression'
```

Add to `STANDARD_PACKS`:

```ts
  [economyProgressionPack.id]: economyProgressionPack as GamePack
```

Add the fixture (after the combat fixture) — it composes from the inventory fixture's items and a vendor cast member:

```ts
PACK_FIXTURES[economyProgressionPack.id] = () => composeEconomySection({
  specConfig: {},
  cast: [{ id: 'c-trader', name: 'Trader', role: 'vendor' }],
  milestones: [{ id: 'm-1' }, { id: 'm-2' }],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: {
    items: (PACK_FIXTURES[interactionInventoryPack.id]!() as {
      items: Array<{ id: string; position: { x: number; z: number } }>
    }).items
  },
  occupied: []
}, createSeededRng(45))
```

Add to `EVAL_HOOK_BUILDERS`:

```ts
  [economyProgressionPack.id]: (config) => createEconomyProgressionEvalHook(economyConfigSchema.parse(config))
```

Add to `EDITOR_CONTRIBUTIONS`:

```ts
  [economyProgressionEditorContribution.packId]: economyProgressionEditorContribution
```

- [ ] **Step 3: Add the matrix scenarios**

In `packages/pack-registry/tests/compositionMatrix.test.ts`, extend the `SCENARIOS` array:

```ts
  const SCENARIOS: ReadonlyArray<readonly string[]> = [
    ['interaction-inventory', 'dialogue-quests', 'schedules-relationships'],
    ['combat-ai'],
    ['interaction-inventory', 'dialogue-quests', 'schedules-relationships', 'combat-ai'],
    // Cycle 5: bounty edge, reward edge, and the full 5-pack set. The base
    // [inventory, economy] pair is NOT listed — the `pairs` loop above already
    // generates it automatically from STANDARD_PACKS (it is the only new
    // requires-satisfiable pair), so listing it here would just run it twice.
    ['interaction-inventory', 'economy-progression', 'combat-ai'],
    ['interaction-inventory', 'dialogue-quests', 'economy-progression'],
    ['interaction-inventory', 'dialogue-quests', 'schedules-relationships', 'combat-ai', 'economy-progression']
  ]
```

- [ ] **Step 4: Run the matrix to verify it stays green**

Run: `npx vitest run --project pack-registry compositionMatrix`
Expected: PASS — the economy+inventory pair, the two synergy scenarios (bounty/reward proven via the event bus), and the 5-pack set all compose, boot, and complete headlessly.

- [ ] **Step 5: Write the parity test**

`packages/pack-registry/tests/economyParity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost, composePacks, createPackEventBus, type PackEvalHook } from '@automata/game-kit'
import { STANDARD_PACKS, PACK_FIXTURES, resolveEvalHooks } from '../src/index'

const SET = ['interaction-inventory', 'economy-progression'] as const
const composition = () => ({
  formatVersion: 1 as const, gameId: 'parity', source: null,
  packs: SET.map((id) => ({ id, version: STANDARD_PACKS[id]!.version, config: PACK_FIXTURES[id]!() as Record<string, unknown> })),
  assets: []
})

/** Drive the eval twin to completion; return the outcome AND the path walked. */
function runEval(): { result: { collected: string[]; totalEarned: number }; path: Array<{ x: number; z: number }> } {
  const hooks = resolveEvalHooks(composition() as never)
  const states = new Map(hooks.map((h) => [h.packId, h.createState()]))
  const bus = createPackEventBus()
  for (const h of hooks) h.connect?.(bus, { get: () => states.get(h.packId), set: (s) => states.set(h.packId, s) })
  const emit = (n: string, p: unknown): void => bus.emit(n, p)
  const player = { x: -8, z: -8 }
  const path: Array<{ x: number; z: number }> = []
  for (let t = 0; t < 4000; t += 1) {
    const slices: Record<string, unknown> = {}
    for (const h of hooks) Object.assign(slices, h.publishSlices?.(states.get(h.packId)) ?? {})
    const incomplete = hooks.filter((h) => !h.complete(states.get(h.packId)))
    if (incomplete.length === 0) break
    for (const h of incomplete) {
      const target = h.nextTarget(states.get(h.packId), player, slices)
      if (!target) continue
      const dx = target.x - player.x, dz = target.z - player.z, dist = Math.hypot(dx, dz)
      const stride = Math.min(0.5, dist)
      if (dist > 0) { player.x += (dx / dist) * stride; player.z += (dz / dist) * stride }
      break
    }
    path.push({ ...player })
    for (const h of hooks) states.set(h.packId, h.step(states.get(h.packId), player, slices, emit))
  }
  const inv = states.get('interaction-inventory') as { collected: string[] }
  const eco = (hooks.find((h) => h.packId === 'economy-progression') as PackEvalHook)
    .publishSlices!(states.get('economy-progression')) as { wallet: { totalEarned: number } }
  return { result: { collected: [...inv.collected].sort(), totalEarned: eco.wallet.totalEarned }, path }
}

/**
 * Drive the RUNTIME twin over the same fixture: compose both packs, boot against
 * a null renderer, and replay the eval run's player path through fixedUpdate so
 * the two paths see identical input. Returns the same shape as runEval.
 */
function runRuntime(path: ReadonlyArray<{ x: number; z: number }>): { collected: string[]; totalEarned: number } {
  const comp = composition()
  const configs = Object.fromEntries(comp.packs.map((entry) => [entry.id, entry.config]))
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  try {
    const runtime = composePacks(SET.map((id) => STANDARD_PACKS[id]!), configs).boot({ host, render: render.port })
    for (const playerPosition of path) runtime.fixedUpdate(1 / 60, { playerPosition })
    const state = runtime.saveState()
    const inv = state['interaction-inventory'] as { collected: string[] }
    const eco = state['economy-progression'] as { wallet: { totalEarned: number } }
    return { collected: [...inv.collected].sort(), totalEarned: eco.wallet.totalEarned }
  } finally {
    host.dispose()
    app.remove()
  }
}

describe('economy+inventory parity', () => {
  it('the eval twin grants purchased catalog ids into inventory', () => {
    const { result } = runEval()
    // Every catalog id in the economy fixture's shop stock ends up owned by inventory.
    const catalog = (PACK_FIXTURES['economy-progression']!() as {
      shops: Array<{ stock: Array<{ itemId: string }> }>
    }).shops.flatMap((s) => s.stock.map((e) => e.itemId))
    expect(catalog.length).toBeGreaterThan(0) // guard: a vacuous assertion would pass silently
    for (const id of catalog) expect(result.collected).toContain(id)
  })

  it('the runtime slice-registry path and the eval event-bus path agree', () => {
    const { result, path } = runEval()
    expect(runRuntime(path)).toEqual(result)
  })
})
```

> Together these discharge spec §6's parity requirement: the first proves the
> event-driven purchase→grant loop end to end in the headless twin (economy emits
> `itemPurchased`, inventory's `connect` handler grants it, the id appears in
> inventory's published `collected`); the second proves the runtime reaches the
> same wallet and inventory outcome over the same player path through
> `ctx.events` + the slice registry. The first test alone is **not** a parity
> test — an earlier draft of this plan shipped only that one.

> `runEval` must now also return the player path it walked. Accumulate it:
> declare `const path: Array<{ x: number; z: number }> = []` next to `player`,
> push `{ ...player }` at the end of each loop iteration (after the move, before
> the `step` fan-out), and return `{ result: { collected, totalEarned }, path }`.

- [ ] **Step 6: Run the parity test + commit**

Run: `npx vitest run --project pack-registry`
Expected: PASS (matrix + parity).

```bash
git add packages/pack-registry/src/index.ts packages/pack-registry/tests packages/pack-registry/package.json package-lock.json
git commit -m "feat(pack-registry): register economy pack, widen matrix, add parity test"
```

---

### Task 14: `composeGame` threading + first-light regression

Wire economy into the real compose flow (after combat) and prove first-light is untouched.

**Files:**
- Modify: `packages/game-compose/src/compose.ts`
- Modify: `packages/game-compose/package.json` (add the dependency)
- Test: `packages/game-compose/tests/compose.test.ts` (add)

**Interfaces:**
- Consumes: `economyProgressionPack`, `composeEconomySection` from `@automata/pack-economy-progression`.
- Produces: economy pack entry in the composition when `economy-progression` is selected.

- [ ] **Step 1: Add the dependency**

In `packages/game-compose/package.json` `dependencies`, add:

```json
    "@automata/pack-economy-progression": "*",
```

Then `npm install`.

- [ ] **Step 2: Write the failing test**

Add to `packages/game-compose/tests/compose.test.ts` a test that a spec selecting `economy-progression` (with `interaction-inventory`) produces an economy pack entry, and a frozen-baseline test that first-light recomposes identically. For the first-light regression, follow the file's existing recompose helper if present; the new selection test:

```ts
it('threads an economy-progression pack config when selected', () => {
  const spec = /* a valid GameSpec with interaction-inventory + economy-progression, a vendor cast member */
  const result = composeGame(spec, /* seed */ 7)
  expect(result.ok).toBe(true)
  const economy = result.composition.packs.find((p) => p.id === 'economy-progression')
  expect(economy).toBeDefined()
  expect((economy!.config as { progression: { milestones: unknown[] } }).progression.milestones.length)
    .toBe(spec.progression.milestones.length)
})
```

> Build the spec by extending the file's existing valid-spec fixture: add `{ id: 'economy-progression', config: {}, requirements: [] }` to `capabilities`, ensure `interaction-inventory` is also selected, and add a cast member with `role: 'vendor'`.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --project game-compose compose`
Expected: FAIL — no economy pack entry (threading not wired).

- [ ] **Step 4: Implement the threading**

In `packages/game-compose/src/compose.ts`:

1. Add the import:

```ts
import { composeEconomySection, economyProgressionPack } from '@automata/pack-economy-progression'
```

2. **Add economy to the `supported` gate (`compose.ts:30-32`)** — without this the
function returns `ok: false` with `compose-unsupported-capability` before any of
the work below runs, and Step 2's test cannot pass:

```ts
  const supported = new Set<string>([
    interactionInventoryPack.id, dialogueQuestsPack.id, schedulesRelationshipsPack.id,
    combatAiPack.id, economyProgressionPack.id
  ])
```

Bump the message on the next line from `Phase 4 cycle 4 composes only` to
`Phase 4 cycle 5 composes only`.

3. **Add economy to the `selectedPacks` flatMap (`compose.ts:49-55`)** — this is
what feeds `validatePackSet`, so without it the requires-inventory error is never
raised and the `packConfig!` non-null assertion in Step 4 is unguarded:

```ts
    if (entry.id === economyProgressionPack.id) return [economyProgressionPack]
```

4. Add the `wantsEconomy` flag next to the others (~line 46):

```ts
  const wantsEconomy = spec.capabilities.some((entry) => entry.id === economyProgressionPack.id)
```

5. After the `if (wantsCombat) { ... }` block (~line 147) and before `const composition`, add:

```ts
  if (wantsEconomy) {
    const economySelection = spec.capabilities.find((entry) => entry.id === economyProgressionPack.id)!
    const economyConfig = composeEconomySection({
      specConfig: economySelection.config as { startingBalance?: number },
      cast: spec.cast,
      milestones: spec.progression.milestones.map((milestone) => ({ id: milestone.id })),
      arena: { half: ARENA.half, spawn: ARENA.spawn, goal },
      inventory: { items: packConfig!.items },
      occupied: [
        ...(dialogueConfig?.npcs.map((npc) => npc.position) ?? []),
        ...(schedulesConfig?.walkers.flatMap((walker) => walker.stations) ?? [])
      ]
    }, rng)
    packs.push({
      id: economyProgressionPack.id,
      version: economyProgressionPack.version,
      config: economyConfig as unknown as Record<string, unknown>
    })
  }
```

> Economy is threaded **last** so it consumes RNG only after the existing sections, preserving every prior section's stream — first-light (no economy) is bit-identical. Economy requires inventory, and Step 3 puts it in `selectedPacks` so `validatePackSet` returns `pack-missing-requirement` before this line is reached — that is what makes `packConfig!` safe. Add a test that a spec selecting economy **without** inventory returns `ok: false` with that code.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project game-compose`
Expected: PASS — the economy selection test and the first-light frozen-baseline recompose both green.

- [ ] **Step 6: Commit**

```bash
git add packages/game-compose/src/compose.ts packages/game-compose/package.json packages/game-compose/tests package-lock.json
git commit -m "feat(game-compose): thread economy-progression section into compose"
```

---

### Task 15: Full gates + first-light bit-identical proof

- [ ] **Step 1: Run the full CI suite**

Run: `npm run ci`
Expected: PASS (typecheck + lint + all package tests). Fix any cross-package type or lint fallout inline (most likely: a missing `import type` or an `any` the lint rejects).

- [ ] **Step 1b: Run coverage**

Run: `npm run coverage`
Expected: PASS. This cycle adds a whole package under `packages/*/src/**`, which
the root config holds to **90% lines and branches** — `pack.ts` in particular has
many branches (purchase, insufficient funds, bounty, reward, marker reconcile on
load, dispose). Task 9's test list is sized for this; if coverage still falls
short, add the missing adapter cases rather than lowering the threshold.

- [ ] **Step 2: Prove first-light recomposes bit-identically**

Run: `npm run verify:new-game`
Expected: PASS. Additionally confirm `games/first-light` output is unchanged:

```bash
git status --porcelain games/first-light
```

Expected: no output (first-light files unchanged).

- [ ] **Step 3: Commit any gate fixes**

```bash
git add -A
git commit -m "chore(pack-economy-progression): satisfy full ci + verify gates"
```

(Skip if there was nothing to fix.)

---

### Task 16: Documentation — roadmap, umbrella gap log, decomposition status

- [ ] **Step 1: Update the umbrella capability-gap log**

In `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-4-capability-packs-design.md` §9, append:

```markdown
- **Cycle 5 — item selling / two-way trade.** Selling requires the inventory pack
  to *remove* an owned item on an economy-emitted event (an `itemSold` consume
  path); buy-only avoids the removal seam this cycle.
- **Cycle 5 — purchasable-only catalog content.** Shop stock uses seeded catalog
  ids with no world entity or downstream reference; real purchasable goods are
  Phase-6 content.
- **Cycle 5 — spec-authored milestone thresholds.** Thresholds are pack-derived
  under the reachability invariant; letting a spec author set per-milestone
  thresholds would be a `progression.milestones` schema extension.
```

- [ ] **Step 2: Update the roadmap**

In `docs/ROADMAP.md:241`, change the cycle 5 line from `Next` to `Shipped`:

```markdown
  - Cycle 5 — economy, shops & progression pack — `Shipped` (2026-07-28, plan:
    [`2026-07-21-phase-4-cycle-5-economy-progression.md`](superpowers/plans/active/2026-07/week-30/2026-07-21-phase-4-cycle-5-economy-progression.md)).
```

And promote cycle 6 (`compact-hub navigation + one vehicle pack`) from `Planned` to `Next`.

- [ ] **Step 3: Update the decomposition status counters**

In `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`:
- §3 Phase-map Phase 4 row (line ~90): change `4 of 7 completed (2026-07-18)` to `5 of 7 completed (2026-07-28)`.
- §5 Phase 4 section header (line ~472): change `**Phase 4 (seven peers; cycles 1–4 completed — see roadmap for live status):**` to `cycles 1–5 completed`.
- §5 Phase 4 list: mark item 5 (`Economy, shops & progression pack — completed`).

- [ ] **Step 3b: Fold this cycle's spec corrections back into the design spec**

Three findings in this plan contradict the approved spec. Amend
`docs/superpowers/specs/active/2026-07/week-30/2026-07-21-phase-4-cycle-5-economy-progression-design.md`
so the shipped spec matches the shipped code:

- §4.2 / §3.5 — `complete` / `objectivesComplete` is "all milestones achieved
  **and** all shop stock purchased". As written (`progressionComplete` alone,
  with §4.1's top threshold `≤ start + Σ pickups`) the shop branch of
  `nextTarget` is unreachable and the purchase loop is unprovable. See Task 5.
- §4.1 — add the **affordability invariant**: `Σ stock prices ≤ startingBalance
  + Σ pickup amounts`, alongside the existing reachability invariant. See Task 8.
- §3.4 — `collectedPickups` and `purchased` **are** persisted; they are not
  recomputable bookkeeping. See Task 7's `savedEconomySchema`.

Also note the two intentional simplifications: pickup count/amount, stock size,
and prices are `ECONOMY_DEFAULTS` constants rather than seeded draws (§4.1 says
"seeded"); and `nextPurchase` takes a `balance` number, not a wallet (§3.2).

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/superpowers/specs
git commit -m "docs: mark Phase 4 cycle 5 (economy) shipped; log capability gaps"
```

- [ ] **Step 5: Add the new gap discovered during this cycle**

Append to the umbrella §9 list from Step 1:

```markdown
- **Cycle 5 — shop stock is bounded by base earning.** Stock size is capped at
  `floor((startingBalance + Σ pickups) / catalogPrice)` because completion
  requires buying it all. Decoupling "stock the vendor offers" from "stock the
  objective requires" needs an optional-purchase concept the pack does not have.
```

---

## Self-Review

**Spec coverage:**
- §1 scope (wallet + buy-only shops + threshold progression) → Tasks 4–10.
- §1 event-driven grant / cycle-2 gap → Task 2 (inventory consume, runtime side) + Task 13 (eval side + runtime/eval parity).
- §1 progression = currency thresholds → Task 6 + Task 8 (reachability).
- §1 synergy edges (bounty/reward) → Task 9/10 (subscribe) + Task 12 (emitters) + Task 13 (scenarios).
- §1 catalog-only stock + 8-cap → Task 8 (catalog budget) + Task 2 (grant unaffected by completion).
- §1 contract-v2 eval event bus → Task 1.
- §2.1 GameSpec config → Task 3.
- §2.2 compatibility declaration → Task 9.
- §2.3 inventory-pack change → Task 2.
- §2.4 pack config + superRefine → Task 7.
- §2.5 eval-harness event bus → Task 1.
- §3 cores + persistence → Tasks 4–6, 9 (save/load).
- §4 composeSection + eval hook → Tasks 8, 10.
- §5 editor + matrix + registration → Tasks 11, 13.
- §6 testing/gates → per-task tests + Task 15.
- §8 capability gaps logged → Task 16.
- first-light frozen → Task 14/15.

**Placeholder scan:** none. Every code step carries complete, copy-paste-runnable code. Two tests (Task 12 dialogue, Task 14 compose) instruct the implementer to reuse an existing fixture/helper in the target test file rather than duplicating a large spec fixture — the assertion and setup shape are given explicitly, so this is a directed reuse, not a "write tests for the above" placeholder.

**Type consistency:** `WalletState`/`ProgressionState`/`ShopDef`/`MilestoneDef`/`EconomyPackConfig` names are used identically across Tasks 4–10. Slice ids (`wallet`, `progression`, `inventory`) and event names (`itemPurchased`, `milestoneReached`, `enemyDefeated`, `questCompleted`) match between the emitter (Task 9/10/12) and consumer (Task 2/9/10) sides. `PackEvalHook.connect`/`emit` signatures from Task 1 are used consistently in Tasks 2, 10, 12, 13.

**Twin parity audit:** the adapter (Task 9) and eval hook (Task 10) must agree on
three things or the Task 13 parity test fails — pickup reach (`0.8` in both),
the owned set (inventory's granted ids ∪ own `purchased`, recomputed per shop in
both), and the completion predicate (`progressionComplete && allStockPurchased`).
Each is called out at its definition site.

**Command audit:** per-package runs use `npx vitest run --project <name>` except
`pack-combat-ai` and the new `pack-economy-progression`, the only two packages
with a `test` script. `npm test -w` fails elsewhere with "Missing script".

**Spec deviations (all deliberate, all logged in Task 16 Step 3b):** completion
includes clearing shop stock (§4.2/§3.5); a new compose-time affordability
invariant (§4.1); `collectedPickups`/`purchased` are persisted (§3.4); pickups,
stock size, and prices are constants rather than seeded draws (§4.1);
`nextPurchase` takes a balance, not a wallet (§3.2). The first three are
corrections to genuine spec defects, not shortcuts — see the note in Task 5.
