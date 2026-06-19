# Editor UX / Chrome Overhaul — Design

> **Status:** Approved direction, pending spec review.
> **Date:** 2026-06-19
> **Scope:** Presentation/chrome overhaul of the generic level editor host UI. No new editing *mechanics*.
> **Relates to:** `docs/superpowers/specs/2026-06-18-generic-editor-design.md` (parent spec); `docs/superpowers/plans/2026-06-16-editor-content-polish-m11-m15.md` Task 21 (the M12 panels this replaces).

## 1. Problem

The editor is functionally complete through M12 (place / move / delete / surface-cycle / inspector / validation, all routed through tested `SceneCommand`s), but its presentation is rough:

- Palette, inspector, and validation are **three disconnected floating cards** over a full-screen viewport — no editor "chrome" ties them together.
- The inspector shows **raw, unrounded floats** (`-0.13216145833333348`). There are no steppers, no grouping, no units.
- There is **no active-tool feedback** — you cannot see which brush is armed or whether a click selects or places.
- 3D and 2D are **mutually-exclusive full-screen tabs**, so every toggle loses your spatial reference.
- Status is a single word ("Valid") — **no coordinates, no snap readout, no surfaced shortcuts**.

The architecture underneath is clean (generic store, serializable commands, tested core methods), so this is almost entirely a **presentation** problem.

## 2. Vision & design north stars

**Identity: a BUILD-style dual-viewport sculptor with LDtk's approachability, for 3D content.**

- **LDtk → friendliness & polish.** Data-driven typed inspector, instant feedback, gorgeous empty states, low modal friction, color-coded items, "it just works."
- **Build 2 Editor → spatial dual-mode editing.** Fluid 2D-top-down ↔ 3D, keyboard-fast, grid/snap, the feeling of sculpting a real space.
- **3D-first.** The content is genuine 3D geometry (real height/volume); the 3D fly view is a hero view — always live in the inset and one keystroke from primary. We **launch on the 2D map** for placement precision; that is a workflow default, not a downgrade of 3D.

**Visual skin: "Slate Pro"** (chosen from three mockups). Dark slate panels, soft bevels (`inset 0 1px 0` highlight + dark base), an **amber active-tool glow** (`#e0a83e`), tabular numerals, readable system-ui type. It extends the current dark-navy theme rather than replacing it.

## 3. Goals / Non-goals

**Goals**
- Replace the three floating cards with a cohesive **docked shell**: menu bar · left tool palette · center viewport region · right inspector + outliner · bottom status bar.
- **2D-primary, swappable, live 3D inset.** Big primary viewport (2D map on launch); the *other* view always live in a bottom-right inset. `Tab` or clicking the inset swaps primary↔inset; `\` hides the inset for full single-view.
- **Fix the inspector**: round to snap precision, tabular numerals, steppers (▲▼) that nudge by the snap increment, grouped Transform / Size sections, a selection header, and empty-state hints.
- **Explicit tool state**: a Select tool plus the placement brushes, active brush glows and shows its hotkey.
- **Live status bar**: cursor world coords · snap (cycle `0.25 / 0.5 / 1 / off`) · selection count · `✓ Valid` or issue summary · active tool.
- **Outliner**: scene-item list driven by `listItems`, click-to-select (syncs 3D highlight), delete, and ⚠ flags for validation gaps.
- Keep everything **generic** (passes the editor litmus test) and **tested** in happy-dom; the host app stays a thin browser shim.

**Non-goals (explicitly deferred — unchanged from the M11–M15 plan)**
- Drag-to-draw footprints, scroll-to-set-height, transform/rotation gizmos, marquee multi-select.
- Dockable / draggable / resizable panels (fixed layout only).
- Import / Export / test-play wiring — that is **M13**. The File menu shows the slots but Import/Export stay **disabled** until then.
- No new engine `RenderPort` methods. No new third-party dependencies.

**In scope but borderline:** **adjustable snap** (small, high-value). If undesired, snap stays fixed at `0.5` and the status readout becomes non-interactive — a one-line change.

## 4. Architecture

The single rule this design protects: **all chrome is game-agnostic** (litmus: *"would a platformer's editor use this unchanged?"*). The chrome reads only from the `GameDefinition` and the editor store; zero monkey-ball concepts.

```
packages/editor/src/
  state/
    ui.ts            NEW  — ui slice: { snap, primaryView, insetVisible }
    actions.ts       EDIT — add setSnap / setPrimaryView / toggleInset
    store.ts         EDIT — compose `ui` into EditorState
  host.ts            EDIT — placeAt/moveSelectionTo read ui.snap (was const 0.5)
  ui/
    theme.css.ts     NEW  — Slate Pro tokens + classes, injected once
    chrome.ts        NEW  — composes the shell; returns EditorChromeHandle
    menubar.ts       NEW  — Edit / View / File menus
    palette.ts       NEW  — Select + brushes, active glow, hotkeys
    inspectorView.ts NEW  — renders inspectorFields with rounding/steppers/groups
    outliner.ts      NEW  — item list: select / delete / validation flags
    statusbar.ts     NEW  — coords / snap / selection / validation / tool
    viewportRegion.ts NEW — owns primary + inset containers; swap / hide
    panels.ts        REMOVE — superseded by the modules above

  index.ts           EDIT — barrel exports renderEditorChrome; drops ./ui/panels

