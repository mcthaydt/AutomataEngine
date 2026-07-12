# Phase 0 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out factory Phase 0 (platform integrity) — deterministic editor IDs, correct/efficient render sync, a shared `@automata/game-kit` browser shell, and hardened save/reopen recovery with acceptance coverage — so generated projects survive engine evolution and long editing sessions.

**Architecture:** Three sequential workstreams on one branch. WS1 hardens editor internals (`packages/editor`). WS2 extracts composable browser-shell primitives into `@automata/game-kit`, refactors both games and the scaffold onto them. WS3 makes autosave recovery visible + reversible and adds long-session acceptance coverage. Sequenced WS1 → WS2 → WS3 so the acceptance suite validates WS1's guarantees and WS2's thinner scaffold.

**Tech Stack:** TypeScript, npm workspaces, vitest (`environment: 'happy-dom'`), Playwright, Three.js/Rapier behind engine ports, zod v4 via `@automata/project`.

**Spec:** [`docs/superpowers/specs/active/2026-07/week-28/2026-07-11-phase-0-completion-design.md`](../../../specs/active/2026-07/week-28/2026-07-11-phase-0-completion-design.md)

## Global Constraints

- **Engine boundary:** `games/*` and `tools/*` import engine APIs only from `@automata/engine` (or `@automata/engine/browser`); third-party engine deps stay wrapped in `packages/engine`.
- **zod only via `@automata/project`:** never import `zod` directly (lint-enforced). Not relevant to any task here, but do not add such an import.
- **TDD:** write the failing (or, for a pure refactor, the behavior-locking) test before implementation on every behavior change.
- **No per-game edits** to root `package.json` or `playwright.config.ts`; games declare `automata.devPort` in their own `package.json`.
- **Untested-shim inventory** (AGENTS.md): `packages/engine/src/loop/browser.ts`, `packages/engine/src/render/browser.ts`, and app `main.ts` files may stay untested. Everything else gets tests.
- **Verification:** `npm run ci` before claiming a change ready; `npm run coverage` when touching `packages/engine` or `packages/editor`; `npm run verify:new-game` after scaffold-template or engine-API changes.
- **Focused test run:** `npx vitest run <path/to/file.test.ts>`.
- **Branch:** all tasks on `phase-0-completion` (already created off `main`; the spec commit is its first commit). Commit after every task and tick its checkbox.

---

## Workstream 1 — Editor entity-ID + render-timing hardening

### Task 1: Shared pure ID allocators

Replace the session-relative `placeCounter` in the editor host with pure allocators derived from scene state, and DRY the palette's existing copy.

**Files:**
- Create: `packages/editor/src/project/ids.ts`
- Test: `packages/editor/tests/project/ids.test.ts`
- Modify: `packages/editor/src/project/host.ts` (remove `placeCounter` at `:60` and the `uniqueEntityId` closure at `:82-86`; import the shared one)
- Modify: `packages/editor/src/ui/project/palette.ts` (remove local `uniqueComponentId` at `:90-97`; import the shared one)

**Interfaces:**
- Produces: `uniqueEntityId(scene: SceneDocument, base: string): string` — lowest `base-1`, `base-2`, … not present in `scene`. `uniqueComponentId(existing: readonly string[], base: string): string` — bare `base`, else `base-2`, `base-3`, ….

- [ ] **Step 1: Write the failing test**

```ts
// packages/editor/tests/project/ids.test.ts
import { describe, expect, it } from 'vitest'
import type { SceneDocument } from '@automata/project'
import { uniqueComponentId, uniqueEntityId } from '../../src/project/ids'

const scene = (ids: string[]): SceneDocument => ({
  id: 'main', name: 'Main',
  entities: ids.map((id) => ({ id, name: id, enabled: true, components: [] }))
})

describe('uniqueEntityId', () => {
  it('numbers from 1 and skips taken ids', () => {
    expect(uniqueEntityId(scene([]), 'wall')).toBe('wall-1')
    expect(uniqueEntityId(scene(['wall-1', 'wall-2']), 'wall')).toBe('wall-3')
  })
  it('is pure in scene state (no hidden counter drift across calls)', () => {
    const s = scene(['wall-1'])
    expect(uniqueEntityId(s, 'wall')).toBe('wall-2')
    expect(uniqueEntityId(s, 'wall')).toBe('wall-2')
  })
  it('reuses the lowest free suffix after a deletion', () => {
    expect(uniqueEntityId(scene(['wall-2']), 'wall')).toBe('wall-1')
  })
})

describe('uniqueComponentId', () => {
  it('returns the bare base when free, then suffixes', () => {
    expect(uniqueComponentId([], 'transform')).toBe('transform')
    expect(uniqueComponentId(['transform'], 'transform')).toBe('transform-2')
    expect(uniqueComponentId(['transform', 'transform-2'], 'transform')).toBe('transform-3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor/tests/project/ids.test.ts`
Expected: FAIL — cannot resolve `../../src/project/ids`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/editor/src/project/ids.ts
import type { SceneDocument } from '@automata/project'

/** Lowest-suffixed entity ID (`base-1`, `base-2`, …) absent from `scene`. Pure in scene state. */
export function uniqueEntityId(scene: SceneDocument, base: string): string {
  const taken = new Set(scene.entities.map((entity) => entity.id))
  let n = 1
  let id = `${base}-${n}`
  while (taken.has(id)) id = `${base}-${++n}`
  return id
}

