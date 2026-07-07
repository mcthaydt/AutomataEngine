# `@automata/game-kit` — shared game-shell layer

Status: approved design. Date: 2026-06-27.

## Motivation

Two games now sit on `@automata/engine`: `monkey-ball` and `pulsebreak`.
Building the second surfaced a layer the engine deliberately does not provide —
a "game shell" of browser/UI plumbing — that each game currently re-derives by
copy-paste. Several files are byte-for-byte identical across the two games:

- `ui/view.ts` — the `View` interface
- `ui/dom.ts` — `panel` / `button` / `staticView`
- `audio/browserAudio.ts` — WebAudio runtime with silent fallback
- the `overlayScene` closure inside each `main.ts`

The engine's charter stops at pure mechanism + ports (see `AGENTS.md`), so this
shared shell has no home and gets duplicated. This design introduces a leaf
package to hold it, and lays out a phased path toward lower-friction game
authoring.

## Goals

- Extract the proven-duplicated shell into one tested package; both games
  consume it and delete their copies.
- Preserve every existing gate: `npm run ci`, `npm run coverage` (90% lines +
  branches), `npm run build`, `npm run e2e` stay green.
- Deliver two follow-on workflow improvements (auto coverage + `new-game`
  scaffold, then testing primitives) as subsequent phased commits in the same
  effort.

## Non-goals

- No changes to `@automata/engine` itself.
- No extraction of game-specific code (RNG, enemy/wave logic, systems, stores).
- No deduplication of `main.ts` — it is the sanctioned untested browser shim and
  legitimately varies per game.

## Boundary & placement

New leaf at `packages/game-kit/` named `@automata/game-kit`.

- **Depends on:** `@automata/engine` (including `@automata/engine/browser`).
- **Never imports:** any game (`monkey-ball`, `pulsebreak`), `@automata/editor`,
  or third-party engine deps (`three`, `@dimforge/*`, `miniplex`, …) directly —
  it goes through the engine exactly as games do.
- **Consumed by:** `games/*`. The games' existing ESLint block already permits
  `@automata/*` imports, so no change is needed on the game side.

ESLint gains a `packages/game-kit/**/*.ts` block that (a) forbids the
third-party engine deps (reuse the same `group` the games use) and (b) forbids
importing `monkey-ball`, `pulsebreak`, `level-editor`, `@automata/editor`.

Package config mirrors the existing leaves: `type: module`, `exports` map,
`tsconfig` extending the base with `lib: ES2022, DOM, DOM.Iterable`, and a
Vitest project (`name: game-kit`, `environment: happy-dom`).

## Phase 1 — the kit (execute now)

Only the verbatim-identical, cleanly-testable units move. Anything generic but
*shaped* is deferred (see "Deferred").

### Exports (`@automata/game-kit`)

| Export | Signature | Replaces |
| --- | --- | --- |
| `View` | `{ element: HTMLElement; dispose(): void }` | each game's `ui/view.ts` |
| `panel` | `(className: string) => HTMLElement` (adds `overlay <class>`) | each game's `ui/dom.ts` |
| `button` | `(label: string, className: string, onClick: () => void) => HTMLButtonElement` | ″ |
| `staticView` | `(element: HTMLElement) => View` | ″ |
| `createBrowserAudio` | `(createContext?: () => AudioContext) => { audio: AudioPort; resume(): void; dispose(): void }` | each game's `audio/browserAudio.ts` |
| `createOverlayScene` | `<Id extends PropertyKey>(overlays: HTMLElement, make: () => View) => Scene<Id>` | the `overlayScene` closure in each `main.ts` |

`createOverlayScene` generalizes the closure both games inline today: on
`onEnter` it calls `make()` and appends the view's element to the supplied
`overlays` container; on `onExit` it disposes the view and clears the reference.
It is parameterized by scene id to satisfy the engine's `Scene<Id>` type.

### Migration

Repoint imports (verified against current source) and delete the moved files:

- **monkey-ball:** `ui/dom.ts` + `ui/view.ts` deleted. `dom` consumers:
  `ui/levelSelect`, `ui/menu`, `ui/overlays`. `view` consumers: `main`,
  `ui/levelSelect`, `ui/menu`, `ui/overlays`. `browserAudio` consumer: `main`.
  `main` adopts `createOverlayScene`.
- **pulsebreak:** `ui/dom.ts` + `ui/view.ts` deleted. `dom` consumers:
  `ui/title`, `ui/overlays`, `ui/upgrade`. `view` consumers: `main`, `ui/title`,
  `ui/overlays`, `ui/hud`, `ui/upgrade`. `browserAudio` consumer: `main`.
  `main` adopts `createOverlayScene`.

### Tests & coverage

- Move the `dom` and `browserAudio` tests into the kit (the games' UI component
  tests continue to exercise the same code through the new import path). Add a
  focused `createOverlayScene` test (mount on enter / dispose on exit, in
  happy-dom). Delete the now-redundant game-level copies
  (`pulsebreak/tests/ui/dom.test.ts`; both `tests/audio/browserAudio.test.ts`).
- Add `packages/game-kit/src/**` to the root `vitest.config.ts` coverage
  `include`. The kit's units reach 100% on their own tests plus the games' usage.
- **Coverage bonus:** consolidating `browserAudio` lets a single no-argument
  `createBrowserAudio()` test exercise the `() => new AudioContext()` default
  parameter via the fallback path under happy-dom — a branch currently uncovered
  in *both* games.

### Deferred (revisit on convergence or a 3rd game)

- The `feedback` drain (`createFeedback`): the *mechanism* is identical but it
  reads a game-specific `ctx`/table; a generic version needs generics over ctx
  plus an injected table. Shaped, not identical — defer.
- The `gameplay.ts` fixed-loop shell (scene-guarded `fixedUpdate`, alpha-pin
  `render`): same reasoning.

## Phase 2 — authoring workflow

Make the *next* game cheap to stand up:

- **Auto-derive coverage include.** Replace the hand-maintained `include` array
  with globs (`packages/*/src/**`, `games/*/src/**`, `tools/*/src/**`) so new
  packages are counted automatically. **Constraint:** the current list omits
  `tools/level-editor` (an app shell intentionally excluded), so a naive glob
  would add it and drop the gate. Phase 2 must reproduce today's *effective*
  file set — glob plus explicit app-shell excludes — and be validated by diffing
  the covered-file list (e.g. the coverage JSON) before and after.
- **`new-game` scaffold.** A script (npm script or `tools/` generator) that
  emits a game package skeleton (the six config/boot files) and wires the root
  `package.json` scripts, coverage, and `playwright.config.ts` web server,
  removing the "forgot to wire it in" failure mode.

## Phase 3 — testing primitives

A `@automata/game-kit/testing` entry with generic helpers: an input `stick(v)`
stub and a Null renderer/audio runtime bundle. **Limitation:** a full
`playingCtx` cannot be fully generic — it references each game's `Entity`/store —
so the per-game ctx builder stays, merely built on these primitives. Scope is
therefore modest: generic primitives only, with each game's ctx builder rebuilt
on top.

## Verification

Each phase is one independently shippable commit, validated by:

- `npm run ci` (lint + typecheck all workspaces + full test run)
- `npm run coverage` (≥90% lines + branches, repo-wide)
- `npm run build` (all apps)
- `npm run e2e` (both game smokes) — Phase 1 only, since it touches `main.ts`

## Risks

- **Migration regressions in the shipped game.** Mitigated by the existing CI,
  coverage, and e2e gates running on every phase; Phase 1 changes are mechanical
  import repoints.
- **Coverage denominator shifts** when files move packages. Mitigated by moving
  tests with code and re-running the coverage gate.
- **Over-abstraction.** Mitigated by restricting Phase 1 to verbatim-identical
  units and explicitly deferring shaped-but-not-identical code.

## Rollout

All three phases execute in this effort, each as its own commit behind the gates:

1. Phase 1: create kit, migrate both games, delete dupes, wire coverage.
2. Phase 2: coverage auto-glob + `new-game` scaffold.
3. Phase 3: testing primitives, adopted by both games' tests.
