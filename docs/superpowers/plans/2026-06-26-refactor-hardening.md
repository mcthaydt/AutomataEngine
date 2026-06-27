# Refactor Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all eight final-audit gaps while preserving gameplay, editor, MCP, and public-port behavior.

**Architecture:** Land correctness seams first (effective commands and one timing owner), then make teardown explicit, pool renderer resources, synchronize editor entities by stable ID, replace the Miniplex type leak with an engine facade, narrow headless entry points, extract the optional AI layer into its own package, and finally expand coverage. Each behavior change is introduced by a focused failing test and committed only after its focused suite is green.

**Tech Stack:** TypeScript 6, Vitest 4, Miniplex 2, Three.js 0.184, Rapier 0.19, npm workspaces, Vite 8.

**Overall Progress:** 54% (49/90 steps complete)

---

### Task 1: Make editor commands report real effects

**Files:**
- Modify: `games/monkey-ball/tests/editor/sceneModel.test.ts`
- Modify: `games/monkey-ball/src/editor/sceneModel.ts`
- Modify: `packages/editor/tests/state/document.test.ts`
- Modify: `packages/editor/src/state/document.ts`
- Modify: `packages/editor/tests/agent/editorToolHost.test.ts`
- Modify: `packages/editor/src/agent/editorToolHost.ts`
- Modify: `packages/editor/tests/fixtures/fakeDefinition.ts`

- [x] **Step 1: Add failing scene-model effect tests**

Add tests proving missing IDs and duplicate IDs are rejected, while same-value updates preserve identity:

```ts
it('rejects commands that target missing or duplicate ids', () => {
  const doc = levelSceneModel.emptyDoc()
  const existing = levelSceneModel.listItems(doc).find((item) => item.id === 'geometry:0')!
  expect(() => levelSceneModel.apply(doc, {
    type: 'setSurface', id: 'missing', surface: { kind: 'color', value: '#fff' }
  })).toThrow(CommandError)
  expect(() => levelSceneModel.apply(doc, {
    type: 'addItem', item: existing
  })).toThrow(CommandError)
})

it('returns the original document for an effective no-op', () => {
  const doc = levelSceneModel.emptyDoc()
  expect(levelSceneModel.apply(doc, {
    type: 'setMetadata', path: 'name', value: doc.name
  })).toBe(doc)
})
```

- [x] **Step 2: Run the scene-model tests and verify RED**

Run: `npx vitest run games/monkey-ball/tests/editor/sceneModel.test.ts`

Expected: FAIL because missing/duplicate targets currently succeed and same-value metadata returns a new object.

- [x] **Step 3: Implement strict target validation and no-op identity**

In `levelSceneModel.apply`, compute the current stable ID set once per targeted command. Throw `CommandError` for missing IDs and duplicate `addItem` IDs. Before cloning, compare the requested value/delta to the current value; return `level` for empty ID arrays, zero deltas, same surfaces, same metadata, same fields, and empty deletes.

Use small equality helpers:

```ts
const sameVec = (a: Vec3, b: Vec3): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z
const zeroDelta = (v: Vec3): boolean => sameVec(v, { x: 0, y: 0, z: 0 })
```

- [x] **Step 4: Add failing reducer and ToolHost no-op tests**

Add a single-command reducer test whose `SceneModel.apply` returns the same doc and assert the entire `DocumentState` reference is unchanged. Add a ToolHost test whose scene returns the same doc and assert:

```ts
expect(result).toMatchObject({ ok: true, content: { applied: 'setMetadata', changed: false } })
expect(host.commands).toEqual([])
expect(host.doc).toBe(seedDoc)
```

- [x] **Step 5: Run the editor tests and verify RED**

Run: `npx vitest run packages/editor/tests/state/document.test.ts packages/editor/tests/agent/editorToolHost.test.ts`

Expected: FAIL because single commands create history and ToolHost records every parsed write.

- [x] **Step 6: Implement effect-aware reducer and ToolHost behavior**

In the single-command reducer branch, return `state` when `next === state.doc`. In ToolHost, apply into `next`, record only when `next !== doc`, and return:

```ts
return {
  ok: true,
  content: { applied: name, changed, items: definition.scene.listItems(doc).length }
}
```

Update the fake scene model to return its original document for same-value operations so fixture behavior matches the production contract.

- [x] **Step 7: Verify Task 1 green**

Run: `npx vitest run games/monkey-ball/tests/editor packages/editor/tests/state/document.test.ts packages/editor/tests/agent/editorToolHost.test.ts`

Expected: all selected tests PASS.

- [x] **Step 8: Commit Task 1**

```bash
git add games/monkey-ball/src/editor/sceneModel.ts games/monkey-ball/tests/editor/sceneModel.test.ts packages/editor/src/state/document.ts packages/editor/src/agent/editorToolHost.ts packages/editor/tests/state/document.test.ts packages/editor/tests/agent/editorToolHost.test.ts packages/editor/tests/fixtures/fakeDefinition.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "fix(editor): reject ineffective scene commands"
```

### Task 2: Put camera and editor movement under one time contract

