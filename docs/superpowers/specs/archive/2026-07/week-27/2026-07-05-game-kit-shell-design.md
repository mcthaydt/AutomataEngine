# Richer `@automata/game-kit` — Browser Shell (P4) — Design

Status: awaiting user review. Brainstormed interactively; the scope, the
unify-vs-preserve principle, the shell shape, and the testing decision were all
settled in dialogue and are recorded below. Every decision is revisable at this
review gate.

## Problem

Every game's browser entry point re-implements the same boot spine. Today three
`main.ts` files diverge on code that should be identical:

- `games/monkey-ball/src/main.ts` (~200 lines) and
  `games/pulsebreak/src/main.ts` (~145 lines) each hand-wire: `#app` lookup, an
  identical `bootError` helper, a `createCleanupStack()` + error-catching
  `dispose()`, a `beforeunload` listener, canvas creation, an `#overlays` div,
  `createThreeRenderer` + `attachCanvasRenderer`, `createBrowserAudio` (register
  sounds, resume-on-first-pointerdown, overlay-click → `uiClick`), keyboard +
  virtual-joystick inputs, a `GameLoop` + `startLoopDriver`, an Escape
  pause/resume listener, and a `try/catch → dispose → bootError` rollback.
- `tools/scaffold/src/templates/srcFiles.ts` (`mainTs`) generates a *third,
  thinner* variant — the "beacon" game — that duplicates a slimmer slice of the
  same boot code and does not use `game-kit` at all.

`@automata/game-kit` today carries only `view`, `dom`, `browserAudio`, and
`overlayScene`. The bug-prone parts — cleanup ordering and the
`try/catch → dispose → bootError` rollback — are copied into every untested
`main.ts`, and the copies have already drifted (see Latent-bug unification).

## Goals

- Lift the shared browser spine into `@automata/game-kit` so a game's `main.ts`
  wires only game-specific pieces.
- Regenerate the scaffold template so new games inherit the spine instead of
  copying it; `npm run verify:new-game` still passes with the thinner template.
- Migrate all three consumers (scaffold template, monkey-ball, pulsebreak) onto
  the new shell as the proof the boundary is right.
- Move the bug-prone rollback logic into one tested place.

Non-goals: a shared *input* primitive (inputs stay game-owned — see D5); any
change to gameplay, scene, HUD, or store code beyond the boot wiring; touching
the editor's preview boot path.

## Principle: unify latent bugs, hook genuine choices

The three entry points differ in small ways. A single shared spine forces a
decision on each. The rule adopted: **the shell owns plumbing; the game owns
policy.** Accidental divergence is unified (and any behavior change flagged);
genuine game choices become hooks.

- **Project-reader base path** — *unify.* monkey-ball reads absolute
  `/project/…` and `/data/…`; pulsebreak/scaffold read `project/…` resolved
  against `document.baseURI`. Absolute paths break under any non-root deploy
  base; base-relative is strictly more correct. The shared reader resolves
  everything against `document.baseURI`. **Behavior change:** monkey-ball's
  asset paths become base-relative (a latent deploy-bug fix).
- **Pause on Escape / on tab-hidden** — *hook, not value.* The pause/resume
  *direction* depends on game state (`playing`→pause, `paused`→resume) and the
  tab-hidden policy differs (monkey-ball always pauses; pulsebreak pauses only
  when `playing`). The shell owns the listener plumbing + cleanup; the game
  supplies the policy via `onEscape` / `onHidden` closures. The shell never
  names a scene.
- **Audio master volume** — *hook.* A real game choice: monkey-ball drives it
  reactively from `store.settings.volume`; pulsebreak uses a fixed `0.7`. The
  game sets volume itself on the returned `BrowserAudio`.

## Architecture

`@automata/game-kit` stays flat (matching `browserAudio.ts`, `dom.ts`,
`overlayScene.ts`, `view.ts`). P4 adds:

| Module | Exports | Owns |
|---|---|---|
| `boot.ts` | `bootGame`, `BootContext`, `GameHooks`, `bootError` | The universal spine: `#app` lookup, cleanup stack, `beforeunload`, canvas + `#overlays`, renderer + canvasRenderer, the `GameLoop` (incl. the `canvasRenderer.renderFrame()` call), `startLoopDriver` visibility wiring, the Escape listener, and the `try/catch → dispose → bootError` rollback. |
| `projectReader.ts` | `createProjectReader`, `ProjectReader` | Base-path-correct fetch resolved against `document.baseURI`. |
| `browserAudio.ts` (extend) | add `mountAudio` | The shared audio cluster: register sounds, resume-on-first-pointerdown, overlay-click → `uiClick`. |

`index.ts` re-exports all three. game-kit keeps its single `@automata/engine`
dependency: `createProjectReader` returns a **structural** `{ readText, fetchText }`
(no `@automata/project` dependency), which the games' existing
`loadXProject({ readText })` signatures accept as-is.

