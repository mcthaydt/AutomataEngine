# Refactor Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all seven final-audit gaps while preserving gameplay, editor, MCP, and public-port behavior.

**Architecture:** Land correctness seams first (effective commands and one timing owner), then make teardown explicit, pool renderer resources, synchronize editor entities by stable ID, replace the Miniplex type leak with an engine facade, narrow headless entry points, and finally expand coverage. Each behavior change is introduced by a focused failing test and committed only after its focused suite is green.

**Tech Stack:** TypeScript 6, Vitest 4, Miniplex 2, Three.js 0.184, Rapier 0.19, npm workspaces, Vite 8.

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

- [ ] **Step 1: Add failing scene-model effect tests**

Add tests proving missing IDs and duplicate IDs are rejected, while same-value updates preserve identity:

```ts
it('rejects commands that target missing or duplicate ids', () => {
  const doc = levelSceneModel.emptyDoc()
  expect(() => levelSceneModel.apply(doc, {
    type: 'setSurface', id: 'missing', surface: { kind: 'color', value: '#fff' }
  })).toThrow(CommandError)
  expect(() => levelSceneModel.apply(doc, {
    type: 'addItem', item: { ...boxItem('geometry:0'), id: 'geometry:0' }
  })).toThrow(CommandError)
})

it('returns the original document for an effective no-op', () => {
  const doc = levelSceneModel.emptyDoc()
  expect(levelSceneModel.apply(doc, {
    type: 'setMetadata', path: 'name', value: doc.name
  })).toBe(doc)
})
```

- [ ] **Step 2: Run the scene-model tests and verify RED**

Run: `npx vitest run games/monkey-ball/tests/editor/sceneModel.test.ts`

Expected: FAIL because missing/duplicate targets currently succeed and same-value metadata returns a new object.

- [ ] **Step 3: Implement strict target validation and no-op identity**

In `levelSceneModel.apply`, compute the current stable ID set once per targeted command. Throw `CommandError` for missing IDs and duplicate `addItem` IDs. Before cloning, compare the requested value/delta to the current value; return `level` for empty ID arrays, zero deltas, same surfaces, same metadata, same fields, and empty deletes.

Use small equality helpers:

```ts
const sameVec = (a: Vec3, b: Vec3): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z
const zeroDelta = (v: Vec3): boolean => sameVec(v, { x: 0, y: 0, z: 0 })
```

- [ ] **Step 4: Add failing reducer and ToolHost no-op tests**

Add a single-command reducer test whose `SceneModel.apply` returns the same doc and assert the entire `DocumentState` reference is unchanged. Add a ToolHost test whose scene returns the same doc and assert:

```ts
expect(result).toMatchObject({ ok: true, content: { applied: 'setMetadata', changed: false } })
expect(host.commands).toEqual([])
expect(host.doc).toBe(seedDoc)
```

- [ ] **Step 5: Run the editor tests and verify RED**

Run: `npx vitest run packages/editor/tests/state/document.test.ts packages/editor/tests/agent/editorToolHost.test.ts`

Expected: FAIL because single commands create history and ToolHost records every parsed write.

- [ ] **Step 6: Implement effect-aware reducer and ToolHost behavior**

In the single-command reducer branch, return `state` when `next === state.doc`. In ToolHost, apply into `next`, record only when `next !== doc`, and return:

```ts
return {
  ok: true,
  content: { applied: name, changed, items: definition.scene.listItems(doc).length }
}
```

Update the fake scene model to return its original document for same-value operations so fixture behavior matches the production contract.

- [ ] **Step 7: Verify Task 1 green**

Run: `npx vitest run games/monkey-ball/tests/editor packages/editor/tests/state/document.test.ts packages/editor/tests/agent/editorToolHost.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 8: Commit Task 1**

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
- Modify: `packages/editor/src/model/gameDefinition.ts`
- Modify: `packages/editor/src/host.ts`
- Create: `packages/editor/src/viewport3d/flyControls.ts`
- Create: `packages/editor/tests/viewport3d/flyControls.test.ts`
- Modify: `packages/editor/src/viewport3d/browser.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `tools/level-editor/src/main.ts`
- Modify: affected gameplay/editor tests and fixtures for the new render signature