/** Component ID absent from `existing`: the bare `base`, else `base-2`, `base-3`, …. Pure. */
export function uniqueComponentId(existing: readonly string[], base: string): string {
  const taken = new Set(existing)
  let id = base
  let counter = 1
  while (taken.has(id)) id = `${base}-${++counter}`
  return id
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/editor/tests/project/ids.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `host.ts` to the shared allocator**

In `packages/editor/src/project/host.ts`: add `import { uniqueEntityId } from './ids'` to the local-imports block. Delete `let placeCounter = 0` (`:60`) and the entire `uniqueEntityId` closure (`:82-86`). The existing call site `const entityId = uniqueEntityId(scene, prefabId)` (`:150`) now resolves to the import — no call-site change.

- [ ] **Step 6: Wire `palette.ts` to the shared allocator**

In `packages/editor/src/ui/project/palette.ts`: add `import { uniqueComponentId } from '../../project/ids'`. Delete the local `uniqueComponentId` function (`:90-97`). Change the call site (`:82`) to compute the base explicitly:

```ts
const base = type.typeId.split('.').pop() ?? 'component'
const componentId = uniqueComponentId(entity.components.map((component) => component.id), base)
```

- [ ] **Step 7: Run the editor suite**

Run: `npx vitest run --project editor`
Expected: PASS (host/palette behavior unchanged; placed-entity IDs are now gap-filling and session-stable — no editor test asserts placed-entity ID numbering).

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/project/ids.ts packages/editor/tests/project/ids.test.ts \
  packages/editor/src/project/host.ts packages/editor/src/ui/project/palette.ts
git commit -m "feat(editor): derive entity/component IDs from scene state, not a session counter"
```

### Task 2: worldSync field comparison (drop per-item JSON.stringify)

`worldSync.seedKey` runs a full `JSON.stringify` on every item on every snapshot change. Replace it with a typed field comparison. This is a **refactor guarded by characterization tests**: the new tests pass on the current implementation (behavior lock), then stay green after the refactor.

**Files:**
- Modify: `packages/editor/src/project/worldSync.ts`
- Modify test: `packages/editor/tests/project/worldSync.test.ts`

**Interfaces:**
- Consumes: `SpatialItem` (`packages/editor/src/project/spatial.ts`) with `position: Vec3`, `rotation: Quat`, `renderable: RenderableDef` whose `primitive` is `'box' | 'sphere' | 'cylinder'`.
- Produces: no signature change to `ProjectWorldSync`.

- [ ] **Step 1: Add behavior-locking tests**

Append to `packages/editor/tests/project/worldSync.test.ts` (the `item()` helper already exists there):

```ts
it('does not re-add an unchanged entity on re-sync', () => {
  const renderer = createNullRenderer()
  const sync = createProjectWorldSync(renderer.port)
  sync.syncNow([item('a', 0)], new Set())
  renderer.calls.length = 0
  sync.syncNow([item('a', 0)], new Set())
  expect(renderer.calls.filter((call) => call.op === 'add')).toHaveLength(0)
  expect(renderer.calls.filter((call) => call.op === 'remove')).toHaveLength(0)
})

it('re-adds an entity whose position changed', () => {
  const renderer = createNullRenderer()
  const sync = createProjectWorldSync(renderer.port)
  sync.syncNow([item('a', 0)], new Set())
  renderer.calls.length = 0
  sync.syncNow([item('a', 5)], new Set())
  expect(renderer.calls.filter((call) => call.op === 'remove')).toHaveLength(1)
  expect(renderer.calls.filter((call) => call.op === 'add')).toHaveLength(1)
})

it('stays bounded under add/remove churn', () => {
  const renderer = createNullRenderer()
  const sync = createProjectWorldSync(renderer.port)
  const many = Array.from({ length: 100 }, (_, i) => item(`e${i}`, i))
  sync.syncNow(many, new Set())
  expect(renderer.port.objectCount).toBe(100)
  sync.syncNow([], new Set())
  expect(renderer.port.objectCount).toBe(0)
})
```

- [ ] **Step 2: Run to confirm they pass on the current implementation**

Run: `npx vitest run packages/editor/tests/project/worldSync.test.ts`
Expected: PASS (they lock existing behavior before the refactor).

- [ ] **Step 3: Refactor `worldSync.ts` to a typed field comparison**

In `packages/editor/src/project/worldSync.ts`: extend the engine import to `import { …, type Quat, type RenderableDef, type Vec3 } from '@automata/engine'`. Replace the `seedKey` function with:

```ts
function sameVec3(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}
function sameQuat(a: Quat, b: Quat): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w
}
function sameRenderable(a: RenderableDef, b: RenderableDef): boolean {
  if (a.primitive !== b.primitive || a.color !== b.color) return false
  switch (a.primitive) {
    case 'box':
      return sameVec3(a.size, (b as Extract<RenderableDef, { primitive: 'box' }>).size)
    case 'sphere':
      return a.radius === (b as Extract<RenderableDef, { primitive: 'sphere' }>).radius
    case 'cylinder': {
      const c = b as Extract<RenderableDef, { primitive: 'cylinder' }>
      return a.radius === c.radius && a.height === c.height
    }
  }
}
/** Two projected items render identically — cheaper than stringifying, and the exhaustive
 * switch forces any future renderable primitive to declare its comparison. */
function sameSeed(a: SpatialItem, b: SpatialItem): boolean {
  return sameVec3(a.position, b.position) && sameQuat(a.rotation, b.rotation) && sameRenderable(a.renderable, b.renderable)
}
```

Change the `current` map to store the previous item instead of a string key:

```ts
const current = new Map<string, { entity: EditorEntity; item: SpatialItem }>()
```

In `syncNow`, replace the two loops' key logic:

```ts
syncNow(items, selected) {
  const wanted = new Map(items.map((item) => [item.entityId, item]))
  for (const [id, record] of [...current]) {
    const item = wanted.get(id)
    if (!item || !sameSeed(item, record.item)) {
      world.remove(record.entity)
      current.delete(id)
    }
  }
  for (const item of items) {
    if (current.has(item.entityId)) continue
    const entity = world.add({ editorId: item.entityId, transform: createTransform(item.position, item.rotation), renderable: item.renderable })
    current.set(item.entityId, { entity, item })
  }
  applyHighlight(selected)
},
```

- [ ] **Step 4: Run the worldSync suite (still green)**

Run: `npx vitest run packages/editor/tests/project/worldSync.test.ts`
Expected: PASS — the existing color-change test and the three new tests all pass; no `JSON.stringify` remains.

- [ ] **Step 5: Run the editor project suite + coverage**

Run: `npx vitest run --project editor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/project/worldSync.ts packages/editor/tests/project/worldSync.test.ts
git commit -m "perf(editor): compare projected items by field instead of per-sync JSON.stringify"
```

- [ ] **Step 7: Workstream 1 gate**

Run: `npm run ci && npm run coverage`
Expected: PASS. Then proceed to Workstream 2.

---

## Workstream 2 — `@automata/game-kit` browser-shell primitives

Five composable primitives (à la carte), then refactor both games and the scaffold onto them. Each primitive is a focused file + unit test, exported from `packages/game-kit/src/index.ts`.

### Task 3: `createGameHost`

**Files:**
- Create: `packages/game-kit/src/host.ts`
- Test: `packages/game-kit/tests/host.test.ts`
- Modify: `packages/game-kit/src/index.ts` (add `export * from './host'`)

**Interfaces:**
- Consumes: `createCleanupStack`, `type CleanupStack` from `@automata/engine`.
- Produces: `createGameHost(app: HTMLElement): GameHost` where `GameHost = { app, canvas: HTMLCanvasElement, overlays: HTMLElement, cleanup: CleanupStack, dispose(): void, renderBootError(error: unknown): void }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/host.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createGameHost } from '../src/host'

