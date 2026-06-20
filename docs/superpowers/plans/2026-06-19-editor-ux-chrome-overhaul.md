# Editor UX / Chrome Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the editor's three floating panels with a cohesive, BUILD-style docked shell (menu · tool palette · dual viewport · inspector + outliner · status bar) wearing a "Slate Pro" skin, with a fixed inspector, explicit tool state, adjustable snap, and a live, swappable 3D inset over a 2D-primary map.

**Overall Progress:** 80% (56/70 steps complete)

**Architecture:** All chrome is **generic** (game-agnostic, driven by `GameDefinition` + the editor store) and lives in `packages/editor/src/ui/`, fully unit-tested in happy-dom. A new `ui` store slice holds `snap` / `primaryView` / `insetVisible`. The host app `tools/level-editor` stays a thin browser shim that mounts the chrome, hands it the two canvases, wires pointer/keyboard, and runs the loop. Cursor coordinates bypass the store (high-frequency) and update the status bar directly.

**Tech Stack:** TypeScript strict, Vitest (happy-dom for editor), the engine's `combineReducers`/`createStore`, Vite. No new third-party dependencies. No new engine `RenderPort` methods.

**Spec:** `docs/superpowers/specs/2026-06-19-editor-ux-chrome-overhaul-design.md`.

## Global Constraints

Copied from the spec / parent plan; every task's requirements implicitly include these.

- **Dependency direction (lint-enforced):** `editor → engine` only. The editor core never imports `monkey-ball` and imports no third-party libs directly. The host app `tools/level-editor` is the only module importing both `@automata/editor` and `monkey-ball`.
- **Editor litmus test** (review gate on every editor-core change): *"Would a platformer's or top-down racer's editor use this API unchanged?"* Zero ball/banana/tilt/goal/spawn concepts in the editor core or chrome. Labels come from `Brush.label`; item names from `brushOf(...)?.label`.
- **Engine litmus test:** the only engine change here is an **optional** element-sizing mode on the existing `attachCanvasRenderer` browser shim (no `RenderPort` change).
- **Coverage gate:** 90% lines and branches on non-shim code across `packages/engine/src/**` and `packages/editor/src/**`. Browser shims (`**/browser.ts`), barrels (`**/index.ts`), and `**/version.ts` are excluded; the host app `tools/level-editor/src/main.ts` is not in the coverage include.
- **Browser-only shims are untested**, kept trivially thin: `tools/level-editor/src/main.ts`, `packages/engine/src/render/browser.ts`, `packages/editor/src/viewport3d/browser.ts`, `packages/editor/src/viewport2d/browser.ts`.
- **TDD throughout:** red-green-refactor; tests written first; run before any green claim.
- **Run the gate per task:** `npx vitest run <file>` for the task's tests, then `npm run typecheck`. Full `npm run ci` at the final checkpoint.
- **Commands run from repo root:** `/Users/mcthaydt/Desktop/AutomataEngine`.

## Conventions used throughout

- Editor tests run in **happy-dom** (package default); `document` is a global.
- Each generic UI panel exports `mountX(core, parent) → PanelHandle<Doc>` where `PanelHandle<Doc> = { update(state): void; dispose(): void }`. The chrome holds the single `store.subscribe` and fans `update(state)` out to every panel — panels never subscribe themselves.
- Class names are prefixed `ed-`; tests target stable `data-*` attributes.
- Test editors are built via the shared harness `packages/editor/tests/fixtures/editorHarness.ts` (Task 3).

## File Structure

```
packages/editor/src/
  state/ui.ts            NEW  — { snap, primaryView, insetVisible } slice + PrimaryView
  state/actions.ts       EDIT — add setSnap / setPrimaryView / toggleInset
  state/store.ts         EDIT — compose `ui` into EditorState
  grid.ts                EDIT — snapToGrid treats cell <= 0 as identity ("snap off")
  host.ts                EDIT — placeAt/moveSelectionTo read ui.snap (drop const 0.5)
  ui/theme.css.ts        NEW  — Slate Pro stylesheet + injectTheme
  ui/panel.ts            NEW  — PanelHandle<Doc> type
  ui/palette.ts          NEW  — Select tool + grouped brushes, active glow
  ui/inspectorView.ts    NEW  — rounded display, steppers, grouped Transform/Size
  ui/outliner.ts         NEW  — item list, select/delete, missing-required warning
  ui/statusbar.ts        NEW  — coords / snap / selection / validation / tool
  ui/viewportRegion.ts   NEW  — primary + inset canvas placement, swap / hide
  ui/menubar.ts          NEW  — File / Edit / View menus
  ui/chrome.ts           NEW  — composes the shell; one subscription; EditorChromeHandle
  ui/panels.ts           DELETE — superseded by chrome + modules above
  index.ts               EDIT — export ./ui/chrome + ./ui/theme.css; drop ./ui/panels

packages/engine/src/
  render/browser.ts      EDIT — attachCanvasRenderer(opts?: { sizeTo?: 'window'|'element' })

packages/editor/tests/
  state/ui.test.ts                 NEW
  grid.test.ts                     EDIT (add cell<=0 case)
  hostTools.test.ts                EDIT (add snap cases)
  ui/theme.test.ts                 NEW
  ui/palette.test.ts               NEW
  ui/inspectorView.test.ts         NEW
  ui/outliner.test.ts              NEW
  ui/statusbar.test.ts             NEW
  ui/viewportRegion.test.ts        NEW
  ui/menubar.test.ts               NEW
  ui/chrome.test.ts                NEW
  ui/panels.test.ts                DELETE
  fixtures/editorHarness.ts        NEW

tools/level-editor/
  src/main.ts            EDIT — mount chrome, parent canvases, wire input/loop
  src/viewTabs.ts        DELETE — superseded by viewportRegion + menubar swap
  tests/viewTabs.test.ts DELETE
  tests/layout.test.ts   REWRITE — assert minimal host shell
  index.html             EDIT — reset + #app only
```

---

## Task 1: `ui` store slice (snap / primaryView / insetVisible)

**Files:**
- Create: `packages/editor/src/state/ui.ts`
- Modify: `packages/editor/src/state/actions.ts`
- Modify: `packages/editor/src/state/store.ts`
- Test: `packages/editor/tests/state/ui.test.ts`

**Interfaces:**
- Produces: `PrimaryView = '2d' | '3d'`; `UiState = { snap: number; primaryView: PrimaryView; insetVisible: boolean }`; `initialUi`; `uiReducer(state, action): UiState`; actions `{ type: 'setSnap'; snap: number }`, `{ type: 'setPrimaryView'; view: PrimaryView }`, `{ type: 'toggleInset' }`; `EditorState<Doc>` gains `ui: UiState`.
- Consumes: `EditorAction`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/state/ui.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { initialUi, uiReducer } from '../../src/state/ui'