- [ ] **Step 1: Add failing `frameDt` loop tests**

Assert the first render receives `(0, 0)`, a 15 ms tick receives `frameDt = 0.015`, negative time receives zero, and a huge gap is capped at `fixedDt * maxSubSteps`:

```ts
expect(render).toHaveBeenLastCalledWith(expect.closeTo(0.5), 0.015)
```

- [ ] **Step 2: Run the loop test and verify RED**

Run: `npx vitest run packages/engine/tests/loop/gameLoop.test.ts`

Expected: FAIL because render currently receives only interpolation alpha.

- [ ] **Step 3: Implement the loop timing contract**

Change `LoopHooks.render` to `render(alpha: number, frameDt: number)`. In `tick`, derive raw elapsed once, clamp it to `[0, fixedDt * maxSubSteps]`, use the clamped value for both the accumulator and render `frameDt`, and pass zero on the baseline tick.

- [ ] **Step 4: Add failing refresh-rate camera tests**

Run the same camera target for one second using 60 calls at `1/60` and 120 calls at `1/120`; assert camera/look-at positions agree within five decimal places.

- [ ] **Step 5: Run the camera test and verify RED**

Run: `npx vitest run games/monkey-ball/tests/systems/cameraFollow.test.ts`

Expected: FAIL because the current 0.1 lerp runs once per frame.

- [ ] **Step 6: Implement time-based camera response**

Add `frameDt` to `GameCtx`, thread it through gameplay render calls, and replace fixed lerp factors with:

```ts
const RESPONSE = -Math.log(1 - 0.1) * 60
const follow = 1 - Math.exp(-RESPONSE * Math.max(0, ctx.frameDt))
```

Keep initial `cam`/`look` assignment exact. Update `Gameplay.render`, `PlayHandle.render`, `EditorCore.tick`, the game/editor composition roots, and test fixtures to pass `frameDt`.

- [ ] **Step 7: Add failing pure fly-control timing tests**

Create `flyControls.test.ts` that advances the same initial camera for one second at 60 Hz and 120 Hz with `W` pressed and asserts identical positions.

- [ ] **Step 8: Run the fly-control test and verify RED**

Run: `npx vitest run packages/editor/tests/viewport3d/flyControls.test.ts`

Expected: FAIL because `advanceFlyControls` does not exist.

- [ ] **Step 9: Implement loop-driven fly controls**

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

- [ ] **Step 10: Verify Task 2 green**

Run: `npx vitest run packages/engine/tests/loop games/monkey-ball/tests/systems/cameraFollow.test.ts games/monkey-ball/tests/game packages/editor/tests/play packages/editor/tests/viewport3d/flyControls.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 11: Commit Task 2**

```bash
git add packages/engine/src/loop/gameLoop.ts packages/engine/tests/loop/gameLoop.test.ts games/monkey-ball/src games/monkey-ball/tests packages/editor/src packages/editor/tests tools/level-editor/src/main.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
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
- Modify: `games/monkey-ball/src/main.ts`
- Modify: `tools/level-editor/src/main.ts`

- [ ] **Step 1: Add failing cleanup-stack tests**

Test LIFO execution, idempotence, and continuing after one callback throws:

```ts
const cleanup = createCleanupStack()
cleanup.defer(() => calls.push('first'))
cleanup.defer(() => { calls.push('second'); throw new Error('boom') })
cleanup.defer(() => calls.push('third'))
expect(() => cleanup.dispose()).toThrow('boom')
expect(calls).toEqual(['third', 'second', 'first'])
cleanup.dispose()
expect(calls).toHaveLength(3)
```

- [ ] **Step 2: Run cleanup tests and verify RED**

Run: `npx vitest run packages/engine/tests/lifecycle/cleanup.test.ts`

Expected: FAIL because the lifecycle module does not exist.

- [ ] **Step 3: Implement `CleanupStack`**

Expose `defer(cleanup: () => void): () => void` and `dispose(): void`. Mark disposed before draining, run callbacks in reverse registration order, retain the first thrown error, finish draining, then throw that error.