**Files:**
- Modify: `packages/engine/tests/loop/gameLoop.test.ts`
- Modify: `packages/engine/src/loop/gameLoop.ts`
- Modify: `games/monkey-ball/tests/systems/cameraFollow.test.ts`
- Modify: `games/monkey-ball/src/systems/cameraFollow.ts`
- Modify: `games/monkey-ball/src/game/context.ts`
- Modify: `games/monkey-ball/src/game/gameplay.ts`
- Modify: `games/monkey-ball/src/main.ts`
- Modify: `games/monkey-ball/src/editor/registration.ts`
- Modify: `packages/editor/src/model/gameDefinition.ts`
- Modify: `packages/editor/src/host.ts`
- Create: `packages/editor/src/viewport3d/flyControls.ts`
- Create: `packages/editor/tests/viewport3d/flyControls.test.ts`
- Modify: `packages/editor/src/viewport3d/browser.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `tools/level-editor/src/main.ts`

- [x] **Step 1: Add failing `frameDt` loop tests**

Assert the first render receives `(0, 0)`, a 15 ms tick receives `frameDt = 0.015`, negative time receives zero, and a huge gap is capped at `fixedDt * maxSubSteps`:

```ts
expect(render).toHaveBeenLastCalledWith(expect.closeTo(0.5), 0.015)
```

- [x] **Step 2: Run the loop test and verify RED**

Run: `npx vitest run packages/engine/tests/loop/gameLoop.test.ts`

Expected: FAIL because render currently receives only interpolation alpha.

- [x] **Step 3: Implement the loop timing contract**

Change `LoopHooks.render` to `render(alpha: number, frameDt: number)`. In `tick`, derive raw elapsed once, clamp it to `[0, fixedDt * maxSubSteps]`, use the clamped value for both the accumulator and render `frameDt`, and pass zero on the baseline tick.

- [x] **Step 4: Add failing refresh-rate camera tests**

Run the same camera target for one second using 60 calls at `1/60` and 120 calls
at `1/120`; assert camera/look-at positions agree within five decimal places.
Type the test context as `GameCtx & { frameDt: number }` so the pre-production
RED run compiles while the current camera implementation ignores the extra
field.

- [x] **Step 5: Run the camera test and verify RED**

Run: `npx vitest run games/monkey-ball/tests/systems/cameraFollow.test.ts`

Expected: FAIL because the current 0.1 lerp runs once per frame.

- [x] **Step 6: Implement time-based camera response**

Add optional `frameDt` to `GameCtx`, thread it through gameplay render calls,
and replace fixed lerp factors with:

```ts
const RESPONSE = -Math.log(1 - 0.1) * 60
const follow = 1 - Math.exp(-RESPONSE * Math.max(0, ctx.frameDt))
```

Keep initial `cam`/`look` assignment exact. Make `Gameplay.render`,
`PlayHandle.render`, and `EditorCore.tick` accept `frameDt = 0` so existing
one-argument callers remain source-compatible; the two composition roots pass
the real value supplied by `GameLoop`.

- [x] **Step 7: Add a failing fly-control ownership test**

Create `flyControls.test.ts` against the existing `attachFlyControls` export.
Stub `requestAnimationFrame`, attach controls, and assert no rAF was requested and
the returned value exposes `update(dt)` plus `dispose()`. Cast the current return
value to the desired handle shape inside the test so RED is an assertion failure,
not a TypeScript/module-resolution error.

- [x] **Step 8: Run the fly-control test and verify RED**

Run: `npx vitest run packages/editor/tests/viewport3d/flyControls.test.ts`

Expected: FAIL because attachment currently starts a private rAF and returns a
bare disposer function.

- [x] **Step 9: Remove private rAF with the minimal handle implementation**

Change `attachFlyControls` to return `{ update() {}, dispose() }`, move its
existing listener cleanup into `dispose`, and remove its private rAF. Rerun the
focused test and confirm the ownership assertion passes.

- [x] **Step 10: Add a failing elapsed-time movement test**

In the same test file, press `W`, advance one attached controller for one second
using 60 calls at `1/60`, advance another using 120 calls at `1/120`, and assert
equal camera positions plus non-zero forward movement.

Run: `npx vitest run packages/editor/tests/viewport3d/flyControls.test.ts`

Expected: FAIL on non-zero/equal movement because `update()` is still the
minimal no-op.

- [x] **Step 11: Implement time-based fly controls**

Create a pure helper:

```ts
export function advanceFlyControls(
  camera: FlyCamera,
  keys: ReadonlySet<string>,
  dt: number,
  speed = 15
): FlyCamera {
  const move = movementFromKeys(keys)
  return move.forward || move.right || move.up
    ? moveFly(camera, move, speed * Math.max(0, dt))
    : camera
}
```

Change `attachFlyControls` to return `{ update(dt), dispose() }`, remove its private rAF, and have `tools/level-editor/src/main.ts` call `flyControls.update(dt)` inside the existing fixed update.

- [x] **Step 12: Verify Task 2 green**

Run: `npx vitest run packages/engine/tests/loop games/monkey-ball/tests/systems/cameraFollow.test.ts games/monkey-ball/tests/game packages/editor/tests/play packages/editor/tests/viewport3d/flyControls.test.ts`

Expected: all selected tests PASS.

- [x] **Step 13: Commit Task 2**

```bash
git add packages/engine/src/loop/gameLoop.ts packages/engine/tests/loop/gameLoop.test.ts games/monkey-ball/src/game/context.ts games/monkey-ball/src/game/gameplay.ts games/monkey-ball/src/systems/cameraFollow.ts games/monkey-ball/src/main.ts games/monkey-ball/src/editor/registration.ts games/monkey-ball/tests/systems/cameraFollow.test.ts packages/editor/src/model/gameDefinition.ts packages/editor/src/host.ts packages/editor/src/viewport3d/flyControls.ts packages/editor/src/viewport3d/browser.ts packages/editor/src/index.ts packages/editor/tests/viewport3d/flyControls.test.ts tools/level-editor/src/main.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(loop): make visual updates time based"
```

### Task 3: Add one idempotent browser cleanup owner and typed scenes

**Files:**
- Create: `packages/engine/src/lifecycle/cleanup.ts`
- Create: `packages/engine/tests/lifecycle/cleanup.test.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/src/scene/manager.ts`
- Modify: `packages/engine/tests/scene/manager.test.ts`
- Modify: `games/monkey-ball/src/audio/browserAudio.ts`
- Modify: `games/monkey-ball/tests/audio/browserAudio.test.ts`
- Modify: `games/monkey-ball/src/scenes/levelLifecycle.ts`
- Modify: `games/monkey-ball/tests/scenes/levelLifecycle.test.ts`
- Modify: `games/monkey-ball/src/main.ts`
- Modify: `tools/level-editor/src/main.ts`

- [x] **Step 1: Add failing cleanup-stack tests**

Import the existing engine index as a namespace, obtain `createCleanupStack`
through a local optional structural cast, and first assert that it is a
function. If absent, return after that assertion so RED is behavioral rather
than an unresolved-module error. Once present, test LIFO execution, idempotence,
continuing after one callback throws, and immediate cleanup when `defer()` is
called after disposal:

```ts
type CleanupStack = {
  readonly disposed: boolean
  defer(cleanup: () => void): void
  dispose(): void
}
const createCleanupStack = (
  engine as unknown as { createCleanupStack?: () => CleanupStack }
).createCleanupStack
expect(typeof createCleanupStack).toBe('function')
if (!createCleanupStack) return
const cleanup = createCleanupStack()
cleanup.defer(() => calls.push('first'))
cleanup.defer(() => { calls.push('second'); throw new Error('boom') })
cleanup.defer(() => calls.push('third'))
expect(() => cleanup.dispose()).toThrow('boom')
expect(calls).toEqual(['third', 'second', 'first'])
cleanup.dispose()
expect(calls).toHaveLength(3)
expect(cleanup.disposed).toBe(true)
cleanup.defer(() => calls.push('late'))
expect(calls.at(-1)).toBe('late')
```

- [x] **Step 2: Run cleanup tests and verify RED**

Run: `npx vitest run packages/engine/tests/lifecycle/cleanup.test.ts`

Expected: FAIL because the engine index does not yet export
`createCleanupStack`.

- [x] **Step 3: Implement `CleanupStack`**

Expose `readonly disposed`, `defer(cleanup: () => void): void`, and
`dispose(): void`. Mark disposed before draining, run callbacks in reverse
registration order, retain the first thrown error, finish draining, then throw
that error. If `defer` runs after disposal, invoke its callback immediately.

- [x] **Step 4: Add failing generic SceneManager compile/runtime coverage**

Update tests to use a literal scene union and a complete scene record. Cast the
existing factory locally to the desired generic/fourth-argument signature so
the pre-production RED run compiles; assert hooks and one manager-level
`onTransition` callback receive `{ from, to }`, including the initial `null ->
current` transition and the final `current -> null` transition on stop.

- [x] **Step 5: Implement typed scene transitions**

Make `Scene` and `createSceneManager` generic in `Id extends PropertyKey`:

```ts
export interface SceneTransition<Id> { from: Id | null; to: Id | null }
export interface Scene<Id> {
  onEnter?(transition: SceneTransition<Id>): void
  onExit?(transition: SceneTransition<Id>): void
}
```

Require `scenes: Record<Id, Scene<Id>>`; remove optional scene lookups. Add an
optional fourth argument `{ onTransition?: (transition) => void }` and invoke it
exactly once per initial entry, state transition, and stop.

- [x] **Step 6: Add failing browser-audio disposal tests**

Read `dispose` through a local optional structural cast and first assert it is a
function. Then assert the real-context path calls `context.close()` once and the
null fallback has an idempotent no-op `dispose()`; the initial RED run therefore
fails an assertion rather than typechecking.

- [x] **Step 7: Implement browser-audio disposal**

Add `dispose()` to `BrowserAudio`, invoking `void context.close()` on the real path.

- [x] **Step 8: Add failing level-session transition tests**

Extend `levelLifecycle.test.ts`. Import the existing module as a namespace, read
`levelSessionAction` through a local structural cast, and first assert that it is
a function; this makes RED an assertion failure rather than an unresolved-module
error. Once present, cover:

```ts
type LevelSessionAction = (
  from: SceneId | null,
  to: SceneId | null,
  hasActive: boolean,
  hasPending: boolean
) => 'enter' | 'leave' | 'keep' | 'none'
const levelSessionAction = (
  lifecycle as unknown as { levelSessionAction?: LevelSessionAction }
).levelSessionAction
expect(typeof levelSessionAction).toBe('function')
if (!levelSessionAction) return
expect(levelSessionAction('playing', 'paused', true, false)).toBe('keep')
expect(levelSessionAction('paused', 'playing', true, false)).toBe('keep')
expect(levelSessionAction('levelComplete', 'levelSelect', true, false)).toBe('leave')
expect(levelSessionAction('gameOver', 'menu', true, false)).toBe('leave')
expect(levelSessionAction('levelSelect', 'playing', false, false)).toBe('enter')
expect(levelSessionAction('paused', 'playing', false, false)).toBe('enter')
expect(levelSessionAction('playing', null, false, true)).toBe('leave')
```

- [x] **Step 9: Run the level-session test and verify RED**

Run: `npx vitest run games/monkey-ball/tests/scenes/levelLifecycle.test.ts`

Expected: FAIL because the level-session transition helper does not exist.

- [x] **Step 10: Implement the explicit level-session matrix**

Define `LevelScene = 'playing' | 'paused' | 'levelComplete' | 'gameOver'` and
return `enter` only when `to === 'playing'` with neither active nor pending
resources, `leave` when leaving that set or shutting down, `keep` for internal
transitions with active/pending resources, and `none` otherwise.

- [x] **Step 11: Wire composition-root cleanup and cancellation**

Register every acquired disposer immediately in each `main.ts`: input handles,
active gameplay, store subscriptions, named DOM listener removals, scene-manager
stop, fly controls, loop driver, autosave, chrome/editor, canvas renderer,
renderer port, audio runtime, and physics. Use the same stack for boot-failure
rollback and `beforeunload`.

In Monkey Ball, replace the separate scene subscription with the scene
manager's typed `onTransition` callback and `levelSessionAction`. Keep the active
world across `playing`, `paused`, `levelComplete`, and `gameOver`; leave it only
for `menu`, `levelSelect`, or shutdown. Maintain `loadEpoch` plus a `pendingLoad`
flag: increment the epoch on every leave/shutdown, capture it before awaiting a
level, and mount only when the epoch still matches and `cleanup.disposed ===
false`. A late resource registered after disposal is immediately cleaned by the
stack. During boot-error handling, catch cleanup errors separately so the
original boot error panel is still rendered.

- [x] **Step 12: Verify Task 3 green**

Run: `npx vitest run packages/engine/tests/lifecycle packages/engine/tests/scene games/monkey-ball/tests/audio games/monkey-ball/tests/scenes/levelLifecycle.test.ts && npm run typecheck`

Expected: all selected tests and workspace typecheck PASS.

- [x] **Step 13: Commit Task 3**

```bash
git add packages/engine/src/lifecycle/cleanup.ts packages/engine/tests/lifecycle/cleanup.test.ts packages/engine/src/scene/manager.ts packages/engine/tests/scene/manager.test.ts packages/engine/src/index.ts games/monkey-ball/src/audio/browserAudio.ts games/monkey-ball/tests/audio/browserAudio.test.ts games/monkey-ball/src/scenes/levelLifecycle.ts games/monkey-ball/tests/scenes/levelLifecycle.test.ts games/monkey-ball/src/main.ts tools/level-editor/src/main.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(runtime): centralize resource cleanup"
```

### Task 4: Cache geometry and pool detached meshes

**Files:**
- Modify: `packages/engine/tests/render/three-meshes.test.ts`
- Modify: `packages/engine/src/render/three.ts`

- [x] **Step 1: Replace disposal-on-remove coverage with failing reuse tests**

Add tests proving identical shapes share one geometry, a removed mesh is reused by identity for the same full definition, reused meshes reset transform/highlight, and geometry/material disposal occurs only during renderer disposal.

```ts
expect(first.geometry).toBe(second.geometry)
port.remove(firstEntity)
port.add(replacement, def)
expect(scene.children.at(-1)).toBe(first)
```

- [x] **Step 2: Run renderer tests and verify RED**

Run: `npx vitest run packages/engine/tests/render/three-meshes.test.ts`

Expected: FAIL because geometry is per mesh and removal disposes resources.

- [x] **Step 3: Implement renderer-lifetime caches**

Create stable `geometryKey(def)` and `meshKey(def)` functions. Store geometry by primitive dimensions and detached meshes by full definition. `add` pops from the matching pool or creates a mesh with cached geometry. `remove` resets emissive state, position, rotation, and scale before pooling. Track each mesh's pool key by entity while active.

- [x] **Step 4: Implement exact final disposal**

On `port.dispose()`, detach active meshes without returning them to the pool, dispose every active/pooled material once, dispose every cached geometry once, clear pools/maps/groups/grids, and remove scene lights.

- [x] **Step 5: Verify Task 4 green**

Run: `npx vitest run packages/engine/tests/render`

Expected: all renderer tests PASS.

- [x] **Step 6: Commit Task 4**

```bash
git add packages/engine/src/render/three.ts packages/engine/tests/render/three-meshes.test.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(render): reuse geometry and mesh resources"
```

### Task 5: Synchronize editor worlds by stable entity ID

**Files:**
- Modify: `packages/editor/src/model/gameDefinition.ts`
- Modify: `packages/editor/src/viewport3d/worldSync.ts`
- Modify: `packages/editor/tests/viewport3d/worldSync.test.ts`
- Modify: `packages/editor/tests/fixtures/fakeDefinition.ts`
- Modify: `games/monkey-ball/src/level/buildWorld.ts`
- Modify: `games/monkey-ball/src/editor/registration.ts`
- Create: `games/monkey-ball/tests/editor/worldSync.test.ts`

- [x] **Step 1: Add failing generic world-sync tests**

Create a local fake-definition value with a `syncWorld` spy and pass it through
the existing `GameDefinition` parameter (structural typing permits the extra
property without changing the production interface first). After the initial
build, change only metadata and assert `syncWorld` receives `(world,
previousDoc, nextDoc)` without another `buildWorld` call. Also call `syncNow()`
again with the identical document reference and assert neither sync nor rebuild
runs; selection highlighting still updates.

- [x] **Step 2: Run generic world-sync tests and verify RED**

Run: `npx vitest run packages/editor/tests/viewport3d/worldSync.test.ts`

Expected: FAIL because `GameDefinition.syncWorld` and previous-document tracking do not exist.

- [x] **Step 3: Add the optional sync hook and use it**

Add:

```ts
syncWorld?(world: World<object>, previous: Doc, next: Doc): void
```

Track the document used to build the current world. On a later `syncNow`, return
after highlighting when `nextDoc === previousDoc`; otherwise call the hook when
present and rebuild only when it is absent. Always update the stored document
after a successful sync/rebuild and reapply highlighting. A throwing hook is
allowed to propagate.

- [x] **Step 4: Add failing Monkey Ball identity tests**

Build an editor world, capture entities by `editorId`, then apply a metadata edit and a one-item move. Assert metadata preserves every entity object; moving one geometry replaces exactly that ID while every other entity retains object identity. Assert render/physics registration receives one remove/add pair.

- [x] **Step 5: Run Monkey Ball sync tests and verify RED**

Run: `npx vitest run games/monkey-ball/tests/editor/worldSync.test.ts`

Expected: FAIL because Monkey Ball has no incremental hook or seed map.

- [x] **Step 6: Extract stable-ID entity seeds**

Refactor `buildWorld.ts` to expose a game-internal `levelEntitySeeds(level, lib, { editorIds: true })`. Keep `populateLevelWorld` as a loop over those seeds and retain its returned ball reference.

- [x] **Step 7: Implement Monkey Ball incremental synchronization**

Build old/new maps keyed by `editorId`. Because both maps come from the same
plain-data seed constructor, compare a pair with
`JSON.stringify(previousSeed) === JSON.stringify(nextSeed)`. Remove
missing/changed live entities, then add added/changed seeds. Register this
function as `GameDefinition.syncWorld`. Metadata-only edits produce no world
mutations.

- [x] **Step 8: Verify Task 5 green**

Run: `npx vitest run packages/editor/tests/viewport3d games/monkey-ball/tests/editor games/monkey-ball/tests/level/buildWorld.test.ts`

Expected: all selected tests PASS.

- [x] **Step 9: Commit Task 5**

```bash
git add packages/editor/src/model/gameDefinition.ts packages/editor/src/viewport3d/worldSync.ts packages/editor/tests/viewport3d/worldSync.test.ts packages/editor/tests/fixtures/fakeDefinition.ts games/monkey-ball/src/level/buildWorld.ts games/monkey-ball/src/editor/registration.ts games/monkey-ball/tests/editor/worldSync.test.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(editor): sync changed world entities by id"
```

### Task 6: Replace the Miniplex type leak with an engine-owned ECS facade

**Files:**
- Modify: `packages/engine/tests/ecs/world.test.ts`
- Modify: `packages/engine/src/ecs/world.ts`
- Modify: `packages/engine/src/physics/systems.ts`
- Modify: `packages/engine/src/render/systems.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: Add facade characterization tests**

