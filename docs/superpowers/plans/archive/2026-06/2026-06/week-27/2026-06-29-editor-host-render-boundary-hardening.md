# Editor Host and Render Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove editor highlighting from the core engine render contract, split project-editor viewport/play responsibilities, make placed IDs safe across persisted scenes, and separate render wall time from fixed-step catch-up time.

**Architecture:** `ProjectEditorCore` remains the stable public facade and delegates edit behavior to a `ViewportController` and preview lifecycle to a `PlayModeController`. The editor owns an `EditorRenderPort` structural extension, while `GameLoop` maintains separate wall-time and capped-simulation deltas.

**Tech Stack:** TypeScript 6, Vitest 4, npm workspaces, Three.js adapter, engine ECS/render systems.

**Design:** `../../../../specs/archive/2026-06/week-27/2026-06-29-editor-host-render-boundary-hardening-design.md`

---

## File Structure

- Modify `packages/engine/src/render/port.ts`: remove editor-only highlighting from `RenderPort`.
- Modify `packages/engine/src/render/null.ts`: retain structural highlight support on the concrete test renderer.
- Modify `packages/engine/src/render/three.ts`: retain structural highlight support on the concrete Three renderer.
- Create `packages/engine/tests/render/port.test.ts`: type regression for the core render boundary.
- Modify `packages/editor/src/project/worldSync.ts`: own and consume `EditorRenderPort`.
- Modify `packages/editor/src/project/host.ts`: require the editor render extension at the public editor boundary.
- Modify `packages/editor/tests/project/worldSync.test.ts`: prove concrete renderers satisfy the editor extension.
- Modify `packages/engine/src/loop/gameLoop.ts`: split wall-time render delta from capped simulation delta.
- Modify `packages/engine/tests/loop/gameLoop.test.ts`: cover long stalls and fractional remainder preservation.
- Create `packages/editor/src/project/entityId.ts`: allocate persisted-snapshot-wide prefab IDs.
- Create `packages/editor/tests/project/entityId.test.ts`: cover cross-scene and reload-stable allocation.
- Create `packages/editor/src/project/viewportController.ts`: own edit viewport, camera, picking, commands, and invalidation.
- Create `packages/editor/tests/project/viewportController.test.ts`: cover controller behavior and suspend/resume.
- Create `packages/editor/src/project/playModeController.ts`: own preview validation, construction, forwarding, and teardown.
- Create `packages/editor/tests/project/playModeController.test.ts`: cover preview lifecycle and failure ordering.
- Modify `packages/editor/src/project/host.ts`: reduce to the public facade and controller orchestration.
- Modify `packages/editor/tests/project/host.test.ts`: retain facade-level integration coverage and cross-scene ID regression.
- Remove four empty duplicate `* 2` directories.

### Task 1: Move selection highlighting out of the core render port

**Files:**
- Create: `packages/engine/tests/render/port.test.ts`
- Modify: `packages/editor/tests/project/worldSync.test.ts`
- Modify: `packages/engine/src/render/port.ts`
- Modify: `packages/engine/src/render/null.ts`
- Modify: `packages/engine/src/render/three.ts`
- Modify: `packages/editor/src/project/worldSync.ts`
- Modify: `packages/editor/src/project/host.ts`
- Modify: `2026-06-29-editor-host-render-boundary-hardening.md`

- [ ] **Step 1: Write failing type-boundary tests**

Create `packages/engine/tests/render/port.test.ts`:

```ts
import { describe, expectTypeOf, it } from 'vitest'
import type { RenderPort } from '../../src/render/port'

describe('RenderPort', () => {
  it('does not expose editor selection policy', () => {
    expectTypeOf<'setHighlight' extends keyof RenderPort ? true : false>()
      .toEqualTypeOf<false>()
  })
})
```

Update the imports and first test in `packages/editor/tests/project/worldSync.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import {
  createProjectWorldSync,
  type EditorRenderPort
} from '../../src/project/worldSync'

// Inside the existing first test, immediately after renderer construction:
expectTypeOf(renderer.port).toMatchTypeOf<EditorRenderPort>()
```

