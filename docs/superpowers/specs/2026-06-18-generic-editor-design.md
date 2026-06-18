# Generic Engine-Powered Editor — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm complete, awaiting implementation plan — Plan 3, M11–M15)

## Relationship to the v1 spec

This document **supersedes the editor section** of the approved v1 spec
(`docs/superpowers/specs/2026-06-09-automata-engine-monkey-ball-design.md`). The
rest of that spec (engine, game runtime, content, polish goals) still stands.

The v1 spec scoped the editor as a **game-specific app** (`editor → game`,
desktop-first, orbit camera) and explicitly listed a *"game-agnostic editor
where a game registers schemas/palette into a generic tool"* as **out of scope
for v1**. This design pulls that future-work item into scope and reframes the
editor:

> The editor is **generic, like the engine is generic.** The way
> `@automata/engine` is a game-agnostic runtime that just *happens* to run the
> monkey-ball game, the editor is a game-agnostic world-editor that just
> *happens* to edit it. The game **registers** its content into the editor.

The interaction model is modeled on Ken Silverman's **BUILD / BUILD 2** editor:
**live in-engine editing**, a **dual viewport** (2D top-down map + 3D
fly-through), and an **instant play/edit toggle** (what-you-see-is-what-you-play).

The M11–M15 task-board items are re-scoped accordingly (see *Milestones*). The
follow-on AI work (editor MCP server + tuning-agent loop + chat overlay) is
**Plan 4 / M16**, designed in its own spec after M13's APIs stabilize.

## Decisions (from brainstorm Q&A)

| Question | Decision |
|---|---|
| Editor genericity | Generic editor core; the game registers content. Editor knows zero game concepts. |
| Where the editor lives | New `packages/editor` package, depends **only** on `@automata/engine`. |
| Game↔editor seam | A host app `tools/level-editor` composes `packages/editor` with the game's registration — the **only** place game and editor meet. |
| Interaction model | BUILD 2: dual viewport (2D top-down map + 3D fly-through), live editing, instant play/edit toggle. |
| 2D map rendering | Pure editor-drawn HTML `<canvas>` from the document. No engine change. |
| 3D view rendering | Engine `RenderPort` (Three) over the live world; **fly camera** (WASD + pointer-lock mouselook). |
| Underlying model | Every edit is a serializable `SceneCommand` → schema-validated document; live world synced from the doc. Undo/redo = bounded snapshot stack over the doc. |
| Geometry model | Place/draw **box & cylinder primitives** now; item `kind` is an extensible tagged union so a future `'sector'` (extruded polygon) slots in without editor rework. |
| Surface model | Per-item **`Surface`** is an extensible tagged union (`color` now, `texture` reserved); a registration-provided palette drives a generic "change surface" tool. Engine stays color-only. |
| Engine additions | Only `RenderPort.setGrid` / `removeGrid` / `setHighlight` (generic, litmus-passing). |
| Document format | The monkey-ball document **is its existing level JSON**; shipped levels load unchanged. The game's `SceneModel` maps the doc to the generic abstractions at its boundary. |
| Test-play | Live (registered `createGameplay`) **and** headless (`runHeadlessPlay → TestPlayResult`) with a pluggable input policy. |
| M14 | Manual authoring of 2 worlds × 3 levels + manual tuning pass; AI/MCP deferred. |
| AI pass | Deferred to **Plan 4 / M16**: editor MCP server, tuning-agent loop, chat overlay. |

## Architecture

### Dependency graph

```
packages/engine/      generic runtime (unchanged philosophy)
        ▲
        │  editor → engine ONLY
packages/editor/      NEW — generic editor core (no game concepts)
        ▲                         ▲
        │                         │
games/monkey-ball/    game runtime + src/editor/registration.ts
        ▲                         ▲
        │     host → editor + game (the only seam)
tools/level-editor/   host app: mounts packages/editor with the game registration
```