**The seam.** The shell owns *plumbing* (DOM, renderer, loop, listeners,
cleanup, rollback). The game owns *policy* (scenes, inputs, sessions, HUD,
store, physics, pause meaning, volume) — all inside one `setup(ctx)` callback,
deferring its own teardown onto `ctx.cleanup`.

## The `bootGame` contract

```ts
export interface BootContext {
  app: HTMLElement               // #app
  canvas: HTMLCanvasElement      // created + appended + cleanup-deferred
  overlays: HTMLElement          // <div id="overlays">, created + deferred
  renderer: ThreeRenderer        // createThreeRenderer(); .port for gameplay
  canvasRenderer: CanvasRenderer // attachCanvasRenderer result
  cleanup: CleanupStack          // the shared stack — game defers its teardown here
}

export interface GameHooks {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt: number): void
  onEscape?(): void   // shell attaches keydown filtered to 'Escape' + cleanup
  onHidden?(): void   // shell passes to startLoopDriver (auto-pause on tab hidden)
  onStarted?(): void  // shell calls once, after the loop is running
}

export type GameSetup = (ctx: BootContext) => GameHooks | Promise<GameHooks>

export interface BootDeps {   // defaults are the real engine functions; tests inject fakes
  createRenderer(): ThreeRenderer
  attachRenderer(renderer: ThreeRenderer, canvas: HTMLCanvasElement): Promise<CanvasRenderer>
  startLoopDriver(loop: GameLoop, onHidden?: () => void): LoopDriver
}

export function bootGame(setup: GameSetup, deps?: BootDeps): void
```

**What `bootGame` does, in order:**

1. Look up `#app`; throw if missing.
2. Create the cleanup stack and a `dispose()` wrapper that catches and logs
   cleanup-callback failures (so the original boot error stays the user-facing
   cause). Wire `beforeunload → dispose` and defer its removal.
3. Inside one `try`:
   - Create `canvas` and `#overlays`; append to `app`; defer removal.
   - `renderer = deps.createRenderer()` (defer `port.dispose()`);
     `canvasRenderer = await deps.attachRenderer(renderer, canvas)` (defer
     `dispose()`).
   - `const hooks = await setup(ctx)`.
   - Build `GameLoop` as `{ fixedUpdate: hooks.fixedUpdate, render: (a, dt) => {
     hooks.render(a, dt); canvasRenderer.renderFrame() } }`.
   - `const loopDriver = deps.startLoopDriver(loop, hooks.onHidden)`; defer
     `stop()`.
   - If `hooks.onEscape`, attach a `keydown` listener filtered to
     `key === 'Escape'`; defer removal.
   - `hooks.onStarted?.()`.
4. `catch (error)`: `dispose()` then `app.replaceChildren(bootError(error))`.

**Why exactly these hooks:** `fixedUpdate`/`render` are the loop steps the
shell can't know. `onHidden` carries the genuine tab-hidden policy difference.
`onEscape`'s direction depends on game state, so the game owns it; the shell
owns only the listener + filter + cleanup. `onStarted` is the post-wire kick —
monkey-ball dispatches `bootCompleted` there (its current code does this last,
after the loop starts); pulsebreak and the scaffold omit it. Nothing else is a
hook because everything else lives inside `setup`.

`bootGame` returns `void` (fire-and-forget, as the games call it today); its
own async work is self-contained and terminates in the `catch`.

## The two supporting primitives

Both are used *inside* `setup`, never forced by the shell.

```ts
export interface ProjectReader {
  readText(path: string): Promise<string>  // → project/${path}, resolved vs document.baseURI
  fetchText(url: string): Promise<string>   // → url, resolved vs document.baseURI
}
export function createProjectReader(): ProjectReader

export function mountAudio(
  ctx: Pick<BootContext, 'overlays' | 'cleanup'>,
  register: (audio: AudioPort) => void
): BrowserAudio  // { audio, resume, dispose }
```

- **`createProjectReader`** wraps engine's `fetchTextViaFetch()` but resolves
  every path against `document.baseURI` via `new URL(...)`. `readText` prepends
  `project/` and is the `ProjectFileReader`-shaped reader the games'
  `loadXProject` calls; `fetchText` is the escape hatch monkey-ball feeds to
  `createLoader` for `data/archetypes/standard.yaml`. Both throw on `!ok`
  (inherited from `fetchTextViaFetch`).
- **`mountAudio`** does the cluster both real games repeat: `createBrowserAudio()`
  (defer `dispose`), `register(audio)`, resume-on-first-`pointerdown` (once,
  deferred), and overlay-click → `play('uiClick')` for clicks that hit a
  `button` (deferred). Returns the `BrowserAudio` so the game sets volume its
  own way. The scaffold's beacon game never calls it.

## Migration

- **Scaffold template** (`tools/scaffold/src/templates/srcFiles.ts`, `mainTs`):
  regenerate to `bootGame(async (ctx) => …)` + `createProjectReader`. The beacon
  game ignores overlays/audio/pause; its `keyboardControl` is wired to defer its
  listeners on `ctx.cleanup`. `npm run verify:new-game` is the acceptance gate.