- [ ] **Step 2: Run typecheck and verify RED**

Run:

```bash
npm run typecheck -w @automata/engine
npm run typecheck -w @automata/editor
```

Expected: engine typecheck fails because `RenderPort` still has `setHighlight`; editor typecheck fails because `EditorRenderPort` does not exist.

- [ ] **Step 3: Implement the editor-owned extension**

Delete `setHighlight` and its editor-specific comment from `RenderPort` in `packages/engine/src/render/port.ts`.

Change the concrete renderer port types without re-adding the method to the core contract:

```ts
// packages/engine/src/render/null.ts
export interface NullRenderer {
  port: RenderPort & {
    setHighlight(entity: object, on: boolean): void
  }
  calls: RenderCall[]
}

// packages/engine/src/render/three.ts
export interface ThreeRenderer {
  port: RenderPort & {
    setHighlight(entity: object, on: boolean): void
  }
  scene: Scene
  camera: PerspectiveCamera
}
```

Add the editor extension and update the sync parameter in `packages/editor/src/project/worldSync.ts`:

```ts
export interface EditorRenderPort extends RenderPort {
  /** Applies editor selection emphasis to an entity already owned by the renderer. */
  setHighlight(entity: object, on: boolean): void
}
```

Change the function parameter type, without altering its reconciliation body:

```diff
-export function createProjectWorldSync(render: RenderPort): ProjectWorldSync {
+export function createProjectWorldSync(render: EditorRenderPort): ProjectWorldSync {
```

Update `ProjectEditorOpts` in `packages/editor/src/project/host.ts` to consume
the editor-owned extension while leaving preview registrations on `RenderPort`:

```ts
import type { PhysicsPort, Vec3 } from '@automata/engine'
import { createProjectWorldSync, type EditorRenderPort, type ProjectWorldSync } from './worldSync'

export interface ProjectEditorOpts<Compiled> {
  registration: EditorProjectRegistration<Compiled> | RegisteredEditorProject
  snapshot: ProjectSnapshot
  render: EditorRenderPort
  physics: PhysicsPort
}
```

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
npm run typecheck -w @automata/engine
npm run typecheck -w @automata/editor
npx vitest run packages/engine/tests/render packages/editor/tests/project/worldSync.test.ts
```

Expected: both typechecks pass and all focused render/world-sync tests pass.

- [ ] **Step 5: Mark Task 1 complete and commit**

Update this task's checkboxes, then run:

```bash
git add packages/engine/src/render/port.ts packages/engine/src/render/null.ts packages/engine/src/render/three.ts packages/engine/tests/render/port.test.ts packages/editor/src/project/worldSync.ts packages/editor/src/project/host.ts packages/editor/tests/project/worldSync.test.ts 2026-06-29-editor-host-render-boundary-hardening.md
git commit -m "refactor(render): isolate editor highlighting"
```

### Task 2: Separate render wall time from fixed-step catch-up

**Files:**
- Modify: `packages/engine/tests/loop/gameLoop.test.ts`
- Modify: `packages/engine/src/loop/gameLoop.ts`
- Modify: `2026-06-29-editor-host-render-boundary-hardening.md`

- [ ] **Step 1: Replace the bounded-render-delta test with the intended timing contract**

Replace `clamps frameDt to a non-negative, bounded interval` and extend the long-gap coverage:

```ts
it('passes non-negative wall time to render without applying the simulation cap', () => {
  const fixedUpdate = vi.fn(), render = vi.fn()
  const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01, maxSubSteps: 5 })
  loop.tick(1000)
  loop.tick(900)
  expect(render).toHaveBeenLastCalledWith(0, 0)

  loop.tick(10_000)
  expect(render).toHaveBeenLastCalledWith(0, 9.1)
  expect(fixedUpdate).toHaveBeenCalledTimes(5)
})