describe('ui slice', () => {
  it('defaults to 0.5 snap, 2d primary, inset visible', () => {
    expect(initialUi).toEqual({ snap: 0.5, primaryView: '2d', insetVisible: true })
  })
  it('sets snap, primary view, and toggles the inset', () => {
    let s = uiReducer(initialUi, { type: 'setSnap', snap: 1 })
    expect(s.snap).toBe(1)
    s = uiReducer(s, { type: 'setPrimaryView', view: '3d' })
    expect(s.primaryView).toBe('3d')
    s = uiReducer(s, { type: 'toggleInset' })
    expect(s.insetVisible).toBe(false)
  })
  it('ignores unrelated actions', () => {
    expect(uiReducer(initialUi, { type: 'undo' })).toBe(initialUi)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/state/ui.test.ts`
Expected: FAIL — cannot resolve `../../src/state/ui`.

- [x] **Step 3: Create the slice**

`packages/editor/src/state/ui.ts`:
```ts
import type { EditorAction } from './actions'

export type PrimaryView = '2d' | '3d'

export interface UiState {
  snap: number
  primaryView: PrimaryView
  insetVisible: boolean
}

export const initialUi: UiState = { snap: 0.5, primaryView: '2d', insetVisible: true }

export function uiReducer(state: UiState, action: EditorAction): UiState {
  switch (action.type) {
    case 'setSnap':
      return { ...state, snap: action.snap }
    case 'setPrimaryView':
      return { ...state, primaryView: action.view }
    case 'toggleInset':
      return { ...state, insetVisible: !state.insetVisible }
    default:
      return state
  }
}
```

- [x] **Step 4: Add the actions**

In `packages/editor/src/state/actions.ts`, add the import and three union members:
```ts
import type { SceneCommand, Surface } from '../model/types'
import type { PrimaryView } from './ui'
```
```ts
  | { type: 'setSnap'; snap: number }
  | { type: 'setPrimaryView'; view: PrimaryView }
  | { type: 'toggleInset' }
```
(Append the three members inside the existing `EditorAction` union.)

- [x] **Step 5: Compose the slice into the store**

In `packages/editor/src/state/store.ts`:
- add `import { initialUi, uiReducer, type UiState } from './ui'`;
- add `ui: UiState` to `EditorState<Doc>`;
- add `ui: uiReducer` to the `combineReducers` map;
- add `ui: initialUi` to the `initial` object.

- [x] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/editor/tests/state/ui.test.ts packages/editor/tests/state/store.test.ts`
Expected: PASS (existing store tests still green — `ui` is additive).

- [x] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): ui store slice for snap/primaryView/insetVisible"
```

---

## Task 2: Snap hardening + thread snap through the host core

**Files:**
- Modify: `packages/editor/src/grid.ts`
- Modify: `packages/editor/src/host.ts`
- Test: `packages/editor/tests/grid.test.ts` (add a case)
- Test: `packages/editor/tests/hostTools.test.ts` (add cases)

**Interfaces:**
- Consumes: `state.ui.snap` (Task 1); `snapVec3XZ`.
- Produces: `snapToGrid(value, cell)` returns `value` unchanged when `cell <= 0`; `EditorCore.placeAt` / `moveSelectionTo` snap by `state.ui.snap`.

- [x] **Step 1: Write the failing tests**

Append to `packages/editor/tests/grid.test.ts` inside the `describe('grid snap', …)` block:
```ts
  it('treats a non-positive cell as no snap (snap "off")', () => {
    expect(snapToGrid(1.2345, 0)).toBe(1.2345)
    expect(snapVec3XZ({ x: 1.2345, y: 2, z: -3.7 }, 0)).toEqual({ x: 1.2345, y: 2, z: -3.7 })
  })
```

Append to `packages/editor/tests/hostTools.test.ts` inside the `describe('host tools', …)` block:
```ts
  it('places using the active snap increment', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'setSnap', snap: 1 })
    editor.store.dispatch({ type: 'setTool', tool: { brushId: 'box', mode: 'place' } })
    editor.placeAt({ x: 1.4, y: 0, z: 2.6 })
    const item = renderDefinition.scene.listItems(editor.store.getState().document.doc)[0]!
    expect(item.transform.position).toEqual({ x: 1, y: 0, z: 3 })
    editor.dispose()
  })

  it('moves to the exact point when snap is off', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'setSnap', snap: 0 })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.moveSelectionTo({ x: 4.37, y: 0, z: 5.12 })
    const item = renderDefinition.scene.listItems(editor.store.getState().document.doc)[0]!
    expect(item.transform.position).toEqual({ x: 4.37, y: 0, z: 5.12 })
    editor.dispose()
  })
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/editor/tests/grid.test.ts packages/editor/tests/hostTools.test.ts`
Expected: FAIL — `snapToGrid(1.2345, 0)` returns `NaN`; the place/move cases use the old fixed `0.5`.

- [x] **Step 3: Harden the grid math**

In `packages/editor/src/grid.ts`, replace `snapToGrid`:
```ts
export function snapToGrid(value: number, cell: number): number {
  if (cell <= 0) return value
  return Math.round(value / cell) * cell
}
```

- [x] **Step 4: Thread snap through the host core**

In `packages/editor/src/host.ts`:
- add `import { snapVec3XZ } from './grid'`;
- delete the line `const GRID_CELL = 0.5`;
- in `placeAt`, change the placement call to use the live snap:
```ts
      const command = placementCommand(definition, items, brush, world, state.ui.snap)
```
- in `moveSelectionTo`, snap the target before computing the delta:
```ts
    moveSelectionTo(world) {
      const state = store.getState()
      const [anchorId] = state.selection
      if (!anchorId) return
      const items = definition.scene.listItems(state.document.doc)
      const anchor = items.find((item) => item.id === anchorId)
      if (!anchor) return
      const target = snapVec3XZ(world, state.ui.snap)
      const position = anchor.transform.position
      store.dispatch({
        type: 'command',
        command: {
          type: 'moveSelected',
          ids: state.selection,
          delta: { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z }
        }
      })
    },
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/editor/tests/grid.test.ts packages/editor/tests/hostTools.test.ts`
Expected: PASS (including the pre-existing host-tool cases — default snap `0.5` keeps their integer points unchanged).

- [x] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): snap 'off' support + live snap in placeAt/moveSelectionTo"
```

---

## Task 3: UI foundation — Slate Pro theme, PanelHandle, test harness

**Files:**
- Create: `packages/editor/src/ui/theme.css.ts`
- Create: `packages/editor/src/ui/panel.ts`
- Create: `packages/editor/tests/fixtures/editorHarness.ts`
- Test: `packages/editor/tests/ui/theme.test.ts`

**Interfaces:**
- Produces: `THEME_STYLE_ID`; `SLATE_PRO_CSS`; `injectTheme(doc?): () => void` (idempotent by id; the disposer removes the style only if this call created it); `PanelHandle<Doc> = { update(state): void; dispose(): void }`; test helpers `nullPhysics()`, `makeTestEditor()`.
- Consumes: `EditorState` (Task 1 shape); `renderDefinition`, `FakeDoc` from `fixtures/fakeDefinition`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/theme.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { THEME_STYLE_ID, injectTheme } from '../../src/ui/theme.css'