Rules (lint-enforced, extending the existing dependency-direction rules):

- `editor → engine` only. The editor core **never** imports `monkey-ball` and
  imports no third-party libs directly (three/rapier/miniplex stay inside
  engine).
- The game provides a registration module (`games/monkey-ball/src/editor/`);
  the **host app** is the single place that imports both `packages/editor` and
  `monkey-ball` and wires them together — analogous to how the game's `main.ts`
  wires engine + game.
- **Editor litmus test** (applied in review on every editor-core change):
  *"Would a platformer's or top-down racer's editor use this API unchanged?"*
  Zero ball/banana/tilt/goal concepts in the editor core.

### Package layout

```
packages/editor/
  src/
    state/        # sceneDoc slice + SceneCommand reducer, selection, tool, mode, history (undo/redo)
    model/        # SceneModel + GameDefinition interfaces, Surface, SceneItem, generic types
    viewport3d/   # fly-camera math, ray build, ray-vs-AABB picking, world-sync (pure) + setCamera/grid/highlight calls
    viewport2d/   # top-down canvas projection, draw, 2D hit-testing, grid (pure draw model)
    tools/        # place/draw, move, delete, change-surface, inspector field model (all emit SceneCommands)
    io/           # import/export (through scene.schema), autosave (persistence middleware)
    play/         # live test-play controller + headless run wiring (calls registration)
    index.ts      # public API: createEditor(host) / EditorHost, types

games/monkey-ball/src/editor/
  registration.ts # GameDefinition<Level>: SceneModel over the level JSON, palette,
                  # buildWorld, createGameplay, runHeadlessPlay, surfacePalette

tools/level-editor/
  src/main.ts     # host shim: mounts createEditor() with monkeyBallRegistration (untested shim)
```

## The generic seam — `GameDefinition` / `SceneModel`

The game registers an **opaque, zod-validated document** plus an adapter the
editor drives generically. The editor core only ever talks to these
abstractions — never to `Level`, `color`, `box`, `spawn`, or `goal`.

```ts
// packages/editor/src/model

/** A placeable thing in the scene, surfaced generically to the viewport/tools. */
interface SceneItem {
  id: string
  kind: 'box' | 'cylinder' | 'archetype'   // extensible union; future: 'sector'
  transform: { position: Vec3; rotationEuler: Vec3 }
  /** box/cylinder footprint+height; archetype name for instances. */
  shape: BoxShape | CylinderShape | ArchetypeRef
  surface: Surface
}

/** Per-item appearance — extensible; engine resolves only 'color' today. */
type Surface =
  | { kind: 'color'; value: string }
  | { kind: 'texture'; textureId: string }   // RESERVED — needs a future engine asset capability

/** A pure, serializable edit. The ONLY way the document mutates. */
type SceneCommand =
  | { type: 'addItem'; item: SceneItem }
  | { type: 'moveSelected'; delta: Vec3 }
  | { type: 'setItemField'; id: string; path: string; value: unknown }  // pos/rot/size, etc.
  | { type: 'setSurface'; id: string; surface: Surface }
  | { type: 'setMetadata'; path: string; value: unknown }               // game settings form
  | { type: 'deleteItems'; ids: string[] }
  | { type: 'loadDoc'; doc: unknown }                                    // import / autosave restore

interface SceneModel<Doc> {
  schema: ZodType<Doc>                       // validation + import/export round-trip
  emptyDoc(): Doc
  listItems(doc: Doc): SceneItem[]           // drives viewport render, picking, inspector
  apply(doc: Doc, cmd: SceneCommand): Doc     // pure; new doc (or throws a typed CommandError)
  metadataFields(doc: Doc): Field[]          // drives the generic metadata inspector form
  getSurface(doc: Doc, id: string): Surface
}

interface GameDefinition<Doc> {
  id: string
  scene: SceneModel<Doc>
  palette: { geometry: GeometryBrush[]; archetypes: ArchetypeBrush[] }
  surfacePalette: Surface[]                   // what "change surface" cycles through (colors today)
  /** Build the live ECS world for a doc — reuses the game's populateLevelWorld. */
  buildWorld(doc: Doc, render: RenderPort, physics: PhysicsPort): World
  /** Live in-viewport test-play (real Three render + input). */
  createGameplay(deps: GameplayDeps<Doc>): Gameplay
  /** Headless metrics run (NullRenderer + real Rapier). */
  runHeadlessPlay(doc: Doc, opts: HeadlessOpts): TestPlayResult
  /** Map a Surface to how it paints in 3D (RenderableDef) and 2D (canvas fill). */
  resolveSurface(s: Surface): { color: string }   // today only 'color'; throws on unsupported kinds
}
```