it('preserves an existing fractional accumulator across a capped stall', () => {
  const fixedUpdate = vi.fn(), render = vi.fn()
  const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01, maxSubSteps: 5 })
  loop.tick(0)
  loop.tick(6)
  loop.tick(10_006)

  expect(fixedUpdate).toHaveBeenCalledTimes(5)
  expect(render).toHaveBeenLastCalledWith(expect.closeTo(0.6), 10)
})
```

Keep the existing first-tick, ordinary interpolation, accumulation, and explicit spiral-of-death tests.

- [ ] **Step 2: Run the loop test and verify RED**

Run:

```bash
npx vitest run packages/engine/tests/loop/gameLoop.test.ts
```

Expected: the render-delta assertion receives `0.05` instead of `9.1`, and the fractional-remainder assertion receives alpha `0` instead of `0.6`.

- [ ] **Step 3: Implement separate timing values**

Replace the elapsed-time block in `GameLoop.tick`:

```ts
if (this.lastMs !== null) {
  const rawElapsed = (nowMs - this.lastMs) / 1000
  frameDt = Math.max(0, rawElapsed)

  // Rendering observes real non-negative wall time. Only fixed-step catch-up
  // is capped, preventing a stall from creating an unbounded update spiral.
  const simulationDt = Math.min(frameDt, this.fixedDt * this.maxSubSteps)
  this.accumulator += simulationDt
  while (this.accumulator >= this.fixedDt - 1e-9) {
    this.hooks.fixedUpdate(this.fixedDt)
    this.accumulator = Math.max(0, this.accumulator - this.fixedDt)
  }
}
```

- [ ] **Step 4: Run the loop and dependent timing tests and verify GREEN**

Run:

```bash
npx vitest run packages/engine/tests/loop/gameLoop.test.ts games/monkey-ball/tests/systems/cameraFollow.test.ts packages/editor/tests/viewport3d/flyControls.test.ts
```

Expected: all focused timing tests pass.

- [ ] **Step 5: Mark Task 2 complete and commit**

```bash
git add packages/engine/src/loop/gameLoop.ts packages/engine/tests/loop/gameLoop.test.ts 2026-06-29-editor-host-render-boundary-hardening.md
git commit -m "fix(loop): preserve render wall time"
```

### Task 3: Allocate prefab IDs from the persisted project snapshot

**Files:**
- Create: `packages/editor/src/project/entityId.ts`
- Create: `packages/editor/tests/project/entityId.test.ts`
- Modify: `packages/editor/src/project/host.ts`
- Modify: `packages/editor/tests/project/host.test.ts`
- Modify: `2026-06-29-editor-host-render-boundary-hardening.md`

- [ ] **Step 1: Write allocator and host regressions**

Create `packages/editor/tests/project/entityId.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nextPrefabEntityId } from '../../src/project/entityId'
import { fakeSnapshot } from '../fixtures/fakeProject'

describe('nextPrefabEntityId', () => {
  it('allocates above matching IDs persisted in every scene', () => {
    const snapshot = fakeSnapshot()
    snapshot.scenes.secondary = {
      formatVersion: 1,
      id: 'secondary',
      name: 'Secondary',
      entities: [
        { id: 'box-7', name: 'Reserved', enabled: true, components: [] },
        { id: 'box-copy', name: 'Non-numeric', enabled: true, components: [] }
      ]
    }
    snapshot.manifest.scenes.push({ id: 'secondary', path: 'scenes/secondary.scene.json' })

    expect(nextPrefabEntityId(snapshot, 'box')).toBe('box-8')
  })

  it('returns the same collision-free next ID after allocator recreation', () => {
    const snapshot = fakeSnapshot()
    snapshot.scenes.main!.entities.push({
      id: 'spawn-3', name: 'Spawn', enabled: true, components: []
    })

    expect(nextPrefabEntityId(snapshot, 'spawn')).toBe('spawn-4')
    expect(nextPrefabEntityId(structuredClone(snapshot), 'spawn')).toBe('spawn-4')
  })
})
```

Add a second scene containing `box-7` in the existing host collision test, call `placePrefabAt('box', ...)`, and assert that the new active-scene entity is `box-8`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run packages/editor/tests/project/entityId.test.ts packages/editor/tests/project/host.test.ts
```