describe('Slate Pro theme', () => {
  it('injects one stylesheet and removes it on dispose', () => {
    const dispose = injectTheme(document)
    expect(document.getElementById(THEME_STYLE_ID)).not.toBeNull()
    const second = injectTheme(document)
    expect(document.querySelectorAll(`#${THEME_STYLE_ID}`)).toHaveLength(1)
    second() // no-op: did not create the element
    expect(document.getElementById(THEME_STYLE_ID)).not.toBeNull()
    dispose()
    expect(document.getElementById(THEME_STYLE_ID)).toBeNull()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/theme.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/theme.css`.

- [x] **Step 3: Create the PanelHandle type**

`packages/editor/src/ui/panel.ts`:
```ts
import type { EditorState } from '../state/store'

/** A chrome sub-panel: the chrome owns the store subscription and calls update(). */
export interface PanelHandle<Doc> {
  update(state: EditorState<Doc>): void
  dispose(): void
}
```

- [x] **Step 4: Create the theme**

`packages/editor/src/ui/theme.css.ts`:
```ts
export const THEME_STYLE_ID = 'editor-slate-pro'

export const SLATE_PRO_CSS = `
.ed-root {
  --bg: #11151d; --panel: #1a202c; --panel-2: #222a3a; --edge: #0d1019;
  --bevel: #36425c; --ink: #cdd6e6; --ink-dim: #8b96b0; --accent: #e0a83e; --ok: #7ed957; --bad: #ff7a7a;
  position: fixed; inset: 0; display: grid; grid-template-rows: auto 1fr auto;
  background: var(--bg); color: var(--ink);
  font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  user-select: none;
}
.ed-root button { font: inherit; color: var(--ink); cursor: pointer; }
.ed-menubar { display: flex; gap: 2px; align-items: stretch; padding: 2px 6px;
  background: #1e2433; box-shadow: inset 0 1px 0 var(--bevel); z-index: 5; }
.ed-menu { position: relative; }
.ed-menu-title { background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 4px 10px; }
.ed-menu-title:hover { background: var(--panel-2); }
.ed-menu-drop { position: absolute; top: 100%; left: 0; min-width: 190px; display: none;
  flex-direction: column; padding: 4px; gap: 1px; background: var(--panel);
  border: 1px solid var(--edge); border-radius: 6px; box-shadow: 0 12px 28px rgba(0,0,0,.5); z-index: 6; }
.ed-menu.is-open .ed-menu-drop { display: flex; }
.ed-menu-item { display: flex; justify-content: space-between; gap: 24px; background: transparent;
  border: 0; border-radius: 4px; padding: 5px 8px; text-align: left; }
.ed-menu-item:hover:not(:disabled) { background: var(--panel-2); }
.ed-menu-item:disabled { color: #54607a; cursor: default; }
.ed-menu-sc { color: var(--ink-dim); }

.ed-body { display: flex; min-height: 0; }
.ed-palette-host { width: 132px; display: flex; flex-direction: column; gap: 6px; padding: 8px;
  background: var(--panel); box-shadow: inset -1px 0 0 #2a3346; overflow: auto; }
.ed-palette { display: flex; flex-direction: column; gap: 4px; }
.ed-group-label { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-dim); margin-top: 4px; }
.ed-tool { display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 6px 8px; background: var(--panel-2); border: 1px solid #2f394e; border-radius: 5px;
  box-shadow: inset 0 1px 0 var(--bevel); }
.ed-tool.is-active { background: var(--accent); color: #1a130a; border-color: #f3c25e;
  box-shadow: 0 0 8px rgba(224,168,62,.5); }

.ed-viewport { position: relative; flex: 1; min-width: 0; background: #0b0e15; }
.ed-vp-main { position: absolute; inset: 0; }
.ed-vp-inset { position: absolute; right: 10px; bottom: 10px; width: 30%; height: 34%;
  border: 1px solid #2a3346; border-radius: 6px; overflow: hidden; box-shadow: 0 8px 22px rgba(0,0,0,.55); }
.ed-vp-inset.is-hidden { display: none; }
.ed-vp-canvas { display: block; width: 100%; height: 100%; }
.ed-vp-swap, .ed-vp-hide { position: absolute; top: 4px; width: 22px; height: 22px; padding: 0;
  background: rgba(11,14,21,.85); border: 1px solid #2a3346; border-radius: 4px; z-index: 2; }
.ed-vp-swap { right: 30px; } .ed-vp-hide { right: 4px; }

.ed-rightcol { width: 230px; display: flex; flex-direction: column; gap: 8px; padding: 8px;
  background: var(--panel); box-shadow: inset 1px 0 0 #2a3346; overflow: auto; }
.ed-panel { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 6px; overflow: hidden; }
.ed-panel-head { font-size: 9px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-dim);
  padding: 6px 8px; background: #1f2738; border-bottom: 1px solid var(--edge); }
.ed-field-group { display: flex; flex-direction: column; }
.ed-field { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 6px; padding: 3px 8px; }
.ed-field-label { color: var(--accent); font-weight: 600; }
.ed-field-num { width: 100%; min-width: 0; box-sizing: border-box; padding: 3px 5px;
  background: #11151d; color: var(--ink); border: 1px solid #3a455f; border-radius: 4px;
  font-variant-numeric: tabular-nums; }
.ed-stepper { display: flex; flex-direction: column; }
.ed-stepper button { line-height: 1; padding: 0 4px; background: #11151d; border: 1px solid #3a455f; border-radius: 3px; font-size: 8px; }
.ed-hint { color: var(--ink-dim); padding: 6px 8px; font-style: italic; }

.ed-outliner .ed-item-list { display: flex; flex-direction: column; }
.ed-item { display: flex; align-items: center; justify-content: space-between; padding: 2px 6px; }
.ed-item.is-selected { background: #243049; }
.ed-item-label { flex: 1; text-align: left; background: transparent; border: 0; padding: 3px 2px; }
.ed-item-del { background: transparent; border: 0; opacity: .6; }
.ed-item-del:hover { opacity: 1; }
.ed-warn { color: var(--accent); padding: 5px 8px; font-size: 11px; }

.ed-statusbar { display: flex; align-items: center; gap: 14px; padding: 4px 10px;
  background: #1e2433; color: var(--ink-dim); box-shadow: inset 0 1px 0 var(--bevel); }
.ed-status-cell { font-variant-numeric: tabular-nums; }
.ed-snap { background: var(--panel-2); border: 1px solid #2f394e; border-radius: 4px; padding: 2px 8px; }
.ed-status-valid.is-invalid { color: var(--bad); } .ed-status-valid:not(.is-invalid) { color: var(--ok); }
.ed-status-tool { margin-left: auto; }
`

/** Injects the Slate Pro stylesheet once. Returns a disposer that removes it only if this call created it. */
export function injectTheme(doc: Document = document): () => void {
  if (doc.getElementById(THEME_STYLE_ID)) return () => {}
  const style = doc.createElement('style')
  style.id = THEME_STYLE_ID
  style.textContent = SLATE_PRO_CSS
  doc.head.append(style)
  return () => { style.remove() }
}
```

- [x] **Step 5: Create the test harness**

`packages/editor/tests/fixtures/editorHarness.ts`:
```ts
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor, type EditorCore } from '../../src/host'
import { renderDefinition, type FakeDoc } from './fakeDefinition'

export function nullPhysics(): PhysicsPort {
  return {
    addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
    readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }),
    applyImpulse() {}, setKinematicTarget() {},
    get bodyCount() { return 0 }, dispose() {}
  } as unknown as PhysicsPort
}

export function makeTestEditor(): EditorCore<FakeDoc> {
  return createEditor<FakeDoc>({
    definition: renderDefinition,
    render: createNullRenderer().port,
    physics: nullPhysics()
  })
}
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/editor/tests/ui/theme.test.ts`
Expected: PASS.

- [x] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): Slate Pro theme, PanelHandle type, test harness"
```

---

## Task 4: Tool palette panel

**Files:**
- Create: `packages/editor/src/ui/palette.ts`
- Test: `packages/editor/tests/ui/palette.test.ts`

**Interfaces:**
- Consumes: `EditorCore`, `PanelHandle`, `makeTestEditor`.
- Produces: `mountPalette(core, parent): PanelHandle<Doc>`. Renders a Select tool (`data-tool="select"`) and one `data-brush="<id>"` button per brush (geometry then archetypes+markers, each under an `.ed-group-label`); the active control carries `is-active` + `aria-pressed="true"` from `state.tool.selection`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/palette.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mountPalette } from '../../src/ui/palette'
import { makeTestEditor } from '../fixtures/editorHarness'

describe('palette panel', () => {
  it('renders Select + brushes and reflects the active tool', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountPalette(editor, host)

    expect(host.querySelector('[data-tool="select"]')).not.toBeNull()
    expect(host.querySelectorAll('[data-brush]').length).toBeGreaterThan(0)

    host.querySelector<HTMLButtonElement>('[data-brush="box"]')!.click()
    handle.update(editor.store.getState())
    expect(editor.store.getState().tool.selection).toEqual({ brushId: 'box', mode: 'place' })
    expect(host.querySelector('[data-brush="box"]')!.getAttribute('aria-pressed')).toBe('true')

    host.querySelector<HTMLButtonElement>('[data-tool="select"]')!.click()
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-tool="select"]')!.getAttribute('aria-pressed')).toBe('true')

    handle.dispose(); editor.dispose()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/palette.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/palette`.

- [x] **Step 3: Implement**

`packages/editor/src/ui/palette.ts`:
```ts
import type { EditorCore } from '../host'
import type { Brush } from '../model/types'
import type { EditorState } from '../state/store'
import type { PanelHandle } from './panel'

export function mountPalette<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-palette'
  parent.append(root)

  const selectBtn = document.createElement('button')
  selectBtn.type = 'button'
  selectBtn.className = 'ed-tool'
  selectBtn.dataset.tool = 'select'
  selectBtn.textContent = 'Select'
  selectBtn.title = 'Select (Q)'
  selectBtn.addEventListener('click', () =>
    core.store.dispatch({ type: 'setTool', tool: { brushId: null, mode: 'select' } }))
  root.append(selectBtn)

  const groups: Array<[string, Brush[]]> = [
    ['Geometry', core.definition.palette.geometry],
    ['Markers', [...core.definition.palette.archetypes, ...core.definition.palette.markers]]
  ]
  const brushButtons = new Map<string, HTMLButtonElement>()
  for (const [label, brushes] of groups) {
    if (brushes.length === 0) continue
    const head = document.createElement('div')
    head.className = 'ed-group-label'
    head.textContent = label
    root.append(head)
    for (const brush of brushes) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ed-tool'
      btn.dataset.brush = brush.id
      btn.textContent = brush.label
      btn.addEventListener('click', () =>
        core.store.dispatch({ type: 'setTool', tool: { brushId: brush.id, mode: 'place' } }))
      brushButtons.set(brush.id, btn)
      root.append(btn)
    }
  }

  function update(state: EditorState<Doc>): void {
    const { brushId, mode } = state.tool.selection
    const selectOn = mode === 'select'
    selectBtn.classList.toggle('is-active', selectOn)
    selectBtn.setAttribute('aria-pressed', String(selectOn))
    for (const [id, btn] of brushButtons) {
      const on = mode === 'place' && brushId === id
      btn.classList.toggle('is-active', on)
      btn.setAttribute('aria-pressed', String(on))
    }
  }

  update(core.store.getState())
  return { update, dispose() { root.remove() } }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/editor/tests/ui/palette.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): tool palette panel with active-tool state"