Extend `world.test.ts` to cover `entities`, `has`, `clear`, `first`, add/remove
subscriptions, and component add/remove through the existing public engine
module. These tests characterize behavior that the wrapper must preserve.

- [ ] **Step 2: Run characterization tests green before refactoring**

Run: `npx vitest run packages/engine/tests/ecs/world.test.ts`

Expected: all runtime characterization assertions PASS against the current
Miniplex-backed export.

- [ ] **Step 3: Add a failing Miniplex-boundary lint rule**

Add a flat ESLint block covering `packages/engine/src/**/*.ts` while ignoring
`packages/engine/src/ecs/world.ts`; forbid direct `miniplex` imports with a
message that all ECS access must go through the engine facade.

Run: `npm run lint`

Expected: FAIL only at the current direct imports in
`physics/systems.ts` and `render/systems.ts`.

- [ ] **Step 4: Implement the facade**

Define engine-owned interfaces:

```ts
export interface EntityQuery<E extends object> extends Iterable<E> {
  readonly first: E | undefined
  readonly onEntityAdded: QuerySignal<E>
  readonly onEntityRemoved: QuerySignal<E>
}

export interface QuerySignal<E extends object> {
  subscribe(listener: (entity: E) => void): () => void
}

export interface World<E extends object> {
  readonly entities: Iterable<E>
  add(entity: E): E
  remove(entity: E): void
  clear(): void
  has(entity: object): entity is E
  addComponent<K extends keyof E>(entity: E, key: K, value: E[K]): void
  removeComponent<K extends keyof E>(entity: E, key: K): void
  with<K extends keyof E>(...keys: K[]): EntityQuery<E & Required<Pick<E, K>>>
}
```