Expected: the allocator module is missing and the host still creates `box-1` or `box-2` from host-local state.

- [ ] **Step 3: Implement the pure allocator and replace `placeCounter`**

Create `packages/editor/src/project/entityId.ts`:

```ts
import type { ProjectSnapshot } from '@automata/project'

/** Allocates above all numeric prefab suffixes persisted anywhere in a project. */
export function nextPrefabEntityId(snapshot: ProjectSnapshot, base: string): string {
  const prefix = `${base}-`
  let highest = 0n
  for (const scene of Object.values(snapshot.scenes)) {
    for (const entity of scene.entities) {
      if (!entity.id.startsWith(prefix)) continue
      const suffix = entity.id.slice(prefix.length)
      if (!/^\d+$/.test(suffix)) continue
      const value = BigInt(suffix)
      if (value > highest) highest = value
    }
  }
  return `${base}-${highest + 1n}`
}
```

In `packages/editor/src/project/host.ts`, import `nextPrefabEntityId`, delete `placeCounter` and `uniqueEntityId`, and replace:

```ts
const entityId = nextPrefabEntityId(state.snapshot, prefabId)
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run packages/editor/tests/project/entityId.test.ts packages/editor/tests/project/host.test.ts
npm run typecheck -w @automata/editor
```

Expected: allocator and host tests pass; editor typecheck passes.

- [ ] **Step 5: Mark Task 3 complete and commit**

```bash
git add packages/editor/src/project/entityId.ts packages/editor/src/project/host.ts packages/editor/tests/project/entityId.test.ts packages/editor/tests/project/host.test.ts 2026-06-29-editor-host-render-boundary-hardening.md
git commit -m "fix(editor): allocate persisted entity ids"
```

### Task 4: Extract the edit viewport controller

**Files:**
- Create: `packages/editor/src/project/viewportController.ts`
- Create: `packages/editor/tests/project/viewportController.test.ts`
- Modify: `packages/editor/src/project/host.ts`
- Modify: `2026-06-29-editor-host-render-boundary-hardening.md`

- [ ] **Step 1: Write the controller contract test**

Create `packages/editor/tests/project/viewportController.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createProjectEditorStore } from '../../src/project/store'
import { createViewportController } from '../../src/project/viewportController'
import { fakeEditorRegistration, fakeSnapshot } from '../fixtures/fakeProject'

describe('ViewportController', () => {
  it('owns edit rendering, invalidation, and suspend/resume', () => {
    const renderer = createNullRenderer()
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const registration = store.getState().registration
    const viewport = createViewportController({ store, registration, render: renderer.port })

    viewport.tick(1)
    expect(renderer.calls.some((call) => call.op === 'add')).toBe(true)
    renderer.calls.length = 0

    store.dispatch({
      type: 'select',
      selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] }
    })
    viewport.tick(1)
    expect(renderer.calls.some((call) => call.op === 'setHighlight' && call.on)).toBe(true)

    viewport.suspend()
    renderer.calls.length = 0
    viewport.tick(1)
    expect(renderer.calls).toEqual([])

    viewport.resume()
    viewport.tick(1)
    expect(renderer.calls.some((call) => call.op === 'add')).toBe(true)
    viewport.dispose()
  })
})
```

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```bash
npx vitest run packages/editor/tests/project/viewportController.test.ts
```

Expected: test fails because `project/viewportController` does not exist.

- [ ] **Step 3: Extract viewport ownership without changing behavior**

Create `packages/editor/src/project/viewportController.ts` with this public contract:

```ts
export interface ViewportControllerOpts {
  store: ProjectEditorStore
  registration: RegisteredEditorProject
  render: EditorRenderPort
}

export interface ViewportController {
  camera: FlyCamera
  readonly mapView: MapView
  tick(alpha: number): void
  suspend(): void
  resume(): void
  placePrefabAt(prefabId: string, world: Vec3): void
  moveSelectionTo(world: Vec3): void
  deleteSelected(): void
  pick2d(screen: { x: number; y: number }, size: ScreenSize): void
  pick3d(screen: { x: number; y: number }, size: ScreenSize): void
  drawModel(size: ScreenSize): DrawOp[]
  dispose(): void
}
```