```

---

## Task 5: Inspector panel (rounded display + steppers + groups)

**Files:**
- Create: `packages/editor/src/ui/inspectorView.ts`
- Test: `packages/editor/tests/ui/inspectorView.test.ts`

**Interfaces:**
- Consumes: `inspectorFields`, `fieldCommand` (`packages/editor/src/tools/inspector.ts`); `EditorCore`, `PanelHandle`, `makeTestEditor`, `boxItem`.
- Produces: `mountInspector(core, parent): PanelHandle<Doc>`. Single-selection numeric fields render under `Transform` (`pos.*`) / `Size` (`size.*`,`radius`,`height`) groups; each numeric `input` is `data-field="<path>"`, displayed rounded to 2 dp, with `▲`/`▼` steppers (`data-step="up|down"`) that nudge by the active snap (or `0.25` when snap is off). An empty selection shows metadata fields plus an `.ed-hint`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/inspectorView.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { mountInspector } from '../../src/ui/inspectorView'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem } from '../fixtures/fakeDefinition'

describe('inspector panel', () => {
  it('renders messy floats rounded to 2 dp', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const messy = boxItem('a')
    messy.transform.position.x = -0.13216145833333348
    editor.store.dispatch({ type: 'loadDoc', doc: { title: 't', items: [messy] } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    const handle = mountInspector(editor, host)
    expect(host.querySelector<HTMLInputElement>('[data-field="pos.x"]')!.value).toBe('-0.13')
    handle.dispose(); editor.dispose()
  })

  it('steppers nudge by the active snap increment', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    editor.store.dispatch({ type: 'loadDoc', doc: { title: 't', items: [boxItem('a', 1, 0)] } })
    editor.store.dispatch({ type: 'select', ids: ['a'] }) // snap defaults to 0.5
    const handle = mountInspector(editor, host)
    const spy = vi.spyOn(editor.store, 'dispatch')
    host.querySelector<HTMLButtonElement>('[data-field="pos.x"] ~ .ed-stepper [data-step="up"]')!.click()
    expect(spy).toHaveBeenCalledWith({
      type: 'command',
      command: { type: 'setItemField', id: 'a', path: 'pos.x', value: 1.5 }
    })
    handle.dispose(); editor.dispose()
  })

  it('shows metadata + a hint when nothing is selected', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountInspector(editor, host)
    expect(host.querySelector('[data-field="title"]')).not.toBeNull()
    expect(host.querySelector('.ed-hint')).not.toBeNull()
    handle.dispose(); editor.dispose()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/inspectorView.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/inspectorView`.

- [x] **Step 3: Implement**

`packages/editor/src/ui/inspectorView.ts`:
```ts
import type { Field } from '../model/types'
import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import { fieldCommand, inspectorFields } from '../tools/inspector'
import type { PanelHandle } from './panel'

const TRANSFORM = new Set(['pos.x', 'pos.y', 'pos.z'])

function display(value: number | string): string {
  if (typeof value === 'string') return value
  return String(Math.round(value * 100) / 100)
}

function groupOf(field: Field): string {
  if (field.type !== 'number') return 'Metadata'
  return TRANSFORM.has(field.path) ? 'Transform' : 'Size'
}

export function mountInspector<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-inspector'
  parent.append(root)

  function fieldRow(state: EditorState<Doc>, field: Field, step: number): HTMLElement {
    const row = document.createElement('label')
    row.className = 'ed-field'
    const name = document.createElement('span')
    name.className = 'ed-field-label'
    name.textContent = field.label
    const input = document.createElement('input')
    input.className = 'ed-field-num'
    input.dataset.field = field.path
    input.value = display(field.value)
    const commit = (value: number | string): void =>
      core.store.dispatch({ type: 'command', command: fieldCommand(state.selection, field, value) })
    input.addEventListener('change', () =>
      commit(field.type === 'number' ? Number(input.value) : input.value))
    row.append(name, input)
    if (field.type === 'number') {
      const steppers = document.createElement('span')
      steppers.className = 'ed-stepper'
      const up = document.createElement('button')
      up.type = 'button'; up.dataset.step = 'up'; up.textContent = '▲'
      const down = document.createElement('button')
      down.type = 'button'; down.dataset.step = 'down'; down.textContent = '▼'
      up.addEventListener('click', () => commit(Number(field.value) + step))
      down.addEventListener('click', () => commit(Number(field.value) - step))
      steppers.append(up, down)
      row.append(steppers)
    }
    return row
  }

  function update(state: EditorState<Doc>): void {
    root.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ed-panel-head'
    const items = core.definition.scene.listItems(state.document.doc)
    if (state.selection.length === 1) {
      const item = items.find((candidate) => candidate.id === state.selection[0])
      head.textContent = item ? `${item.kind} · ${item.id}` : 'Inspector'
    } else if (state.selection.length > 1) {
      head.textContent = `${state.selection.length} selected`
    } else {
      head.textContent = 'Inspector'
    }
    root.append(head)

    const step = state.ui.snap > 0 ? state.ui.snap : 0.25
    const fields = inspectorFields(core.definition, state.document.doc, state.selection)
    let groupName = ''
    let group: HTMLDivElement | null = null
    for (const field of fields) {
      const name = groupOf(field)
      if (name !== groupName) {
        groupName = name
        const label = document.createElement('div')
        label.className = 'ed-group-label'
        label.textContent = name
        root.append(label)
        group = document.createElement('div')
        group.className = 'ed-field-group'
        root.append(group)
      }
      group!.append(fieldRow(state, field, step))
    }

    if (state.selection.length === 0) {
      const hint = document.createElement('p')
      hint.className = 'ed-hint'
      hint.textContent = 'Pick a tool and click the map to place — or click an item to select it.'
      root.append(hint)
    }
  }

  update(core.store.getState())
  return { update, dispose() { root.remove() } }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/editor/tests/ui/inspectorView.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): inspector panel with rounded display, steppers, groups"
```

---

## Task 6: Outliner panel

**Files:**
- Create: `packages/editor/src/ui/outliner.ts`
- Test: `packages/editor/tests/ui/outliner.test.ts`

**Interfaces:**
- Consumes: `brushOf`, `missingRequired` (`packages/editor/src/tools/cardinality.ts`); `EditorCore`, `PanelHandle`, `makeTestEditor`, `boxItem`.
- Produces: `mountOutliner(core, parent): PanelHandle<Doc>`. Renders one `data-item="<id>"` row per `listItems` item (label = `brushOf(...)?.label ?? kind`, selection-highlighted), a delete control `data-del="<id>"` (selects then `core.deleteSelected()`), and a `data-warn` banner listing `missingRequired` labels.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/outliner.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mountOutliner } from '../../src/ui/outliner'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem } from '../fixtures/fakeDefinition'