Wrap Miniplex internally in `createWorld`; adapt query iteration, `first`, and signals. Remove all exported Miniplex types and remove engine-internal `Query` casts/imports.

- [ ] **Step 5: Run ECS, physics, render, and lint verification**

Run: `npx vitest run packages/engine/tests/ecs packages/engine/tests/physics/systems.test.ts packages/engine/tests/render/systems.test.ts && npm run lint`

Expected: all selected tests PASS.

- [ ] **Step 6: Run workspace typecheck**

Run: `npm run typecheck`

Expected: PASS without consumer changes because the facade preserves the existing
engine-owned `World` surface; no module outside `ecs/world.ts` imports Miniplex.

- [ ] **Step 7: Commit Task 6**

```bash
git add packages/engine/src/ecs/world.ts packages/engine/tests/ecs/world.test.ts packages/engine/src/physics/systems.ts packages/engine/src/render/systems.ts eslint.config.js docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(ecs): hide miniplex behind engine facade"
```

### Task 7: Add narrow headless package entry points

**Files:**
- Create: `packages/engine/src/browser.ts`
- Create: `packages/engine/src/data.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/package.json`
- Create: `packages/editor/src/headless.ts`
- Modify: `packages/editor/src/model/gameDefinition.ts`
- Modify: `packages/editor/src/host.ts`
- Modify: `packages/editor/tests/host.test.ts`
- Modify: `packages/editor/package.json`
- Create: `games/monkey-ball/src/headless.ts`
- Create: `games/monkey-ball/src/editor/headlessRegistration.ts`
- Modify: `games/monkey-ball/src/editor/registration.ts`
- Modify: `games/monkey-ball/src/editor/sceneModel.ts`
- Modify: `games/monkey-ball/src/main.ts`
- Modify: `games/monkey-ball/src/audio/browserAudio.ts`
- Modify: `games/monkey-ball/package.json`
- Modify: `games/monkey-ball/src/level/headlessPlay.ts`
- Modify: `tools/level-editor/src/main.ts`
- Modify: `tools/editor-mcp-server/src/headlessHost.ts`
- Modify: `tools/editor-mcp-server/package.json`
- Modify: `tools/editor-mcp-server/tests/headlessHost.test.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: Add a failing headless-boundary lint rule**

For `tools/editor-mcp-server/**/*.ts`, forbid root `@automata/engine`, root
`@automata/editor`, and root `monkey-ball` imports with messages directing
callers to narrow headless subpaths.

Run: `npm run lint`

Expected: FAIL at the three root imports in
`tools/editor-mcp-server/src/headlessHost.ts` and nowhere else.

- [ ] **Step 2: Split platform-neutral and browser engine exports**

Create `packages/engine/src/browser.ts` re-exporting only
`loop/browser`, `input/keyboard`, `input/joystick`, `render/browser`, and
`audio/browser`. Remove those five exports from the root index and add
`"./browser": "./src/browser.ts"` to the package export map. Migrate browser
imports in Monkey Ball main/audio/editor registration and level-editor main to
`@automata/engine/browser`; keep platform-neutral imports at the root.

- [ ] **Step 3: Add narrow data/editor entry points**

`engine/data` exports only data kind/parser/loader/archetype APIs.
`editor/headless` exports model types, `GameDefinition`, validation, and
`createEditorToolHost`, without importing UI, settings, tuning, or provider
adapters. Add both subpaths to their package export maps. Change
`sceneModel.ts` to import `parseData` from `@automata/engine/data` and structural
`Vec3` from `@automata/contracts`; import `CommandError` and editor model types
from `@automata/editor/headless`. Change `headlessPlay.ts` to import
`HeadlessOpts`, `PlayObservation`, and `TestPlayResult` directly from
`@automata/contracts`.

- [ ] **Step 4: Add a headless Monkey Ball definition**

Make `PlayDefinition.createGameplay` optional. In `EditorCore.enterPlay`, require
`definition.play?.createGameplay` and keep the existing descriptive error when
live play is unavailable; add a focused host test for a definition that has
headless play but no live factory.

Create `headlessRegistration.ts` containing the current shared palette,
surface, build-world, and `runHeadlessPlay` wiring but no keyboard import and no
live `createGameplay`. Refactor the browser `registration.ts` to compose that
base with `createKeyboardInput` and live gameplay. Export the headless factory
and required data kinds from `games/monkey-ball/src/headless.ts`.

- [ ] **Step 5: Add export maps and direct dependencies**

Add subpath exports such as:

```json
"exports": {
  ".": "./src/index.ts",
  "./browser": "./src/browser.ts",
  "./data": "./src/data.ts"
}
```

Add `"./headless": "./src/headless.ts"` to Monkey Ball and declare
`@automata/contracts` as its direct dependency. Keep the MCP server's existing
engine/editor/monkey-ball dependencies because it still imports each through a
narrow subpath.

- [ ] **Step 6: Migrate and test the MCP headless graph**

Use `@automata/engine/data`, `@automata/editor/headless`, and
`monkey-ball/headless` in `headlessHost.ts`. Extend its Node-environment test to
import the headless subpath, create the definition, list tools, and run
headless play without defining `window`, `document`, or `localStorage`.

- [ ] **Step 7: Verify package boundaries**

Run: `npm run lint && npm run typecheck && npx vitest run packages/editor/tests/host.test.ts tools/editor-mcp-server/tests games/monkey-ball/tests/level/headlessPlay.test.ts`

Expected: lint, typecheck, and selected tests PASS.

- [ ] **Step 8: Commit Task 7**

```bash
git add packages/engine/src/browser.ts packages/engine/src/data.ts packages/engine/src/index.ts packages/engine/package.json packages/editor/src/headless.ts packages/editor/src/model/gameDefinition.ts packages/editor/src/host.ts packages/editor/tests/host.test.ts packages/editor/package.json games/monkey-ball/src/headless.ts games/monkey-ball/src/editor/headlessRegistration.ts games/monkey-ball/src/editor/registration.ts games/monkey-ball/src/editor/sceneModel.ts games/monkey-ball/src/main.ts games/monkey-ball/src/audio/browserAudio.ts games/monkey-ball/package.json games/monkey-ball/src/level/headlessPlay.ts tools/level-editor/src/main.ts tools/editor-mcp-server/src/headlessHost.ts tools/editor-mcp-server/package.json tools/editor-mcp-server/tests/headlessHost.test.ts eslint.config.js docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(packages): expose narrow headless entry points"
```

### Task 8: Extract the optional AI layer into `@automata/editor-agent`

**Files:**
- Create: `packages/editor-agent/package.json`
- Create: `packages/editor-agent/tsconfig.json`
- Create: `packages/editor-agent/vitest.config.ts`
- Create: `packages/editor-agent/src/index.ts`
- Move: `packages/editor/src/agent/settings.ts` -> `packages/editor-agent/src/settings.ts`
- Move: `packages/editor/src/agent/tuningRunner.ts` -> `packages/editor-agent/src/tuningRunner.ts`
- Move: `packages/editor/src/agent/diff.ts` -> `packages/editor-agent/src/diff.ts`
- Move: `packages/editor/src/ui/chatOverlay.ts` -> `packages/editor-agent/src/chatOverlay.ts`
- Move: `packages/editor/tests/agent/tuningRunner.test.ts` -> `packages/editor-agent/tests/tuningRunner.test.ts`
- Move: `packages/editor/tests/agent/diff.test.ts` -> `packages/editor-agent/tests/diff.test.ts`
- Move: `packages/editor/tests/ui/chatOverlay.test.ts` -> `packages/editor-agent/tests/chatOverlay.test.ts`
- Move: `packages/editor/tests/agent/settings.test.ts` -> `packages/editor-agent/tests/settings.test.ts`
- Create: `packages/editor-agent/tests/fixtures/fakeDefinition.ts`
- Create: `packages/editor/src/ui/index.ts`
- Create: `packages/editor/src/viewport.ts`
- Modify: `packages/editor/tests/ui/chrome.test.ts`
- Modify: `packages/editor/src/ui/chrome.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `packages/editor/package.json`
- Modify: `eslint.config.js`
- Modify: `vitest.config.ts`
- Modify: `tools/level-editor/src/main.ts`
- Modify: `tools/level-editor/package.json`