Move the following existing host-local state and functions into
`createViewportController(opts)` unchanged in behavior:

```ts
let sync: ProjectWorldSync | null = createProjectWorldSync(render)
let camera = initialFlyCamera
const mapView = initialMapView
let lastSnapshot: ProjectSnapshot | undefined
let lastSceneId: string | undefined
let lastSelection: ProjectSelection | undefined

const invalidate = (): void => {
  lastSnapshot = undefined
  lastSceneId = undefined
  lastSelection = undefined
}
```

`tick` returns immediately while suspended; otherwise it performs the existing
snapshot/scene/selection synchronization, camera update, and `sync.render`.
`suspend` disposes the current sync once, sets it to `null`, and invalidates.
`resume` creates a new sync once and invalidates. Placement uses
`nextPrefabEntityId(state.snapshot, prefabId)`. Move, delete, 2D/3D picking,
and draw-model bodies move from `host.ts` without semantic changes.

Rewrite `host.ts` to construct a viewport and proxy its edit-facing members;
leave play-mode state in the host until Task 5:

```ts
const viewport = createViewportController({ store, registration, render })

// Public facade fields/methods:
get camera() { return viewport.camera },
set camera(next) { viewport.camera = next },
mapView: viewport.mapView,
placePrefabAt: viewport.placePrefabAt,
moveSelectionTo: viewport.moveSelectionTo,
deleteSelected: viewport.deleteSelected,
pick2d: viewport.pick2d,
pick3d: viewport.pick3d,
drawModel: viewport.drawModel
```

Use `viewport.tick(alpha)` in edit mode, `viewport.suspend()` after successful
preview construction, `viewport.resume()` on play exit, and
`viewport.dispose()` during host disposal.

- [ ] **Step 4: Run controller, host, world-sync, and editor typecheck verification**

Run:

```bash
npx vitest run packages/editor/tests/project/viewportController.test.ts packages/editor/tests/project/host.test.ts packages/editor/tests/project/worldSync.test.ts
npm run typecheck -w @automata/editor
```

Expected: all focused tests and editor typecheck pass.

- [ ] **Step 5: Mark Task 4 complete and commit**

```bash
git add packages/editor/src/project/viewportController.ts packages/editor/src/project/host.ts packages/editor/tests/project/viewportController.test.ts 2026-06-29-editor-host-render-boundary-hardening.md
git commit -m "refactor(editor): extract viewport controller"
```

### Task 5: Extract play-mode lifecycle and leave a thin host facade

**Files:**
- Create: `packages/editor/src/project/playModeController.ts`
- Create: `packages/editor/tests/project/playModeController.test.ts`
- Modify: `packages/editor/src/project/host.ts`
- Modify: `packages/editor/tests/project/host.test.ts`
- Modify: `2026-06-29-editor-host-render-boundary-hardening.md`

- [ ] **Step 1: Write play-controller lifecycle tests**