tools/level-editor/
  src/main.ts        EDIT — thinner: mount chrome, parent canvases, wire input/loop
  src/viewTabs.ts    REMOVE — superseded by viewportRegion + menubar swap
  tests/viewTabs.test.ts / tests/layout.test.ts  REMOVE/REWRITE — they test the
                     superseded tab shim; replace with a thin layout smoke if any host
                     logic remains, else delete (logic now lives in tested ui/ modules)
  index.html         EDIT — strip bespoke panel CSS to a reset + #app
```

**Component boundaries (each: one purpose, store-driven, independently testable):**

- **`renderEditorChrome(core, root) → EditorChromeHandle`** builds the shell, injects the theme once, mounts each sub-panel, subscribes once to the store and fans out re-renders. Returns:
  ```ts
  interface EditorChromeHandle {
    viewport: { primaryEl: HTMLElement; insetEl: HTMLElement } // host mounts canvases here
    setCursorReadout(coords: { x: number; z: number } | null): void // high-freq, bypasses store
    onLayoutChange(cb: () => void): void  // fires on swap/hide so host re-measures canvases
    dispose(): void
  }
  ```
- Each sub-panel module exports a `mount(core, parent) → { update(state): void; dispose(): void }` so `chrome.ts` calls `update` from its single store subscription and the modules stay pure DOM + dispatch.

**State: where each piece lives**

| Piece | Home | Why |
|---|---|---|
| doc, selection, tool, mode | existing store slices | unchanged |
| snap, primaryView, insetVisible | **new `ui` slice** | low-frequency, affects placement (snap) + layout; belongs in the tested store |
| cursor world coords | **not in the store** — direct DOM via `setCursorReadout` | pointermove is high-frequency; routing it through dispatch+subscribe would churn every panel |

**Data flow.** Store is the single source of truth. `chrome.ts` holds one `store.subscribe`; on change it calls each panel's `update(state)`. User actions dispatch either `SceneCommand`s (via `core` methods / `fieldCommand`) or `ui` actions. Snap edits → `setSnap` → `placeAt` reads `ui.snap` on the next placement. Outliner/palette clicks → `select` / `setTool`. The 3D highlight already reflects `selection` through the existing world-sync `tick`. Cursor readout updates the status bar element directly.

## 5. Components

### 5.1 Menu bar
- **Edit:** Undo (`⌘/Ctrl+Z`), Redo (`⇧⌘/Ctrl+Y`), Delete (`⌫`). Wired to existing `{type:'undo'|'redo'}` and `core.deleteSelected()`.
- **View:** Swap primary/inset (`Tab`), Hide inset (`\`), Snap submenu (`0.25 / 0.5 / 1 / off`).
- **File:** New (loads `emptyDoc`); Import / Export present but **disabled** (M13).
- Shows shortcuts inline. Items grey out when unavailable (Undo with empty `past`, etc.).

### 5.2 Tool palette (left)
- A **Select** tool (`Esc` / `Q`) → `setTool { brushId: null, mode: 'select' }`.
- Brushes from `definition.palette` grouped **Geometry / Markers**, each → `setTool { brushId, mode: 'place' }`.
- Active tool reads from `state.tool` and glows amber; each shows its hotkey. Generic per-`kind` glyphs (box / cylinder / marker), no game labels hardcoded — labels come from `Brush.label`.

### 5.3 Inspector (right, top) — `inspectorView.ts`
- Consumes existing `inspectorFields(definition, doc, selection)`; commits via existing `fieldCommand`.
- **Rendering fixes:** numbers **displayed** rounded to a fixed, readable precision (2 dp) — the stored value is untouched (a freely-moved item may be off-grid); `font-variant-numeric: tabular-nums`; commit on Enter/blur.
- **Steppers (▲▼)** nudge by the current snap increment; ↑/↓ arrow keys do the same when focused.
- Grouped **Transform** (X/Y/Z) and **Size** (box W/H/D · cylinder Radius/Height), matching what `inspectorFields` already emits.
- Header: selected item's `kind` + label; "N selected" for multi; metadata fields + a hint ("Select an item, or pick a tool and click the map") when nothing is selected.

### 5.4 Outliner (right, below inspector) — `outliner.ts`
- Lists `definition.scene.listItems(doc)`: kind glyph + label, current selection highlighted.
- Click → `select`. A delete affordance → `core.deleteSelected()` (honors cardinality guard). A ⚠ marker on the panel header when `validateDoc` reports missing-required items.

### 5.5 Status bar (bottom) — `statusbar.ts`
- Cursor world `x, z` (via `setCursorReadout`) · snap chip (click → cycle `setSnap`) · selection count · `✓ Valid` or `issues.join(' · ')` from `validateDoc` · active tool name.

### 5.6 Viewport region — `viewportRegion.ts`
- Owns `#vp-primary` and `#vp-inset` containers. Reads `state.ui.primaryView` / `insetVisible` to decide which container is big and whether the inset shows; renders the swap (`⇄`) and hide (`×`) affordances → `setPrimaryView` / `toggleInset`.
- The host mounts `canvas2d` and `canvas3d` and **re-parents** them between the two containers on `onLayoutChange`. Both canvases render every frame (no more `display:none` tab); the host sizes each canvas's backing store from its container rect each frame, as `resizeMapCanvas` does today.