The **monkey-ball document is its existing `Level` JSON** (`levelKind`/
`levelSchema`). Its `SceneModel`:

- `listItems` maps `geometry[]` → `box`/`cylinder` items and `entities[]` →
  `archetype` items;
- `getSurface`/`setSurface` map the doc's existing `color: string` ⇄
  `{ kind: 'color', value }` — **so the on-disk format never changes and shipped
  levels (`w1-l1.json`, …) load unchanged**;
- `metadataFields` exposes `name`, `timeLimitS`, `fallY`, `spawn`, `goal` as a
  form — the editor renders the form without knowing what those mean.

`spawn`/`goal` stay **metadata fields** (not placeable items) to preserve the
existing level format; promoting them to placeable singleton archetypes is a
possible later refinement, not part of this design.

## Editing model

- **One command stream.** Both viewports and the inspector emit
  `SceneCommand`s. The `sceneDoc` reducer applies them via `scene.apply`,
  re-validates, and bumps a `dirty` flag. This is the editor's expression of
  **AI-readiness constraint #1**: every mutation is plain data through a
  reducer, never logic reachable only from a gesture. An MCP tool (Plan 4) emits
  the same commands.
- **Schema-validated document** (**constraint #2**): the working doc is always a
  value of `scene.schema`; import/export and autosave round-trip through it.
- **Undo/redo** = bounded **snapshot stack** of the document (pure reducer logic
  over a `history` slice). Coarse-grained (per command) and simple; matches the
  v1 spec.
- **Live world sync.** The 3D viewport keeps an ECS world built from the doc via
  `buildWorld`; on doc change it **rebuilds** the world for v1 (simple and
  obviously correct). Per-`id` diffing is an explicit later optimization, not
  part of this design. The 2D map redraws from `listItems`. Neither surface holds
  authoritative state — the doc is the single source of truth.
- **Instant play/edit toggle** (`mode` slice: `edit | play`): entering `play`
  hands the working doc to `createGameplay` running in the 3D viewport with real
  input; the 2D map is hidden. Leaving `play` disposes the gameplay world
  (physics bodies, render handles, entities — leak-tested) and restores the edit
  view with selection/camera intact.

## Viewport design

### 3D fly-through (engine / Three)

- **Fly camera** (pure math, tested): position + yaw/pitch state; WASD/QE move
  along camera basis, mouselook rotates → `{ position, lookAt }` →
  `RenderPort.setCamera`. Pointer-lock + key/mouse wiring is a **thin untested
  shim**.
- Renders the live world via engine `registerRenderables` + `renderSystem`.
  Ground grid via engine `setGrid`. Selection via engine `setHighlight`.
- **Picking** (pure, tested): build a ray from the editor-owned camera state +
  viewport size; ray-vs-ground-plane for placement, ray-vs-AABB over
  `listItems` for selection and for the "change surface" point-and-cycle tool.
  AABBs are computed from each item's shape/transform (pure) — no engine
  raycaster needed.

### 2D top-down map (pure HTML canvas — no engine change)

- The editor draws the document's XZ footprint on a `<canvas>`: `box` → rect,
  `cylinder` → circle, `archetype` → icon, filled per `resolveSurface`, plus its
  own grid and selection styling. Pan/zoom is a pure 2D view transform.
- **Pure projection & hit-testing** (tested): screen ⇄ world-XZ transform;
  rect/circle hit-tests for selection; drag-rectangle → a `box` footprint,
  drag-circle → a `cylinder`. Height/Y is set by scroll (on the selected item)
  and in the inspector.
- Pointer wiring is a **thin untested shim**; all geometry/projection/hit math
  is pure and unit-tested.

## Engine additions (the only engine growth)

Three generic `RenderPort` methods — each passes the engine litmus test (a
racer's or platformer's editor would use them unchanged), so they live in the
engine; the editor can't import Three directly:

```ts
setGrid(opts: { size: number; divisions: number; color: string }): GridId
removeGrid(id: GridId): void
setHighlight(entity: object, on: boolean): void   // outline / emissive toggle
```

Three impl (GridHelper / material emissive), `NullRenderer` records the calls,
both tested. **No** engine camera-mode, raycaster, mesh, or texture additions —
fly camera, 2D map, picking, snapping, and projection are all pure editor logic.

## Geometry model (extensible)

- **Now:** `box` and `cylinder` primitives — the engine's existing
  renderable/rigidBody shapes, with exact colliders. Drawn in 2D (drag-rect /
  drag-circle) or placed in 3D, height/Y tunable.
- **Extensible:** `SceneItem.kind` is a tagged union and **every** editor
  operation (draw, place, move, pick, render-2D, render-3D, inspect) dispatches
  on `kind`. A future `'sector'` (free-form extruded polygon, BUILD-style) is a
  new kind added alongside a future **engine** geometry+collider capability,
  **without reworking the editor core**.
- True sectors are **out of scope here** (engine has no mesh/extrusion support;
  v1 commits to primitives) — see *Out of scope / future*.

## Surface model (extensible)

- **Now:** `Surface = { kind: 'color'; value }`. The "change surface" tool (3D
  point-and-cycle, or 2D on the selection) rotates through the registration's
  `surfacePalette` and emits a `setSurface` command — same picking, same undo.
- **Extensible:** `Surface` is a tagged union; a future `{ kind: 'texture' }`
  palette entry + a future **engine** texture/asset capability slot in
  **without** changing the editor core, picking, inspector control, or command
  model.
- The editor core **never references `color` directly** — it works with
  `Surface` + the palette + `resolveSurface`. This abstraction lives entirely in
  `packages/editor` at **zero engine cost** and is what keeps the editor generic
  on the appearance axis, symmetric with `kind` on the geometry axis.
- Real textures are **out of scope here** (no asset pipeline in v1) — see *Out
  of scope / future*.

## Tools

- **Palette** (from `GameDefinition.palette` + `surfacePalette`): geometry
  brushes, archetype brushes, surface swatches. Selecting a brush sets the
  `tool` slice.
- **Place / draw:** click-to-place (grid-snapped) or drag-to-draw a footprint →
  `addItem`.
- **Move:** drag selected on the ground plane (3D) or in the map (2D) →
  `moveSelected`; height/Y via scroll + inspector → `setItemField`.
- **Delete:** `deleteItems` over the selection.
- **Change surface:** point-and-cycle (3D) / cycle on selection (2D) →
  `setSurface`.
- **Inspector:** a generic form rendered from `metadataFields(doc)` plus the
  selected item's fields (pos/rot/size, archetype overrides) → `setMetadata` /
  `setItemField`. Built as a DOM view, unit-tested in happy-dom.

## Validation, import/export, autosave

- **Validation panel:** runs `scene.schema.safeParse(doc)` on the working doc;
  surfaces flattened issues. An `isExportable` / `isPlayable` selector gates
  export and test-play (invalid documents cannot be exported or played) —
  mirroring the game's "no silent fallback for shipped data."
- **Export:** serialize the doc to JSON (stable key order) and download (download
  is a shim); guarded by `isExportable`. Round-trip is tested: build a doc →
  export string → `scene.schema.parse` equals the doc.
- **Import:** read file text → `scene.schema.parse` → `loadDoc`; invalid input
  surfaces in the validation panel. Round-trips through the **same** validator a
  programmatic author would hit (**constraint #2**).
- **Autosave:** the editor store uses the engine **persistence middleware** to
  debounce-write the `sceneDoc` slice through `localStorageAdapter`; on boot the
  working copy is restored. Versioned; corrupt/old → fresh empty doc with a
  warning (mirrors the game's save migration).

Shipping a level remains: export the `.json` into
`games/monkey-ball/public/data/levels/` and add it to the `worlds.json`
manifest (no asset pipeline in v1).

## Test-play

Two surfaces over the **same** registered systems:

### Live (in-viewport)

The `play` mode hands the working doc to `GameDefinition.createGameplay` (real
Three render + keyboard/joystick input) running in the 3D viewport; toggle back
restores editing.

### Headless (metrics — AI-readiness constraint #3)

```ts
interface TestPlayResult {
  outcome: 'completed' | 'gameOver' | 'incomplete'   // terminal scene, or step cap
  timeMs: number
  fallCount: number      // includes time-expiry falls
  bananas: number
  steps: number
}

runHeadlessPlay(doc, {
  input?: (step: number) => InputVector,   // default: zero input
  maxSteps: number
}): TestPlayResult
```

Runs the **real** gameplay systems with real Rapier + `NullRenderer` +
`NullAudio`, driving a scripted `InputSource` built from `input`. Returns the
typed result by reading the game store at termination. The optional `input` fn
is the **policy seam** a future tuning/eval agent (Plan 4) plugs into;
`TestPlayResult` is the eval signal it optimizes. The editor's own automated
playtest passes no input and asserts "loads + simulates N steps without
throwing, ball above `fallY` at start, result well-typed."

`runHeadlessPlay` is implemented in the **game** package (it needs the game's
systems) and exposed through the registration, so it doubles as the game's own
integration-test harness.

## AI-readiness constraints (preserved)

This design keeps the three forward-looking guardrails from the M11–M15 stub,
now expressed in generic terms:

1. **Ops = serializable commands** — every mutation is a `SceneCommand` through
   the `sceneDoc` reducer (owner: M11–M12).
2. **Levels stay schema-validated data** — `scene.schema`; import/export
   round-trips (owner: M13).
3. **Headless runs emit structured metrics** — `TestPlayResult` (owner: M13;
   relies on M8).

These make **Plan 4 / M16** (editor MCP server over the command model + validate
+ test-play; tuning-agent loop over the metrics; chat overlay) a thin adapter
rather than a rearchitecture. No MCP/agent code is built in M11–M15.

## Milestones (re-scoped M11–M15; PR-sized, TDD throughout)

Themes preserved from the task board; content updated for the generic,
dual-viewport editor.

| # | Milestone |
|---|---|
| **M11** | `packages/editor` scaffold (engine-only); `sceneDoc` + `SceneCommand` reducer + undo/redo; `GameDefinition`/`SceneModel`/`Surface` interfaces; engine `setGrid`/`removeGrid`/`setHighlight`; 3D fly-camera math + 2D map projection (pure); host app `tools/level-editor` mounts editor + monkey-ball registration; live 3D render + canvas 2D render of the doc. |
| **M12** | Palette (geometry/archetype/surface from the registration); place/draw/move/delete in **both** viewports; pure picking (3D ray-vs-AABB, 2D rect/circle hit); selection + highlight; change-surface tool; generic inspector form; validation panel + `isExportable`. |
| **M13** | Instant in-viewport test-play (`createGameplay`); headless `runHeadlessPlay → TestPlayResult`; import/export round-trip through `scene.schema`; autosave via persistence middleware. |
| **M14** | Dogfood-author 2 worlds × 3 levels in the editor; extend `worlds.json`; manual tuning pass + recorded per-level headless metric baselines; write the **Plan 4 / M16** forward-pointer stub. |
| **M15** | Pixel-ratio cap (named constant, applied to editor canvas too); visibility-pause confirmed for game + editor test-play; input feel; Playwright smokes (game: boot→menu→play→ball moves; editor: draw a box in the 2D map → export contains it); release builds for game + editor. |

The `AGENTS.md` task board and the M11–M15 plan stub are rewritten to this
architecture as part of executing Plan 3.

## Testing strategy (strict TDD)

- **Pure unit tests (bulk):** `SceneCommand` reducer + `scene.apply`; undo/redo
  stack; fly-camera math; 2D projection & hit-testing; ray build + ray-vs-AABB +
  ground-plane intersection; grid snap; surface cycling; inspector field model;
  validation; export/import round-trip. DOM views (palette, inspector,
  validation panel) in happy-dom.
- **System / integration:** registration `buildWorld` against in-memory world +
  Null adapters; `runHeadlessPlay` against **real Rapier** in Node (a shipped
  level loads, simulates, returns a well-typed result); engine grid/highlight on
  the Three renderer and `NullRenderer`.
- **Browser-only shims** (added to the untested inventory, excluded from the
  coverage gate, kept trivially thin): the host `tools/level-editor/src/main.ts`,
  the 3D pointer-lock/fly input shim, and the 2D-canvas pointer shim. Covered by
  the editor Playwright smoke.
- **Coverage gate stays 90%** lines/branches on non-shim code. CI = lint (incl.
  dependency-direction rules + editor litmus boundary) + typecheck + tests.

## Error handling

- Document validation: file + flattened zod issues in the validation panel;
  invalid documents refuse export and test-play.
- Autosave: versioned; corrupt/old → fresh empty doc with a warning.
- Test-play teardown disposes physics bodies, render handles, and entities; leak
  assertions in tests (as gameplay teardown already does).
- `resolveSurface` / unsupported `kind`: a typed error surfaced in the editor,
  never a silent wrong-render (guards against a half-added future `sector`/
  `texture`).

## Out of scope / future

- **True BUILD sectors** (free-form extruded-polygon geometry + generated
  colliders) — a future engine geometry milestone; the `kind` union is designed
  to accept it.
- **Textures / materials / asset pipeline** — a future engine capability; the
  `Surface` union is designed to accept `{ kind: 'texture' }`.
- **Plan 4 / M16 — the AI-first pass:** editor MCP server (over the command
  model + validate + test-play), tuning-agent loop (over `TestPlayResult`), and
  an in-editor **chat overlay**. Designed in its own spec once M13's APIs are
  stable, to avoid building the wrapper twice. It is an LLM application and will
  be designed against the current Anthropic MCP / Agent SDK and latest models.
- **Engine ortho camera / second WebGL viewport** — explicitly avoided; the 2D
  map is pure canvas.

## Known risks (planned for)

- **Generic core leaking game concepts** → enforced by the package boundary +
  editor litmus test in review; monkey-ball is the only consumer, so a second
  registration (even a trivial test fixture) is the real proof — add a minimal
  fake registration in tests to keep the seam honest.
- **AABB picking accuracy** for rotated/cylinder geometry → keep pick/snap math
  well-tested with explicit fixtures.
- **Test-play teardown leaks** → leak-tested dispose, same discipline as the
  game.
- **Two render surfaces (canvas 2D + Three 3D) drifting** → both derive purely
  from `listItems`; no independent state.
- **Dual-viewport scope** is the largest cost; M11 deliberately lands both
  surfaces rendering (read-only) before M12 adds editing, so the riskiest
  integration is proven early.