**Interfaces:**
- Consumes (Task 7 `@automata/editor/headless`): `createEditorToolHost`, `EditorToolHost<Doc>`, `validateDoc`, `GameDefinition<Doc>`, `SceneModel<Doc>`, `SceneItem`, `Surface`, `CommandError`.
- Consumes (editor root `.`): `createEditor`, `EditorCore<Doc>`, `EditorState<Doc>`.
- Produces (`@automata/editor/ui`): `renderEditorChrome<Doc>(core, root, canvases, opts?)`, `EditorChromeHandle`, `EditorChromeOptions<Doc> = { mountAgentPanel?: (core: EditorCore<Doc>, host: HTMLElement) => PanelHandle<Doc> }`, `PanelHandle<Doc>`, `SLATE_PRO_CSS`, `injectTheme`.
- Produces (`@automata/editor/viewport`): `attachFlyControls`, `paintMap`, `screenToWorldXZ`, `worldToScreen`, `MapView`, `ScreenSize`, `DrawOp`, `buildDrawModel`, `hitTestMap`, `FlyCamera`, `initialFlyCamera`, `cameraView`, `buildRay`, `rayPlaneY`, `Aabb`, `itemAabb`, `pickItem`, `EDITOR_FOV_Y`.
- Produces (`@automata/editor-agent`): `mountChatOverlay<Doc>(core, parent, deps?)`, `defaultChatDeps<Doc>(opts?)`, `CHAT_SYSTEM_PROMPT`, `createAgentPanelMount<Doc>(deps?): (core: EditorCore<Doc>, host: HTMLElement) => PanelHandle<Doc>`, plus re-exports `runTuning`, `TuningRunResult<Doc>`, `loadAgentSettings`, `saveAgentSettings`, `createProvider`, `AgentSettings`, `ChatOverlayDeps<Doc>`.