describe('createGameHost', () => {
  it('mounts a canvas and #overlays into app', () => {
    const app = document.createElement('div')
    const host = createGameHost(app)
    expect(app.querySelector('canvas')).toBe(host.canvas)
    expect(app.querySelector('#overlays')).toBe(host.overlays)
  })
  it('dispose removes mounted nodes and runs deferred cleanup', () => {
    const app = document.createElement('div')
    const host = createGameHost(app)
    const spy = vi.fn()
    host.cleanup.defer(spy)
    host.dispose()
    expect(app.querySelector('canvas')).toBeNull()
    expect(app.querySelector('#overlays')).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })
  it('removes the beforeunload listener on dispose', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    createGameHost(document.createElement('div')).dispose()
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })
  it('renderBootError replaces app content with a panel', () => {
    const app = document.createElement('div')
    createGameHost(app).renderBootError(new Error('boom'))
    expect(app.querySelector('.boot-error')?.textContent).toContain('boom')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/game-kit/tests/host.test.ts`
Expected: FAIL — cannot resolve `../src/host`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/game-kit/src/host.ts
import { createCleanupStack, type CleanupStack } from '@automata/engine'

export interface GameHost {
  app: HTMLElement
  canvas: HTMLCanvasElement
  overlays: HTMLElement
  cleanup: CleanupStack
  dispose(): void
  renderBootError(error: unknown): void
}

/**
 * Shared browser boot surface: a canvas + `#overlays` mounted in `app`, a cleanup
 * stack, `beforeunload` teardown, and a boot-error panel. Games build their store,
 * scenes, and gameplay on top of this.
 */
export function createGameHost(app: HTMLElement): GameHost {
  const cleanup = createCleanupStack()
  const dispose = (): void => {
    try { cleanup.dispose() } catch (error) { console.error('Cleanup failed', error) }
  }
  const onBeforeUnload = (): void => dispose()
  window.addEventListener('beforeunload', onBeforeUnload)
  cleanup.defer(() => window.removeEventListener('beforeunload', onBeforeUnload))

  const canvas = document.createElement('canvas')
  app.append(canvas)
  cleanup.defer(() => canvas.remove())
  const overlays = document.createElement('div')
  overlays.id = 'overlays'
  app.append(overlays)
  cleanup.defer(() => overlays.remove())

  const renderBootError = (error: unknown): void => {
    const panel = document.createElement('div')
    panel.className = 'overlay boot-error'
    panel.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`
    app.replaceChildren(panel)
  }

  return { app, canvas, overlays, cleanup, dispose, renderBootError }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/game-kit/tests/host.test.ts`
Expected: PASS.

- [ ] **Step 5: Export + commit**

Add `export * from './host'` to `packages/game-kit/src/index.ts`, then:

```bash
git add packages/game-kit/src/host.ts packages/game-kit/tests/host.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): add createGameHost browser boot surface"
```

### Task 4: `createProjectReader`

**Files:**
- Create: `packages/game-kit/src/projectReader.ts`
- Test: `packages/game-kit/tests/projectReader.test.ts`
- Modify: `packages/game-kit/src/index.ts` (add `export * from './projectReader'`)

**Interfaces:**
- Produces: `createProjectReader(baseURI?: string): ProjectReader` where `ProjectReader = { readText(path: string): Promise<string> }`; default `baseURI = document.baseURI`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/projectReader.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectReader } from '../src/projectReader'

afterEach(() => vi.restoreAllMocks())

describe('createProjectReader', () => {
  it('fetches project-relative paths and returns text', async () => {
    const fetchMock = vi.fn(async () => new Response('hello', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const reader = createProjectReader('http://host/game/')
    await expect(reader.readText('scenes/a.json')).resolves.toBe('hello')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://host/game/project/scenes/a.json')
  })
  it('throws with status and path on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const reader = createProjectReader('http://host/')
    await expect(reader.readText('missing.json')).rejects.toThrow(/404.*missing\.json/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/game-kit/tests/projectReader.test.ts`
Expected: FAIL — cannot resolve `../src/projectReader`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/game-kit/src/projectReader.ts
export interface ProjectReader {
  readText(path: string): Promise<string>
}

/** Reads project files relative to the document base (or an explicit base URI). */
export function createProjectReader(baseURI: string = document.baseURI): ProjectReader {
  return {
    async readText(path) {
      const response = await fetch(new URL(`project/${path}`, baseURI))
      if (!response.ok) throw new Error(`Project request failed (${response.status}): ${path}`)
      return response.text()
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/game-kit/tests/projectReader.test.ts`
Expected: PASS.

- [ ] **Step 5: Export + commit**

Add `export * from './projectReader'` to `packages/game-kit/src/index.ts`, then:

```bash
git add packages/game-kit/src/projectReader.ts packages/game-kit/tests/projectReader.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): add createProjectReader"
```

### Task 5: `mountBrowserAudio`

**Files:**
- Create: `packages/game-kit/src/mountBrowserAudio.ts`
- Test: `packages/game-kit/tests/mountBrowserAudio.test.ts`
- Modify: `packages/game-kit/src/index.ts` (add `export * from './mountBrowserAudio'`)

**Interfaces:**
- Consumes: `createBrowserAudio`, `type BrowserAudio` from `./browserAudio`; `type CleanupStack` from `@automata/engine`.
- Produces: `mountBrowserAudio(host: AudioHost, opts?: { create?: () => BrowserAudio }): BrowserAudio` where `AudioHost = { overlays: HTMLElement; cleanup: CleanupStack }` (a `GameHost` satisfies it). Wires resume-on-first-pointerdown, overlay-button-click → `audio.play('uiClick')`, and defers `dispose`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/mountBrowserAudio.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createCleanupStack } from '@automata/engine'
import { mountBrowserAudio } from '../src/mountBrowserAudio'
import type { BrowserAudio } from '../src/browserAudio'

function fakeAudio(): BrowserAudio & { plays: string[] } {
  const plays: string[] = []
  return {
    plays,
    audio: { play: (id: string) => plays.push(id) } as unknown as BrowserAudio['audio'],
    resume: vi.fn(),
    dispose: vi.fn()
  }
}

describe('mountBrowserAudio', () => {
  it('plays uiClick when an overlay button is clicked', () => {
    const overlays = document.createElement('div')
    const button = document.createElement('button')
    overlays.append(button)
    const audio = fakeAudio()
    mountBrowserAudio({ overlays, cleanup: createCleanupStack() }, { create: () => audio })
    button.click()
    expect(audio.plays).toEqual(['uiClick'])
  })
  it('resumes on the first pointerdown and disposes with the host', () => {
    const audio = fakeAudio()
    const cleanup = createCleanupStack()
    mountBrowserAudio({ overlays: document.createElement('div'), cleanup }, { create: () => audio })
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('pointerdown'))
    expect(audio.resume).toHaveBeenCalledTimes(1)
    cleanup.dispose()
    expect(audio.dispose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/game-kit/tests/mountBrowserAudio.test.ts`
Expected: FAIL — cannot resolve `../src/mountBrowserAudio`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/game-kit/src/mountBrowserAudio.ts
import type { CleanupStack } from '@automata/engine'
import { createBrowserAudio, type BrowserAudio } from './browserAudio'

export interface AudioHost {
  overlays: HTMLElement
  cleanup: CleanupStack
}

/** BrowserAudio wired for browser games: resume on first pointer, UI-click SFX on overlay
 * buttons, disposed with the host. Returns the runtime so the game registers sounds/volume. */
export function mountBrowserAudio(host: AudioHost, opts: { create?: () => BrowserAudio } = {}): BrowserAudio {
  const runtime = (opts.create ?? createBrowserAudio)()
  host.cleanup.defer(() => runtime.dispose())

  const onOverlayClick = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('button')) runtime.audio.play('uiClick')
  }
  host.overlays.addEventListener('click', onOverlayClick)
  host.cleanup.defer(() => host.overlays.removeEventListener('click', onOverlayClick))

  window.addEventListener('pointerdown', runtime.resume, { once: true })
  host.cleanup.defer(() => window.removeEventListener('pointerdown', runtime.resume))

  return runtime
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/game-kit/tests/mountBrowserAudio.test.ts`
Expected: PASS.

- [ ] **Step 5: Export + commit**

Add `export * from './mountBrowserAudio'` to `packages/game-kit/src/index.ts`, then:

```bash
git add packages/game-kit/src/mountBrowserAudio.ts packages/game-kit/tests/mountBrowserAudio.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): add mountBrowserAudio"
```

### Task 6: `createStandardInputs`

**Files:**
- Create: `packages/game-kit/src/standardInputs.ts`
- Test: `packages/game-kit/tests/standardInputs.test.ts`
- Modify: `packages/game-kit/src/index.ts` (add `export * from './standardInputs'`)

**Interfaces:**
- Consumes: `createKeyboardInput`, `createVirtualJoystick` from `@automata/engine/browser`; `type CleanupStack`, `type InputSource` from `@automata/engine`.
- Produces: `createStandardInputs(app: HTMLElement, cleanup: CleanupStack, opts?: { joystickClass?: string }): StandardInputs` where `StandardInputs = { inputs: InputSource[]; element: HTMLElement }`. Mounts the joystick into `app`, defers the element removal and each input's `dispose()` into the **caller-supplied** `cleanup` (so a game can pass a per-level session stack).

- [ ] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/standardInputs.test.ts
import { describe, expect, it } from 'vitest'
import { createCleanupStack } from '@automata/engine'
import { createStandardInputs } from '../src/standardInputs'

describe('createStandardInputs', () => {
  it('mounts a joystick and returns keyboard + joystick inputs', () => {
    const app = document.createElement('div')
    const { inputs, element } = createStandardInputs(app, createCleanupStack(), { joystickClass: 'joystick left' })
    expect(inputs).toHaveLength(2)
    expect(element.className).toBe('joystick left')
    expect(app.contains(element)).toBe(true)
  })
  it('removes the joystick when its cleanup stack disposes', () => {
    const app = document.createElement('div')
    const cleanup = createCleanupStack()
    const { element } = createStandardInputs(app, cleanup)
    cleanup.dispose()
    expect(app.contains(element)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/game-kit/tests/standardInputs.test.ts`
Expected: FAIL — cannot resolve `../src/standardInputs`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/game-kit/src/standardInputs.ts
import type { CleanupStack, InputSource } from '@automata/engine'
import { createKeyboardInput, createVirtualJoystick } from '@automata/engine/browser'

export interface StandardInputs {
  inputs: InputSource[]
  element: HTMLElement
}

/** Keyboard + on-screen joystick, joystick mounted into `app`; every disposer deferred
 * to the caller-supplied `cleanup` (pass a per-level session stack for per-level inputs). */
export function createStandardInputs(
  app: HTMLElement,
  cleanup: CleanupStack,
  opts: { joystickClass?: string } = {}
): StandardInputs {
  const element = document.createElement('div')
  element.className = opts.joystickClass ?? 'joystick'
  app.append(element)
  cleanup.defer(() => element.remove())
  const inputs: InputSource[] = [createKeyboardInput(window), createVirtualJoystick(element)]
  for (const input of inputs) cleanup.defer(() => input.dispose())
  return { inputs, element }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/game-kit/tests/standardInputs.test.ts`
Expected: PASS.

- [ ] **Step 5: Export + commit**

Add `export * from './standardInputs'` to `packages/game-kit/src/index.ts`, then:

```bash
git add packages/game-kit/src/standardInputs.ts packages/game-kit/tests/standardInputs.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): add createStandardInputs with caller-supplied cleanup"
```

### Task 7: `startGameLoop`

**Files:**
- Create: `packages/game-kit/src/gameLoop.ts`
- Test: `packages/game-kit/tests/gameLoop.test.ts`
- Modify: `packages/game-kit/src/index.ts` (add `export * from './gameLoop'`)

**Interfaces:**
- Consumes: `GameLoop`, `type CleanupStack` from `@automata/engine`; `startLoopDriver` from `@automata/engine/browser`.
- Produces: `startGameLoop(hooks: GameLoopHooks, cleanup: CleanupStack, deps?: LoopDeps): void`. `GameLoopHooks = { fixedUpdate(dt): void; render(alpha, frameDt): void; renderFrame(): void; onBlurPause?(): void }`. The `deps` seam (`createLoop`, `drive`) exists for testing; production omits it.

- [ ] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/gameLoop.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createCleanupStack, GameLoop } from '@automata/engine'
import { startGameLoop } from '../src/gameLoop'

describe('startGameLoop', () => {
  it('drives game hooks then renders the frame, and stops on cleanup dispose', () => {
    const events: string[] = []
    const stop = vi.fn()
    let captured: { fixedUpdate: (dt: number) => void; render: (a: number, d: number) => void } | undefined
    const cleanup = createCleanupStack()
    startGameLoop(
      {
        fixedUpdate: () => events.push('fixed'),
        render: () => events.push('render'),
        renderFrame: () => events.push('frame'),
        onBlurPause: () => events.push('blur')
      },
      cleanup,
      {
        createLoop: (spec) => { captured = spec; return {} as unknown as GameLoop },
        drive: (_loop, onBlur) => { onBlur?.(); return { stop } }
      }
    )
    captured!.fixedUpdate(0.016)
    captured!.render(1, 0.016)
    expect(events).toEqual(['blur', 'fixed', 'render', 'frame'])
    cleanup.dispose()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/game-kit/tests/gameLoop.test.ts`
Expected: FAIL — cannot resolve `../src/gameLoop`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/game-kit/src/gameLoop.ts
import { GameLoop, type CleanupStack } from '@automata/engine'
import { startLoopDriver } from '@automata/engine/browser'

export interface GameLoopHooks {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt: number): void
  renderFrame(): void
  onBlurPause?: () => void
}

export interface LoopDeps {
  createLoop?: (spec: { fixedUpdate: (dt: number) => void; render: (alpha: number, frameDt: number) => void }) => GameLoop
  drive?: (loop: GameLoop, onBlur?: () => void) => { stop(): void }
}

/** Wire a GameLoop that renders the canvas after each game render, pauses on blur,
 * and stops when `cleanup` disposes. `deps` is a test seam; production omits it. */
export function startGameLoop(hooks: GameLoopHooks, cleanup: CleanupStack, deps: LoopDeps = {}): void {
  const createLoop = deps.createLoop ?? ((spec) => new GameLoop(spec))
  const drive = deps.drive ?? startLoopDriver
  const loop = createLoop({
    fixedUpdate: (dt) => hooks.fixedUpdate(dt),
    render: (alpha, frameDt) => {
      hooks.render(alpha, frameDt)
      hooks.renderFrame()
    }
  })
  const driver = drive(loop, hooks.onBlurPause)
  cleanup.defer(() => driver.stop())
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/game-kit/tests/gameLoop.test.ts`
Expected: PASS.

- [ ] **Step 5: Export, run whole kit suite, commit**

Add `export * from './gameLoop'` to `packages/game-kit/src/index.ts`. Run `npx vitest run --project game-kit` (Expected: PASS), then:

```bash
git add packages/game-kit/src/gameLoop.ts packages/game-kit/tests/gameLoop.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): add startGameLoop"
```

### Task 8: Refactor Pulsebreak `main.ts` onto the primitives

`main.ts` is an untested browser shim; validation is the build + the existing `e2e/pulsebreak.spec.ts` (behavior must be unchanged).

**Files:**
- Modify: `games/pulsebreak/src/main.ts`

- [ ] **Step 1: Replace the file body**

Rewrite `games/pulsebreak/src/main.ts` to:

```ts
import {
  createSceneManager, createThreeRenderer, localStorageAdapter, subscribeSelector,
  type Scene
} from '@automata/engine'
import { attachCanvasRenderer } from '@automata/engine/browser'
import {
  createGameHost, createOverlayScene, createProjectReader, createStandardInputs,
  mountBrowserAudio, startGameLoop, type View
} from '@automata/game-kit'
import './style.css'
import { registerSounds } from './audio/sounds'
import { createGameplay } from './game/gameplay'
import { loadPulsebreakProject } from './project'
import { createRng } from './sim/rng'
import { createGameStore } from './state/root'
import type { SceneId } from './state/actions'
import { createHud } from './ui/hud'
import { createTitle } from './ui/title'
import { createUpgrade } from './ui/upgrade'
import { createDefeat, createPauseOverlay, createVictory } from './ui/overlays'

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')
  const host = createGameHost(app)
  try {
    const config = await loadPulsebreakProject(createProjectReader())
    const renderer = createThreeRenderer()
    host.cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, host.canvas)
    host.cleanup.defer(() => canvasRenderer.dispose())

    const store = createGameStore({ config, storage: localStorageAdapter() })
    const audioRuntime = mountBrowserAudio(host)
    registerSounds(audioRuntime.audio)
    audioRuntime.audio.setMasterVolume(0.7)

    const { inputs, element: joystickBase } = createStandardInputs(app, host.cleanup)

    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    const game = createGameplay({
      config, store, render: renderer.port, rng: createRng(seed), audio: audioRuntime.audio, inputSources: inputs
    })
    host.cleanup.defer(() => game.dispose())

    const hud = createHud(store, config.waves.length)
    app.append(hud.element)
    host.cleanup.defer(() => hud.dispose())

    const inRun = (scene: SceneId): boolean => scene === 'playing' || scene === 'paused' || scene === 'upgrade'
    const reflectChrome = (scene: SceneId): void => {
      hud.element.style.display = inRun(scene) ? 'flex' : 'none'
      joystickBase.style.display = scene === 'playing' ? 'block' : 'none'
    }
    reflectChrome(store.getState().scene)
    host.cleanup.defer(subscribeSelector(store, (s) => s.scene, reflectChrome))

    const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(host.overlays, make)
    const scenes: Record<SceneId, Scene<SceneId>> = {
      title: overlayScene(() => createTitle(store)),
      playing: {},
      paused: overlayScene(() => createPauseOverlay(store)),
      upgrade: overlayScene(() => createUpgrade(store, config.upgrades)),
      victory: overlayScene(() => createVictory(store)),
      defeat: overlayScene(() => createDefeat(store))
    }
    const sceneManager = createSceneManager(store, (state) => state.scene, scenes)
    host.cleanup.defer(sceneManager.start())

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    }
    window.addEventListener('keydown', onKeyDown)
    host.cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))

    startGameLoop({
      fixedUpdate: (dt) => game.fixedUpdate(dt),
      render: (alpha, frameDt) => game.render(alpha, frameDt),
      renderFrame: () => canvasRenderer.renderFrame(),
      onBlurPause: () => { if (store.getState().scene === 'playing') store.dispatch({ type: 'paused' }) }
    }, host.cleanup)
  } catch (error) {
    host.dispose()
    host.renderBootError(error)
  }
}

void main()
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build -w games/pulsebreak` (or `npm run ci`)
Expected: PASS (no unused imports; `GameLoop`/`startLoopDriver`/`createBrowserAudio`/`createKeyboardInput`/`createVirtualJoystick`/`createCleanupStack` no longer imported directly here).

- [ ] **Step 3: Run the Pulsebreak e2e**

Run: `npx playwright test e2e/pulsebreak.spec.ts`
Expected: PASS (Playwright auto-starts the dev server; behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add games/pulsebreak/src/main.ts
git commit -m "refactor(pulsebreak): boot via @automata/game-kit primitives"
```

### Task 9: Refactor Monkey Ball `main.ts` onto the primitives

Same primitives, but Monkey Ball keeps its per-level lifecycle: `createStandardInputs` is called per level with the **session** cleanup stack.

**Files:**
- Modify: `games/monkey-ball/src/main.ts`

- [ ] **Step 1: Replace the file body**

Rewrite `games/monkey-ball/src/main.ts` to:

```ts
import {
  createCleanupStack, createLoader, createRapierPhysics, createSceneManager,
  createThreeRenderer, fetchTextViaFetch, localStorageAdapter, subscribeSelector,
  type CleanupStack, type Scene
} from '@automata/engine'
import { attachCanvasRenderer } from '@automata/engine/browser'
import {
  createGameHost, createOverlayScene, createProjectReader, createStandardInputs,
  mountBrowserAudio, startGameLoop, type View
} from '@automata/game-kit'
import './style.css'
import { registerSounds } from './audio/sounds'
import { createGameplay, type Gameplay } from './game/gameplay'
import { loadBootData, type BootData } from './scenes/boot'
import { levelSessionAction, loadRequestedLevel } from './scenes/levelLifecycle'
import { createGameStore } from './state/root'
import type { SceneId } from './state/actions'
import { createHud } from './ui/hud'
import { createLevelSelect } from './ui/levelSelect'
import { createMenu } from './ui/menu'
import { createGameOver, createLevelComplete, createPauseOverlay } from './ui/overlays'

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')
  const host = createGameHost(app)
  try {
    const fetchText = fetchTextViaFetch()
    const loader = createLoader(fetchText)
    const projectReader = createProjectReader()
    const renderer = createThreeRenderer()
    host.cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, host.canvas)
    host.cleanup.defer(() => canvasRenderer.dispose())
    const store = createGameStore({ storage: localStorageAdapter() })
    const audioRuntime = mountBrowserAudio(host)
    registerSounds(audioRuntime.audio)
    audioRuntime.audio.setMasterVolume(store.getState().settings.volume)
    host.cleanup.defer(subscribeSelector(
      store, (state) => state.settings.volume, (volume) => audioRuntime.audio.setMasterVolume(volume)
    ))
    const physics = await createRapierPhysics()
    host.cleanup.defer(() => physics.dispose())
    const boot: BootData = await loadBootData(loader, projectReader)
    const { project, lib } = boot
    const { tuning, manifest } = project

    let active: { game: Gameplay; cleanup: CleanupStack } | null = null

    const leaveLevel = (): void => {
      const current = active
      active = null
      current?.cleanup.dispose()
    }
    host.cleanup.defer(leaveLevel)

    const enterLevel = (levelId: string): void => {
      if (active || host.cleanup.disposed) return
      const level = loadRequestedLevel(project, store, levelId, false)
      if (!level || active) return

      const session = createCleanupStack()
      try {
        const { inputs } = createStandardInputs(app, session, {
          joystickClass: `joystick ${store.getState().settings.joystickSide}`
        })
        const game = createGameplay({
          store, physics, render: renderer.port, audio: audioRuntime.audio, lib, level, tuning, inputSources: inputs
        })
        session.defer(() => game.dispose())
        const hud = createHud(store, level.timeLimitS)
        app.append(hud.element)
        session.defer(() => hud.dispose())
        active = { game, cleanup: session }
      } catch (error) {
        session.dispose()
        throw error
      }
    }

    const startLevel = (levelId: string): void => {
      try {
        enterLevel(levelId)
      } catch (error) {
        leaveLevel()
        console.error('Level startup failed', error)
      }
    }

    const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(host.overlays, make)
    const scenes: Record<SceneId, Scene<SceneId>> = {
      boot: {},
      playing: {},
      menu: overlayScene(() => createMenu(store)),
      levelSelect: overlayScene(() => createLevelSelect(store, manifest)),
      paused: overlayScene(() => createPauseOverlay(store)),
      levelComplete: overlayScene(() => createLevelComplete(store)),
      gameOver: overlayScene(() => createGameOver(store))
    }
    const sceneManager = createSceneManager(store, (state) => state.scene, scenes, {
      onTransition: ({ from, to }) => {
        const action = levelSessionAction(from, to, active !== null, false)
        if (action === 'leave') leaveLevel()
        if (action === 'enter') {
          const levelId = store.getState().session.levelId
          if (levelId) startLevel(levelId)
        }
      }
    })
    host.cleanup.defer(sceneManager.start())

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    }
    window.addEventListener('keydown', onKeyDown)
    host.cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))

    startGameLoop({
      fixedUpdate: (dt) => active?.game.fixedUpdate(dt),
      render: (alpha, frameDt) => active?.game.render(alpha, frameDt),
      renderFrame: () => canvasRenderer.renderFrame(),
      onBlurPause: () => store.dispatch({ type: 'paused' })
    }, host.cleanup)

    store.dispatch({ type: 'bootCompleted' })
  } catch (error) {
    host.dispose()
    host.renderBootError(error)
  }
}

void main()
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build -w games/monkey-ball` (or `npm run ci`)
Expected: PASS.

- [ ] **Step 3: Run the Monkey Ball e2e**

Run: `npx playwright test e2e/game.spec.ts`
Expected: PASS (behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add games/monkey-ball/src/main.ts
git commit -m "refactor(monkey-ball): boot via @automata/game-kit primitives"
```

### Task 10: Regenerate the scaffold template + `verify:new-game`

Make new games inherit the primitives, add the `@automata/game-kit` dependency to the generated `package.json`, and update scaffold tests.

**Files:**
- Modify: `tools/scaffold/src/templates/srcFiles.ts` (`mainTs`, `:133-202`)
- Modify: the scaffold template that emits the generated `package.json` dependencies (find in step 2)
- Modify: any scaffold test asserting `mainTs` content (find in step 4)

- [ ] **Step 1: Rewrite `mainTs`**

Replace the `mainTs` function in `tools/scaffold/src/templates/srcFiles.ts` with:

```ts
export function mainTs(name: string): string {
  return `import { createThreeRenderer } from '@automata/engine'
import { attachCanvasRenderer } from '@automata/engine/browser'
import { createGameHost, createProjectReader, startGameLoop } from '@automata/game-kit'
import { createGameplay } from './game/gameplay'
import { loadProject } from './project/load'
import type { SimControl, SimState } from './sim/sim'

const STATUS_TEXT: Record<SimState['status'], string> = {
  running: 'Reach the beacon',
  succeeded: 'Beacon reached!',
  failed: 'Too late — the light went out'
}

function keyboardControl(target: Window): () => SimControl {
  const pressed = new Set<string>()
  target.addEventListener('keydown', (event) => pressed.add(event.key.toLowerCase()))
  target.addEventListener('keyup', (event) => pressed.delete(event.key.toLowerCase()))
  const axis = (negative: string[], positive: string[]): number => {
    const held = (keys: string[]): boolean => keys.some((key) => pressed.has(key))
    return (held(positive) ? 1 : 0) - (held(negative) ? 1 : 0)
  }
  return () => ({
    x: axis(['a', 'arrowleft'], ['d', 'arrowright']),
    z: axis(['w', 'arrowup'], ['s', 'arrowdown'])
  })
}

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')
  const host = createGameHost(app)
  try {
    const compiled = await loadProject(createProjectReader())
    const hud = document.createElement('div')
    hud.className = 'hud'
    app.append(hud)
    host.cleanup.defer(() => hud.remove())

    const renderer = createThreeRenderer()
    host.cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, host.canvas)
    host.cleanup.defer(() => canvasRenderer.dispose())
    const control = keyboardControl(window)
    const game = createGameplay({ compiled, render: renderer.port, control: () => control() })

    hud.textContent = STATUS_TEXT.running
    startGameLoop({
      fixedUpdate: (dt) => {
        game.fixedUpdate(dt)
        hud.textContent = STATUS_TEXT[game.state.status]
      },
      render: (alpha, frameDt) => game.render(alpha, frameDt),
      renderFrame: () => canvasRenderer.renderFrame()
    }, host.cleanup)
  } catch (error) {
    host.dispose()
    host.renderBootError(error)
  }
}

void main()
`
}
```

(The `name` parameter is now unused by `mainTs`; if the function signature must keep it for callers, leave it — otherwise drop the parameter and update the call site the compiler points to.)

- [ ] **Step 2: Add the game-kit dependency to the generated package.json**

Run: `grep -rn '@automata/engine' tools/scaffold/src/templates/*.ts`
In whichever template emits the generated `package.json` `dependencies`, add `"@automata/game-kit"` alongside `"@automata/engine"`, using the identical version specifier the template uses for `@automata/engine` (e.g. `"*"` or `"workspace:*"`).

- [ ] **Step 3: Run the scaffold unit suite**

Run: `npx vitest run --project scaffold`
Expected: FAIL on any assertion that pins the old `mainTs` text or the old dependency list.

- [ ] **Step 4: Update scaffold test expectations**

In the failing scaffold test(s), update the expected `mainTs` substring/snapshot to match the new template (e.g. assert it contains `createGameHost` and `startGameLoop` and no longer references `new GameLoop`), and update the expected dependency list to include `@automata/game-kit`. Re-run `npx vitest run --project scaffold` → PASS.

- [ ] **Step 5: Clean-clone acceptance**

Run: `npm run verify:new-game`
Expected: PASS — a freshly scaffolded game (depending on `@automata/game-kit`) builds, tests, and boots.

- [ ] **Step 6: Commit**

```bash
git add tools/scaffold/
git commit -m "feat(scaffold): generate main.ts from @automata/game-kit primitives"
```

- [ ] **Step 7: Workstream 2 gate**

Run: `npm run ci`
Expected: PASS. Then proceed to Workstream 3.

---

## Workstream 3 — Save/reopen recovery hardening + acceptance coverage

### Task 11: Visible, reversible recovery notice

Autosave recovery currently replaces the opened project silently. Surface a dismissible notice with a discard-to-disk action.

**Files:**
- Create: `tools/level-editor/src/recoveryNotice.ts`
- Test: `tools/level-editor/tests/recoveryNotice.test.ts`
- Modify: `tools/level-editor/src/editorApp.ts` (`mountProjectSession`, recovery block at `:269-272`)

**Interfaces:**
- Produces: `showRecoveryNotice(root: HTMLElement, opts: { onDiscard: () => void }): () => void` — appends a `[data-recovery-notice]` banner with a `[data-recovery-discard]` and a `[data-recovery-dismiss]` button; returns a remover.

- [ ] **Step 1: Write the failing test**

```ts
// tools/level-editor/tests/recoveryNotice.test.ts
import { describe, expect, it, vi } from 'vitest'
import { showRecoveryNotice } from '../src/recoveryNotice'

describe('showRecoveryNotice', () => {
  it('renders a banner and discards recovered changes on demand', () => {
    const root = document.createElement('div')
    const onDiscard = vi.fn()
    showRecoveryNotice(root, { onDiscard })
    expect(root.querySelector('[data-recovery-notice]')).not.toBeNull()
    root.querySelector<HTMLButtonElement>('[data-recovery-discard]')!.click()
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(root.querySelector('[data-recovery-notice]')).toBeNull()
  })
  it('keeps recovered changes and just dismisses', () => {
    const root = document.createElement('div')
    const onDiscard = vi.fn()
    showRecoveryNotice(root, { onDiscard })
    root.querySelector<HTMLButtonElement>('[data-recovery-dismiss]')!.click()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(root.querySelector('[data-recovery-notice]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/level-editor/tests/recoveryNotice.test.ts`
Expected: FAIL — cannot resolve `../src/recoveryNotice`.

- [ ] **Step 3: Write the implementation**

```ts
// tools/level-editor/src/recoveryNotice.ts
/** Dismissible banner shown when unsaved work was recovered from autosave, with a
 * revert-to-disk action. Returns a function that removes the banner. */
export function showRecoveryNotice(root: HTMLElement, opts: { onDiscard: () => void }): () => void {
  const banner = document.createElement('div')
  banner.className = 'ed-recovery-notice'
  banner.dataset.recoveryNotice = ''
  const message = document.createElement('span')
  message.textContent = 'Recovered unsaved changes from a previous session.'
  const discard = document.createElement('button')
  discard.type = 'button'
  discard.dataset.recoveryDiscard = ''
  discard.textContent = 'Discard recovered changes'
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.dataset.recoveryDismiss = ''
  dismiss.textContent = 'Keep'
  const remove = (): void => banner.remove()
  discard.addEventListener('click', () => { opts.onDiscard(); remove() })
  dismiss.addEventListener('click', remove)
  banner.append(message, discard, dismiss)
  root.append(banner)
  return remove
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tools/level-editor/tests/recoveryNotice.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `mountProjectSession`**

In `tools/level-editor/src/editorApp.ts`: add `import { showRecoveryNotice } from './recoveryNotice'`. Replace the recovery block (`:269-272`) with:

```ts
const autosaved = loadProjectAutosave(options.autosaveStorage, options.snapshot.manifest.id)
if (autosaved && stringifyProjectBundle(toProjectBundle(autosaved)) !== stringifyProjectBundle(toProjectBundle(options.snapshot))) {
  core.store.dispatch({ type: 'recoverSnapshot', snapshot: autosaved })
  const removeNotice = showRecoveryNotice(options.root, {
    onDiscard: () => core.store.dispatch({ type: 'loadSnapshot', snapshot: options.snapshot })
  })
  cleanup.defer(removeNotice)
}
```

- [ ] **Step 6: Run the level-editor suite**

Run: `npx vitest run --project level-editor`
Expected: PASS (if `editorApp.test.ts` or `projectSession.test.ts` asserts on `options.root` children after a recovering mount, update it to tolerate the banner).

- [ ] **Step 7: Commit**

```bash
git add tools/level-editor/src/recoveryNotice.ts tools/level-editor/tests/recoveryNotice.test.ts tools/level-editor/src/editorApp.ts
git commit -m "feat(level-editor): show a dismissible, reversible autosave-recovery notice"
```

### Task 12: Flush autosave on tab close

Guarantee the pending autosave debounce is flushed when the tab unloads (the `installProjectAutosave` disposer already flushes on call — this wires it to `beforeunload`).

**Files:**
- Modify: `tools/level-editor/src/editorApp.ts` (`mountEditorApp`, returned `dispose` at `:228-239`)
- Modify test: `tools/level-editor/tests/editorApp.test.ts`

- [ ] **Step 1: Check current wiring**

Run: `grep -rn "beforeunload" tools/level-editor/src`
If a `beforeunload → dispose` (or `→ session.dispose`) is already wired, skip steps 2-4 and note it in the commit; otherwise continue.

- [ ] **Step 2: Add a behavior test**

In `tools/level-editor/tests/editorApp.test.ts`, model the test on the file's existing session-open pattern (`sessionFactory(handle)` → `mounted.factory`, opened via the `[data-create-game="pulsebreak"]` button — see the "keeps a dirty session mounted" test at `:74-105`, which already asserts on a `dispose` mock). Add:

```ts
it('disposes the open session on beforeunload so autosave flushes', async () => {
  const root = document.createElement('main')
  document.body.append(root)
  const dispose = vi.fn()
  const handle: ProjectSessionHandle = {
    canSave: false, hasUnsavedChanges: () => false,
    save: async () => true, exportBundle: () => {}, dispose
  }
  const mounted = sessionFactory(handle)
  const app = await mountEditorApp({
    root, catalog, workspace, autosaveStorage: memoryStorage(),
    query: '?game=pulsebreak', createSession: mounted.factory
  })
  root.querySelector<HTMLButtonElement>('[data-create-game="pulsebreak"]')!.click()
  await vi.waitFor(() => expect(mounted.mounts).toHaveLength(1))

  window.dispatchEvent(new Event('beforeunload'))
  expect(dispose).toHaveBeenCalled()

  app.dispose()
})
```

Run: `npx vitest run tools/level-editor/tests/editorApp.test.ts` → FAIL (no `beforeunload` wiring yet).

- [ ] **Step 3: Wire `beforeunload` in `mountEditorApp`**

In `mountEditorApp`, immediately before the `return { … }`, add:

```ts
const onBeforeUnload = (): void => session?.dispose()
window.addEventListener('beforeunload', onBeforeUnload)
```

and in the returned `dispose()`, before `removeTheme()`, add:

```ts
window.removeEventListener('beforeunload', onBeforeUnload)
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tools/level-editor/tests/editorApp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/level-editor/src/editorApp.ts tools/level-editor/tests/editorApp.test.ts
git commit -m "fix(level-editor): flush autosave by disposing the session on beforeunload"
```

### Task 13: Acceptance coverage — save→reopen round-trip + long editing session

Two tests. First, a unit round-trip proving edited content survives the editor's canonical persist→reload path (spec §5.1) — the folder-level File System Access save/open can't run headless, so this exercises the real serialize→reload code shared by durable save and autosave. Second, a Playwright long-session test (WS1's guarantee: IDs and render sync survive churn) asserting no app-level console/page errors. Recovery (§5.2) is covered by Task 11's unit tests, and scaffold-boot (§5.4) by `verify:new-game` (Task 10).

**Files:**
- Modify: `packages/editor/tests/project/storage/autosave.test.ts`
- Modify: `e2e/editor.spec.ts`

- [ ] **Step 1: Add the save→reopen content round-trip test**

Append to `packages/editor/tests/project/storage/autosave.test.ts`, reusing that file's existing harness (`createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())`, `memoryStorage()`, the `setSpeed` edit helper, project id `'fake-demo'`):

```ts
it('preserves an edit across a persist → reload round-trip', () => {
  const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
  const storage = memoryStorage()
  const stop = installProjectAutosave(store, storage, { debounceMs: 100 })

  store.dispatch(setSpeed(12))
  stop() // disposer flushes the pending write immediately

  const reopened = loadProjectAutosave(storage, 'fake-demo')
  expect(reopened).toEqual(store.getState().snapshot)
})
```

If the bundle round-trip is not field-for-field identity (making the whole-snapshot `toEqual` brittle), fall back to asserting the edited value, mirroring the file's existing flush test: `expect((reopened!.resources.tuning!.data as { speed: number }).speed).toBe(12)`.

- [ ] **Step 2: Run the round-trip test**

Run: `npx vitest run packages/editor/tests/project/storage/autosave.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the long-session e2e**

Append to `e2e/editor.spec.ts`. The console/page-error listeners filter known-benign headless-Chromium noise (WebGL/resource warnings) and assert no app-level errors remain:

```ts
test('survives a long editing session without console errors', async ({ page }) => {
  const IGNORE = [/WebGL/i, /favicon/i, /Failed to load resource/i]
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORE.some((r) => r.test(msg.text()))) errors.push(msg.text())
  })
  page.on('pageerror', (err) => { if (!IGNORE.some((r) => r.test(err.message))) errors.push(err.message) })

  await page.goto('http://127.0.0.1:5175/?game=pulsebreak')
  await page.getByRole('button', { name: 'Create Pulsebreak Project' }).click()
  await page.getByText('arena').click()
  await page.getByText('Spawn Zone').click()

  const canvas = page.locator('[data-vp="main"] canvas')
  for (let i = 0; i < 20; i++) {
    await canvas.click({ position: { x: 120 + (i % 5) * 30, y: 120 + Math.floor(i / 5) * 30 } })
  }
  for (let i = 0; i < 10; i++) await page.keyboard.press('Control+z')
  for (let i = 0; i < 10; i++) await page.keyboard.press('Control+Shift+z')

  await page.getByRole('button', { name: 'Export Bundle' }).click()
  await expect(page.locator('[data-save-status]')).toContainText(/Exported/)
  expect(errors).toEqual([])
})
```

- [ ] **Step 4: Run the editor e2e**

Run: `npx playwright test e2e/editor.spec.ts`
Expected: PASS, `errors` empty. If the undo/redo shortcut differs from `Control+z` / `Control+Shift+z`, confirm the binding in `editorApp.ts` (`:392-397`) and match it.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/tests/project/storage/autosave.test.ts e2e/editor.spec.ts
git commit -m "test: cover save→reopen content round-trip and a long editing session"
```

- [ ] **Step 6: Workstream 3 gate**

Run: `npm run ci && npm run coverage`
Expected: PASS.

- [ ] **Step 7: Full acceptance sweep**

Run: `npx playwright test` and `npm run verify:new-game`
Expected: all PASS.

---

## Task 14: Roadmap closeout (at merge)

After all three workstreams are merged, record Phase 0 as complete.

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Update the roadmap**

In `docs/ROADMAP.md`:
- Move **Phase 0 — Platform integrity** from `In progress` to `Shipped` in §1 (newest first), citing the merge commit, and note the three sub-cycles + P4 done.
- In §3, change the Phase 0 heading status to `Shipped` and mark its remaining tasks (`Editor entity-ID + render-timing hardening`, `P4`, `Save/reopen recovery + acceptance`) `Shipped`.
- In §2, set the `P4` row status to `Shipped`.
- Promote **Phase 1 — Persistent MCP build sessions (P5)** from `Next`/`In progress` per the sequencing rules.

- [ ] **Step 2: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark Phase 0 (platform integrity) shipped; promote Phase 1"
```

---

## Self-Review

**Spec coverage:** WS1 IDs → Task 1; WS1 render sync → Task 2; WS2 five primitives → Tasks 3-7; WS2 game refactors → Tasks 8-9; WS2 scaffold regen + `verify:new-game` → Task 10; WS3 visible/reversible recovery → Task 11; WS3 flush-on-close → Task 12; WS3 acceptance coverage → Task 13 (spec §5.1 save→reopen via an autosave-storage content round-trip; §5.3 long-session e2e), with §5.2 recovery → Task 11 and §5.4 scaffold-boot → `verify:new-game` (Task 10); roadmap impact (spec §7) → Task 14. The spec's "migration-on-recover" edge is already covered by the existing `autosave.test.ts` ("returns null for the legacy envelope, garbage, and future versions") and the shared `parseProjectBundle` path, so no new task is required.

**Type consistency:** `GameHost`/`AudioHost`/`StandardInputs`/`GameLoopHooks`/`LoopDeps`/`ProjectReader` are defined once (Tasks 3-7) and consumed unchanged by Tasks 8-10. `uniqueEntityId`/`uniqueComponentId` signatures (Task 1) match every call site. `showRecoveryNotice` signature (Task 11) matches its `editorApp.ts` call.

**Placeholder scan:** One task references "the file's existing binding" (Task 13's undo shortcut) rather than inlining it — deliberate, noted with an exact location (`editorApp.ts:392-397`). Task 12's `beforeunload` test and Task 13's save→reopen round-trip test are now inlined in full against the real harness identifiers. Task 10 Step 2 keeps a single grep to locate the generated `package.json` template — a genuine discovery step, not a placeholder. All production code and all new tests are complete.