## 6. Host app shim (`tools/level-editor`) — stays untested

- `main.ts`: create the two canvases → `renderEditorChrome(editor, app)` → mount canvases into `viewport.primaryEl/insetEl` per `primaryView` → wire input → run the loop.
- **Input** (thin: browser event → tested core call): `pointermove` over a viewport → `setCursorReadout` (+ `screenToWorldXZ` for 2D, `groundPointAt` for 3D); `pointerdown` → place / pick / shift-move exactly as today, choosing the 2D vs 3D mapping by which canvas fired.
- **Keymap** (shim dispatch only): `Tab` swap · `\` hide inset · `Q`/`Esc` select tool · brush hotkeys · `⌫` delete · `C` cycle surface · `⌘/Ctrl+Z` / `⇧+…` undo/redo.
- `index.html`: reduced to a reset + `#app`; all panel styling now ships from `ui/theme.css.ts`.
- Stays in the coverage exclude (browser shim).

## 7. Testing strategy (happy-dom; preserves the 90% gate)

- **`ui` slice:** `setSnap` / `setPrimaryView` / `toggleInset` reduce correctly; defaults are `snap 0.5`, `primaryView '2d'`, `insetVisible true`.
- **Editor core:** `placeAt` / `moveSelectionTo` honor `ui.snap` (place with snap `1` lands on integers; with `0.25` on quarters).
- **palette:** renders Select + every brush; clicking dispatches the right `setTool`; the active brush carries the amber/`aria-pressed` state from `state.tool`.
- **inspectorView:** a `0.5`-snap doc with a messy float renders rounded; a stepper click dispatches `setItemField` with the nudged value; empty selection shows metadata + hint.
- **outliner:** lists items; click dispatches `select`; the validation flag appears for a doc missing a required marker.
- **statusbar:** reflects snap, selection count, and `validateDoc` (valid vs issue text); the snap chip cycles `setSnap`.
- **viewportRegion:** reflects `primaryView` / `insetVisible`; swap and hide affordances dispatch the matching `ui` actions.
- **chrome:** mounts all regions; one store change updates inspector + status together; `dispose` removes everything and unsubscribes.

## 8. Risks & mitigations

- **Canvas size vs. layout.** Re-parenting canvases on swap must re-measure before the next render. Mitigation: host re-measures each frame (already does) and on `onLayoutChange`. Integer-floor sizing as today; the M15 DPR cap (Task 33) remains out of scope.
- **Rendering both viewports every frame** (vs. one hidden tab) costs a little more. Mitigation: both are small relative to the canvas already drawn; acceptable, and the inset is ~30% size. Revisit only if a frame-budget issue shows up.
- **Theme ownership move.** Pulling CSS from `index.html` into `ui/theme.css.ts` must not regress the host. Mitigation: theme injected once by `chrome.ts`, scoped under a root class; host keeps only a reset.
- **Scope creep.** Adjustable snap is the only new capability; everything else is presentation. The non-goals list is the guardrail.

## 9. Decided defaults

- Primary on launch: **2D map**. Inset: **visible**, bottom-right, ~30% width, not draggable.
- Swap: **`Tab` or click the inset**. Hide inset: **`\`**.
- Snap: default **0.5**, cycles `0.25 / 0.5 / 1 / off`.
- Active-tool accent: amber `#e0a83e`. Skin: Slate Pro.