- **monkey-ball** (`src/main.ts`): collapse the spine (~lines 38–96) into the
  shell. `setup` builds the reader (`createProjectReader`, plus
  `createLoader(reader.fetchText)` for the archetype library), store,
  `mountAudio` + reactive volume via `subscribeSelector`, physics, the
  level-session enter/leave machinery, and the sceneManager; it
  returns `{ fixedUpdate, render, onEscape, onHidden: () => dispatch(paused),
  onStarted: () => dispatch(bootCompleted) }`. One small edit to
  `src/scenes/boot.ts`: the archetype path `/data/archetypes/standard.yaml`
  becomes base-relative `data/archetypes/standard.yaml`, loaded via
  `reader.fetchText`.
- **pulsebreak** (`src/main.ts`): same collapse. `setup` builds reader →
  `loadPulsebreakProject`, store, `mountAudio` + `setMasterVolume(0.7)`, joystick
  inputs, seed, gameplay, hud, `reflectChrome`, and the sceneManager; it returns
  `{ fixedUpdate, render, onEscape, onHidden: () => { if (playing) dispatch(paused) } }`.
- The identical `bootError` helper is **deleted from both games** and lives once
  in `boot.ts`.

## Error handling

The rollback spine is centralized in `bootGame`. `dispose()` runs the cleanup
stack, catching and logging any cleanup-callback failure so that the original
boot error remains the user-facing cause (preserving monkey-ball's documented
semantics). On any failure during boot, the partially-acquired resources are
rolled back in reverse acquisition order and `bootError(error)` replaces the
`#app` contents. If `#app` itself is missing, `bootGame` throws (there is no
container to render into) — matching today's behavior.

## Testing

AGENTS.md keeps browser shims thin and untested; P4's win is moving logic *out*
of untested `main.ts` into tested game-kit units.

- **`createProjectReader`** — unit test with a fake `fetch` and a stubbed
  `baseURI`: asserts it builds `project/foo`, resolves correctly under a
  non-root base, and throws on `!ok`.
- **`mountAudio`** — jsdom test with a fake `AudioPort`: asserts `register` is
  called, the first `pointerdown` resumes, a `button` click inside `overlays`
  plays `uiClick`, and `cleanup.dispose()` removes listeners and disposes.
- **`bootGame`** — driven with injected `deps` (fake renderer / attach / loop
  driver) in jsdom, asserting the payoff cases: a throwing `setup` runs
  `dispose` and mounts `bootError` into `#app`; the loop's `render` calls
  `canvasRenderer.renderFrame()`; `onHidden` and `onEscape` fire through their
  wiring; teardown runs in reverse order. The `deps` parameter exists so the
  bug-prone rollback centerpiece is covered for a 3-field injection surface;
  production callers pass no `deps` and get the real engine functions.

All gated by `npm run ci`; `npm run coverage` when engine-adjacent tests move.

## Rejected alternatives

- **One orchestrator owns everything** (audio, inputs, scenes, project loading
  via config fields). Smallest `main.ts`, but the shell would assume it owns
  inputs — monkey-ball recreates inputs per level-session, so it fights the
  shape and needs escape hatches. Rejected: leaky config, poor fit for the
  hardest consumer.
- **Pure composable primitives, no orchestrator** (`mountAppShell`,
  `runGameLoop`, `wirePauseControls`, …; each game assembles them). Most
  flexible, each piece testable — but the `try/catch → dispose → bootError`
  rollback, the most-duplicated and bug-prone part, stays copied in every
  `main.ts`. Rejected: fails the core goal.
- **A shared input primitive** (`mountControls`). Inputs genuinely differ:
  monkey-ball builds `[keyboard, virtualJoystick]` per level-session with a
  settings-driven side; pulsebreak builds them once globally; the scaffold uses
  a different `keyboardControl` returning `SimControl` directly. Deferred as
  YAGNI; inputs stay game-owned in `setup`.

## Decisions log (as agreed)

- **D1 — Scope:** migrate all three consumers (scaffold + monkey-ball +
  pulsebreak). Strongest proof the boundary fits both the minimal beacon game
  and the two divergent real games.
- **D2 — Unify vs preserve:** unify latent bugs (project-reader base path),
  hook genuine choices (pause policy, audio volume). "Shell owns plumbing, game
  owns policy."
- **D3 — Shell shape:** hybrid — `bootGame` spine + one `setup(ctx)` callback +
  small primitives.
- **D4 — `onStarted` hook:** included as the home for monkey-ball's
  `bootCompleted` kick (faithful ordering: after the loop starts).
- **D5 — Input primitive:** out of scope (YAGNI).
- **D6 — `bootGame` testing:** test the spine via optional `deps` injection
  (default real), rather than leaving it a thin untested shim.

## Plan handoff

Detailed step-by-step lives in the plan under
`docs/superpowers/plans/`. On merge, update `docs/ROADMAP.md`: move the P4 row
and the Phase 0 P4 task to `Shipped` with the merge commit, and update the
cross-cutting P4 section.