describe('outliner panel', () => {
  it('warns about missing required items', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountOutliner(editor, host)
    expect(host.querySelector('[data-warn]')!.textContent).toContain('Start')
    handle.dispose(); editor.dispose()
  })

  it('lists items, selects on click, and deletes', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    const handle = mountOutliner(editor, host)
    handle.update(editor.store.getState())

    host.querySelector<HTMLButtonElement>('[data-item="a"] .ed-item-label')!.click()
    expect(editor.store.getState().selection).toEqual(['a'])

    host.querySelector<HTMLButtonElement>('[data-del="a"]')!.click()
    expect(editor.definition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    handle.dispose(); editor.dispose()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/outliner.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/outliner`.

- [x] **Step 3: Implement**

`packages/editor/src/ui/outliner.ts`:
```ts
import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import { brushOf, missingRequired } from '../tools/cardinality'
import type { PanelHandle } from './panel'

export function mountOutliner<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-outliner'
  parent.append(root)

  function update(state: EditorState<Doc>): void {
    root.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ed-panel-head'
    head.textContent = 'Outliner'
    root.append(head)

    const items = core.definition.scene.listItems(state.document.doc)
    const missing = missingRequired(core.definition, items)
    if (missing.length > 0) {
      const warn = document.createElement('div')
      warn.className = 'ed-warn'
      warn.dataset.warn = ''
      warn.textContent = `Missing: ${missing.join(', ')}`
      root.append(warn)
    }

    const list = document.createElement('div')
    list.className = 'ed-item-list'
    root.append(list)
    for (const item of items) {
      const row = document.createElement('div')
      row.className = 'ed-item'
      row.dataset.item = item.id
      row.classList.toggle('is-selected', state.selection.includes(item.id))

      const label = document.createElement('button')
      label.type = 'button'
      label.className = 'ed-item-label'
      label.textContent = brushOf(core.definition, item)?.label ?? item.kind
      label.addEventListener('click', () => core.store.dispatch({ type: 'select', ids: [item.id] }))

      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'ed-item-del'
      del.dataset.del = item.id
      del.textContent = '🗑'
      del.addEventListener('click', () => {
        core.store.dispatch({ type: 'select', ids: [item.id] })
        core.deleteSelected()
      })

      row.append(label, del)
      list.append(row)
    }
  }

  update(core.store.getState())
  return { update, dispose() { root.remove() } }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/editor/tests/ui/outliner.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): outliner panel with select/delete + missing-required warning"
```

---

## Task 7: Status bar

**Files:**
- Create: `packages/editor/src/ui/statusbar.ts`
- Test: `packages/editor/tests/ui/statusbar.test.ts`

**Interfaces:**
- Consumes: `validateDoc` (`packages/editor/src/io/validation.ts`); `EditorCore`, `PanelHandle`, `makeTestEditor`.
- Produces: `StatusBarHandle<Doc> = PanelHandle<Doc> & { setCursor(coords: { x: number; z: number } | null): void }`; `mountStatusBar(core, parent): StatusBarHandle<Doc>`. Cells: coords, a `data-snap` button cycling `0.25 → 0.5 → 1 → off`, selection count, a `data-valid` cell (`✓ Valid` / issues, `is-invalid` class when not exportable), and the active tool.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/statusbar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mountStatusBar } from '../../src/ui/statusbar'
import { makeTestEditor } from '../fixtures/editorHarness'
import type { SceneItem } from '../../src/model/types'

const startMarker: SceneItem = {
  id: 'marker:start', kind: 'marker',
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' },
  surface: { kind: 'color', value: '#fff' }
}

describe('status bar', () => {
  it('shows validation, snap, selection, and cursor', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountStatusBar(editor, host)

    expect(host.querySelector('[data-valid]')!.textContent).toContain('Missing')

    editor.store.dispatch({ type: 'loadDoc', doc: { title: 't', items: [startMarker] } })
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-valid]')!.textContent).toBe('✓ Valid')

    host.querySelector<HTMLButtonElement>('[data-snap]')!.click() // 0.5 -> 1
    expect(editor.store.getState().ui.snap).toBe(1)
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-snap]')!.textContent).toBe('snap 1')

    handle.setCursor({ x: 6.5, z: 2 })
    expect(host.querySelector('.ed-status-coords')!.textContent).toBe('x 6.50  z 2.00')

    handle.dispose(); editor.dispose()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/statusbar.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/statusbar`.

- [x] **Step 3: Implement**

`packages/editor/src/ui/statusbar.ts`:
```ts
import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import { validateDoc } from '../io/validation'
import type { PanelHandle } from './panel'

const SNAPS = [0.25, 0.5, 1, 0]
const snapLabel = (s: number): string => (s > 0 ? String(s) : 'off')

export interface StatusBarHandle<Doc> extends PanelHandle<Doc> {
  setCursor(coords: { x: number; z: number } | null): void
}

export function mountStatusBar<Doc>(core: EditorCore<Doc>, parent: HTMLElement): StatusBarHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-statusbar'
  parent.append(root)

  const cell = (cls: string): HTMLSpanElement => {
    const span = document.createElement('span')
    span.className = `ed-status-cell ${cls}`
    return span
  }

  const coords = cell('ed-status-coords')
  coords.textContent = 'x —  z —'
  const snap = document.createElement('button')
  snap.type = 'button'
  snap.className = 'ed-status-cell ed-snap'
  snap.dataset.snap = ''
  const selection = cell('ed-status-sel')
  const valid = cell('ed-status-valid')
  valid.dataset.valid = ''
  const tool = cell('ed-status-tool')
  root.append(coords, snap, selection, valid, tool)

  snap.addEventListener('click', () => {
    const current = core.store.getState().ui.snap
    const index = SNAPS.indexOf(current)
    const next = SNAPS[(index + 1) % SNAPS.length] ?? 0.5
    core.store.dispatch({ type: 'setSnap', snap: next })
  })

  function setCursor(value: { x: number; z: number } | null): void {
    coords.textContent = value ? `x ${value.x.toFixed(2)}  z ${value.z.toFixed(2)}` : 'x —  z —'
  }

  function update(state: EditorState<Doc>): void {
    snap.textContent = `snap ${snapLabel(state.ui.snap)}`
    selection.textContent = `${state.selection.length} selected`
    const result = validateDoc(core.definition, state.document.doc)
    valid.textContent = result.exportable ? '✓ Valid' : result.issues.join(' · ')
    valid.classList.toggle('is-invalid', !result.exportable)
    const { brushId, mode } = state.tool.selection
    tool.textContent = mode === 'place' ? `Place: ${brushId ?? '—'}` : 'Select'
  }

  update(core.store.getState())
  return { update, setCursor, dispose() { root.remove() } }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/editor/tests/ui/statusbar.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): status bar with coords/snap/selection/validation/tool"
```

---

## Task 8: Viewport region (primary + inset placement, swap / hide)

**Files:**
- Create: `packages/editor/src/ui/viewportRegion.ts`
- Test: `packages/editor/tests/ui/viewportRegion.test.ts`

**Interfaces:**
- Consumes: `EditorCore`, `PanelHandle`, `PrimaryView`, `makeTestEditor`.
- Produces: `mountViewportRegion(core, parent, canvases: Record<PrimaryView, HTMLCanvasElement>): PanelHandle<Doc>`. Builds `[data-vp="main"]` and `[data-vp="inset"]` containers; on `update` it re-parents the primary view's canvas into `main` and the other into `inset` (preserving the inset's swap/hide buttons), and toggles `is-hidden` on the inset from `insetVisible`. `[data-vp-swap]` dispatches `setPrimaryView(other)`; `[data-vp-hide]` dispatches `toggleInset`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/viewportRegion.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mountViewportRegion } from '../../src/ui/viewportRegion'
import { makeTestEditor } from '../fixtures/editorHarness'

const canvases = (): { '2d': HTMLCanvasElement; '3d': HTMLCanvasElement } =>
  ({ '2d': document.createElement('canvas'), '3d': document.createElement('canvas') })