- [ ] **Step 4: Add failing generic SceneManager compile/runtime coverage**

Update tests to use a literal scene union and a complete `Record<SceneId, Scene<SceneId>>`; assert hooks receive `{ from, to }` and stop exits to `null`.

- [ ] **Step 5: Implement typed scene transitions**

Make `Scene` and `createSceneManager` generic in `Id extends PropertyKey`:

```ts
export interface SceneTransition<Id> { from: Id | null; to: Id | null }
export interface Scene<Id> {
  onEnter?(transition: SceneTransition<Id>): void
  onExit?(transition: SceneTransition<Id>): void
}
```

Require `scenes: Record<Id, Scene<Id>>`; remove optional scene lookups.

- [ ] **Step 6: Add failing browser-audio disposal tests**

Assert the real-context path calls `context.close()` once and the null fallback has an idempotent no-op `dispose()`.

- [ ] **Step 7: Implement browser-audio disposal**

Add `dispose()` to `BrowserAudio`, invoking `void context.close()` on the real path.

- [ ] **Step 8: Wire composition-root cleanup**

Register every acquired disposer immediately in each `main.ts`: input handles, active gameplay, store subscriptions, named DOM listener removals, scene-manager stop, fly controls, loop driver, autosave, chrome/editor, canvas renderer, renderer port, audio runtime, and physics. Use the same stack for boot-failure rollback and `beforeunload`. Route active-level mount/unmount through typed scene transition hooks so no second scene subscription remains.

- [ ] **Step 9: Verify Task 3 green**

Run: `npx vitest run packages/engine/tests/lifecycle packages/engine/tests/scene games/monkey-ball/tests/audio && npm run typecheck`

Expected: all selected tests and workspace typecheck PASS.

- [ ] **Step 10: Commit Task 3**

```bash
git add packages/engine/src/lifecycle packages/engine/tests/lifecycle packages/engine/src/scene packages/engine/tests/scene packages/engine/src/index.ts games/monkey-ball/src/audio games/monkey-ball/tests/audio games/monkey-ball/src/main.ts tools/level-editor/src/main.ts docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(runtime): centralize resource cleanup"
```

### Task 4: Cache geometry and pool detached meshes

**Files:**
- Modify: `packages/engine/tests/render/three-meshes.test.ts`
- Modify: `packages/engine/src/render/three.ts`

- [ ] **Step 1: Replace disposal-on-remove coverage with failing reuse tests**

Add tests proving identical shapes share one geometry, a removed mesh is reused by identity for the same full definition, reused meshes reset transform/highlight, and geometry/material disposal occurs only during renderer disposal.