- [ ] **Step 1: Replace the default-chat assertion with the agent-panel hook tests**

`packages/editor/tests/ui/chrome.test.ts` already exists: it mounts the full chrome with the shared `makeTestEditor()` harness (from `tests/fixtures/editorHarness.ts`, which already provides `nullPhysics`) and asserts the chat overlay mounts by default. After this task the overlay no longer lives in the editor, so replace **only** the second `it(...)` block (`'mounts the chat overlay panel in the chrome'`) with two hook-based cases. Leave the file's imports, its first test, and the `canvases()` helper unchanged:

```ts
  it('mounts the agent region only when a mountAgentPanel hook is supplied', () => {
    const root = document.createElement('div')
    const editor = makeTestEditor()
    const seen: HTMLElement[] = []
    const chrome = renderEditorChrome(editor, root, canvases(), {
      mountAgentPanel: (_core, host) => {
        seen.push(host)
        return { update() {}, dispose() {} }
      }
    })

    expect(seen).toHaveLength(1)
    expect(root.querySelector('.ed-chat-host')).not.toBeNull()

    chrome.dispose()
    expect(root.querySelector('.ed-chat-host')).toBeNull()
    editor.dispose()
  })

  it('omits the agent region when no hook is supplied', () => {
    const root = document.createElement('div')
    const editor = makeTestEditor()
    renderEditorChrome(editor, root, canvases())

    expect(root.querySelector('.ed-chat-host')).toBeNull()
    editor.dispose()
  })
```

- [ ] **Step 2: Run the chrome test and verify RED**

Run: `npx vitest run packages/editor/tests/ui/chrome.test.ts`

Expected: FAIL — vitest strips types and runs, but the unchanged 3-parameter `renderEditorChrome` still creates `.ed-chat-host` unconditionally and ignores the 4th argument, so the hook is never called (`seen` stays empty) and the no-hook case still finds `.ed-chat-host`. Both new cases fail.

- [ ] **Step 3: Add the mountAgentPanel seam and stop importing the chat overlay**

In `packages/editor/src/ui/chrome.ts`, delete the chat-overlay import line `import { mountChatOverlay } from './chatOverlay'`. Add a panel-type import and an options interface:

```ts
import type { PanelHandle } from './panel'

export interface EditorChromeOptions<Doc> {
  /** When provided, chrome mounts an agent panel in the right column; otherwise none exists. */
  mountAgentPanel?: (core: EditorCore<Doc>, host: HTMLElement) => PanelHandle<Doc>
}
```

Add the options parameter to the signature:

```ts
export function renderEditorChrome<Doc>(
  core: EditorCore<Doc>,
  root: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>,
  opts: EditorChromeOptions<Doc> = {}
): EditorChromeHandle {
```

Delete the unconditional `const chatHost = region('ed-chat-host')` line, change the right-column append to `rightcol.append(inspectorHost, outlinerHost)`, remove `mountChatOverlay(core, chatHost),` from the `panels` array, and after the array mount the agent panel conditionally:

```ts
  const panels = [
    menubar,
    mountToolbar(core, toolbarHost),
    mountPalette(core, paletteHost),
    mountInspector(core, inspectorHost),
    mountOutliner(core, outlinerHost),
    mountViewportRegion(core, viewportHost, canvases)
  ]
  if (opts.mountAgentPanel) {
    const chatHost = region('ed-chat-host')
    rightcol.append(chatHost)
    panels.push(opts.mountAgentPanel(core, chatHost))
  }
```

Run: `npx vitest run packages/editor/tests/ui/chrome.test.ts`

Expected: PASS.

- [ ] **Step 4: Add the failing agent-core boundary and register the new package**

In `eslint.config.js`, add `'packages/editor-agent/**/*.ts'` to the `files` array of the first block (the "third-party libs only through `@automata/engine`" block). Then replace the generic-editor block so it also forbids the AI layer:

```js
  {
    // The generic editor core must not depend on any game or on the optional AI layer.
    files: ['packages/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['monkey-ball', 'monkey-ball/*'],
            message: 'The editor core is generic; the game registers itself via GameDefinition.'
          },
          {
            group: ['@automata/agent-core', '@automata/agent-core/*'],
            message: 'AI is optional; the agent layer lives in @automata/editor-agent, not the editor core.'
          }
        ]
      }]
    }
  },
```

Run: `npm run lint`

Expected: FAIL at `packages/editor/src/agent/settings.ts`, `packages/editor/src/agent/tuningRunner.ts`, and `packages/editor/src/ui/chatOverlay.ts` (still importing `@automata/agent-core` before the move).

- [ ] **Step 5: Scaffold the @automata/editor-agent package**

Create `packages/editor-agent/package.json`:

```json
{
  "name": "@automata/editor-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@automata/editor": "*",
    "@automata/agent-core": "*",
    "@automata/contracts": "*"
  }
}
```

Create `packages/editor-agent/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

Create `packages/editor-agent/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'editor-agent', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

Create a temporary `packages/editor-agent/src/index.ts` containing `export {}` so the workspace install resolves. Then run `npm install`.

Expected: npm links `@automata/editor-agent` with no errors.

- [ ] **Step 6: Move the agent modules and rewrite their imports**

```bash
git mv packages/editor/src/agent/settings.ts packages/editor-agent/src/settings.ts
git mv packages/editor/src/agent/tuningRunner.ts packages/editor-agent/src/tuningRunner.ts
git mv packages/editor/src/agent/diff.ts packages/editor-agent/src/diff.ts
git mv packages/editor/src/ui/chatOverlay.ts packages/editor-agent/src/chatOverlay.ts
```

`settings.ts` keeps its single `@automata/agent-core` import unchanged.

In `packages/editor-agent/src/diff.ts`, replace the two editor-relative type imports with:

```ts
import type { GameDefinition, SceneItem } from '@automata/editor/headless'
```

In `packages/editor-agent/src/tuningRunner.ts`, replace the `../host`, `../io/validation`, and `./editorToolHost` imports with:

```ts
import type { EditorCore } from '@automata/editor'
import { validateDoc, createEditorToolHost } from '@automata/editor/headless'
```

The `@automata/agent-core` and `@automata/contracts` imports in `tuningRunner.ts` stay unchanged.

In `packages/editor-agent/src/chatOverlay.ts`, replace the editor-relative imports (`../agent/diff`, `../agent/editorToolHost`, `../agent/settings`, `../agent/tuningRunner`, `../host`, `../state/store`, `./panel`) with:

```ts
import { diffDocs } from './diff'
import { createEditorToolHost, type EditorToolHost } from '@automata/editor/headless'
import { createProvider, loadAgentSettings, saveAgentSettings, type AgentSettings } from './settings'
import { runTuning, type TuningRunResult } from './tuningRunner'
import type { EditorCore, EditorState } from '@automata/editor'
import type { PanelHandle } from '@automata/editor/ui'
```

