# Richer `@automata/game-kit` Browser Shell (P4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Progress: 43% (3/7 tasks complete)** — Tasks 1–3 ✅ (game-kit: 23 tests pass, typecheck clean)
> **Note:** In this repo, run scoped tests via `npm test -- --project game-kit <filter>` (the plan's `npm test -w @automata/game-kit -- <filter>` does not work; game-kit has no per-package `test` script — the root `vitest run` drives all workspace projects).

**Goal:** Lift the duplicated browser boot spine out of every game's `main.ts` into `@automata/game-kit` as a `bootGame(setup)` orchestrator plus `createProjectReader` and `mountAudio` primitives, then migrate all three consumers (scaffold template, monkey-ball, pulsebreak) onto it.

**Architecture:** A hybrid shell. `bootGame` owns the universal spine (`#app` lookup, cleanup stack, `beforeunload`, canvas + `#overlays`, renderer + canvasRenderer, the `GameLoop` incl. the `canvasRenderer.renderFrame()` call, `startLoopDriver` visibility wiring, the Escape listener, and the `try/catch → dispose → bootError` rollback). Each game passes one `setup(ctx)` callback that receives the assembled pieces and returns loop steps plus pause policy. Small primitives (`createProjectReader`, `mountAudio`) are exported for use inside `setup`. The shell never names a scene, input, or level.

**Tech Stack:** TypeScript (ESM), Vitest + happy-dom (unit), Playwright (browser smokes), npm workspaces. Engine APIs come from `@automata/engine` and `@automata/engine/browser`.

**Spec:** `../../../../specs/archive/2026-07/week-27/2026-07-05-game-kit-shell-design.md`

## Global Constraints

- Games/tools import engine APIs only from `@automata/engine` (and `@automata/engine/browser`); never third-party engine deps directly.
- `@automata/game-kit` keeps a single dependency, `@automata/engine`. Do **not** add `@automata/project`; `createProjectReader` returns a structural `{ readText, fetchText }`.
- game-kit unit tests run under **happy-dom** (`packages/game-kit/vitest.config.ts`), files matched by `tests/**/*.test.ts`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- Full gate: `npm run ci` (= `lint` → `typecheck` → `test`) must pass before a task is done. Browser smokes run via Playwright.
- The engine `CleanupStack.dispose()` **rethrows** the first cleanup error after draining; any wrapper that calls it must catch (this preserves the original boot error as the user-facing cause).
- Behavior change (intended, per spec): monkey-ball's asset fetches move from origin-absolute (`/project/…`, `/data/…`) to base-relative (resolved against `document.baseURI`).

---

### Task 1: `createProjectReader` primitive

**Files:**
- Create: `packages/game-kit/src/projectReader.ts`
- Create: `packages/game-kit/tests/projectReader.test.ts`
- Modify: `packages/game-kit/src/index.ts`

**Interfaces:**
- Consumes: `fetchTextViaFetch` from `@automata/engine` (`(fetchImpl?: typeof fetch) => (url: string) => Promise<string>`; throws `Error("HTTP <status> for <url>")` on non-ok).
- Produces:
  - `interface ProjectReader { readText(path: string): Promise<string>; fetchText(url: string): Promise<string> }`
  - `interface ProjectReaderOptions { fetchImpl?: typeof fetch; baseURI?: string }`
  - `function createProjectReader(options?: ProjectReaderOptions): ProjectReader`
  - `readText(path)` fetches `project/${path}` resolved against `baseURI`; `fetchText(url)` fetches `url` resolved against `baseURI`.

- [x] **Step 1: Write the failing test**

Create `packages/game-kit/tests/projectReader.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createProjectReader } from '../src/projectReader'

const okFetch = (body: string): typeof fetch =>
  vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch

describe('createProjectReader', () => {
  it('reads project files under project/ resolved against baseURI', async () => {
    const fetchImpl = okFetch('scene-json')
    const reader = createProjectReader({ fetchImpl, baseURI: 'https://host/sub/' })
    const text = await reader.readText('scenes/a.scene.json')
    expect(text).toBe('scene-json')
    expect(fetchImpl).toHaveBeenCalledWith('https://host/sub/project/scenes/a.scene.json')
  })

  it('fetchText resolves non-project asset paths against baseURI', async () => {
    const fetchImpl = okFetch('yaml')
    const reader = createProjectReader({ fetchImpl, baseURI: 'https://host/sub/' })
    await reader.fetchText('data/archetypes/standard.yaml')
    expect(fetchImpl).toHaveBeenCalledWith('https://host/sub/data/archetypes/standard.yaml')
  })

  it('throws when the response is not ok', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const reader = createProjectReader({ fetchImpl, baseURI: 'https://host/' })
    await expect(reader.readText('automata.project.json')).rejects.toThrow('HTTP 404')
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --project game-kit projectReader`
Expected: FAIL — cannot resolve `../src/projectReader`. ✅ Confirmed failed.

- [x] **Step 3: Write the minimal implementation**

Create `packages/game-kit/src/projectReader.ts`:

```ts
import { fetchTextViaFetch } from '@automata/engine'

/** Reads project files and other same-app assets. */
export interface ProjectReader {
  /** A project-relative file (e.g. `scenes/a.scene.json`) under `project/`. */
  readText(path: string): Promise<string>
  /** Any same-app asset URL (e.g. `data/archetypes/standard.yaml`). */
  fetchText(url: string): Promise<string>
}

export interface ProjectReaderOptions {
  fetchImpl?: typeof fetch
  baseURI?: string
}

/**
 * Fetches project files and app assets, resolving every path against
 * `document.baseURI` so a game works under any deploy base, not just the origin
 * root. `readText` prepends `project/`; `fetchText` is the escape hatch for
 * non-project assets (e.g. a code-owned archetype library).
 */
export function createProjectReader(options: ProjectReaderOptions = {}): ProjectReader {
  const base = options.baseURI ?? document.baseURI
  const fetchText = fetchTextViaFetch(options.fetchImpl)
  const resolve = (relative: string): string => new URL(relative, base).href
  return {
    fetchText: (url) => fetchText(resolve(url)),
    readText: (path) => fetchText(resolve(`project/${path}`))
  }
}
```

- [x] **Step 4: Add the barrel export**

In `packages/game-kit/src/index.ts`, add after the existing exports:

```ts
export * from './projectReader'
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -- --project game-kit projectReader`
Expected: PASS (3 tests). ✅ 3 passed.

- [x] **Step 6: Commit**

```bash
git add packages/game-kit/src/projectReader.ts packages/game-kit/tests/projectReader.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): add createProjectReader (base-relative asset fetch)"
```

---

### Task 2: `mountAudio` primitive

**Files:**
- Modify: `packages/game-kit/src/browserAudio.ts`
- Modify: `packages/game-kit/tests/browserAudio.test.ts`

**Interfaces:**
- Consumes: `createBrowserAudio(): BrowserAudio` (existing, same file); `type AudioPort`, `type CleanupStack` from `@automata/engine`. `BrowserAudio` is `{ audio: AudioPort; resume(): void; dispose(): void }`.
- Produces: `function mountAudio(ctx: { overlays: HTMLElement; cleanup: CleanupStack }, register: (audio: AudioPort) => void): BrowserAudio`. It creates a `BrowserAudio`, defers its `dispose`, calls `register(audio)`, wires resume-on-first-`pointerdown` and overlay-click → `play('uiClick')` (both deferred), and returns the `BrowserAudio`.

- [x] **Step 1: Write the failing test**

Append to `packages/game-kit/tests/browserAudio.test.ts` (add imports `beforeEach`, `mountAudio`, `createCleanupStack`, and `AudioPort` type):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCleanupStack, type AudioPort } from '@automata/engine'
import { createBrowserAudio, mountAudio } from '../src/browserAudio'