describe('viewport region', () => {
  it('puts the primary view in main and the other in the inset', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const cs = canvases()
    const handle = mountViewportRegion(editor, host, cs)

    expect(cs['2d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('main')
    expect(cs['3d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('inset')

    editor.store.dispatch({ type: 'setPrimaryView', view: '3d' })
    handle.update(editor.store.getState())
    expect(cs['3d'].closest('[data-vp]')!.getAttribute('data-vp')).toBe('main')

    handle.dispose(); editor.dispose()
  })

  it('swap and hide affordances dispatch ui actions', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountViewportRegion(editor, host, canvases())

    host.querySelector<HTMLButtonElement>('[data-vp-swap]')!.click()
    expect(editor.store.getState().ui.primaryView).toBe('3d')

    host.querySelector<HTMLButtonElement>('[data-vp-hide]')!.click()
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-vp="inset"]')!.classList.contains('is-hidden')).toBe(true)

    handle.dispose(); editor.dispose()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/viewportRegion.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/viewportRegion`.

- [x] **Step 3: Implement**

`packages/editor/src/ui/viewportRegion.ts`:
```ts
import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import type { PrimaryView } from '../state/ui'
import type { PanelHandle } from './panel'

const other = (view: PrimaryView): PrimaryView => (view === '2d' ? '3d' : '2d')

export function mountViewportRegion<Doc>(
  core: EditorCore<Doc>,
  parent: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>
): PanelHandle<Doc> {
  const main = document.createElement('div')
  main.className = 'ed-vp-main'
  main.dataset.vp = 'main'

  const inset = document.createElement('div')
  inset.className = 'ed-vp-inset'
  inset.dataset.vp = 'inset'

  const swap = document.createElement('button')
  swap.type = 'button'; swap.className = 'ed-vp-swap'; swap.dataset.vpSwap = ''; swap.textContent = '⇄'
  const hide = document.createElement('button')
  hide.type = 'button'; hide.className = 'ed-vp-hide'; hide.dataset.vpHide = ''; hide.textContent = '×'
  inset.append(swap, hide)
  parent.append(main, inset)

  for (const canvas of Object.values(canvases)) canvas.classList.add('ed-vp-canvas')

  swap.addEventListener('click', (event) => {
    event.stopPropagation()
    core.store.dispatch({ type: 'setPrimaryView', view: other(core.store.getState().ui.primaryView) })
  })
  hide.addEventListener('click', (event) => {
    event.stopPropagation()
    core.store.dispatch({ type: 'toggleInset' })
  })

  function update(state: EditorState<Doc>): void {
    const primary = state.ui.primaryView
    const primaryCanvas = canvases[primary]
    const insetCanvas = canvases[other(primary)]
    if (primaryCanvas.parentElement !== main) main.insertBefore(primaryCanvas, main.firstChild)
    if (insetCanvas.parentElement !== inset) inset.insertBefore(insetCanvas, inset.firstChild)
    inset.classList.toggle('is-hidden', !state.ui.insetVisible)
    main.dataset.view = primary
    inset.dataset.view = other(primary)
  }

  update(core.store.getState())
  return { update, dispose() { main.remove(); inset.remove() } }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/editor/tests/ui/viewportRegion.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): viewport region with primary/inset placement + swap/hide"
```

---

## Task 9: Menu bar

**Files:**
- Create: `packages/editor/src/ui/menubar.ts`
- Test: `packages/editor/tests/ui/menubar.test.ts`

**Interfaces:**
- Consumes: `EditorCore`, `PanelHandle`, `makeTestEditor`.
- Produces: `mountMenuBar(core, parent): PanelHandle<Doc>`. Renders File (New; Import/Export disabled), Edit (Undo/Redo/Delete), View (Swap/Toggle inset/Cycle snap) as `[data-menu-item="<id>"]` buttons. `update` disables Undo/Redo/Delete when `past`/`future`/`selection` are empty. New dispatches `loadDoc(scene.emptyDoc())`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/menubar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mountMenuBar } from '../../src/ui/menubar'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem } from '../fixtures/fakeDefinition'

describe('menu bar', () => {
  it('disables Undo until there is history; New resets the doc', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountMenuBar(editor, host)

    expect(host.querySelector<HTMLButtonElement>('[data-menu-item="undo"]')!.disabled).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-menu-item="import"]')!.disabled).toBe(true)

    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    handle.update(editor.store.getState())
    expect(host.querySelector<HTMLButtonElement>('[data-menu-item="undo"]')!.disabled).toBe(false)

    host.querySelector<HTMLButtonElement>('[data-menu-item="new"]')!.click()
    expect(editor.definition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    expect(editor.store.getState().document.dirty).toBe(false)

    handle.dispose(); editor.dispose()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/menubar.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/menubar`.

- [x] **Step 3: Implement**

`packages/editor/src/ui/menubar.ts`:
```ts
import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import type { PanelHandle } from './panel'

interface MenuItem { id: string; label: string; shortcut?: string; disabled?: boolean; run: () => void }

const SNAP_ORDER = [0.25, 0.5, 1, 0]

export function mountMenuBar<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-menubar'
  parent.append(root)
  const store = core.store
  const itemEls = new Map<string, HTMLButtonElement>()

  const menus: Array<{ title: string; items: MenuItem[] }> = [
    { title: 'File', items: [
      { id: 'new', label: 'New', run: () => store.dispatch({ type: 'loadDoc', doc: core.definition.scene.emptyDoc() }) },
      { id: 'import', label: 'Import…', disabled: true, run: () => {} },
      { id: 'export', label: 'Export…', disabled: true, run: () => {} }
    ] },
    { title: 'Edit', items: [
      { id: 'undo', label: 'Undo', shortcut: '⌘Z', run: () => store.dispatch({ type: 'undo' }) },
      { id: 'redo', label: 'Redo', shortcut: '⇧⌘Z', run: () => store.dispatch({ type: 'redo' }) },
      { id: 'delete', label: 'Delete', shortcut: '⌫', run: () => core.deleteSelected() }
    ] },
    { title: 'View', items: [
      { id: 'swap', label: 'Swap viewports', shortcut: 'Tab', run: () => {
        const view = store.getState().ui.primaryView
        store.dispatch({ type: 'setPrimaryView', view: view === '2d' ? '3d' : '2d' })
      } },
      { id: 'inset', label: 'Toggle inset', shortcut: '\\', run: () => store.dispatch({ type: 'toggleInset' }) },
      { id: 'snap', label: 'Cycle snap', run: () => {
        const index = SNAP_ORDER.indexOf(store.getState().ui.snap)
        store.dispatch({ type: 'setSnap', snap: SNAP_ORDER[(index + 1) % SNAP_ORDER.length] ?? 0.5 })
      } }
    ] }
  ]

  for (const menu of menus) {
    const col = document.createElement('div')
    col.className = 'ed-menu'
    const title = document.createElement('button')
    title.type = 'button'; title.className = 'ed-menu-title'; title.textContent = menu.title
    title.addEventListener('click', () => col.classList.toggle('is-open'))
    const drop = document.createElement('div')
    drop.className = 'ed-menu-drop'
    for (const item of menu.items) {
      const btn = document.createElement('button')
      btn.type = 'button'; btn.className = 'ed-menu-item'; btn.dataset.menuItem = item.id
      btn.textContent = item.label
      if (item.shortcut) {
        const sc = document.createElement('span')
        sc.className = 'ed-menu-sc'; sc.textContent = item.shortcut
        btn.append(sc)
      }
      btn.disabled = Boolean(item.disabled)
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        item.run()
        col.classList.remove('is-open')
      })
      itemEls.set(item.id, btn)
      drop.append(btn)
    }
    col.append(title, drop)
    root.append(col)
  }

  function update(state: EditorState<Doc>): void {
    const undo = itemEls.get('undo')
    if (undo) undo.disabled = state.document.past.length === 0
    const redo = itemEls.get('redo')
    if (redo) redo.disabled = state.document.future.length === 0
    const del = itemEls.get('delete')
    if (del) del.disabled = state.selection.length === 0
  }

  update(store.getState())
  return { update, dispose() { root.remove() } }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/editor/tests/ui/menubar.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): menu bar (File/Edit/View) with enable/disable state"
```

---

## Task 10: Chrome composition + barrel swap + remove panels

**Files:**
- Create: `packages/editor/src/ui/chrome.ts`
- Modify: `packages/editor/src/index.ts`
- Delete: `packages/editor/src/ui/panels.ts`
- Delete: `packages/editor/tests/ui/panels.test.ts`
- Test: `packages/editor/tests/ui/chrome.test.ts`

**Interfaces:**
- Consumes: every `mountX` from Tasks 4–9; `injectTheme`; `PrimaryView`; `EditorCore`, `makeTestEditor`.
- Produces: `EditorChromeHandle = { setCursorReadout(coords): void; dispose(): void }`; `renderEditorChrome(core, root, canvases: Record<PrimaryView, HTMLCanvasElement>): EditorChromeHandle`. Holds the single `store.subscribe`, fanning `update(state)` to all panels; `setCursorReadout` forwards to the status bar.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/ui/chrome.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { renderEditorChrome } from '../../src/ui/chrome'
import { makeTestEditor } from '../fixtures/editorHarness'
import { boxItem } from '../fixtures/fakeDefinition'

const canvases = (): { '2d': HTMLCanvasElement; '3d': HTMLCanvasElement } =>
  ({ '2d': document.createElement('canvas'), '3d': document.createElement('canvas') })

describe('editor chrome', () => {
  it('mounts every region and reacts to a single dispatch', () => {
    const root = document.createElement('div')
    const editor = makeTestEditor()
    const chrome = renderEditorChrome(editor, root, canvases())

    expect(root.querySelector('.ed-menubar')).not.toBeNull()
    expect(root.querySelectorAll('[data-brush]').length).toBeGreaterThan(0)
    expect(root.querySelector('[data-vp="main"]')).not.toBeNull()
    expect(root.querySelector('[data-valid]')!.textContent).toContain('Missing')

    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(root.querySelector('[data-item="a"]')).not.toBeNull() // outliner updated via subscription

    chrome.setCursorReadout({ x: 1, z: 2 })
    expect(root.querySelector('.ed-status-coords')!.textContent).toBe('x 1.00  z 2.00')

    chrome.dispose()
    expect(root.querySelector('.ed-root')).toBeNull()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/chrome.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/chrome`.

- [x] **Step 3: Implement the chrome**

`packages/editor/src/ui/chrome.ts`:
```ts
import type { EditorCore } from '../host'
import type { PrimaryView } from '../state/ui'
import { injectTheme } from './theme.css'
import { mountInspector } from './inspectorView'
import { mountMenuBar } from './menubar'
import { mountOutliner } from './outliner'
import { mountPalette } from './palette'
import { mountStatusBar } from './statusbar'
import { mountViewportRegion } from './viewportRegion'

export interface EditorChromeHandle {
  setCursorReadout(coords: { x: number; z: number } | null): void
  dispose(): void
}

export function renderEditorChrome<Doc>(
  core: EditorCore<Doc>,
  root: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>
): EditorChromeHandle {
  const region = (cls: string): HTMLDivElement => {
    const div = document.createElement('div')
    div.className = cls
    return div
  }

  const removeTheme = injectTheme(root.ownerDocument ?? document)
  const shell = region('ed-root')
  const menubarHost = region('ed-menubar-host')
  const body = region('ed-body')
  const paletteHost = region('ed-palette-host')
  const viewportHost = region('ed-viewport')
  const rightcol = region('ed-rightcol')
  const inspectorHost = region('ed-inspector-host')
  const outlinerHost = region('ed-outliner-host')
  const statusHost = region('ed-statusbar-host')
  rightcol.append(inspectorHost, outlinerHost)
  body.append(paletteHost, viewportHost, rightcol)
  shell.append(menubarHost, body, statusHost)
  root.append(shell)

  const panels = [
    mountMenuBar(core, menubarHost),
    mountPalette(core, paletteHost),
    mountInspector(core, inspectorHost),
    mountOutliner(core, outlinerHost),
    mountViewportRegion(core, viewportHost, canvases)
  ]
  const status = mountStatusBar(core, statusHost)

  const unsubscribe = core.store.subscribe(() => {
    const state = core.store.getState()
    for (const panel of panels) panel.update(state)
    status.update(state)
  })

  return {
    setCursorReadout: (coords) => status.setCursor(coords),
    dispose() {
      unsubscribe()
      for (const panel of panels) panel.dispose()
      status.dispose()
      shell.remove()
      removeTheme()
    }
  }
}
```

- [x] **Step 4: Swap the barrel and delete the old panels**

In `packages/editor/src/index.ts`, replace the final line `export * from './ui/panels'` with:
```ts
export * from './ui/chrome'
export { SLATE_PRO_CSS, injectTheme } from './ui/theme.css'
```
Then remove the superseded module and its test:
```bash
git rm packages/editor/src/ui/panels.ts packages/editor/tests/ui/panels.test.ts
```

- [x] **Step 5: Run the test + full editor suite to verify**

```bash
npx vitest run packages/editor/tests/ui/chrome.test.ts
npx vitest run packages/editor
```
Expected: chrome test PASS; the whole editor package green (no lingering `renderPanels` references).

- [x] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): renderEditorChrome composes the docked shell; drop panels.ts"
```

---

## Task 11: Engine — element-sizing option on `attachCanvasRenderer`

The 3D viewport is no longer full-window (it lives in a main or inset container), so the renderer must size to its canvas element, not `window`. This is an opt-in flag; `monkey-ball` keeps the default `'window'` behavior unchanged.

**Files:**
- Modify: `packages/engine/src/render/browser.ts`

**Interfaces:**
- Produces: `attachCanvasRenderer(renderer, canvas, opts?: { sizeTo?: 'window' | 'element' })`. Default `'window'` (current behavior). `'element'` sizes the GL drawing buffer from `canvas.clientWidth/clientHeight` and re-sizes via a `ResizeObserver` on the canvas.

> **No unit test:** `render/browser.ts` is a browser-only shim (excluded from coverage, untested by convention — it needs a real `WebGLRenderer`/`ResizeObserver`). It is verified in the Task 13 manual checkpoint. Keep the change trivially thin.

- [ ] **Step 1: Implement the option**

Replace the body of `attachCanvasRenderer` in `packages/engine/src/render/browser.ts`:
```ts
export function attachCanvasRenderer(
  renderer: ThreeRenderer,
  canvas: HTMLCanvasElement,
  opts?: { sizeTo?: 'window' | 'element' }
): CanvasRenderer {
  const gl = new WebGLRenderer({ canvas, antialias: true })
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const sizeTo = opts?.sizeTo ?? 'window'
  const dims = (): { w: number; h: number } =>
    sizeTo === 'element'
      ? { w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 }
      : { w: window.innerWidth, h: window.innerHeight }
  const resize = (): void => {
    const { w, h } = dims()
    gl.setSize(w, h, sizeTo === 'window')
    renderer.camera.aspect = w / h
    renderer.camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  let observer: ResizeObserver | undefined
  if (sizeTo === 'element' && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(canvas)
  }
  resize()
  return {
    renderFrame: () => gl.render(renderer.scene, renderer.camera),
    dispose() {
      window.removeEventListener('resize', resize)
      observer?.disconnect()
      gl.dispose()
    }
  }
}
```
(Keep the existing imports/types at the top of the file; only the function body and signature change. `gl.setSize(w, h, sizeTo === 'window')` preserves the prior `updateStyle=true` behavior for window mode and lets CSS control layout in element mode.)

- [ ] **Step 2: Typecheck + verify the game still compiles**

```bash
npm run typecheck
npx vitest run packages/engine
```
Expected: typecheck clean; engine tests green (`browser.ts` is excluded from coverage, so no new test is required).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(engine): attachCanvasRenderer element-sizing option for embedded viewports"
```

---

## Task 12: Host app — mount the chrome, wire input + loop

**Files:**
- Modify: `tools/level-editor/src/main.ts`
- Delete: `tools/level-editor/src/viewTabs.ts`
- Delete: `tools/level-editor/tests/viewTabs.test.ts`
- Rewrite: `tools/level-editor/tests/layout.test.ts`
- Modify: `tools/level-editor/index.html`

**Interfaces:**
- Consumes: `renderEditorChrome`, `screenToWorldXZ`, `ScreenSize` from `@automata/editor`; `attachCanvasRenderer(..., { sizeTo: 'element' })` from `@automata/engine`.

> The host is a browser shim (untested core logic). `index.html` + `layout.test.ts` are the only testable parts here; the manual checkpoint (Task 13) verifies behavior.

- [ ] **Step 1: Rewrite the layout guard test (red)**

Replace `tools/level-editor/tests/layout.test.ts` with:
```ts
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('level editor host shell', () => {
  it('is a minimal mount point — chrome + theme come from @automata/editor', () => {
    const html = readFileSync(resolve(toolRoot, 'index.html'), 'utf8')
    expect(html).toContain('id="app"')
    expect(html).not.toContain('#view-tabs')
    expect(html).not.toContain('.view-canvas')
    expect(html).not.toContain('#panels')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tools/level-editor/tests/layout.test.ts`
Expected: FAIL — current `index.html` still contains `#view-tabs` / `.view-canvas` / `#panels`.

- [ ] **Step 3: Strip `index.html` to a mount point**

Replace `tools/level-editor/index.html` with:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Level Editor</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #11151d; }
      #app { position: fixed; inset: 0; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Run the layout test to verify it passes**

Run: `npx vitest run tools/level-editor/tests/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Remove the obsolete tab shim**

```bash
git rm tools/level-editor/src/viewTabs.ts tools/level-editor/tests/viewTabs.test.ts
```

- [ ] **Step 6: Rewrite the host shim**

Replace `tools/level-editor/src/main.ts` with:
```ts
import {
  GameLoop, attachCanvasRenderer, createLoader, createRapierPhysics, createThreeRenderer,
  fetchTextViaFetch, startLoopDriver
} from '@automata/engine'
import {
  attachFlyControls, createEditor, paintMap, renderEditorChrome, screenToWorldXZ, type ScreenSize
} from '@automata/editor'
import { createMonkeyBallDefinition, loadBootData, type Level } from 'monkey-ball'

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')

  const canvas3d = document.createElement('canvas')
  const canvas2d = document.createElement('canvas')

  const loader = createLoader(fetchTextViaFetch())
  const renderer = createThreeRenderer()
  const canvasRenderer = attachCanvasRenderer(renderer, canvas3d, { sizeTo: 'element' })
  const physics = await createRapierPhysics()
  const boot = await loadBootData(loader)
  const definition = createMonkeyBallDefinition(boot.lib, boot.tuning)

  const editor = createEditor<Level>({ definition, render: renderer.port, physics })
  editor.store.dispatch({ type: 'loadDoc', doc: definition.scene.emptyDoc() })

  const chrome = renderEditorChrome<Level>(editor, app, { '2d': canvas2d, '3d': canvas3d })
  attachFlyControls(canvas3d, () => editor.camera, (camera) => { editor.camera = camera })

  const context2d = canvas2d.getContext('2d')
  if (!context2d) throw new Error('2D canvas context unavailable')

  const fit = (canvas: HTMLCanvasElement): ScreenSize => {
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    return { w, h }
  }

  const localScreen = (canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const worldAt = (view: '2d' | '3d', screen: { x: number; y: number }, size: ScreenSize) =>
    view === '2d'
      ? (() => { const xz = screenToWorldXZ(editor.mapView, screen, size); return { x: xz.x, y: 0, z: xz.z } })()
      : editor.groundPointAt(screen, size)

  const editAt = (view: '2d' | '3d', event: PointerEvent, canvas: HTMLCanvasElement): void => {
    // Clicking the non-primary (inset) view promotes it instead of editing.
    if (editor.store.getState().ui.primaryView !== view) {
      editor.store.dispatch({ type: 'setPrimaryView', view })
      return
    }
    const size = fit(canvas)
    const screen = localScreen(canvas, event)
    const world = worldAt(view, screen, size)
    if (event.shiftKey) { if (world) editor.moveSelectionTo(world); return }
    if (editor.store.getState().tool.selection.mode === 'place') { if (world) editor.placeAt(world); return }
    if (view === '2d') editor.pick2d(screen, size); else editor.pick3d(screen, size)
  }

  for (const [view, canvas] of [['2d', canvas2d], ['3d', canvas3d]] as const) {
    canvas.addEventListener('pointerdown', (event) => editAt(view, event, canvas))
    canvas.addEventListener('pointermove', (event) => {
      const world = worldAt(view, localScreen(canvas, event), fit(canvas))
      chrome.setCursorReadout(world ? { x: world.x, z: world.z } : null)
    })
    canvas.addEventListener('pointerleave', () => chrome.setCursorReadout(null))
  }

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    if (event.key === 'Delete' || event.key === 'Backspace') editor.deleteSelected()
    else if (key === 'q' || event.key === 'Escape') editor.store.dispatch({ type: 'setTool', tool: { brushId: null, mode: 'select' } })
    else if (event.key === 'Tab') {
      event.preventDefault()
      const view = editor.store.getState().ui.primaryView
      editor.store.dispatch({ type: 'setPrimaryView', view: view === '2d' ? '3d' : '2d' })
    } else if (event.key === '\\') editor.store.dispatch({ type: 'toggleInset' })
    else if ((event.metaKey || event.ctrlKey) && key === 'z') {
      event.preventDefault()
      editor.store.dispatch(event.shiftKey ? { type: 'redo' } : { type: 'undo' })
    } else if (key === 'c') {
      const [id] = editor.store.getState().selection
      if (id) editor.cycleSurfaceOn(id)
    }
  })

  const loop = new GameLoop({
    fixedUpdate: () => {},
    render: (alpha) => {
      editor.tick(alpha)
      canvasRenderer.renderFrame()
      const mapSize = fit(canvas2d)
      paintMap(context2d, editor.drawModel(mapSize), mapSize)
    }
  })
  window.addEventListener('beforeunload', () => chrome.dispose())
  startLoopDriver(loop)
}

void main()
```

- [ ] **Step 7: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean (the host is the only module importing both `monkey-ball` and `@automata/editor`; no third-party imports leak).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(editor): mount docked chrome in host; dual viewport, cursor readout, keymap"
```

---

## Task 13: Full gate + manual checkpoint

**Files:** none (verification only).

- [ ] **Step 1: Run the full CI gate**

```bash
npm run ci
```
Expected: typecheck, lint, all tests, and coverage (≥90% on `packages/**/src`) green. If coverage dips, it is because a new `ui/` branch is unexercised — add the missing assertion to that panel's test (do not lower the gate).

- [ ] **Step 2: Manual browser checkpoint (human gate)**

```bash
npm run dev -w level-editor
```
Open the URL and verify the Slate Pro shell:
- Layout: menu bar on top, tool palette left, **2D map primary** with a live **3D inset** bottom-right, inspector + outliner right, status bar bottom.
- Pick **Box** (it glows amber); click the map to place — items snap to the status-bar snap increment; click the **snap** chip to cycle `0.25 / 0.5 / 1 / off`.
- Click an item: inspector shows **rounded** X/Y/Z (no more `-0.132…`), steppers nudge by snap; the outliner row highlights and the 3D inset shows the highlight.
- Press **Tab** (or the inset `⇄`) to swap primary↔inset; the 3D view resizes correctly to its container; press `\` to hide the inset.
- Move cursor over a viewport: status bar shows live `x …  z …`.
- Place a spawn + goal: the status bar flips to **✓ Valid** and the outliner "Missing" banner clears.
- `⌘/Ctrl+Z` undoes; `Delete` removes; `C` cycles the selected item's surface; `Q`/`Esc` returns to Select.

Stop the dev server when done.

- [ ] **Step 3: Final commit (if any checkpoint fixes were needed)**

```bash
git add -A
git commit -m "chore(editor): UX chrome overhaul checkpoint fixes"
```

---

## Self-Review

**Spec coverage:**
- Docked shell (menu/palette/viewport/inspector/outliner/status) → Tasks 4–10, 12. ✓
- 2D-primary + live swappable/hideable 3D inset → Task 8 (region) + Task 1 (`ui`) + Task 12 (host swap/inset-click). ✓
- Inspector rounding/steppers/groups/header/hint → Task 5. ✓
- Explicit Select tool + active glow → Task 4. ✓
- Status bar coords/snap/selection/validation/tool → Task 7; cursor bypasses store → Task 10 (`setCursorReadout`) + Task 12. ✓
- Outliner list/select/delete/validation → Task 6. ✓
- Menu bar Edit/View now, File Import/Export disabled (M13) → Task 9. ✓
- Generic `ui` slice (snap/primaryView/insetVisible); cursor not in store → Tasks 1, 7, 10. ✓
- Adjustable snap incl. "off" → Tasks 1, 2, 7. ✓
- Slate Pro theme shipped from the editor package; host HTML minimal → Tasks 3, 12. ✓
- Remove `panels.ts` / `viewTabs.ts` / obsolete tests → Tasks 10, 12. ✓
- Engine viewport sizing (the one engine change) → Task 11. ✓
- Coverage gate / litmus / TDD → Global Constraints + per-task tests. ✓
- Non-goals (no drag-draw/gizmos/marquee, no import/export/test-play) → not implemented; File slots disabled. ✓

**Type consistency:** `PanelHandle<Doc>` (Task 3) is the return of every `mountX`; `StatusBarHandle<Doc>` extends it with `setCursor` (Task 7), consumed by `renderEditorChrome` (Task 10). `PrimaryView` (Task 1) flows through actions, region, chrome, host. `ScreenSize` is imported from the projection barrel in the host (Task 12). `setCursorReadout`/`setCursor` names line up across Tasks 7/10/12. Snap order `[0.25, 0.5, 1, 0]` is identical in statusbar (Task 7) and menubar (Task 9).

**Placeholder scan:** no TBD/TODO; every code step shows complete, runnable content.