The `runAgent`/provider imports from `@automata/agent-core` and `SceneCommand` from `@automata/contracts` stay. `editorToolHost.ts` remains at `packages/editor/src/agent/editorToolHost.ts` (exported via `@automata/editor/headless` from Task 7).

- [ ] **Step 7: Write the editor-agent barrel and the panel-mount factory**

Replace `packages/editor-agent/src/index.ts`:

```ts
import { defaultChatDeps, mountChatOverlay, type ChatOverlayDeps } from './chatOverlay'
import type { EditorCore } from '@automata/editor'
import type { PanelHandle } from '@automata/editor/ui'

export { mountChatOverlay, defaultChatDeps, CHAT_SYSTEM_PROMPT } from './chatOverlay'
export type { ChatOverlayDeps, ChatRunOutput, DefaultChatDepsOptions } from './chatOverlay'
export { runTuning, type TuningRunResult } from './tuningRunner'
export { loadAgentSettings, saveAgentSettings, createProvider, defaultAgentSettings, type AgentSettings } from './settings'

/** Build the optional chrome hook that mounts the chat assistant panel. */
export function createAgentPanelMount<Doc>(
  deps?: ChatOverlayDeps<Doc>
): (core: EditorCore<Doc>, host: HTMLElement) => PanelHandle<Doc> {
  return (core, host) => mountChatOverlay(core, host, deps ?? defaultChatDeps<Doc>())
}
```

- [ ] **Step 8: Curate the editor surface and add the ./ui and ./viewport subpaths**

Replace `packages/editor/src/index.ts` with the core-only barrel (agent, chrome/theme, and viewport exports removed):

```ts
export { EDITOR_VERSION } from './version'
export * from './model/types'
export * from './model/gameDefinition'
export * from './state/actions'
export * from './state/store'
export * from './host'
export * from './tools/cardinality'
export * from './tools/place'
export * from './tools/inspector'
export * from './io/validation'
export * from './io/exportDoc'
export * from './io/importDoc'
export * from './io/autosave'
export * from './grid'
```

Create `packages/editor/src/ui/index.ts`:

```ts
export { renderEditorChrome, type EditorChromeHandle, type EditorChromeOptions } from './chrome'
export type { PanelHandle } from './panel'
export { SLATE_PRO_CSS, injectTheme } from './theme.css'
```

Create `packages/editor/src/viewport.ts`:

```ts
export { attachFlyControls } from './viewport3d/browser'
export { paintMap } from './viewport2d/browser'
export * from './viewport2d/projection'
export * from './viewport2d/draw'
export * from './viewport2d/hit'
export * from './viewport3d/flyCamera'
export * from './viewport3d/ray'
export * from './viewport3d/aabb'
```

In `packages/editor/package.json`, remove `"@automata/agent-core": "*"` from `dependencies` and set the export map to:

```json
"exports": {
  ".": "./src/index.ts",
  "./headless": "./src/headless.ts",
  "./ui": "./src/ui/index.ts",
  "./viewport": "./src/viewport.ts"
},
```

- [ ] **Step 9: Move the agent tests and add the editor-agent fixture**

```bash
git mv packages/editor/tests/agent/settings.test.ts packages/editor-agent/tests/settings.test.ts
git mv packages/editor/tests/agent/tuningRunner.test.ts packages/editor-agent/tests/tuningRunner.test.ts
git mv packages/editor/tests/agent/diff.test.ts packages/editor-agent/tests/diff.test.ts
git mv packages/editor/tests/ui/chatOverlay.test.ts packages/editor-agent/tests/chatOverlay.test.ts
```

Create `packages/editor-agent/tests/fixtures/fakeDefinition.ts` by copying `packages/editor/tests/fixtures/fakeDefinition.ts` verbatim, replacing only its first four import lines with:

```ts
import { createWorld, type RenderPort } from '@automata/engine'
import type { GameDefinition, SceneModel, SceneItem, Surface } from '@automata/editor/headless'
import { CommandError } from '@automata/editor/headless'
```

This relies on Task 7's `packages/editor/src/headless.ts` re-exporting `GameDefinition`, `SceneModel`, `SceneItem`, `Surface`, `validateDoc`, `createEditorToolHost`, and `CommandError`. If any are absent, add them to `headless.ts` before continuing.