describe('mountAudio', () => {
  let overlays: HTMLElement
  beforeEach(() => {
    document.body.replaceChildren()
    overlays = document.createElement('div')
    document.body.append(overlays)
  })

  it('registers sounds against the mounted audio port', () => {
    const cleanup = createCleanupStack()
    const register = vi.fn((_audio: AudioPort) => {})
    const mounted = mountAudio({ overlays, cleanup }, register)
    expect(register).toHaveBeenCalledWith(mounted.audio)
  })

  it('plays uiClick when a button inside overlays is clicked, and stops after cleanup', () => {
    const cleanup = createCleanupStack()
    const mounted = mountAudio({ overlays, cleanup }, () => {})
    const play = vi.spyOn(mounted.audio, 'play')

    const button = document.createElement('button')
    overlays.append(button)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(play).toHaveBeenCalledWith('uiClick')

    play.mockClear()
    overlays.dispatchEvent(new MouseEvent('click', { bubbles: true })) // not a button
    expect(play).not.toHaveBeenCalled()

    cleanup.dispose()
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(play).not.toHaveBeenCalled()
  })

  it('resumes audio on the first pointerdown', () => {
    const cleanup = createCleanupStack()
    const mounted = mountAudio({ overlays, cleanup }, () => {})
    const resume = vi.spyOn(mounted, 'resume')
    window.dispatchEvent(new Event('pointerdown'))
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
```

Note: keep the existing `describe('createBrowserAudio', …)` block; merge the `import` lines so `createBrowserAudio` and `mountAudio` come from one import.

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --project game-kit browserAudio`
Expected: FAIL — `mountAudio` is not exported. ✅ 3 new tests failed.

- [x] **Step 3: Write the minimal implementation**

In `packages/game-kit/src/browserAudio.ts`, change the first import line to also bring in `CleanupStack`:

```ts
import { createNullAudio, type AudioPort, type CleanupStack } from '@automata/engine'
```

Then append at the end of the file:

```ts
/**
 * The audio cluster every game repeats: create the runtime, register its sounds,
 * resume it on the first pointer interaction, and play `uiClick` on overlay
 * button clicks. Teardown is deferred onto `ctx.cleanup`. The caller sets volume
 * on the returned runtime (reactively or with a literal).
 */
export function mountAudio(
  ctx: { overlays: HTMLElement; cleanup: CleanupStack },
  register: (audio: AudioPort) => void
): BrowserAudio {
  const runtime = createBrowserAudio()
  ctx.cleanup.defer(() => runtime.dispose())
  register(runtime.audio)

  const resume = (): void => runtime.resume()
  window.addEventListener('pointerdown', resume, { once: true })
  ctx.cleanup.defer(() => window.removeEventListener('pointerdown', resume))

  const onOverlayClick = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('button')) runtime.audio.play('uiClick')
  }
  ctx.overlays.addEventListener('click', onOverlayClick)
  ctx.cleanup.defer(() => ctx.overlays.removeEventListener('click', onOverlayClick))

  return runtime
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --project game-kit browserAudio`
Expected: PASS (existing `createBrowserAudio` tests + 3 new `mountAudio` tests). ✅ 6 passed.

- [x] **Step 5: Commit**

```bash
git add packages/game-kit/src/browserAudio.ts packages/game-kit/tests/browserAudio.test.ts
git commit -m "feat(game-kit): add mountAudio (register + resume-on-input + overlay click)"
```

---

### Task 3: `bootGame` orchestrator

**Files:**
- Create: `packages/game-kit/src/boot.ts`
- Create: `packages/game-kit/tests/boot.test.ts`
- Modify: `packages/game-kit/src/index.ts`

**Interfaces:**
- Consumes: from `@automata/engine`: `GameLoop`, `createCleanupStack`, `createThreeRenderer`, `type CleanupStack`, `type ThreeRenderer`. From `@automata/engine/browser`: `attachCanvasRenderer`, `startLoopDriver`, `type CanvasRenderer`, `type LoopDriver`.
- Produces:
  - `interface BootContext { app: HTMLElement; canvas: HTMLCanvasElement; overlays: HTMLElement; renderer: ThreeRenderer; canvasRenderer: CanvasRenderer; cleanup: CleanupStack }`
  - `interface GameHooks { fixedUpdate(dt: number): void; render(alpha: number, frameDt: number): void; onEscape?(): void; onHidden?(): void; onStarted?(): void }`
  - `type GameSetup = (ctx: BootContext) => GameHooks | Promise<GameHooks>`
  - `interface BootDeps { createRenderer(): ThreeRenderer; attachRenderer(renderer: ThreeRenderer, canvas: HTMLCanvasElement): Promise<CanvasRenderer>; startLoopDriver(loop: GameLoop, onHidden?: () => void): LoopDriver }`
  - `function bootError(error: unknown): HTMLElement`
  - `function bootGame(setup: GameSetup, deps?: BootDeps): void` — production callers omit `deps`.

- [x] **Step 1: Write the failing test**

Create `packages/game-kit/tests/boot.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameLoop } from '@automata/engine'
import { bootGame, type BootContext, type BootDeps, type GameHooks } from '../src/boot'

interface Harness {
  deps: BootDeps
  canvasRenderer: { renderFrame: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
  rendererDispose: ReturnType<typeof vi.fn>
  loopDriverStop: ReturnType<typeof vi.fn>
  capturedLoop: GameLoop | null
  capturedOnHidden: (() => void) | undefined
}

function makeHarness(): Harness {
  const rendererDispose = vi.fn()
  const canvasRenderer = { renderFrame: vi.fn(), dispose: vi.fn() }
  const loopDriverStop = vi.fn()
  const h: Harness = {
    canvasRenderer, rendererDispose, loopDriverStop, capturedLoop: null, capturedOnHidden: undefined,
    deps: {
      createRenderer: () => ({ port: { dispose: rendererDispose } }) as never,
      attachRenderer: async () => canvasRenderer as never,
      startLoopDriver: (loop, onHidden) => {
        h.capturedLoop = loop
        h.capturedOnHidden = onHidden
        return { stop: loopDriverStop }
      }
    }
  }
  return h
}

beforeEach(() => {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.replaceChildren(app)
})
afterEach(() => { document.body.replaceChildren() })

describe('bootGame', () => {
  it('assembles the context, starts the loop, and calls onStarted', async () => {
    const h = makeHarness()
    const setup = vi.fn((ctx: BootContext): GameHooks => {
      expect(ctx.app.id).toBe('app')
      expect(ctx.canvas.tagName).toBe('CANVAS')
      expect(ctx.overlays.id).toBe('overlays')
      return { fixedUpdate: vi.fn(), render: vi.fn(), onStarted: vi.fn() }
    })
    bootGame(setup, h.deps)
    await vi.waitFor(() => expect(setup).toHaveBeenCalledTimes(1))
    const hooks = setup.mock.results[0]!.value as GameHooks
    await vi.waitFor(() => expect(hooks.onStarted).toHaveBeenCalledTimes(1))
    expect(h.capturedLoop).toBeInstanceOf(GameLoop)
  })

  it('renders through the loop and calls canvasRenderer.renderFrame after the game render', async () => {
    const h = makeHarness()
    const render = vi.fn()
    bootGame(() => ({ fixedUpdate: vi.fn(), render }), h.deps)
    await vi.waitFor(() => expect(h.capturedLoop).not.toBeNull())
    h.capturedLoop!.tick(0)
    expect(render).toHaveBeenCalledTimes(1)
    expect(h.canvasRenderer.renderFrame).toHaveBeenCalledTimes(1)
  })

  it('wires onHidden into the loop driver and onEscape to the Escape key', async () => {
    const h = makeHarness()
    const onHidden = vi.fn()
    const onEscape = vi.fn()
    bootGame(() => ({ fixedUpdate: vi.fn(), render: vi.fn(), onHidden, onEscape }), h.deps)
    await vi.waitFor(() => expect(h.capturedOnHidden).toBe(onHidden))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(onEscape).not.toHaveBeenCalled()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('rolls back acquired resources and shows a boot error when setup throws', async () => {
    const h = makeHarness()
    bootGame(() => { throw new Error('boom') }, h.deps)
    await vi.waitFor(() => {
      const app = document.getElementById('app')!
      expect(app.querySelector('.boot-error')?.textContent).toContain('boom')
    })
    expect(h.rendererDispose).toHaveBeenCalledTimes(1)
    expect(h.canvasRenderer.dispose).toHaveBeenCalledTimes(1)
  })

  it('throws synchronously when #app is missing', () => {
    document.body.replaceChildren()
    expect(() => bootGame(() => ({ fixedUpdate: vi.fn(), render: vi.fn() }), makeHarness().deps))
      .toThrow('Missing #app')
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --project game-kit tests/boot`
Expected: FAIL — cannot resolve `../src/boot`. ✅ Confirmed.

- [x] **Step 3: Write the minimal implementation**

Create `packages/game-kit/src/boot.ts`:

```ts
import {
  GameLoop,
  createCleanupStack,
  createThreeRenderer,
  type CleanupStack,
  type ThreeRenderer
} from '@automata/engine'
import {
  attachCanvasRenderer,
  startLoopDriver,
  type CanvasRenderer,
  type LoopDriver
} from '@automata/engine/browser'

/** The assembled browser pieces a game's `setup` receives. */
export interface BootContext {
  app: HTMLElement
  canvas: HTMLCanvasElement
  overlays: HTMLElement
  renderer: ThreeRenderer
  canvasRenderer: CanvasRenderer
  cleanup: CleanupStack
}

/** The game-specific policy `setup` returns to the shell. */
export interface GameHooks {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt: number): void
  /** Called when the user presses Escape; the game decides pause vs resume. */
  onEscape?(): void
  /** Called when the tab is hidden; the game decides whether to pause. */
  onHidden?(): void
  /** Called once after the loop is running (e.g. dispatch a boot-completed action). */
  onStarted?(): void
}

export type GameSetup = (ctx: BootContext) => GameHooks | Promise<GameHooks>

/** Un-fakeable browser/WebGL factories, injected so the spine is testable. */
export interface BootDeps {
  createRenderer(): ThreeRenderer
  attachRenderer(renderer: ThreeRenderer, canvas: HTMLCanvasElement): Promise<CanvasRenderer>
  startLoopDriver(loop: GameLoop, onHidden?: () => void): LoopDriver
}

const defaultDeps: BootDeps = {
  createRenderer: createThreeRenderer,
  attachRenderer: attachCanvasRenderer,
  startLoopDriver
}

/** The user-facing failure panel mounted into `#app` when boot fails. */
export function bootError(error: unknown): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'overlay boot-error'
  panel.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`
  return panel
}

/**
 * The shared browser boot spine. Owns the cleanup stack, DOM scaffold, renderer,
 * game loop, visibility/Escape wiring, and roll-back-on-failure; the game supplies
 * only policy through `setup`. Throws synchronously if `#app` is missing.
 */
export function bootGame(setup: GameSetup, deps: BootDeps = defaultDeps): void {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')

  const cleanup = createCleanupStack()
  const dispose = (): void => {
    // Drain every acquired resource; keep the boot error as the user-facing
    // cause even if a cleanup callback also throws.
    try {
      cleanup.dispose()
    } catch (error) {
      console.error('Cleanup failed', error)
    }
  }
  const onBeforeUnload = (): void => dispose()
  window.addEventListener('beforeunload', onBeforeUnload)
  cleanup.defer(() => window.removeEventListener('beforeunload', onBeforeUnload))

  void (async (): Promise<void> => {
    try {
      const canvas = document.createElement('canvas')
      app.append(canvas)
      cleanup.defer(() => canvas.remove())
      const overlays = document.createElement('div')
      overlays.id = 'overlays'
      app.append(overlays)
      cleanup.defer(() => overlays.remove())

      const renderer = deps.createRenderer()
      cleanup.defer(() => renderer.port.dispose())
      const canvasRenderer = await deps.attachRenderer(renderer, canvas)
      cleanup.defer(() => canvasRenderer.dispose())

      const hooks = await setup({ app, canvas, overlays, renderer, canvasRenderer, cleanup })

      const loop = new GameLoop({
        fixedUpdate: (dt) => hooks.fixedUpdate(dt),
        render: (alpha, frameDt) => {
          hooks.render(alpha, frameDt)
          canvasRenderer.renderFrame()
        }
      })
      const loopDriver = deps.startLoopDriver(loop, hooks.onHidden)
      cleanup.defer(() => loopDriver.stop())

      const onEscape = hooks.onEscape
      if (onEscape) {
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape') onEscape()
        }
        window.addEventListener('keydown', onKeyDown)
        cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))
      }

      hooks.onStarted?.()
    } catch (error) {
      dispose()
      app.replaceChildren(bootError(error))
    }
  })()
}
```

- [x] **Step 4: Add the barrel export**

In `packages/game-kit/src/index.ts`, add:

```ts
export * from './boot'
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -- --project game-kit tests/boot`
Expected: PASS (5 tests). ✅ 5 passed.

- [x] **Step 6: Run the whole game-kit suite + typecheck**

Run: `npm test -- --project game-kit && npm run typecheck -w @automata/game-kit`
Expected: PASS. ✅ 23 tests pass, typecheck clean.

- [x] **Step 7: Commit**

```bash
git add packages/game-kit/src/boot.ts packages/game-kit/tests/boot.test.ts packages/game-kit/src/index.ts
git commit -m "feat(game-kit): add bootGame browser boot spine with injectable deps"
```

---

### Task 4: Migrate the scaffold template `mainTs`

**Files:**
- Modify: `tools/scaffold/src/templates/srcFiles.ts:133-202` (the `mainTs` function)
- Modify: `tools/scaffold/src/templates/configFiles.ts:14-18` (add the `@automata/game-kit` dependency to the generated `package.json`)

**Interfaces:**
- Consumes: `bootGame`, `createProjectReader` from `@automata/game-kit`; the generated `loadProject(reader)` (accepts a `{ readText }`), `createGameplay`, and `SimControl`/`SimState`.
- Produces: a generated `src/main.ts` whose only boot code is a `bootGame(async (ctx) => …)` call. The `mainTs(name)` signature is unchanged (still called at `tools/scaffold/src/plan.ts:54`).

- [ ] **Step 1: Replace the `mainTs` function body**

Replace `tools/scaffold/src/templates/srcFiles.ts` lines 133–202 (the entire `mainTs` function) with:

```ts
export function mainTs(name: string): string {
  return `// Browser entry point for the ${name} game.
import { bootGame, createProjectReader } from '@automata/game-kit'
import { createGameplay } from './game/gameplay'
import { loadProject } from './project/load'
import type { SimControl, SimState } from './sim/sim'

const STATUS_TEXT: Record<SimState['status'], string> = {
  running: 'Reach the beacon',
  succeeded: 'Beacon reached!',
  failed: 'Too late — the light went out'
}

interface Deferrer { defer(cleanup: () => void): void }

function keyboardControl(target: Window, cleanup: Deferrer): () => SimControl {
  const pressed = new Set<string>()
  const onDown = (event: KeyboardEvent): void => { pressed.add(event.key.toLowerCase()) }
  const onUp = (event: KeyboardEvent): void => { pressed.delete(event.key.toLowerCase()) }
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)
  cleanup.defer(() => {
    target.removeEventListener('keydown', onDown)
    target.removeEventListener('keyup', onUp)
  })
  const axis = (negative: string[], positive: string[]): number => {
    const held = (keys: string[]): boolean => keys.some((key) => pressed.has(key))
    return (held(positive) ? 1 : 0) - (held(negative) ? 1 : 0)
  }
  return () => ({
    x: axis(['a', 'arrowleft'], ['d', 'arrowright']),
    z: axis(['w', 'arrowup'], ['s', 'arrowdown'])
  })
}

bootGame(async (ctx) => {
  const compiled = await loadProject(createProjectReader())

  const hud = document.createElement('div')
  hud.className = 'hud'
  ctx.app.append(hud)
  ctx.cleanup.defer(() => hud.remove())

  const control = keyboardControl(window, ctx.cleanup)
  const game = createGameplay({ compiled, render: ctx.renderer.port, control: () => control() })
  ctx.cleanup.defer(() => game.dispose())

  hud.textContent = STATUS_TEXT.running
  return {
    fixedUpdate: (dt) => {
      game.fixedUpdate(dt)
      hud.textContent = STATUS_TEXT[game.state.status]
    },
    render: (alpha, frameDt) => game.render(alpha, frameDt)
  }
})
`
}
```

- [ ] **Step 2: Declare `@automata/game-kit` in the generated `package.json`**

The new template imports from `@automata/game-kit`, so the generated game must depend on it (the current template only used `@automata/engine`). In `tools/scaffold/src/templates/configFiles.ts`, change the `dependencies` block (lines 14–18) from:

```ts
    dependencies: {
      '@automata/editor': '*',
      '@automata/engine': '*',
      '@automata/project': '*'
    },
```

to:

```ts
    dependencies: {
      '@automata/editor': '*',
      '@automata/engine': '*',
      '@automata/game-kit': '*',
      '@automata/project': '*'
    },
```

- [ ] **Step 3: Verify scaffold unit tests and typecheck still pass**

Run: `npm test -w @automata/scaffold && npm run typecheck -w @automata/scaffold`
Expected: PASS — no scaffold test pins the generated `main.ts` content or the dependency set (verified: `grep -rn "createThreeRenderer\|bootGame\|main.ts\|dependencies" tools/scaffold/tests` finds only the file-list path in `plan.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add tools/scaffold/src/templates/srcFiles.ts tools/scaffold/src/templates/configFiles.ts
git commit -m "feat(scaffold): generate main.ts on the game-kit bootGame shell"
```

Note: the generated game's full boot proof (clean-clone install → CI → build → Playwright smoke) runs in Task 7 via `npm run verify:new-game`.

---

### Task 5: Migrate monkey-ball onto the shell

**Files:**
- Modify: `games/monkey-ball/src/main.ts` (full rewrite)
- Modify: `games/monkey-ball/src/scenes/boot.ts:16` (archetype path → base-relative)
- Modify: `games/monkey-ball/tests/scenes/boot.test.ts:28` (expectation → base-relative)
- Modify: `games/monkey-ball/tests/helpers/data.ts` (`fsFetchText`: strip an optional leading slash)

Note: the base-relative value `data/archetypes/standard.yaml` already exists as `ARCHETYPE_DATA_PATH` in `src/project/headless.ts` (the editor/headless paths use it — see `tests/project/editor.test.ts:89,97`). The browser `boot.ts` is the last caller still on the absolute path. Keep a local literal in `boot.ts` rather than importing that constant: `headless.ts` pulls in `@automata/editor/headless` + evaluation code, which must not enter the browser game bundle.

**Interfaces:**
- Consumes: `bootGame`, `createProjectReader`, `mountAudio`, `createOverlayScene`, `type View` from `@automata/game-kit`; `createCleanupStack`, `createLoader`, `createRapierPhysics`, `createSceneManager`, `localStorageAdapter`, `subscribeSelector`, `type CleanupStack`, `type InputSource`, `type Scene` from `@automata/engine`; `createKeyboardInput`, `createVirtualJoystick` from `@automata/engine/browser`. All local game modules keep their current exports.
- Produces: no new exports; `main.ts` is a leaf entry point.

- [ ] **Step 1: Update the boot-data test expectation (fails first)**

In `games/monkey-ball/tests/scenes/boot.test.ts`, change line 28 from:

```ts
    expect(dataReads).toEqual(['/data/archetypes/standard.yaml'])
```

to:

```ts
    expect(dataReads).toEqual(['data/archetypes/standard.yaml'])
```

Run: `npm test -w monkey-ball -- scenes/boot`
Expected: FAIL — code still requests `/data/archetypes/standard.yaml`.

- [ ] **Step 2: Change the archetype path to base-relative**

In `games/monkey-ball/src/scenes/boot.ts`, line 16, change:

```ts
    loader.load(archetypeLibraryKind, '/data/archetypes/standard.yaml')
```

to:

```ts
    loader.load(archetypeLibraryKind, 'data/archetypes/standard.yaml')
```

- [ ] **Step 3: Teach the test helper to accept the base-relative path**

`fsFetchText` currently strips only a leading `/data/`, so the new relative path would fall through to the legacy-fixtures root and the boot-data test would throw. In `games/monkey-ball/tests/helpers/data.ts`, change:

```ts
export async function fsFetchText(url: string): Promise<string> {
  return readDataFile(url.replace(/^\/data\//, ''))
}
```

to (make the leading slash optional):

```ts
export async function fsFetchText(url: string): Promise<string> {
  return readDataFile(url.replace(/^\/?data\//, ''))
}
```

- [ ] **Step 4: Run the boot-data test to verify it passes**

Run: `npm test -w monkey-ball -- scenes/boot`
Expected: PASS (both tests).

- [ ] **Step 5: Rewrite `games/monkey-ball/src/main.ts`**

Replace the entire file with:

```ts
import {
  createCleanupStack,
  createLoader,
  createRapierPhysics,
  createSceneManager,
  localStorageAdapter,
  subscribeSelector,
  type CleanupStack,
  type InputSource,
  type Scene
} from '@automata/engine'
import { createKeyboardInput, createVirtualJoystick } from '@automata/engine/browser'
import { bootGame, createOverlayScene, createProjectReader, mountAudio, type View } from '@automata/game-kit'
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

bootGame(async (ctx) => {
  const { app, overlays, renderer, cleanup } = ctx

  const reader = createProjectReader()
  const loader = createLoader(reader.fetchText)
  const store = createGameStore({ storage: localStorageAdapter() })
  const audioRuntime = mountAudio(ctx, registerSounds)
  audioRuntime.audio.setMasterVolume(store.getState().settings.volume)
  cleanup.defer(subscribeSelector(
    store,
    (state) => state.settings.volume,
    (volume) => audioRuntime.audio.setMasterVolume(volume)
  ))
  const physics = await createRapierPhysics()
  cleanup.defer(() => physics.dispose())
  const boot: BootData = await loadBootData(loader, reader)
  const { project, lib } = boot
  const { tuning, manifest } = project

  let active: { game: Gameplay; cleanup: CleanupStack } | null = null

  const leaveLevel = (): void => {
    const current = active
    active = null
    current?.cleanup.dispose()
  }
  cleanup.defer(leaveLevel)

  const enterLevel = (levelId: string): void => {
    if (active || cleanup.disposed) return
    const level = loadRequestedLevel(project, store, levelId, false)
    if (!level || active) return

    const session = createCleanupStack()
    try {
      const joystickBase = document.createElement('div')
      joystickBase.className = `joystick ${store.getState().settings.joystickSide}`
      app.append(joystickBase)
      session.defer(() => joystickBase.remove())
      const inputs: InputSource[] = [
        createKeyboardInput(window),
        createVirtualJoystick(joystickBase)
      ]
      for (const input of inputs) session.defer(() => input.dispose())
      const game = createGameplay({
        store,
        physics,
        render: renderer.port,
        audio: audioRuntime.audio,
        lib,
        level,
        tuning,
        inputSources: inputs
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

  const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(overlays, make)

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
  cleanup.defer(sceneManager.start())

  return {
    fixedUpdate: (dt) => active?.game.fixedUpdate(dt),
    render: (alpha, frameDt) => active?.game.render(alpha, frameDt),
    onEscape: () => {
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    },
    onHidden: () => store.dispatch({ type: 'paused' }),
    onStarted: () => store.dispatch({ type: 'bootCompleted' })
  }
})
```

- [ ] **Step 6: Typecheck, lint, and unit-test monkey-ball**

Run: `npm run ci`
Expected: PASS. (Confirms the rewritten `main.ts` typechecks and every game/engine unit test still passes.)

- [ ] **Step 7: Drive the browser smoke**

Run: `npx playwright test e2e/game.spec.ts`
Expected: PASS — game boots to the menu, `#overlays` visible, Play → level → `canvas` + `.hud` visible, and a `…/project/automata.project.json` response is observed (now base-relative, still resolves to the dev-server root).

- [ ] **Step 8: Commit**

```bash
git add games/monkey-ball/src/main.ts games/monkey-ball/src/scenes/boot.ts games/monkey-ball/tests/scenes/boot.test.ts games/monkey-ball/tests/helpers/data.ts
git commit -m "refactor(monkey-ball): boot on the game-kit shell; base-relative assets"
```

---

### Task 6: Migrate pulsebreak onto the shell

**Files:**
- Modify: `games/pulsebreak/src/main.ts` (full rewrite)

**Interfaces:**
- Consumes: `bootGame`, `createOverlayScene`, `createProjectReader`, `mountAudio`, `type View` from `@automata/game-kit`; `createSceneManager`, `localStorageAdapter`, `subscribeSelector`, `type InputSource`, `type Scene` from `@automata/engine`; `createKeyboardInput`, `createVirtualJoystick` from `@automata/engine/browser`. Local modules keep current exports.
- Produces: no new exports; `main.ts` is a leaf entry point.

- [ ] **Step 1: Rewrite `games/pulsebreak/src/main.ts`**

Replace the entire file with:

```ts
import {
  createSceneManager,
  localStorageAdapter,
  subscribeSelector,
  type InputSource,
  type Scene
} from '@automata/engine'
import { createKeyboardInput, createVirtualJoystick } from '@automata/engine/browser'
import { bootGame, createOverlayScene, createProjectReader, mountAudio, type View } from '@automata/game-kit'
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

bootGame(async (ctx) => {
  const { app, overlays, renderer, cleanup } = ctx

  const reader = createProjectReader()
  const config = await loadPulsebreakProject(reader)

  const store = createGameStore({ config, storage: localStorageAdapter() })
  const audioRuntime = mountAudio(ctx, registerSounds)
  audioRuntime.audio.setMasterVolume(0.7)

  const joystickBase = document.createElement('div')
  joystickBase.className = 'joystick'
  app.append(joystickBase)
  cleanup.defer(() => joystickBase.remove())
  const inputs: InputSource[] = [createKeyboardInput(window), createVirtualJoystick(joystickBase)]
  for (const input of inputs) cleanup.defer(() => input.dispose())

  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  const game = createGameplay({
    config, store, render: renderer.port, rng: createRng(seed), audio: audioRuntime.audio, inputSources: inputs
  })
  cleanup.defer(() => game.dispose())

  const hud = createHud(store, config.waves.length)
  app.append(hud.element)
  cleanup.defer(() => hud.dispose())

  // HUD + joystick are only meaningful inside a run.
  const inRun = (scene: SceneId): boolean => scene === 'playing' || scene === 'paused' || scene === 'upgrade'
  const reflectChrome = (scene: SceneId): void => {
    hud.element.style.display = inRun(scene) ? 'flex' : 'none'
    joystickBase.style.display = scene === 'playing' ? 'block' : 'none'
  }
  reflectChrome(store.getState().scene)
  cleanup.defer(subscribeSelector(store, (s) => s.scene, reflectChrome))

  const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(overlays, make)
  const scenes: Record<SceneId, Scene<SceneId>> = {
    title: overlayScene(() => createTitle(store)),
    playing: {},
    paused: overlayScene(() => createPauseOverlay(store)),
    upgrade: overlayScene(() => createUpgrade(store, config.upgrades)),
    victory: overlayScene(() => createVictory(store)),
    defeat: overlayScene(() => createDefeat(store))
  }
  const sceneManager = createSceneManager(store, (state) => state.scene, scenes)
  cleanup.defer(sceneManager.start())

  return {
    fixedUpdate: (dt) => game.fixedUpdate(dt),
    render: (alpha, frameDt) => game.render(alpha, frameDt),
    onEscape: () => {
      const scene = store.getState().scene
      if (scene === 'playing') store.dispatch({ type: 'paused' })
      else if (scene === 'paused') store.dispatch({ type: 'resumed' })
    },
    onHidden: () => {
      if (store.getState().scene === 'playing') store.dispatch({ type: 'paused' })
    }
  }
})
```

- [ ] **Step 2: Typecheck, lint, and unit-test the workspace**

Run: `npm run ci`
Expected: PASS.

- [ ] **Step 3: Drive the browser smoke**

Run: `npx playwright test e2e/pulsebreak.spec.ts`
Expected: PASS — pulsebreak boots, starts a run, shows the HUD, and pauses/resumes; `#overlays` visible; `/project/` responses observed.

- [ ] **Step 4: Commit**

```bash
git add games/pulsebreak/src/main.ts
git commit -m "refactor(pulsebreak): boot on the game-kit shell"
```

---

### Task 7: Full acceptance + roadmap update

**Files:**
- Modify: `docs/ROADMAP.md` (P4 rows + Phase 0 task → `Shipped`)

- [ ] **Step 1: Run the full CI gate**

Run: `npm run ci`
Expected: PASS across all workspaces.

- [ ] **Step 2: Run coverage (engine-adjacent code moved)**

Run: `npm run coverage`
Expected: PASS; game-kit coverage includes `boot.ts`, `projectReader.ts`, and `mountAudio`.

- [ ] **Step 3: Run the paved-road acceptance proof**

Run: `npm run verify:new-game`
Expected: `verify:new-game OK` — a freshly scaffolded game installs, passes CI, builds, the MCP server loads it, and its generated Playwright smoke boots the game on the new `bootGame` template.

- [ ] **Step 4: Run both real-game browser smokes together**

Run: `npx playwright test e2e/game.spec.ts e2e/pulsebreak.spec.ts`
Expected: PASS (both).

- [ ] **Step 5: Update `docs/ROADMAP.md`**

Make these edits:
- In the section 2 table, change the P4 row status from `Planned` to `Shipped` and add the merge date/commit inline (match the P3 row's format).
- In "Phase 0 — Platform integrity", change the P4 task bullet from `Planned` to `Shipped` with the date.
- In the cross-cutting "P4 — Richer `@automata/game-kit`" section, update the status to `Shipped` and revise "What today looks like" to reflect that the shared shell now lives in `game-kit` (past tense), linking the spec and this plan.

- [ ] **Step 6: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark P4 (game-kit shell) shipped"
```

---

## Self-Review

**Spec coverage:**
- Module split (`boot.ts`, `projectReader.ts`, `mountAudio` in `browserAudio.ts`, index re-exports) → Tasks 1–3. ✓
- `bootGame` contract (`BootContext`, `GameHooks`, `BootDeps`, ordered spine, rollback) → Task 3. ✓
- `createProjectReader` (base-relative `readText` + `fetchText`) → Task 1. ✓
- `mountAudio` (register + resume-on-input + overlay click; volume left to caller) → Task 2. ✓
- Unify latent bug: monkey-ball base-relative assets → Task 5 (path + expectation + `fsFetchText` helper). ✓
- Generated game declares `@automata/game-kit` (new template dependency) → Task 4. ✓
- Hooked policy: `onEscape`/`onHidden` pause differences, `onStarted` for `bootCompleted` → Tasks 5, 6. ✓
- Migrate all three consumers → Tasks 4, 5, 6. ✓
- Delete duplicated `bootError` from both games → Tasks 5, 6 (full-file rewrites omit it). ✓
- Testing: primitives unit-tested, spine tested via `deps` injection → Tasks 1–3. ✓
- Out of scope (no input primitive, no `@automata/project` dep) → honored across tasks. ✓
- Acceptance (`ci`, `coverage`, `verify:new-game`, both e2e) + ROADMAP → Task 7. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code; every run step shows the command and expected result. ✓

**Type consistency:** `BootContext`/`GameHooks`/`BootDeps`/`GameSetup` names and shapes are identical in Task 3's interface block, its implementation, and their consumption in Tasks 4–6. `ProjectReader.readText`/`fetchText` used consistently (Task 1 defines; Tasks 4–6 consume). `mountAudio(ctx, register)` signature matches between Task 2 and its callers. `createProjectReader()` is called with no args in games (defaults to `document.baseURI` + global `fetch`) and with options only in its unit test. ✓