```ts
expect(first.geometry).toBe(second.geometry)
port.remove(firstEntity)
port.add(replacement, def)
expect(scene.children.at(-1)).toBe(first)
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run: `npx vitest run packages/engine/tests/render/three-meshes.test.ts`

Expected: FAIL because geometry is per mesh and removal disposes resources.

- [ ] **Step 3: Implement renderer-lifetime caches**

Create stable `geometryKey(def)` and `meshKey(def)` functions. Store geometry by primitive dimensions and detached meshes by full definition. `add` pops from the matching pool or creates a mesh with cached geometry. `remove` resets emissive state, position, rotation, and scale before pooling. Track each mesh's pool key by entity while active.

- [ ] **Step 4: Implement exact final disposal**

On `port.dispose()`, detach active meshes without returning them to the pool, dispose every active/pooled material once, dispose every cached geometry once, clear pools/maps/groups/grids, and remove scene lights.

- [ ] **Step 5: Verify Task 4 green**

Run: `npx vitest run packages/engine/tests/render`

Expected: all renderer tests PASS.

- [ ] **Step 6: Commit Task 4**

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

- [ ] **Step 1: Add failing generic world-sync tests**

Extend the fake definition with a `syncWorld` spy. After the initial build, change only metadata and assert `syncWorld` receives `(world, previousDoc, nextDoc)` without another `buildWorld` call. Also assert selection-only updates do not call either function.

- [ ] **Step 2: Run generic world-sync tests and verify RED**

Run: `npx vitest run packages/editor/tests/viewport3d/worldSync.test.ts`

Expected: FAIL because `GameDefinition.syncWorld` and previous-document tracking do not exist.

- [ ] **Step 3: Add the optional sync hook and use it**

Add:

```ts
syncWorld?(world: World<object>, previous: Doc, next: Doc): void
```

Track the document used to build the current world. On a later `syncNow`, call the hook when present; otherwise rebuild. Always update the stored document and reapply highlighting.

- [ ] **Step 4: Add failing Monkey Ball identity tests**

Build an editor world, capture entities by `editorId`, then apply a metadata edit and a one-item move. Assert metadata preserves every entity object; moving one geometry replaces exactly that ID while every other entity retains object identity. Assert render/physics registration receives one remove/add pair.

- [ ] **Step 5: Run Monkey Ball sync tests and verify RED**

Run: `npx vitest run games/monkey-ball/tests/editor/worldSync.test.ts`

Expected: FAIL because Monkey Ball has no incremental hook or seed map.

- [ ] **Step 6: Extract stable-ID entity seeds**

Refactor `buildWorld.ts` to expose a game-internal `levelEntitySeeds(level, lib, { editorIds: true })`. Keep `populateLevelWorld` as a loop over those seeds and retain its returned ball reference.

- [ ] **Step 7: Implement Monkey Ball incremental synchronization**

Build old/new maps keyed by `editorId`. Compare seeds structurally with a deterministic deep comparison. Remove missing/changed live entities, then add added/changed seeds. Register this function as `GameDefinition.syncWorld`. Metadata-only edits produce no world mutations.

- [ ] **Step 8: Verify Task 5 green**

Run: `npx vitest run packages/editor/tests/viewport3d games/monkey-ball/tests/editor games/monkey-ball/tests/level/buildWorld.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 9: Commit Task 5**

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
- Modify: dependent type annotations exposed by typecheck

- [ ] **Step 1: Add failing facade contract tests**

Extend `world.test.ts` to cover `entities`, `has`, `clear`, `first`, add/remove subscriptions, and component add/remove through the exported engine interfaces. Add a type assertion that exported query methods return `EntityQuery`, not a Miniplex type.

- [ ] **Step 2: Run ECS tests as the baseline**

Run: `npx vitest run packages/engine/tests/ecs/world.test.ts`

Expected: runtime assertions pass, while the new `EntityQuery` import/type assertion fails because it is not defined.

- [ ] **Step 3: Implement the facade**

Define engine-owned interfaces:

```ts
export interface EntityQuery<E extends object> extends Iterable<E> {
  readonly first: E | undefined
  readonly onEntityAdded: QuerySignal<E>
  readonly onEntityRemoved: QuerySignal<E>
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

- [ ] **Step 4: Run ECS, physics, and render system tests**

Run: `npx vitest run packages/engine/tests/ecs packages/engine/tests/physics/systems.test.ts packages/engine/tests/render/systems.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 5: Run workspace typecheck and repair only facade fallout**

Run: `npm run typecheck`

Expected: PASS after updating any dependent generic constraints; no consumer imports Miniplex.

- [ ] **Step 6: Commit Task 6**

```bash
git add packages/engine/src/ecs/world.ts packages/engine/tests/ecs/world.test.ts packages/engine/src/physics/systems.ts packages/engine/src/render/systems.ts packages games tools docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(ecs): hide miniplex behind engine facade"
```

### Task 7: Add narrow headless package entry points

**Files:**
- Create: `packages/engine/src/data.ts`
- Modify: `packages/engine/package.json`
- Create: `packages/editor/src/headless.ts`
- Modify: `packages/editor/package.json`
- Create: `games/monkey-ball/src/editor.ts`
- Modify: `games/monkey-ball/package.json`
- Modify: `games/monkey-ball/src/level/headlessPlay.ts`
- Modify: `tools/editor-mcp-server/src/headlessHost.ts`
- Modify: `tools/editor-mcp-server/package.json`
- Modify: `eslint.config.js`

- [ ] **Step 1: Add narrow entry files and migrate imports**