Create `packages/editor/tests/project/playModeController.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createPlayModeController } from '../../src/project/playModeController'
import { createProjectEditorStore } from '../../src/project/store'
import { fakeEditorRegistration, fakeSnapshot, previewCalls } from '../fixtures/fakeProject'

const nullPhysics = (): PhysicsPort => ({
  addBody() {}, removeBody() {}, setGravity() {}, step() { return [] },
  readPose() { return null },
  readLinearVelocity() { return { x: 0, y: 0, z: 0 } },
  applyImpulse() {}, setKinematicTarget() {},
  get bodyCount() { return 0 }, dispose() {}
})

describe('PlayModeController', () => {
  beforeEach(() => { previewCalls.length = 0 })

  it('owns preview entry, forwarding, exit, and edit suspension', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const suspendEdit = vi.fn(), resumeEdit = vi.fn()
    const controller = createPlayModeController({
      registration: store.getState().registration,
      store,
      render: createNullRenderer().port,
      physics: nullPhysics(),
      suspendEdit,
      resumeEdit
    })

    controller.enter()
    expect(controller.active).toBe(true)
    expect(suspendEdit).toHaveBeenCalledOnce()
    expect(store.getState().mode).toBe('play')
    controller.fixedUpdate(1 / 60)
    controller.render(0.5, 0.25)
    expect(previewCalls).toEqual(expect.arrayContaining(['fixedUpdate', 'render']))

    controller.exit()
    expect(controller.active).toBe(false)
    expect(resumeEdit).toHaveBeenCalledOnce()
    expect(store.getState().mode).toBe('edit')
    expect(previewCalls).toContain('dispose')
  })

  it('does not suspend edit mode when preview creation fails', () => {
    const broken = { ...fakeEditorRegistration, preview: { create() { throw new Error('boom') } } }
    const store = createProjectEditorStore(broken, fakeSnapshot())
    const suspendEdit = vi.fn()
    const controller = createPlayModeController({
      registration: store.getState().registration,
      store,
      render: createNullRenderer().port,
      physics: nullPhysics(),
      suspendEdit,
      resumeEdit: vi.fn()
    })

    expect(() => controller.enter()).toThrow(/boom/)
    expect(suspendEdit).not.toHaveBeenCalled()
    expect(store.getState().mode).toBe('edit')
  })
})
```

- [ ] **Step 2: Run the play-controller test and verify RED**

Run:

```bash
npx vitest run packages/editor/tests/project/playModeController.test.ts
```

Expected: test fails because `project/playModeController` does not exist.

- [ ] **Step 3: Implement `PlayModeController`**

Create `packages/editor/src/project/playModeController.ts`:

```ts
import type { PhysicsPort, RenderPort } from '@automata/engine'
import type { RegisteredEditorProject, ProjectPlayHandle } from './registration'
import type { ProjectEditorStore } from './store'

export interface PlayModeControllerOpts {
  registration: RegisteredEditorProject
  store: ProjectEditorStore
  render: RenderPort
  physics: PhysicsPort
  suspendEdit(): void
  resumeEdit(): void
}

export interface PlayModeController {
  readonly active: boolean
  enter(): void
  exit(): void
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt: number): void
  dispose(): void
}

export function createPlayModeController(opts: PlayModeControllerOpts): PlayModeController {
  let play: ProjectPlayHandle | null = null

  return {
    get active() { return play !== null },
    enter() {
      if (play) return
      const { registration, store } = opts
      if (!registration.createPreview) throw new Error('this registration has no preview support')
      const snapshot = store.getState().snapshot
      const errors = registration.validate(snapshot).filter((issue) => issue.severity === 'error')
      if (errors.length > 0) {
        throw new Error(`invalid project: ${errors.map((issue) => issue.code).join('; ')}`)
      }
      const compiled = registration.compile(snapshot)
      const nextPlay = registration.createPreview(
        compiled,
        store.getState().activeSceneId,
        opts.render,
        opts.physics
      )
      opts.suspendEdit()
      play = nextPlay
      store.dispatch({ type: 'setMode', mode: 'play' })
    },
    exit() {
      if (!play) return
      play.dispose()
      play = null
      opts.resumeEdit()
      opts.store.dispatch({ type: 'setMode', mode: 'edit' })
    },
    fixedUpdate(dt) { play?.fixedUpdate(dt) },
    render(alpha, frameDt) { play?.render(alpha, frameDt) },
    dispose() {
      play?.dispose()
      play = null
    }
  }
}
```

- [ ] **Step 4: Rewrite `ProjectEditorCore` as the thin orchestrator**

Keep the public interfaces in `host.ts`, then reduce `createProjectEditor` to:

```ts
export function createProjectEditor<Compiled>(opts: ProjectEditorOpts<Compiled>): ProjectEditorCore {
  const store = createProjectEditorStore(opts.registration, opts.snapshot)
  const registration = store.getState().registration
  const viewport = createViewportController({ store, registration, render: opts.render })
  const playMode = createPlayModeController({
    registration,
    store,
    render: opts.render,
    physics: opts.physics,
    suspendEdit: viewport.suspend,
    resumeEdit: viewport.resume
  })

  return {
    registration,
    store,
    get camera() { return viewport.camera },
    set camera(next) { viewport.camera = next },
    mapView: viewport.mapView,
    tick(alpha, frameDt = 0) {
      if (playMode.active) playMode.render(alpha, frameDt)
      else viewport.tick(alpha)
    },
    fixedUpdate: playMode.fixedUpdate,
    enterPlay: playMode.enter,
    exitPlay: playMode.exit,
    placePrefabAt: viewport.placePrefabAt,
    moveSelectionTo: viewport.moveSelectionTo,
    deleteSelected: viewport.deleteSelected,
    pick2d: viewport.pick2d,
    pick3d: viewport.pick3d,
    drawModel: viewport.drawModel,
    dispose() {
      playMode.dispose()
      viewport.dispose()
    }
  }
}
```

Update the host test only where controller extraction changes test setup; keep
all facade behavior assertions intact.

- [ ] **Step 5: Run focused editor verification and verify GREEN**

Run:

```bash
npx vitest run packages/editor/tests/project/playModeController.test.ts packages/editor/tests/project/viewportController.test.ts packages/editor/tests/project/host.test.ts packages/editor/tests/project/worldSync.test.ts packages/editor/tests/ui/project/chrome.test.ts tools/level-editor/tests/projectSession.test.ts
npm run typecheck -w @automata/editor
npm run typecheck -w level-editor
```

Expected: all focused tests and both typechecks pass.

- [ ] **Step 6: Mark Task 5 complete and commit**

```bash
git add packages/editor/src/project/playModeController.ts packages/editor/src/project/host.ts packages/editor/tests/project/playModeController.test.ts packages/editor/tests/project/host.test.ts 2026-06-29-editor-host-render-boundary-hardening.md
git commit -m "refactor(editor): extract play mode controller"
```

### Task 6: Remove duplicate directories and run repository gates

**Files:**
- Remove empty directories:
  - `packages/editor/tests 2`
  - `packages/editor-agent/tests 2`
  - `tools/editor-mcp-server/src 2`
  - `tools/editor-mcp-server/bin 2`
- Modify: `2026-06-29-editor-host-render-boundary-hardening.md`

- [ ] **Step 1: Verify the duplicate directories are still empty**

Run:

```bash
find 'packages/editor/tests 2' 'packages/editor-agent/tests 2' 'tools/editor-mcp-server/src 2' 'tools/editor-mcp-server/bin 2' -mindepth 1 -print
```

Expected: no output.

- [ ] **Step 2: Remove only the confirmed empty directories**

Run:

```bash
rmdir 'packages/editor/tests 2' 'packages/editor-agent/tests 2' 'tools/editor-mcp-server/src 2' 'tools/editor-mcp-server/bin 2'
```

Verify:

```bash
find packages/editor packages/editor-agent tools/editor-mcp-server -type d -name '* 2' -print
```

Expected: no output.

- [ ] **Step 3: Run formatting and boundary checks**

Run:

```bash
git diff --check
rg -n "setHighlight" packages/engine/src/render/port.ts
```

Expected: `git diff --check` produces no output and exits 0; `rg` produces no
output and exits 1 because no match exists.

- [ ] **Step 4: Run full coverage**

Run:

```bash
npm run coverage
```

Expected: all tests pass and global line/branch coverage remains at or above 90%.

- [ ] **Step 5: Run full CI**

Run:

```bash
npm run ci
```

Expected: lint, all workspace typechecks, and all tests pass.

- [ ] **Step 6: Review the final diff and mark the plan complete**

Run:

```bash
git status --short --branch
git diff --stat 260d5e6..HEAD
git log -8 --oneline --decorate
```

Confirm only the intended hardening commits and plan status changes are present.

- [ ] **Step 7: Commit final plan completion**

```bash
git add 2026-06-29-editor-host-render-boundary-hardening.md
git commit -m "docs: complete editor host hardening plan"
```