Repoint imports in each moved test (the tests' own inline `nullPhysics` helpers stay):

- `settings.test.ts`: `import { createProvider, defaultAgentSettings, loadAgentSettings, saveAgentSettings } from '../../src/settings'` (no fixture import needed).
- `diff.test.ts`: `import { diffDocs } from '../../src/diff'` and `from './fixtures/fakeDefinition'`.
- `tuningRunner.test.ts`: `import { runTuning } from '../../src/tuningRunner'`, `import { createEditor } from '@automata/editor'`, and `from './fixtures/fakeDefinition'`.
- `chatOverlay.test.ts`: `import { defaultChatDeps, mountChatOverlay, type ChatOverlayDeps } from '../../src/chatOverlay'`, `import type { AgentSettings } from '../../src/settings'`, `import { createEditor } from '@automata/editor'`, `import { createEditorToolHost } from '@automata/editor/headless'`, and `from './fixtures/fakeDefinition'`.

- [ ] **Step 10: Wire the optional panel into the editor app and include the package in coverage**

In `tools/level-editor/src/main.ts`, split the editor imports across the new subpaths and add the agent factory:

```ts
import { createEditor, importDoc, installAutosave, loadAutosave } from '@automata/editor'
import { renderEditorChrome } from '@automata/editor/ui'
import { attachFlyControls, paintMap, screenToWorldXZ, type ScreenSize } from '@automata/editor/viewport'
import { createAgentPanelMount } from '@automata/editor-agent'
```

Pass the hook when rendering chrome:

```ts
  const chrome = renderEditorChrome<Level>(
    editor, app, { '2d': canvas2d, '3d': canvas3d },
    { mountAgentPanel: createAgentPanelMount<Level>() }
  )
```

Add `"@automata/editor-agent": "*"` to `tools/level-editor/package.json` dependencies. In `vitest.config.ts`, add `'packages/editor-agent/src/**'` to `coverage.include`. Then run `npm install`.

- [ ] **Step 11: Verify Task 8 green**

Run: `npm run lint && npm run typecheck && npx vitest run packages/editor packages/editor-agent tools/level-editor tools/editor-mcp-server`

Expected: lint clean (no `@automata/agent-core` import under `packages/editor/`), all typechecks pass, and every selected suite PASSES.

- [ ] **Step 12: Commit Task 8**

```bash
git add packages/editor-agent packages/editor/src packages/editor/package.json packages/editor/tests eslint.config.js vitest.config.ts tools/level-editor/src/main.ts tools/level-editor/package.json package-lock.json docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(editor): extract optional @automata/editor-agent layer"
```

### Task 9: Expand coverage to game and MCP production code

**Files:**
- Modify: `vitest.config.ts`
- Modify: `games/monkey-ball/tests/editor/registrationPlay.test.ts`
- Create: `games/monkey-ball/tests/editor/registrationBrowser.test.ts`
- Modify: `games/monkey-ball/tests/editor/sceneModel.test.ts`
- Modify: `games/monkey-ball/tests/level/buildWorld.test.ts`
- Modify: `games/monkey-ball/tests/level/headlessPlay.test.ts`
- Modify: `games/monkey-ball/tests/scenes/levelLifecycle.test.ts`
- Modify: `games/monkey-ball/tests/state/persist.test.ts`
- Create: `games/monkey-ball/tests/state/unlocks.test.ts`
- Modify: `games/monkey-ball/tests/systems/goal.test.ts`
- Modify: `games/monkey-ball/tests/systems/path.test.ts`
- Modify: `games/monkey-ball/tests/ui/overlays.test.ts`
- Modify: `tools/editor-mcp-server/tests/mcpAdapter.test.ts`
- Modify: `tools/editor-mcp-server/tests/server.test.ts`

- [ ] **Step 1: Expand coverage includes**

Add `games/monkey-ball/src/**` and `tools/editor-mcp-server/src/**`. Extend exclusions with `**/main.ts` while retaining `**/browser.ts`, barrels, and version files.

- [ ] **Step 2: Run coverage and verify the expanded gate RED**

Run: `npm run coverage`

Audited pre-refactor baseline: all 569 tests pass, then the expanded gate FAILS
at 86.74% branches. The uncovered concentration is Monkey Ball
browser-audio/editor-registration/scene-model branches, small game guard
branches, and the MCP valid-resource path. Earlier tasks will raise this number,
but this step remains the authoritative expanded gate.

- [ ] **Step 3: Close the known game coverage gaps with focused behavior tests**

Add these explicit cases:

- `registrationPlay.test.ts` (Node): resolve a color surface, reject a texture surface, and verify the headless-only definition runs test play without browser globals;
- new `registrationBrowser.test.ts` (default happy-dom environment): create/dispose live gameplay with recording ports and exercise the keyboard-backed browser definition;
- `sceneModel.test.ts`: add cylinder/archetype items, reject marker addition, edit box axes and cylinder radius/height, and parse `loadDoc`;
- `buildWorld.test.ts`: build cylinder geometry and assert its collider/renderable dimensions;
- `headlessPlay.test.ts`: cover game-over result mapping in addition to the existing completed and incomplete cases;
- `levelLifecycle.test.ts`: return a successfully loaded current level and ignore a failed stale request without dispatch;
- `persist.test.ts`: reject non-finite and out-of-range persisted settings;
- `unlocks.test.ts`: reject missing/empty worlds and unknown levels;
- `goal.test.ts`: ignore events while paused and when no active level ID exists;
- `path.test.ts`: cover empty paths, negative loop distance, negative ping-pong distance, and a zero-length segment before a non-zero segment;
- `overlays.test.ts`: exercise both Quit buttons and dispose each static view; and
- existing Task 3 browser-audio tests cover both real and fallback creation branches.

Run: `npx vitest run games/monkey-ball/tests/editor games/monkey-ball/tests/level games/monkey-ball/tests/scenes games/monkey-ball/tests/state games/monkey-ball/tests/systems games/monkey-ball/tests/ui`

Expected: all game tests PASS.

- [ ] **Step 4: Close the known MCP coverage gaps**

Add an MCP adapter case with undefined arguments to exercise the `{}` fallback. Add an in-memory server integration case that reads `editor://doc` successfully and asserts the host result, complementing the existing invalid-resource test.

Run: `npx vitest run tools/editor-mcp-server/tests`

Expected: all MCP server tests PASS.

- [ ] **Step 5: Verify expanded coverage green**

Run: `npm run coverage`

Expected: at least 90% lines and 90% branches across the expanded include set.

- [ ] **Step 6: Commit Task 9**

```bash
git add vitest.config.ts games/monkey-ball/tests/editor/registrationPlay.test.ts games/monkey-ball/tests/editor/registrationBrowser.test.ts games/monkey-ball/tests/editor/sceneModel.test.ts games/monkey-ball/tests/level/buildWorld.test.ts games/monkey-ball/tests/level/headlessPlay.test.ts games/monkey-ball/tests/scenes/levelLifecycle.test.ts games/monkey-ball/tests/state/persist.test.ts games/monkey-ball/tests/state/unlocks.test.ts games/monkey-ball/tests/systems/goal.test.ts games/monkey-ball/tests/systems/path.test.ts games/monkey-ball/tests/ui/overlays.test.ts tools/editor-mcp-server/tests/mcpAdapter.test.ts tools/editor-mcp-server/tests/server.test.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "test: cover game and MCP production code"
```

### Task 10: Final consistency and release verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-26-refactor-hardening.md`
- Verify: `docs/superpowers/specs/2026-06-26-refactor-hardening-design.md`
- Verify: root worktree and all changed package boundaries

- [ ] **Step 1: Run the complete repository gate**

Run: `npm run ci`

Expected: lint, all workspace typechecks, and all Vitest projects PASS.

- [ ] **Step 2: Run expanded coverage fresh**

Run: `npm run coverage`

Expected: global lines and branches remain at or above 90%.

- [ ] **Step 3: Build both browser applications**

Run: `npm run build`

Expected: Monkey Ball and level-editor Vite production builds PASS.

- [ ] **Step 4: Run browser end-to-end coverage**

Run: `npm run e2e`

Expected: Playwright game and editor flows PASS against the configured local
servers.

- [ ] **Step 5: Audit architecture assertions mechanically**

Run:

```bash
rg -n "from ['\"]miniplex['\"]" games tools packages -g '*.ts'
rg -n "requestAnimationFrame" packages/editor games/monkey-ball tools/level-editor -g '*.ts'
rg -n "from ['\"]@automata/(engine|editor)['\"]|from ['\"]monkey-ball['\"]" tools/editor-mcp-server/src -g '*.ts'
rg -n "from ['\"]@automata/engine/browser['\"]" games/monkey-ball/src tools/level-editor/src -g '*.ts'
rg -n "@automata/agent-core" packages/editor/src -g '*.ts'
```

Expected: Miniplex imports exist only inside `packages/engine/src/ecs/world.ts`; editor/game/tool code owns no extra rAF loop; MCP headless code uses narrow subpaths; and `packages/editor/src` contains no `@automata/agent-core` import (the agent layer lives only in `@automata/editor-agent`).

- [ ] **Step 6: Hold the manual browser checkpoint**

Run `npm run dev:game` and verify: start `w1-l1`, camera motion remains smooth,
pause/resume retains the same world, level-complete and game-over overlays retain
the world, retry works, and quit removes HUD/joystick without duplicates.

Run `npm run dev:editor` and verify: WASD/E/Q fly movement, 2D/3D editing,
metadata-only edits, play/edit toggling, import/export, and closing/reloading the
page all behave normally. Stop here for explicit user confirmation before
marking the plan complete.

- [ ] **Step 7: Mark every plan checkbox complete and inspect the tree**

Run: `rg -n "^- \[ \]" docs/superpowers/plans/2026-06-26-refactor-hardening.md` and `git status --short`.

Expected: no unchecked tasks and only intentional final documentation changes.

- [ ] **Step 8: Commit final plan completion**

```bash
git add docs/superpowers/plans/2026-06-26-refactor-hardening.md docs/superpowers/specs/2026-06-26-refactor-hardening-design.md
git commit -m "docs: complete refactor hardening plan"
```