`engine/data` exports only data kind/parser/loader/archetype APIs. `editor/headless` exports `GameDefinition`, validation, and `createEditorToolHost`. `monkey-ball/editor` exports its editor definition plus required data kinds. Change headless play to import `HeadlessOpts`, `PlayObservation`, and `TestPlayResult` directly from `@automata/contracts`.

- [ ] **Step 2: Add export-map entries and direct dependencies**

Add subpath exports such as:

```json
"exports": {
  ".": "./src/index.ts",
  "./data": "./src/data.ts"
}
```

Declare `@automata/contracts` in Monkey Ball dependencies. Migrate the MCP server to narrow subpaths and remove any dependency that is no longer directly imported.

- [ ] **Step 3: Add lint guards against headless root barrels**

For `tools/editor-mcp-server/**/*.ts`, forbid root `@automata/engine`, root `@automata/editor`, and root `monkey-ball` imports with a message directing callers to the new subpaths.

- [ ] **Step 4: Verify package boundaries**

Run: `npm run lint && npm run typecheck && npx vitest run tools/editor-mcp-server/tests games/monkey-ball/tests/level/headlessPlay.test.ts`

Expected: lint, typecheck, and selected tests PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add packages/engine/src/data.ts packages/engine/package.json packages/editor/src/headless.ts packages/editor/package.json games/monkey-ball/src/editor.ts games/monkey-ball/package.json games/monkey-ball/src/level/headlessPlay.ts tools/editor-mcp-server/src/headlessHost.ts tools/editor-mcp-server/package.json eslint.config.js docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "refactor(packages): expose narrow headless entry points"
```

### Task 8: Expand coverage to game and MCP production code

**Files:**
- Modify: `vitest.config.ts`
- Modify: `games/monkey-ball/tests/editor/registrationPlay.test.ts`
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

Expected baseline: FAIL near 77.73% branches. The uncovered concentration is Monkey Ball browser-audio/editor-registration/scene-model branches, small game guard branches, and the MCP valid-resource path.

- [ ] **Step 3: Close the known game coverage gaps with focused behavior tests**

Add these explicit cases:

- `registrationPlay.test.ts`: resolve a color surface, reject a texture surface, create/dispose live gameplay with recording ports;
- `sceneModel.test.ts`: add cylinder/archetype items, reject marker addition, edit box axes and cylinder radius/height, and parse `loadDoc`;
- `buildWorld.test.ts`: build cylinder geometry and assert its collider/renderable dimensions;
- `headlessPlay.test.ts`: cover game-over and completed result mapping plus the no-ball observation fallback through an exported pure observation helper;
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

- [ ] **Step 6: Commit Task 8**

```bash
git add vitest.config.ts games/monkey-ball/tests tools/editor-mcp-server/tests games/monkey-ball/src tools/editor-mcp-server/src docs/superpowers/plans/2026-06-26-refactor-hardening.md
git commit -m "test: cover game and MCP production code"
```

### Task 9: Final consistency and release verification

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

- [ ] **Step 4: Audit architecture assertions mechanically**

Run:

```bash
rg -n "from ['\"]miniplex['\"]" games tools packages -g '*.ts'
rg -n "requestAnimationFrame" packages/editor games/monkey-ball tools/level-editor -g '*.ts'
rg -n "from ['\"]@automata/(engine|editor)['\"]|from ['\"]monkey-ball['\"]" tools/editor-mcp-server/src -g '*.ts'
```

Expected: Miniplex imports exist only inside `packages/engine/src/ecs/world.ts`; editor/game/tool code owns no extra rAF loop; MCP headless code uses narrow subpaths.

- [ ] **Step 5: Mark every plan checkbox complete and inspect the tree**

Run: `rg -n "^- \[ \]" docs/superpowers/plans/2026-06-26-refactor-hardening.md` and `git status --short`.

Expected: no unchecked tasks and only intentional final documentation changes.

- [ ] **Step 6: Commit final plan completion**

```bash
git add docs/superpowers/plans/2026-06-26-refactor-hardening.md docs/superpowers/specs/2026-06-26-refactor-hardening-design.md
git commit -m "docs: complete refactor hardening plan"
```
