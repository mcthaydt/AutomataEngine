# Generic Editor / Content / Polish (M11–M15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a **generic, engine-powered level editor** (`packages/editor`) that the monkey-ball game registers its content into, author the shipping content in it, and complete release polish — milestones M11–M15.

**Overall progress:** 11% (21/200 checklist items complete)

**Architecture:** The editor is generic like the engine: `packages/editor` depends **only** on `@automata/engine` and is driven by a `GameDefinition` the game registers; a host app `tools/level-editor` is the sole place the game and editor meet. Editing is BUILD 2-style — a dual viewport (pure-canvas 2D top-down map + Three fly-through 3D) editing one **serializable `SceneCommand`** stream into a **schema-validated document**, with live world sync and an instant play/edit toggle. The engine grows only three generic `RenderPort` methods (`setGrid`/`removeGrid`/`setHighlight`).

**Tech Stack:** Existing workspace toolchain (TypeScript strict, Vitest, ESLint flat config, Vite). The engine wraps three/rapier/miniplex/zod; the editor and game import only `@automata/engine`. **No new third-party dependencies** until M15 (Playwright, dev-only).

**Spec:** `docs/superpowers/specs/2026-06-18-generic-editor-design.md` (supersedes the editor section of the v1 spec `docs/superpowers/specs/2026-06-09-automata-engine-monkey-ball-design.md`). This plan covers M11–M15. The follow-on AI work (editor MCP server + tuning-agent loop + chat overlay) is **Plan 4 / M16**, written after M13 stabilizes.

## Global Constraints

Copied from the spec; every task's requirements implicitly include these.

- **Dependency direction (lint-enforced):** `editor → engine` only. The editor core never imports `monkey-ball` and imports no third-party libs directly (three/rapier/miniplex/smol-toml/yaml/zod stay inside engine). The host app `tools/level-editor` is the only module that imports both `@automata/editor` and `monkey-ball`.
- **Editor litmus test** (review gate on every editor-core change): *"Would a platformer's or top-down racer's editor use this API unchanged?"* Zero ball/banana/tilt/goal/spawn concepts in the editor core.
- **Engine litmus test** (unchanged): *"Would a top-down racer or platformer use this API unchanged?"* The only engine additions in this plan are `RenderPort.setGrid` / `removeGrid` / `setHighlight`.
- **AI-readiness constraints (preserve all three):** (1) every editor mutation is a serializable `SceneCommand` through the document reducer; (2) levels stay schema-validated data, import/export round-trips through `SceneModel.parse` + `validateDoc`; (3) a headless `NullRenderer` run emits a typed `TestPlayResult`.
- **Format conventions:** TOML = tuning config, YAML = archetypes, JSON = levels/manifests. The monkey-ball document **is** its existing `Level` JSON — shipped levels load unchanged.
- **Coverage gate:** 90% lines and branches on non-shim code, now covering `packages/engine/src/**` and `packages/editor/src/**`.
- **Browser-only shims** are untested, excluded from coverage, kept trivially thin. The inventory grows by: the host `tools/level-editor/src/main.ts`, the 3D pointer-lock/fly input shim (`packages/editor/src/viewport3d/browser.ts`), and the 2D-canvas pointer shim (`packages/editor/src/viewport2d/browser.ts`). All editor shim files are named `browser.ts` so the existing coverage exclude `**/browser.ts` catches them.
- **TDD throughout:** red-green-refactor; tests written first; run before any green claim.

## Conventions used throughout

- All commands run from the repo root: `/Users/mcthaydt/Desktop/AutomataEngine`.
- Test files live in the package's `tests/` dir, mirroring `src/` (e.g. `packages/editor/tests/state/document.test.ts` tests `packages/editor/src/state/document.ts`).
- "Run: `npx vitest run <path>`" — with the root projects config, a path argument filters to that file.
- Editor tests run in **happy-dom** (the package default set in Task 2); engine tests run in **node**. Files that use real Rapier carry a `// @vitest-environment node` pragma on line 1.
- `@automata/engine` public API is re-exported from `packages/engine/src/index.ts`; "add to the engine barrel" means append the shown `export` line there. `@automata/editor` is re-exported from `packages/editor/src/index.ts`.
- API drift note: if an installed library's API differs from the code shown, check its installed types and adapt internals — never the port interfaces.

## Design deltas from the spec (decided while planning, with reasons)

1. **`GameDefinition.play` is an optional sub-object** `{ createGameplay, runHeadlessPlay }`, not flat members. *Why:* test-play lands in M13, but the editor core (M11–M12) must compile and the host must mount without it. The play controller (M13) requires `play` to be present and errors clearly if a definition omits it. The spec's flat sketch is illustrative.
2. **The editor store is `document` + `selection` + `tool` + `mode` slices composed by `combineReducers`**, where `document` owns the doc, `dirty`, and the bounded undo/redo stacks (`past`/`future`). *Why:* undo/redo wraps the document only; selection/tool/mode are independent and must not be on the undo stack.
3. **A minimal fake registration fixture** (`packages/editor/tests/fixtures/fakeDefinition.ts`) backs the editor-core tests. *Why:* the spec's risk register requires a second, non-monkey-ball consumer to keep the generic seam honest; it is also the cleanest way to unit-test the core without dragging in the game.
4. **`Vec3` and store primitives are re-used from `@automata/engine`** (the editor's only dependency); the editor does not define its own vector type.
5. **`SceneModel` exposes `parse(input)` instead of `schema: ZodType<Doc>`.** *Why:* the editor package is lint-forbidden from importing `zod`; the game owns schema validation behind its registration. Any round-trip or AI-readiness check uses `definition.scene.parse(...)` and `validateDoc(...)`, never `scene.schema`.
6. **`moveSelected` carries explicit `ids`.** *Why:* the reducer keeps selection outside the document undo stack, so commands must be replayable and serializable without ambient selection state.
7. **M11-M15 intentionally ship point placement for geometry.** The `Brush.place` union keeps the future drag-draw vocabulary, but this plan uses `place: 'point'` for box/cylinder brushes. Drag-to-draw footprints, scroll-to-set-height, and full transform/rotation gizmos are deferred to a later editor polish slice. To avoid a half-exposed model, M12's inspector exposes position plus box/cylinder size fields that `setItemField` can actually persist.
8. **Autosave uses a small editor IO helper, not the engine persistence middleware.** *Why:* editor autosave stores an opaque validated document snapshot with debounce and versioning; the engine middleware remains appropriate for game state stores.
9. **Play mode is gated by validation.** `enterPlay()` refuses invalid documents via `validateDoc` before creating the live gameplay handle, so "invalid documents cannot be played" is enforced in the editor core.

**Execution notes (read before starting):**
1. **Run the gate per task.** Tasks run `npx vitest run <file>`; run `npm run typecheck` (or `npm run ci`) at the end of each task — the dependency-direction ESLint rules and strict TS catch boundary violations early. Full `npm run ci` is required at each milestone checkpoint.
2. **The "verify in a real browser" steps are human gates.** Each milestone ends with a manual checkpoint (`npm run dev -w level-editor` / `-w monkey-ball`, open the URL, observe). An automated/subagent runner cannot complete these — pause for a human or explicitly defer, but never mark them done from code alone. Stop the dev server after each.
3. **`Infinity` cardinality** is written as `Number.POSITIVE_INFINITY` in code; JSON-serialized brushes are constructed in TS, never parsed from JSON, so this is safe.

---

## Milestone M11 — Generic editor core, dual-viewport shell

Delivers: the engine grid/highlight additions; the `packages/editor` package with the generic model, command/undo store, pure fly-camera + 2D-projection math, and world-sync rendering; a partial monkey-ball registration (enough to render and edit a level); and a host app that shows the live 3D world + 2D map of a loaded level. Editing tools land in M12.

### Task 1: Engine — `RenderPort.setGrid` / `removeGrid` / `setHighlight`

Generic scene-graph aids a racer's or platformer's editor would use unchanged, so they live in the engine (the editor cannot import Three).

**Files:**
- Modify: `packages/engine/src/render/port.ts`
- Modify: `packages/engine/src/render/three.ts`
- Modify: `packages/engine/src/render/null.ts`
- Test: `packages/engine/tests/render/three-grid.test.ts`
- Test: `packages/engine/tests/render/null.test.ts` (add cases)

**Interfaces:**
- Produces: `RenderPort.setGrid(opts: { size: number; divisions: number; color: string }): GridId`, `RenderPort.removeGrid(id: GridId): void`, `RenderPort.setHighlight(entity: object, on: boolean): void`; `type GridId = number`.

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/render/three-grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createThreeRenderer } from '../../src/render/three'

describe('render grid + highlight', () => {
  it('adds and removes a grid as a scene child', () => {
    const { port, scene } = createThreeRenderer()
    const before = scene.children.length
    const grid = port.setGrid({ size: 20, divisions: 20, color: '#334' })
    expect(scene.children.length).toBe(before + 1)
    port.removeGrid(grid)
    expect(scene.children.length).toBe(before)
  })

  it('removeGrid on an unknown id is a no-op', () => {
    const { port } = createThreeRenderer()
    expect(() => port.removeGrid(999)).not.toThrow()
  })

  it('setHighlight toggles emissive on the entity mesh without throwing', () => {
    const { port } = createThreeRenderer()
    const entity = {}
    port.add(entity, { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color: '#fff' })
    expect(() => port.setHighlight(entity, true)).not.toThrow()
    expect(() => port.setHighlight(entity, false)).not.toThrow()
    expect(() => port.setHighlight({}, true)).not.toThrow() // unknown entity: no-op
  })
})
```

Append to `packages/engine/tests/render/null.test.ts` inside the `describe('createNullRenderer', …)` block:
```ts
  it('records grid + highlight calls', () => {
    const renderer = createNullRenderer()
    const grid = renderer.port.setGrid({ size: 10, divisions: 10, color: '#222' })
    const entity = {}
    renderer.port.setHighlight(entity, true)
    renderer.port.removeGrid(grid)
    expect(renderer.calls.map((c) => c.op)).toEqual(['setGrid', 'setHighlight', 'removeGrid'])
    expect(renderer.calls[1]).toMatchObject({ op: 'setHighlight', entity, on: true })
  })
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/render/three-grid.test.ts packages/engine/tests/render/null.test.ts`
Expected: FAIL — `port.setGrid is not a function`.

- [x] **Step 3: Implement**

In `packages/engine/src/render/port.ts`, add to the `RenderPort` interface (after `removeGroup`):
```ts
  /** Adds a reference grid on the ground plane; returns a handle for removal. */
  setGrid(opts: { size: number; divisions: number; color: string }): GridId
  removeGrid(grid: GridId): void
  /** Toggles a selection highlight on a previously-added entity (no-op if unknown). */
  setHighlight(entity: object, on: boolean): void
```
and add the type alias near `GroupId`:
```ts
export type GridId = number
```

In `packages/engine/src/render/three.ts`:
- add `GridHelper` and `Color` to the existing `three` import, and `MeshStandardMaterial` is already imported;
- after the `groups` map declarations add:
```ts
  const grids = new Map<GridId, GridHelper>()
  let nextGridId: GridId = 1
```
- add these methods to the `port` object (after `removeGroup`):
```ts
    setGrid({ size, divisions, color }) {
      const grid = new GridHelper(size, divisions, new Color(color), new Color(color))
      scene.add(grid)
      const id = nextGridId++
      grids.set(id, grid)
      return id
    },

    removeGrid(gridId) {
      const grid = grids.get(gridId)
      if (!grid) return
      grid.removeFromParent()
      grid.geometry.dispose()
      ;(grid.material as Material).dispose()
      grids.delete(gridId)
    },

    setHighlight(entity, on) {
      const mesh = meshes.get(entity)
      if (!mesh) return
      const material = mesh.material as MeshStandardMaterial
      material.emissive.set(on ? '#ffffff' : '#000000')
      material.emissiveIntensity = on ? 0.4 : 0
    },
```
- update `GridId` in the type import from `./port`: change `import type { GroupId, RenderPort } from './port'` to `import type { GridId, GroupId, RenderPort } from './port'`.
- in `dispose()`, after the groups cleanup add `for (const grid of grids.values()) grid.removeFromParent(); grids.clear()`.

In `packages/engine/src/render/null.ts`:
- extend the `RenderCall.op` union to include `'setGrid' | 'removeGrid' | 'setHighlight'`;
- add optional fields to `RenderCall` used by these ops: `grid?: GridId`, `on?: boolean` (and `entity?: object` if not already present);
- import the `GridId` type from `./port`;
- track an id counter and add methods to the `port` object (after `removeGroup`):
```ts
    setGrid(opts) {
      const grid = nextGridId++
      calls.push({ op: 'setGrid', grid, opts })
      return grid
    },
    removeGrid(grid) {
      calls.push({ op: 'removeGrid', grid })
    },
    setHighlight(entity, on) {
      calls.push({ op: 'setHighlight', entity, on })
    },
```
with `let nextGridId = 1` declared alongside the existing counters and `opts?: { size: number; divisions: number; color: string }` added to `RenderCall`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/render/three-grid.test.ts packages/engine/tests/render/null.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(engine): RenderPort setGrid/removeGrid/setHighlight for editor viewport"
```

### Task 2: `packages/editor` scaffold + lint/coverage wiring

**Files:**
- Create: `packages/editor/package.json`
- Create: `packages/editor/tsconfig.json`
- Create: `packages/editor/vitest.config.ts`
- Create: `packages/editor/src/version.ts`
- Create: `packages/editor/src/index.ts`
- Modify: `eslint.config.js`
- Modify: `vitest.config.ts` (root — coverage include)
- Test: `packages/editor/tests/smoke.test.ts`

**Interfaces:**
- Produces: package `@automata/editor` (exports `./src/index.ts`); `EDITOR_VERSION` constant.

- [x] **Step 1: Write the scaffold files**

`packages/editor/package.json`:
```json
{
  "name": "@automata/editor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "@automata/engine": "*" }
}
```

`packages/editor/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/editor/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'editor', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

`packages/editor/src/version.ts`:
```ts
export const EDITOR_VERSION = '0.1.0'
```

`packages/editor/src/index.ts`:
```ts
export { EDITOR_VERSION } from './version'
```

- [x] **Step 2: Wire lint + coverage**

In `eslint.config.js`, extend the games/tools restriction to include the editor package, and forbid the editor from importing the game. Change the `files: ['games/**/*.ts', 'tools/**/*.ts']` block to also cover `packages/editor`:
```js
  {
    // Game, tools, and editor may only use third-party libs through @automata/engine.
    files: ['games/**/*.ts', 'tools/**/*.ts', 'packages/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['three', 'three/*', '@dimforge/*', 'miniplex', 'smol-toml', 'yaml', 'zod'],
          message: 'Import the engine-wrapped API from @automata/engine instead.'
        }]
      }]
    }
  },
  {
    // The generic editor core must not depend on any game.
    files: ['packages/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['monkey-ball', 'monkey-ball/*'],
          message: 'The editor core is generic; the game registers itself via GameDefinition.'
        }]
      }]
    }
  },
```
and in the engine block's restricted group, add `'@automata/editor'`:
```js
          group: ['monkey-ball', 'monkey-ball/*', 'level-editor', 'level-editor/*', '@automata/editor'],
```

In the root `vitest.config.ts`, extend `coverage.include`:
```ts
      include: ['packages/engine/src/**', 'packages/editor/src/**'],
```
(The existing `exclude: ['**/browser.ts', '**/index.ts', '**/version.ts']` already covers editor shims and barrels.)

- [x] **Step 3: Write the failing smoke test**

`packages/editor/tests/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EDITOR_VERSION } from '../src/index'

describe('editor package', () => {
  it('exports its version', () => {
    expect(EDITOR_VERSION).toBe('0.1.0')
  })
})
```

- [x] **Step 4: Install the workspace + run**

```bash
npm install
npx vitest run packages/editor/tests/smoke.test.ts
```
Expected: PASS (1 test). `npm install` links the new `@automata/editor` workspace.

- [x] **Step 5: Typecheck + lint + commit**

```bash
npm run typecheck
npm run lint
git add -A
git commit -m "chore(editor): scaffold @automata/editor package with lint + coverage wiring"
```

### Task 3: Generic model types + `GameDefinition` / `SceneModel` + fake fixture

**Files:**
- Create: `packages/editor/src/model/types.ts`
- Create: `packages/editor/src/model/gameDefinition.ts`
- Create: `packages/editor/tests/fixtures/fakeDefinition.ts`
- Test: `packages/editor/tests/model/fakeDefinition.test.ts`

**Interfaces:**
- Produces: `SceneItem`, `Surface`, `SceneCommand`, `Brush`, `MarkerRef`, `BoxShape`, `CylinderShape`, `ArchetypeRef`, `Field`, `ItemKind`; `SceneModel<Doc>`, `GameDefinition<Doc>`, `CommandError`; the fake `FakeDoc` + `fakeDefinition` test fixture (`{ doc: FakeDoc; ... }`).
- Consumes: `Vec3` from `@automata/engine`.

- [x] **Step 1: Write the model types**

`packages/editor/src/model/types.ts`:
```ts
import type { Vec3 } from '@automata/engine'

export type ItemKind = 'box' | 'cylinder' | 'archetype' | 'marker' // extensible; future: 'sector'

export interface BoxShape { type: 'box'; size: Vec3 }
export interface CylinderShape { type: 'cylinder'; radius: number; height: number }
export interface ArchetypeRef { type: 'archetype'; name: string }
export interface MarkerRef { type: 'marker'; markerId: string } // e.g. 'spawn', 'goal'
export type ItemShape = BoxShape | CylinderShape | ArchetypeRef | MarkerRef

/** Per-item appearance — extensible; the engine resolves only 'color' today. */
export type Surface =
  | { kind: 'color'; value: string }
  | { kind: 'texture'; textureId: string } // RESERVED — needs a future engine asset capability

export interface ItemTransform { position: Vec3; rotationEuler: Vec3 }

/** A placeable thing in the scene, surfaced generically to viewport + tools. */
export interface SceneItem {
  id: string
  kind: ItemKind
  transform: ItemTransform
  shape: ItemShape
  surface: Surface
}

/** A pure, serializable edit. The ONLY way a document mutates. */
export type SceneCommand =
  | { type: 'addItem'; item: SceneItem }
  | { type: 'moveSelected'; ids: string[]; delta: Vec3 }
  | { type: 'setItemField'; id: string; path: string; value: unknown }
  | { type: 'setSurface'; id: string; surface: Surface }
  | { type: 'setMetadata'; path: string; value: unknown }
  | { type: 'deleteItems'; ids: string[] }
  | { type: 'loadDoc'; doc: unknown }

/** A brush is a placeable; cardinality is enforced generically by the editor. */
export interface Brush {
  id: string
  label: string
  /** What this brush produces and how it is placed. */
  kind: ItemKind
  place: 'point' | 'draw-box' | 'draw-circle'
  /** Inclusive bounds on how many items of this brush a document may hold. */
  cardinality: { min: number; max: number }
  /** For archetype/marker brushes: the shape name written into placed items. */
  ref?: string
}

/** A single inspector form field, generated from the document. */
export interface Field {
  path: string
  label: string
  type: 'number' | 'text'
  value: number | string
}
```

- [x] **Step 2: Write the registration interfaces**

`packages/editor/src/model/gameDefinition.ts`:
```ts
import type { PhysicsPort, RenderPort, World } from '@automata/engine'
import type { Brush, Field, SceneCommand, SceneItem, Surface } from './types'

/** Thrown by SceneModel.apply when a command cannot be applied. */
export class CommandError extends Error {}

/** The game's adapter over its opaque, schema-validated document. */
export interface SceneModel<Doc> {
  /** Parses unknown input into a valid Doc or throws (zod-backed). */
  parse(input: unknown): Doc
  emptyDoc(): Doc
  /** All placeable items (geometry, archetypes, synthesized markers). */
  listItems(doc: Doc): SceneItem[]
  /** Pure: returns a new Doc, or throws CommandError. */
  apply(doc: Doc, cmd: SceneCommand): Doc
  /** Scalar metadata fields for the inspector form. */
  metadataFields(doc: Doc): Field[]
  getSurface(doc: Doc, id: string): Surface
}

export interface HeadlessOpts {
  input?: (step: number) => { x: number; y: number }
  maxSteps: number
}

export interface TestPlayResult {
  outcome: 'completed' | 'gameOver' | 'incomplete'
  timeMs: number
  fallCount: number
  bananas: number
  steps: number
}

/** Live in-viewport gameplay handle (mirrors the game's Gameplay). */
export interface PlayHandle {
  fixedUpdate(dt: number): void
  render(alpha: number): void
  dispose(): void
}

/** Optional test-play members; present from M13 onward. */
export interface PlayDefinition<Doc> {
  createGameplay(doc: Doc, render: RenderPort, physics: PhysicsPort): PlayHandle
  runHeadlessPlay(doc: Doc, opts: HeadlessOpts): Promise<TestPlayResult>
}

export interface GameDefinition<Doc> {
  id: string
  scene: SceneModel<Doc>
  palette: { geometry: Brush[]; archetypes: Brush[]; markers: Brush[] }
  /** What the "change surface" tool cycles through (colors today). */
  surfacePalette: Surface[]
  /** Builds the live ECS world for a doc into the given ports. */
  buildWorld(doc: Doc, render: RenderPort, physics: PhysicsPort): World<object>
  /** Maps a Surface to how it paints; throws on unsupported kinds. */
  resolveSurface(s: Surface): { color: string }
  /** Test-play; added in M13. The play controller requires this. */
  play?: PlayDefinition<Doc>
}
```

- [x] **Step 3: Write the fake registration fixture**

`packages/editor/tests/fixtures/fakeDefinition.ts`:
```ts
import type { GameDefinition, SceneModel } from '../../src/model/gameDefinition'
import { CommandError } from '../../src/model/gameDefinition'
import type { SceneItem, Surface } from '../../src/model/types'

/** A minimal non-game document: a flat item list + a title. Proves genericity. */
export interface FakeDoc { title: string; items: SceneItem[] }

const fakeScene: SceneModel<FakeDoc> = {
  parse: (input) => input as FakeDoc,
  emptyDoc: () => ({ title: 'untitled', items: [] }),
  listItems: (doc) => doc.items,
  metadataFields: (doc) => [{ path: 'title', label: 'Title', type: 'text', value: doc.title }],
  getSurface: (doc, id) =>
    doc.items.find((i) => i.id === id)?.surface ?? { kind: 'color', value: '#fff' },
  apply(doc, cmd) {
    switch (cmd.type) {
      case 'addItem':
        return { ...doc, items: [...doc.items, cmd.item] }
      case 'deleteItems':
        return { ...doc, items: doc.items.filter((i) => !cmd.ids.includes(i.id)) }
      case 'moveSelected':
        return {
          ...doc,
          items: doc.items.map((i) =>
            cmd.ids.includes(i.id)
              ? { ...i, transform: { ...i.transform, position: {
                  x: i.transform.position.x + cmd.delta.x,
                  y: i.transform.position.y + cmd.delta.y,
                  z: i.transform.position.z + cmd.delta.z } } }
              : i)
        }
      case 'setSurface':
        return { ...doc, items: doc.items.map((i) => i.id === cmd.id ? { ...i, surface: cmd.surface } : i) }
      case 'setMetadata':
        if (cmd.path === 'title') return { ...doc, title: String(cmd.value) }
        throw new CommandError(`unknown metadata ${cmd.path}`)
      case 'setItemField':
        throw new CommandError('fake has no item fields')
      case 'loadDoc':
        return fakeScene.parse(cmd.doc)
    }
  }
}

const swatch = (value: string): Surface => ({ kind: 'color', value })

export const fakeDefinition: GameDefinition<FakeDoc> = {
  id: 'fake',
  scene: fakeScene,
  palette: {
    geometry: [{ id: 'box', label: 'Box', kind: 'box', place: 'point',
      cardinality: { min: 0, max: Number.POSITIVE_INFINITY } }],
    archetypes: [],
    markers: [{ id: 'start', label: 'Start', kind: 'marker', place: 'point', ref: 'start',
      cardinality: { min: 1, max: 1 } }]
  },
  surfacePalette: [swatch('#e0e0e0'), swatch('#ff5964'), swatch('#4ecdc4')],
  buildWorld: () => { throw new Error('fake buildWorld unused in core tests') },
  resolveSurface: (s) => {
    if (s.kind === 'color') return { color: s.value }
    throw new CommandError(`unsupported surface ${s.kind}`)
  }
}

export function boxItem(id: string, x = 0, z = 0): SceneItem {
  return {
    id, kind: 'box',
    transform: { position: { x, y: 0, z }, rotationEuler: { x: 0, y: 0, z: 0 } },
    shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
    surface: { kind: 'color', value: '#e0e0e0' }
  }
}
```

- [x] **Step 4: Write the failing test**

`packages/editor/tests/model/fakeDefinition.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'

describe('generic SceneModel (fake registration)', () => {
  const { scene } = fakeDefinition

  it('adds, moves, and deletes items purely', () => {
    let doc = scene.emptyDoc()
    doc = scene.apply(doc, { type: 'addItem', item: boxItem('a', 1, 1) })
    doc = scene.apply(doc, { type: 'moveSelected', ids: ['a'], delta: { x: 2, y: 0, z: 0 } })
    expect(scene.listItems(doc)[0]!.transform.position).toEqual({ x: 3, y: 0, z: 1 })
    doc = scene.apply(doc, { type: 'deleteItems', ids: ['a'] })
    expect(scene.listItems(doc)).toEqual([])
  })

  it('edits metadata and surfaces', () => {
    let doc = scene.apply(scene.emptyDoc(), { type: 'addItem', item: boxItem('a') })
    doc = scene.apply(doc, { type: 'setMetadata', path: 'title', value: 'Hi' })
    doc = scene.apply(doc, { type: 'setSurface', id: 'a', surface: { kind: 'color', value: '#000' } })
    expect(scene.metadataFields(doc)[0]).toMatchObject({ path: 'title', value: 'Hi' })
    expect(scene.getSurface(doc, 'a')).toEqual({ kind: 'color', value: '#000' })
  })

  it('declares a singleton marker brush', () => {
    expect(fakeDefinition.palette.markers[0]!.cardinality).toEqual({ min: 1, max: 1 })
  })
})
```

- [x] **Step 5: Run tests to verify they pass (types compile)**

Run: `npx vitest run packages/editor/tests/model/fakeDefinition.test.ts`
Expected: PASS (3 tests).

- [x] **Step 6: Export from the barrel + commit**

Append to `packages/editor/src/index.ts`:
```ts
export * from './model/types'
export * from './model/gameDefinition'
```
Then:
```bash
npm run typecheck
git add -A
git commit -m "feat(editor): generic SceneModel/GameDefinition model + fake fixture"
```

### Task 4: `document` slice — apply commands, dirty flag, bounded undo/redo

**Files:**
- Create: `packages/editor/src/state/actions.ts`
- Create: `packages/editor/src/state/document.ts`
- Test: `packages/editor/tests/state/document.test.ts`

**Interfaces:**
- Consumes: `SceneModel`, `SceneCommand`, `CommandError`.
- Produces: `EditorAction`; `DocumentState<Doc>` (`{ doc; dirty; past; future }`), `createDocumentReducer(scene, opts?): Reducer<DocumentState<Doc>, EditorAction>`, `initialDocument(scene): DocumentState<Doc>`, `UNDO_LIMIT`.

- [x] **Step 1: Write the failing tests**

`packages/editor/tests/state/document.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createDocumentReducer, initialDocument } from '../../src/state/document'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const scene = fakeDefinition.scene
const reduce = createDocumentReducer<FakeDoc>(scene)
const start = () => initialDocument(scene)

describe('document slice', () => {
  it('applies a command, sets dirty, and records history', () => {
    const next = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(scene.listItems(next.doc)).toHaveLength(1)
    expect(next.dirty).toBe(true)
    expect(next.past).toHaveLength(1)
    expect(next.future).toEqual([])
  })

  it('undo restores the prior doc; redo re-applies', () => {
    let s = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    s = reduce(s, { type: 'undo' })
    expect(scene.listItems(s.doc)).toHaveLength(0)
    expect(s.future).toHaveLength(1)
    s = reduce(s, { type: 'redo' })
    expect(scene.listItems(s.doc)).toHaveLength(1)
  })

  it('a new command after undo clears the redo future', () => {
    let s = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    s = reduce(s, { type: 'undo' })
    s = reduce(s, { type: 'command', command: { type: 'addItem', item: boxItem('b') } })
    expect(s.future).toEqual([])
    expect(scene.listItems(s.doc)).toHaveLength(1)
  })

  it('ignores a command that throws CommandError (no history churn)', () => {
    const s = reduce(start(), { type: 'command', command: { type: 'setItemField', id: 'x', path: 'p', value: 1 } })
    expect(s.past).toEqual([])
    expect(s.dirty).toBe(false)
  })

  it('loadDoc replaces the doc and resets history + dirty', () => {
    let s = reduce(start(), { type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    const loaded: FakeDoc = { title: 'x', items: [boxItem('z')] }
    s = reduce(s, { type: 'loadDoc', doc: loaded })
    expect(scene.listItems(s.doc).map((i) => i.id)).toEqual(['z'])
    expect(s.past).toEqual([])
    expect(s.future).toEqual([])
    expect(s.dirty).toBe(false)
  })

  it('caps the undo stack at UNDO_LIMIT', () => {
    let s = start()
    for (let i = 0; i < 250; i++) {
      s = reduce(s, { type: 'command', command: { type: 'addItem', item: boxItem(`i${i}`) } })
    }
    expect(s.past.length).toBeLessThanOrEqual(200)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/state/document.test.ts`
Expected: FAIL — cannot resolve `../../src/state/document`.

- [x] **Step 3: Implement**

`packages/editor/src/state/actions.ts`:
```ts
import type { SceneCommand } from '../model/types'
import type { Surface } from '../model/types'

export interface ToolSelection { brushId: string | null; mode: 'select' | 'place' | 'surface' }

export type EditorAction =
  | { type: 'command'; command: SceneCommand }
  | { type: 'loadDoc'; doc: unknown }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'setTool'; tool: ToolSelection }
  | { type: 'setSurfaceBrush'; surface: Surface }
  | { type: 'setMode'; mode: 'edit' | 'play' }
```

`packages/editor/src/state/document.ts`:
```ts
import type { Reducer } from '@automata/engine'
import type { SceneModel } from '../model/gameDefinition'
import { CommandError } from '../model/gameDefinition'
import type { EditorAction } from './actions'

export const UNDO_LIMIT = 200

export interface DocumentState<Doc> {
  doc: Doc
  dirty: boolean
  past: Doc[]
  future: Doc[]
}

export function initialDocument<Doc>(scene: SceneModel<Doc>): DocumentState<Doc> {
  return { doc: scene.emptyDoc(), dirty: false, past: [], future: [] }
}

export function createDocumentReducer<Doc>(
  scene: SceneModel<Doc>
): Reducer<DocumentState<Doc>, EditorAction> {
  return (state, action) => {
    switch (action.type) {
      case 'command': {
        let next: Doc
        try {
          next = scene.apply(state.doc, action.command)
        } catch (error) {
          if (error instanceof CommandError) return state
          throw error
        }
        const past = [...state.past, state.doc].slice(-UNDO_LIMIT)
        return { doc: next, dirty: true, past, future: [] }
      }
      case 'loadDoc':
        return { doc: scene.parse(action.doc), dirty: false, past: [], future: [] }
      case 'undo': {
        const prev = state.past.at(-1)
        if (prev === undefined) return state
        return { doc: prev, dirty: true, past: state.past.slice(0, -1), future: [state.doc, ...state.future] }
      }
      case 'redo': {
        const [next, ...rest] = state.future
        if (next === undefined) return state
        return { doc: next, dirty: true, past: [...state.past, state.doc], future: rest }
      }
      default:
        return state
    }
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/state/document.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): document slice with command apply + bounded undo/redo"
```

### Task 5: `selection`, `tool`, `mode` slices

**Files:**
- Create: `packages/editor/src/state/selection.ts`
- Create: `packages/editor/src/state/tool.ts`
- Create: `packages/editor/src/state/mode.ts`
- Test: `packages/editor/tests/state/uiSlices.test.ts`

**Interfaces:**
- Consumes: `EditorAction`, `Surface`, `ToolSelection`.
- Produces: `selectionReducer`, `initialSelection` (`string[]`); `ToolState` (`{ selection: ToolSelection; surface: Surface }`), `toolReducer`, `initialTool`; `modeReducer`, `initialMode` (`'edit' | 'play'`).

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/state/uiSlices.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { initialSelection, selectionReducer } from '../../src/state/selection'
import { initialTool, toolReducer } from '../../src/state/tool'
import { initialMode, modeReducer } from '../../src/state/mode'

describe('selection slice', () => {
  it('replaces the selection', () => {
    expect(selectionReducer(initialSelection, { type: 'select', ids: ['a', 'b'] })).toEqual(['a', 'b'])
  })
  it('clears selection when items are deleted', () => {
    const after = selectionReducer(['a', 'b'], { type: 'command', command: { type: 'deleteItems', ids: ['a'] } })
    expect(after).toEqual(['b'])
  })
})

describe('tool slice', () => {
  it('sets the active tool and surface brush', () => {
    let t = toolReducer(initialTool, { type: 'setTool', tool: { brushId: 'box', mode: 'place' } })
    expect(t.selection).toEqual({ brushId: 'box', mode: 'place' })
    t = toolReducer(t, { type: 'setSurfaceBrush', surface: { kind: 'color', value: '#000' } })
    expect(t.surface).toEqual({ kind: 'color', value: '#000' })
  })
})

describe('mode slice', () => {
  it('toggles edit/play', () => {
    expect(modeReducer(initialMode, { type: 'setMode', mode: 'play' })).toBe('play')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/state/uiSlices.test.ts`
Expected: FAIL — cannot resolve the slice modules.

- [ ] **Step 3: Implement**

`packages/editor/src/state/selection.ts`:
```ts
import type { EditorAction } from './actions'

export const initialSelection: string[] = []

export function selectionReducer(state: string[], action: EditorAction): string[] {
  switch (action.type) {
    case 'select':
      return action.ids
    case 'command':
      if (action.command.type === 'deleteItems') {
        const removed = new Set(action.command.ids)
        return state.filter((id) => !removed.has(id))
      }
      return state
    default:
      return state
  }
}
```

`packages/editor/src/state/tool.ts`:
```ts
import type { Surface } from '../model/types'
import type { EditorAction, ToolSelection } from './actions'

export interface ToolState { selection: ToolSelection; surface: Surface }

export const initialTool: ToolState = {
  selection: { brushId: null, mode: 'select' },
  surface: { kind: 'color', value: '#e0e0e0' }
}

export function toolReducer(state: ToolState, action: EditorAction): ToolState {
  switch (action.type) {
    case 'setTool':
      return { ...state, selection: action.tool }
    case 'setSurfaceBrush':
      return { ...state, surface: action.surface }
    default:
      return state
  }
}
```

`packages/editor/src/state/mode.ts`:
```ts
import type { EditorAction } from './actions'

export type Mode = 'edit' | 'play'
export const initialMode: Mode = 'edit'

export function modeReducer(state: Mode, action: EditorAction): Mode {
  return action.type === 'setMode' ? action.mode : state
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/state/uiSlices.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): selection/tool/mode slices"
```

### Task 6: `createEditorStore` — compose slices over a definition

**Files:**
- Create: `packages/editor/src/state/store.ts`
- Test: `packages/editor/tests/state/store.test.ts`

**Interfaces:**
- Consumes: `combineReducers`, `createStore`, `Store` from `@automata/engine`; all slice reducers; `GameDefinition`.
- Produces: `EditorState<Doc>` (`{ document; selection; tool; mode }`), `EditorStore<Doc>`, `createEditorStore<Doc>(definition): EditorStore<Doc>`, selectors `selectDoc`, `selectItems`, `selectSelection`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/state/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createEditorStore, selectItems } from '../../src/state/store'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('editor store', () => {
  it('starts empty in edit mode', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    expect(store.getState().mode).toBe('edit')
    expect(selectItems(fakeDefinition, store.getState())).toEqual([])
  })

  it('routes commands through the document slice and exposes items', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a', 5, 0) } })
    store.dispatch({ type: 'select', ids: ['a'] })
    expect(selectItems(fakeDefinition, store.getState())).toHaveLength(1)
    expect(store.getState().selection).toEqual(['a'])
    expect(store.getState().document.dirty).toBe(true)
  })

  it('undo flows through the store', () => {
    const store = createEditorStore<FakeDoc>(fakeDefinition)
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    store.dispatch({ type: 'undo' })
    expect(selectItems(fakeDefinition, store.getState())).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/state/store.test.ts`
Expected: FAIL — cannot resolve `../../src/state/store`.

- [ ] **Step 3: Implement**

`packages/editor/src/state/store.ts`:
```ts
import { combineReducers, createStore, type Store } from '@automata/engine'
import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'
import type { EditorAction } from './actions'
import { createDocumentReducer, initialDocument, type DocumentState } from './document'
import { initialSelection, selectionReducer } from './selection'
import { initialMode, modeReducer, type Mode } from './mode'
import { initialTool, toolReducer, type ToolState } from './tool'

export interface EditorState<Doc> {
  document: DocumentState<Doc>
  selection: string[]
  tool: ToolState
  mode: Mode
}

export type EditorStore<Doc> = Store<EditorState<Doc>, EditorAction>

export function createEditorStore<Doc>(definition: GameDefinition<Doc>): EditorStore<Doc> {
  const root = combineReducers<EditorState<Doc>, EditorAction>({
    document: createDocumentReducer(definition.scene),
    selection: selectionReducer,
    tool: toolReducer,
    mode: modeReducer
  })
  const initial: EditorState<Doc> = {
    document: initialDocument(definition.scene),
    selection: initialSelection,
    tool: initialTool,
    mode: initialMode
  }
  return createStore(root, initial)
}

export const selectDoc = <Doc>(state: EditorState<Doc>): Doc => state.document.doc
export const selectSelection = <Doc>(state: EditorState<Doc>): string[] => state.selection
export function selectItems<Doc>(definition: GameDefinition<Doc>, state: EditorState<Doc>): SceneItem[] {
  return definition.scene.listItems(state.document.doc)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/state/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from barrel + commit**

Append to `packages/editor/src/index.ts`:
```ts
export * from './state/actions'
export * from './state/store'
```
Then:
```bash
npm run typecheck
git add -A
git commit -m "feat(editor): createEditorStore composing document/selection/tool/mode"
```

### Task 7: Grid snap math

**Files:**
- Create: `packages/editor/src/grid.ts`
- Test: `packages/editor/tests/grid.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `@automata/engine`.
- Produces: `snapToGrid(value: number, cell: number): number`, `snapVec3XZ(v: Vec3, cell: number): Vec3`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { snapToGrid, snapVec3XZ } from '../src/grid'

describe('grid snap', () => {
  it('rounds a scalar to the nearest cell', () => {
    expect(snapToGrid(1.2, 0.5)).toBe(1)
    expect(snapToGrid(1.3, 0.5)).toBe(1.5)
    expect(snapToGrid(-0.2, 1)).toBe(-0)
  })
  it('snaps x and z but leaves y untouched', () => {
    expect(snapVec3XZ({ x: 1.2, y: 3.7, z: -0.3 }, 0.5)).toEqual({ x: 1, y: 3.7, z: -0.5 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/grid.test.ts`
Expected: FAIL — cannot resolve `../src/grid`.

- [ ] **Step 3: Implement**

`packages/editor/src/grid.ts`:
```ts
import type { Vec3 } from '@automata/engine'

export function snapToGrid(value: number, cell: number): number {
  return Math.round(value / cell) * cell
}

export function snapVec3XZ(v: Vec3, cell: number): Vec3 {
  return { x: snapToGrid(v.x, cell), y: v.y, z: snapToGrid(v.z, cell) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/grid.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): grid snap math"
```

### Task 8: 3D fly camera (pure)

**Files:**
- Create: `packages/editor/src/viewport3d/flyCamera.ts`
- Test: `packages/editor/tests/viewport3d/flyCamera.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `@automata/engine`.
- Produces: `FlyCamera` (`{ position: Vec3; yaw: number; pitch: number }`), `initialFlyCamera`, `cameraForward(cam): Vec3`, `cameraView(cam): { position: Vec3; lookAt: Vec3 }`, `moveFly(cam, move, speed): FlyCamera`, `rotateFly(cam, dYaw, dPitch): FlyCamera`. `move` is `{ forward: number; right: number; up: number }`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/viewport3d/flyCamera.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  cameraForward, cameraView, initialFlyCamera, moveFly, rotateFly
} from '../../src/viewport3d/flyCamera'

describe('fly camera', () => {
  it('looks down -z at yaw 0, pitch 0', () => {
    const f = cameraForward({ ...initialFlyCamera, position: { x: 0, y: 0, z: 0 } })
    expect(f.x).toBeCloseTo(0)
    expect(f.y).toBeCloseTo(0)
    expect(f.z).toBeCloseTo(-1)
  })

  it('cameraView returns position and a lookAt one unit ahead', () => {
    const cam = { position: { x: 0, y: 2, z: 0 }, yaw: 0, pitch: 0 }
    const { position, lookAt } = cameraView(cam)
    expect(position).toEqual({ x: 0, y: 2, z: 0 })
    expect(lookAt.z).toBeCloseTo(-1)
  })

  it('yaw of +90° turns forward toward -x', () => {
    const cam = rotateFly(initialFlyCamera, Math.PI / 2, 0)
    const f = cameraForward(cam)
    expect(f.x).toBeCloseTo(-1)
    expect(Math.abs(f.z)).toBeLessThan(1e-6)
  })

  it('moving forward advances along the forward vector', () => {
    const cam = moveFly(initialFlyCamera, { forward: 1, right: 0, up: 0 }, 2)
    expect(cam.position.z).toBeCloseTo(initialFlyCamera.position.z - 2)
  })

  it('clamps pitch to just under straight up/down', () => {
    const cam = rotateFly(initialFlyCamera, 0, 10)
    expect(cam.pitch).toBeLessThan(Math.PI / 2)
    expect(cam.pitch).toBeGreaterThan(Math.PI / 2 - 0.2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/viewport3d/flyCamera.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/viewport3d/flyCamera.ts`:
```ts
import type { Vec3 } from '@automata/engine'

export interface FlyCamera { position: Vec3; yaw: number; pitch: number }

export const initialFlyCamera: FlyCamera = { position: { x: 0, y: 8, z: 16 }, yaw: 0, pitch: -0.4 }

const PITCH_LIMIT = Math.PI / 2 - 0.05

/** Forward unit vector. yaw rotates about +y (0 ⇒ -z); pitch tilts up/down. */
export function cameraForward(cam: FlyCamera): Vec3 {
  const cp = Math.cos(cam.pitch)
  return { x: -Math.sin(cam.yaw) * cp, y: Math.sin(cam.pitch), z: -Math.cos(cam.yaw) * cp }
}

function cameraRight(cam: FlyCamera): Vec3 {
  return { x: Math.cos(cam.yaw), y: 0, z: -Math.sin(cam.yaw) }
}

export function cameraView(cam: FlyCamera): { position: Vec3; lookAt: Vec3 } {
  const f = cameraForward(cam)
  return {
    position: cam.position,
    lookAt: { x: cam.position.x + f.x, y: cam.position.y + f.y, z: cam.position.z + f.z }
  }
}

export function rotateFly(cam: FlyCamera, dYaw: number, dPitch: number): FlyCamera {
  const pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dPitch))
  return { ...cam, yaw: cam.yaw + dYaw, pitch }
}

export function moveFly(
  cam: FlyCamera, move: { forward: number; right: number; up: number }, speed: number
): FlyCamera {
  const f = cameraForward(cam)
  const r = cameraRight(cam)
  return {
    ...cam,
    position: {
      x: cam.position.x + (f.x * move.forward + r.x * move.right) * speed,
      y: cam.position.y + (move.up + f.y * move.forward) * speed,
      z: cam.position.z + (f.z * move.forward + r.z * move.right) * speed
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/viewport3d/flyCamera.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): pure fly-camera math"
```

### Task 9: 2D top-down map projection (pure)

**Files:**
- Create: `packages/editor/src/viewport2d/projection.ts`
- Test: `packages/editor/tests/viewport2d/projection.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `@automata/engine`.
- Produces: `MapView` (`{ panX: number; panZ: number; pixelsPerUnit: number }`), `initialMapView`, `worldToScreen(view, world, size): { x: number; y: number }`, `screenToWorldXZ(view, screen, size): { x: number; z: number }` (`size = { w, h }`, screen origin top-left; world +x → right, +z → down).

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/viewport2d/projection.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { initialMapView, screenToWorldXZ, worldToScreen } from '../../src/viewport2d/projection'

const size = { w: 800, h: 600 }

describe('2D map projection', () => {
  it('maps world origin to screen center at default pan', () => {
    const p = worldToScreen(initialMapView, { x: 0, y: 0, z: 0 }, size)
    expect(p).toEqual({ x: 400, y: 300 })
  })

  it('round-trips screen ⇄ world on the XZ plane', () => {
    const view = { panX: 2, panZ: -1, pixelsPerUnit: 24 }
    const world = screenToWorldXZ(view, { x: 123, y: 456 }, size)
    const back = worldToScreen(view, { x: world.x, y: 0, z: world.z }, size)
    expect(back.x).toBeCloseTo(123)
    expect(back.y).toBeCloseTo(456)
  })

  it('+x is right and +z is down in screen space', () => {
    const right = worldToScreen(initialMapView, { x: 1, y: 0, z: 0 }, size)
    const down = worldToScreen(initialMapView, { x: 0, y: 0, z: 1 }, size)
    expect(right.x).toBeGreaterThan(400)
    expect(down.y).toBeGreaterThan(300)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/viewport2d/projection.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/viewport2d/projection.ts`:
```ts
import type { Vec3 } from '@automata/engine'

export interface MapView { panX: number; panZ: number; pixelsPerUnit: number }
export interface ScreenSize { w: number; h: number }

export const initialMapView: MapView = { panX: 0, panZ: 0, pixelsPerUnit: 24 }

export function worldToScreen(view: MapView, world: Vec3, size: ScreenSize): { x: number; y: number } {
  return {
    x: size.w / 2 + (world.x - view.panX) * view.pixelsPerUnit,
    y: size.h / 2 + (world.z - view.panZ) * view.pixelsPerUnit
  }
}

export function screenToWorldXZ(
  view: MapView, screen: { x: number; y: number }, size: ScreenSize
): { x: number; z: number } {
  return {
    x: (screen.x - size.w / 2) / view.pixelsPerUnit + view.panX,
    z: (screen.y - size.h / 2) / view.pixelsPerUnit + view.panZ
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/viewport2d/projection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): pure 2D map projection"
```

### Task 10: 2D map draw model (pure)

The 2D map renders by producing a list of pure draw ops; the canvas shim (M11 host) just executes them. This keeps all map-rendering logic testable.

**Files:**
- Create: `packages/editor/src/viewport2d/draw.ts`
- Test: `packages/editor/tests/viewport2d/draw.test.ts`

**Interfaces:**
- Consumes: `MapView`, `ScreenSize`, `worldToScreen`; `SceneItem`, `GameDefinition`.
- Produces: `DrawOp` (`{ shape: 'rect' | 'circle' | 'icon'; x; y; w?; h?; r?; color: string; selected: boolean; id: string }`), `buildDrawModel(definition, items, selection, view, size): DrawOp[]`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/viewport2d/draw.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildDrawModel } from '../../src/viewport2d/draw'
import { initialMapView } from '../../src/viewport2d/projection'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'
import type { SceneItem } from '../../src/model/types'

const size = { w: 800, h: 600 }
const cylinder: SceneItem = {
  id: 'c', kind: 'cylinder',
  transform: { position: { x: 2, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'cylinder', radius: 1, height: 1 }, surface: { kind: 'color', value: '#abc' }
}
const marker: SceneItem = {
  id: 'm', kind: 'marker',
  transform: { position: { x: -1, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' }, surface: { kind: 'color', value: '#0f0' }
}

describe('2D draw model', () => {
  it('emits a rect for a box, a circle for a cylinder, an icon for a marker', () => {
    const ops = buildDrawModel(fakeDefinition, [boxItem('b'), cylinder, marker], [], initialMapView, size)
    expect(ops.map((o) => o.shape)).toEqual(['rect', 'circle', 'icon'])
  })

  it('positions a box rect centered on its world position', () => {
    const [rect] = buildDrawModel(fakeDefinition, [boxItem('b', 0, 0)], [], initialMapView, size)
    expect(rect).toMatchObject({ x: 400, y: 300 })
  })

  it('marks selected items', () => {
    const ops = buildDrawModel(fakeDefinition, [boxItem('b')], ['b'], initialMapView, size)
    expect(ops[0]!.selected).toBe(true)
  })

  it('uses resolveSurface for the fill color', () => {
    const [rect] = buildDrawModel(fakeDefinition, [boxItem('b')], [], initialMapView, size)
    expect(rect!.color).toBe('#e0e0e0')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/viewport2d/draw.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/viewport2d/draw.ts`:
```ts
import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'
import { worldToScreen, type MapView, type ScreenSize } from './projection'

export interface DrawOp {
  id: string
  shape: 'rect' | 'circle' | 'icon'
  x: number
  y: number
  w?: number
  h?: number
  r?: number
  color: string
  selected: boolean
}

export function buildDrawModel<Doc>(
  definition: GameDefinition<Doc>,
  items: SceneItem[],
  selection: string[],
  view: MapView,
  size: ScreenSize
): DrawOp[] {
  const selected = new Set(selection)
  const ppu = view.pixelsPerUnit
  return items.map((item) => {
    const center = worldToScreen(view, item.transform.position, size)
    const color = definition.resolveSurface(item.surface).color
    const base = { id: item.id, x: center.x, y: center.y, color, selected: selected.has(item.id) }
    if (item.shape.type === 'box') {
      return { ...base, shape: 'rect', w: item.shape.size.x * ppu, h: item.shape.size.z * ppu,
        x: center.x - (item.shape.size.x * ppu) / 2, y: center.y - (item.shape.size.z * ppu) / 2 }
    }
    if (item.shape.type === 'cylinder') {
      return { ...base, shape: 'circle', r: item.shape.radius * ppu }
    }
    return { ...base, shape: 'icon', r: 8 } // archetype + marker render as a small icon
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/viewport2d/draw.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): pure 2D map draw model"
```

### Task 11: 3D world sync — render the doc + reflect selection

Builds the live ECS world from the document via `definition.buildWorld`, renders it through the engine render systems, and toggles `setHighlight` on the selection. Rebuilds the world on document change (M11 keeps this simple: full rebuild).

**Files:**
- Create: `packages/editor/src/viewport3d/worldSync.ts`
- Test: `packages/editor/tests/viewport3d/worldSync.test.ts`

**Interfaces:**
- Consumes: `RenderPort`, `PhysicsPort`, `World`, `registerRenderables`, `renderSystem`, `createNullRenderer` (test) from `@automata/engine`; `GameDefinition`; `EditorStore`.
- Produces: `createWorldSync<Doc>(definition, store, render, physics): { syncNow(): void; render(alpha): void; dispose(): void }`. Items carry a stable `id`; the world entities expose `editorId` for highlight mapping.

- [ ] **Step 1: Extend the fake fixture with a real `buildWorld`**

Append to `packages/editor/tests/fixtures/fakeDefinition.ts` (add `createWorld`, `RenderPort` to its `@automata/engine` import):
```ts
import { createWorld, type RenderPort } from '@automata/engine'

/** A fake buildWorld: one renderable box entity per item, carrying editorId. */
export function fakeBuildWorld(doc: FakeDoc, _render: RenderPort) {
  const world = createWorld<{ editorId?: string; renderable?: unknown; transform?: unknown }>()
  for (const item of doc.items) {
    world.add({
      editorId: item.id,
      renderable: { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color: '#e0e0e0' },
      transform: { position: item.transform.position, rotation: { x: 0, y: 0, z: 0, w: 1 },
        prevPosition: item.transform.position, prevRotation: { x: 0, y: 0, z: 0, w: 1 } }
    })
  }
  return world
}

export const renderDefinition: GameDefinition<FakeDoc> = { ...fakeDefinition, buildWorld: fakeBuildWorld as never }
```

- [ ] **Step 2: Write the failing test**

`packages/editor/tests/viewport3d/worldSync.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createWorldSync } from '../../src/viewport3d/worldSync'
import { createEditorStore } from '../../src/state/store'
import { boxItem, renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

describe('worldSync', () => {
  it('adds a render object per item and highlights the selection', () => {
    const store = createEditorStore<FakeDoc>(renderDefinition)
    const render = createNullRenderer()
    const sync = createWorldSync(renderDefinition, store, render.port, nullPhysics())

    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    sync.syncNow()
    expect(render.calls.some((c) => c.op === 'add')).toBe(true)

    store.dispatch({ type: 'select', ids: ['a'] })
    sync.syncNow()
    const highlight = render.calls.filter((c) => c.op === 'setHighlight').at(-1)
    expect(highlight).toMatchObject({ op: 'setHighlight', on: true })

    sync.dispose()
    expect(render.port.objectCount).toBe(0)
    expect(render.calls.some((c) => c.op === 'remove')).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/editor/tests/viewport3d/worldSync.test.ts`
Expected: FAIL — cannot resolve `../../src/viewport3d/worldSync`.

- [ ] **Step 4: Implement**

`packages/editor/src/viewport3d/worldSync.ts`:
```ts
import {
  registerRenderables, renderSystem, type PhysicsPort, type RenderPort, type World
} from '@automata/engine'
import type { GameDefinition } from '../model/gameDefinition'
import type { EditorStore } from '../state/store'

interface EditorEntity { editorId?: string }

export interface WorldSync {
  syncNow(): void
  render(alpha: number): void
  dispose(): void
}

export function createWorldSync<Doc>(
  definition: GameDefinition<Doc>,
  store: EditorStore<Doc>,
  render: RenderPort,
  physics: PhysicsPort
): WorldSync {
  const stage = render.createGroup()
  let world: World<EditorEntity> | null = null
  let offRender: (() => void) | null = null
  const renderStep = renderSystem<{ world: World<EditorEntity>; alpha: number }>(render)

  function teardown(): void {
    world?.clear()
    offRender?.()
    offRender = null
    world = null
  }

  function rebuild(): void {
    teardown()
    world = definition.buildWorld(store.getState().document.doc, render, physics) as World<EditorEntity>
    offRender = registerRenderables(world, render, stage)
  }

  function applyHighlight(): void {
    if (!world) return
    const selected = new Set(store.getState().selection)
    for (const entity of world.with('editorId')) {
      render.setHighlight(entity, selected.has(entity.editorId!))
    }
  }

  return {
    syncNow() {
      rebuild()
      applyHighlight()
    },
    render(alpha) {
      if (world) renderStep.run({ world, alpha })
    },
    dispose() {
      teardown()
      render.removeGroup(stage)
    }
  }
}
```

> **API note:** `registerRenderables(world, render, group)` and `renderSystem(render)` are the engine helpers the game uses in `games/monkey-ball/src/game/gameplay.ts`. If `renderSystem`'s context shape differs from `{ world, alpha }`, match the engine's `System` context (check `packages/engine/src/render/systems.ts`) and adapt the call — do not change the engine.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/editor/tests/viewport3d/worldSync.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): 3D world sync rendering doc + selection highlight"
```

### Task 12: Game public barrel + monkey-ball SceneModel + partial registration

The game exposes a public API for the host, and registers a `GameDefinition<Level>` whose `SceneModel` maps the existing level JSON to generic items — including **synthesized spawn/goal markers** written back to the level's top-level fields.

**Files:**
- Create: `games/monkey-ball/src/index.ts`
- Modify: `games/monkey-ball/package.json` (add `exports`)
- Modify: `games/monkey-ball/src/entity.ts` (optional editor ID tag)
- Modify: `games/monkey-ball/src/level/buildWorld.ts` (optional editor ID tagging)
- Create: `games/monkey-ball/src/editor/sceneModel.ts`
- Create: `games/monkey-ball/src/editor/registration.ts`
- Test: `games/monkey-ball/tests/editor/sceneModel.test.ts`

**Interfaces:**
- Consumes: `levelKind`, `levelSchema`, `Level`, `populateLevelWorld`, `Entity` (game); `parseData`, `createWorld`, `registerPhysicsBodies` (engine); `SceneModel`, `GameDefinition`, `SceneItem`, `CommandError` (editor).
- Produces: `monkeyBallDefinition: GameDefinition<Level>`; `levelSceneModel: SceneModel<Level>`; the game barrel re-exporting level/data/registration symbols. `play` is added in M13.

- [ ] **Step 1: Write the failing tests**

`games/monkey-ball/tests/editor/sceneModel.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { levelSceneModel } from '../../src/editor/sceneModel'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { levelKind } from '../../src/data/level'
import { createMonkeyBallDefinition } from '../../src/editor/registration'
import { archetypeLibraryKind, createNullRenderer, parseData, type PhysicsPort } from '@automata/engine'
import { readDataFile } from '../helpers/data'

const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')
const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

describe('monkey-ball level SceneModel', () => {
  it('lists geometry, entities, and synthesized spawn + goal markers', () => {
    const items = levelSceneModel.listItems(level)
    const kinds = items.map((i) => i.kind)
    expect(kinds).toContain('box')
    expect(kinds).toContain('archetype')
    const markers = items.filter((i) => i.kind === 'marker')
    expect(markers.map((m) => (m.shape as { markerId: string }).markerId).sort()).toEqual(['goal', 'spawn'])
  })

  it('places the spawn marker at the level spawn', () => {
    const spawn = levelSceneModel.listItems(level).find(
      (i) => i.kind === 'marker' && (i.shape as { markerId: string }).markerId === 'spawn')!
    expect(spawn.transform.position).toEqual({ x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] })
  })

  it('moving the spawn marker writes back to the level spawn field', () => {
    const next = levelSceneModel.apply(level, { type: 'moveSelected', ids: ['marker:spawn'], delta: { x: 1, y: 0, z: -2 } })
    expect(next.spawn).toEqual([level.spawn[0] + 1, level.spawn[1], level.spawn[2] - 2])
  })

  it('moving the goal marker writes back to goal.pos', () => {
    const next = levelSceneModel.apply(level, { type: 'moveSelected', ids: ['marker:goal'], delta: { x: 0, y: 0, z: 3 } })
    expect(next.goal.pos).toEqual([level.goal.pos[0], level.goal.pos[1], level.goal.pos[2] + 3])
  })

  it('setSurface on a geometry item updates its color in the level', () => {
    const boxId = levelSceneModel.listItems(level).find((i) => i.kind === 'box')!.id
    const next = levelSceneModel.apply(level, { type: 'setSurface', id: boxId, surface: { kind: 'color', value: '#123456' } })
    const idx = Number(boxId.replace('geometry:', ''))
    expect(next.geometry[idx]!.color).toBe('#123456')
  })

  it('exposes scalar metadata fields (name, timeLimitS, fallY) only', () => {
    expect(levelSceneModel.metadataFields(level).map((f) => f.path).sort())
      .toEqual(['fallY', 'name', 'timeLimitS'])
  })

  it('buildWorld tags real renderable entities with editor IDs for 3D highlight', () => {
    const definition = createMonkeyBallDefinition(lib, tuning)
    const world = definition.buildWorld(level, createNullRenderer().port, nullPhysics())
    const ids = [...world.with('editorId')].map((e) => e.editorId).sort()
    expect(ids).toEqual(expect.arrayContaining(['geometry:0', 'marker:spawn', 'marker:goal']))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run games/monkey-ball/tests/editor/sceneModel.test.ts`
Expected: FAIL — cannot resolve `../../src/editor/sceneModel`.

- [ ] **Step 3: Implement the SceneModel**

`games/monkey-ball/src/editor/sceneModel.ts`:
```ts
import { parseData, type Vec3 } from '@automata/engine'
import { CommandError, type SceneItem, type SceneModel, type Field, type Surface } from '@automata/editor'
import { levelKind, type Level } from '../data/level'

type Geometry = Level['geometry'][number]

const noRot = { x: 0, y: 0, z: 0 }
const vec = (t: [number, number, number]): Vec3 => ({ x: t[0], y: t[1], z: t[2] })
const colorSurface = (value: string): Surface => ({ kind: 'color', value })

function geometryItem(g: Geometry, index: number): SceneItem {
  const shape = g.shape === 'box'
    ? { type: 'box' as const, size: { x: g.size[0], y: g.size[1], z: g.size[2] } }
    : { type: 'cylinder' as const, radius: g.radius, height: g.height }
  return {
    id: `geometry:${index}`, kind: g.shape === 'box' ? 'box' : 'cylinder',
    transform: { position: vec(g.pos), rotationEuler: g.rot ? vec(g.rot) : noRot },
    shape, surface: colorSurface(g.color)
  }
}

function markerItem(markerId: 'spawn' | 'goal', pos: [number, number, number]): SceneItem {
  return {
    id: `marker:${markerId}`, kind: 'marker',
    transform: { position: vec(pos), rotationEuler: noRot },
    shape: { type: 'marker', markerId }, surface: colorSurface(markerId === 'goal' ? '#4ecdc4' : '#ffffff')
  }
}

function entityItem(e: Level['entities'][number], index: number): SceneItem {
  return {
    id: `entity:${index}`, kind: 'archetype',
    transform: { position: vec(e.pos), rotationEuler: noRot },
    shape: { type: 'archetype', name: e.archetype }, surface: colorSurface('#9b5de5')
  }
}

const addDelta = (t: [number, number, number], d: Vec3): [number, number, number] =>
  [t[0] + d.x, t[1] + d.y, t[2] + d.z]

export const levelSceneModel: SceneModel<Level> = {
  parse: (input) => (typeof input === 'string'
    ? parseData(levelKind, input, 'imported.json')
    : levelKind.schema.parse(input)),

  emptyDoc: () => ({
    id: 'untitled', name: 'Untitled', timeLimitS: 60, fallY: -10,
    spawn: [0, 1, 6], goal: { pos: [0, 0, -6] },
    geometry: [{ shape: 'box', size: [8, 0.5, 16], pos: [0, -0.25, 0], color: '#7ec850', friction: 0.6 }],
    entities: []
  }),

  listItems: (level) => [
    ...level.geometry.map(geometryItem),
    ...level.entities.map(entityItem),
    markerItem('spawn', level.spawn),
    markerItem('goal', level.goal.pos)
  ],

  metadataFields: (level): Field[] => [
    { path: 'name', label: 'Name', type: 'text', value: level.name },
    { path: 'timeLimitS', label: 'Time limit (s)', type: 'number', value: level.timeLimitS },
    { path: 'fallY', label: 'Fall Y', type: 'number', value: level.fallY }
  ],

  getSurface: (level, id) => {
    if (id.startsWith('geometry:')) {
      const g = level.geometry[Number(id.slice('geometry:'.length))]
      if (g) return colorSurface(g.color)
    }
    return colorSurface('#ffffff')
  },

  apply(level, cmd) {
    switch (cmd.type) {
      case 'moveSelected': {
        let next = level
        for (const id of cmd.ids) {
          if (id === 'marker:spawn') next = { ...next, spawn: addDelta(next.spawn, cmd.delta) }
          else if (id === 'marker:goal') next = { ...next, goal: { pos: addDelta(next.goal.pos, cmd.delta) } }
          else if (id.startsWith('geometry:')) {
            const i = Number(id.slice('geometry:'.length))
            next = { ...next, geometry: next.geometry.map((g, gi) => gi === i ? { ...g, pos: addDelta(g.pos, cmd.delta) } : g) }
          } else if (id.startsWith('entity:')) {
            const i = Number(id.slice('entity:'.length))
            next = { ...next, entities: next.entities.map((e, ei) => ei === i ? { ...e, pos: addDelta(e.pos, cmd.delta) } : e) }
          }
        }
        return next
      }
      case 'setSurface': {
        if (!cmd.surface || cmd.surface.kind !== 'color') throw new CommandError('only color surfaces supported')
        if (cmd.id.startsWith('geometry:')) {
          const i = Number(cmd.id.slice('geometry:'.length))
          return { ...level, geometry: level.geometry.map((g, gi) => gi === i ? { ...g, color: cmd.surface.kind === 'color' ? cmd.surface.value : g.color } : g) }
        }
        return level
      }
      case 'setMetadata': {
        if (cmd.path === 'name') return { ...level, name: String(cmd.value) }
        if (cmd.path === 'timeLimitS') return { ...level, timeLimitS: Number(cmd.value) }
        if (cmd.path === 'fallY') return { ...level, fallY: Number(cmd.value) }
        throw new CommandError(`unknown metadata ${cmd.path}`)
      }
      case 'deleteItems': {
        const geom = new Set<number>()
        const ent = new Set<number>()
        for (const id of cmd.ids) {
          if (id.startsWith('geometry:')) geom.add(Number(id.slice('geometry:'.length)))
          else if (id.startsWith('entity:')) ent.add(Number(id.slice('entity:'.length)))
          else throw new CommandError('spawn/goal cannot be deleted')
        }
        return {
          ...level,
          geometry: level.geometry.filter((_, i) => !geom.has(i)),
          entities: level.entities.filter((_, i) => !ent.has(i))
        }
      }
      case 'addItem':
      case 'setItemField':
        // Full add/field editing lands in M12; markers are singletons (no add here).
        throw new CommandError(`command ${cmd.type} not supported until M12`)
      case 'loadDoc':
        return this.parse(cmd.doc)
    }
  }
}
```

> **Note:** the geometry `friction` default — `parseData`/`levelSchema` apply `.default(0.6)`, so parsed levels always carry `friction`. `emptyDoc` sets it explicitly to keep the type happy.

- [ ] **Step 4: Add optional editor ID tags to the runtime world builder**

In `games/monkey-ball/src/entity.ts`, add this optional tag to `Entity`:
```ts
  /** Stable editor document item id, present only in editor-built worlds. */
  editorId?: string
```

In `games/monkey-ball/src/level/buildWorld.ts`, add an options type and helper near the top:
```ts
export interface PopulateLevelWorldOptions {
  /** When true, tag renderable entities with the SceneItem id used by the editor. */
  editorIds?: boolean
}

const editorId = (opts: PopulateLevelWorldOptions, id: string): string | undefined =>
  opts.editorIds ? id : undefined
```

Change `populateLevelWorld` to accept `opts` and tag the entities it creates:
```ts
export function populateLevelWorld(
  world: World<Entity>, level: Level, lib: ArchetypeLibrary, opts: PopulateLevelWorldOptions = {}
): { ball: Entity } {
  for (const [index, g] of level.geometry.entries()) {
    world.add({
      editorId: editorId(opts, `geometry:${index}`),
      transform: createTransform({ x: g.pos[0], y: g.pos[1], z: g.pos[2] }, rotationOf(g)),
      rigidBody: geometryRigidBody(g),
      renderable: geometryRenderable(g)
    })
  }
  const ball = spawnFromArchetype<Entity>(world, lib, 'ball', {
    editorId: editorId(opts, 'marker:spawn'),
    transform: createTransform({ x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] })
  })
  spawnFromArchetype<Entity>(world, lib, 'goal', {
    editorId: editorId(opts, 'marker:goal'),
    transform: createTransform({ x: level.goal.pos[0], y: level.goal.pos[1], z: level.goal.pos[2] })
  })
  for (const [index, e] of level.entities.entries()) {
    spawnFromArchetype<Entity>(world, lib, e.archetype, {
      editorId: editorId(opts, `entity:${index}`),
      transform: createTransform({ x: e.pos[0], y: e.pos[1], z: e.pos[2] }),
      ...(e.overrides ?? {})
    })
  }
  return { ball }
}
```

- [ ] **Step 5: Implement the partial registration + game barrel**

`games/monkey-ball/src/editor/registration.ts`:
```ts
import {
  createWorld, registerPhysicsBodies, type ArchetypeLibrary, type PhysicsPort, type RenderPort
} from '@automata/engine'
import type { Brush, GameDefinition, Surface } from '@automata/editor'
import type { Level } from '../data/level'
import type { Entity } from '../entity'
import type { PhysicsTuning } from '../data/config'
import { populateLevelWorld } from '../level/buildWorld'
import { levelSceneModel } from './sceneModel'

const swatch = (value: string): Surface => ({ kind: 'color', value })
const MANY = { min: 0, max: Number.POSITIVE_INFINITY }
type EditorEntity = Entity & { editorId?: string }

/** Build a definition once boot data (archetypes + tuning) is available. */
export function createMonkeyBallDefinition(lib: ArchetypeLibrary, _tuning: PhysicsTuning): GameDefinition<Level> {
  return {
    id: 'monkey-ball',
    scene: levelSceneModel,
    palette: {
      geometry: [
        { id: 'box', label: 'Floor / Box', kind: 'box', place: 'point', cardinality: MANY },
        { id: 'cylinder', label: 'Cylinder', kind: 'cylinder', place: 'point', cardinality: MANY }
      ],
      archetypes: [
        { id: 'banana', label: 'Banana', kind: 'archetype', place: 'point', ref: 'banana', cardinality: MANY },
        { id: 'bumper', label: 'Bumper', kind: 'archetype', place: 'point', ref: 'bumper', cardinality: MANY },
        { id: 'moving-platform', label: 'Moving Platform', kind: 'archetype', place: 'point', ref: 'moving-platform', cardinality: MANY }
      ],
      markers: [
        { id: 'spawn', label: 'Spawn', kind: 'marker', place: 'point', ref: 'spawn', cardinality: { min: 1, max: 1 } },
        { id: 'goal', label: 'Goal', kind: 'marker', place: 'point', ref: 'goal', cardinality: { min: 1, max: 1 } }
      ]
    },
    surfacePalette: ['#7ec850', '#4ecdc4', '#ff5964', '#ffd23f', '#9b5de5', '#cfd8ff'].map(swatch),
    buildWorld(level: Level, render: RenderPort, physics: PhysicsPort) {
      const world = createWorld<EditorEntity>()
      registerPhysicsBodies(world, physics)
      populateLevelWorld(world, level, lib, { editorIds: true })
      void render
      return world
    },
    resolveSurface(s) {
      if (s.kind === 'color') return { color: s.value }
      throw new Error(`unsupported surface kind ${s.kind}`)
    }
  }
}
```

`games/monkey-ball/src/index.ts`:
```ts
// Public API for the editor host. The game never imports the editor core.
export { levelKind, levelSchema, worldsManifestKind, type Level, type WorldsManifest } from './data/level'
export { physicsTuningKind, toPhysicsTuning, type PhysicsTuning } from './data/config'
export { archetypeLibraryKind } from '@automata/engine'
export { populateLevelWorld, buildLevelWorld } from './level/buildWorld'
export { loadBootData, type BootData } from './scenes/boot'
export type { Entity } from './entity'
export { levelSceneModel } from './editor/sceneModel'
export { createMonkeyBallDefinition } from './editor/registration'
```

In `games/monkey-ball/package.json`, add an `exports` field and the `@automata/editor` dependency (the registration implements its `GameDefinition` interface — `game → editor` is the intended direction; the forbidden reverse edge `editor → game` is lint-enforced):
```json
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@automata/engine": "*", "@automata/editor": "*" },
```
Then run `npm install` to link `@automata/editor` into the game workspace before the typecheck below.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run games/monkey-ball/tests/editor/sceneModel.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(game): public barrel + level SceneModel + partial editor registration"
```

### Task 13: Host app shell — mount the editor over monkey-ball (M11 checkpoint)

Rewrites `tools/level-editor` from the walking skeleton into the host that boots monkey-ball data, builds the definition, and mounts the editor with a live 3D viewport and a 2D map. Pointer/fly input wiring is a thin shim.

**Files:**
- Modify: `tools/level-editor/package.json` (add `@automata/editor`)
- Delete: `tools/level-editor/src/skeleton.ts`, `tools/level-editor/tests/skeleton.test.ts`
- Create: `packages/editor/src/host.ts`
- Create: `packages/editor/src/viewport3d/browser.ts` (shim)
- Create: `packages/editor/src/viewport2d/browser.ts` (shim)
- Create: `tools/level-editor/vite.config.ts` (serve monkey-ball public data)
- Modify: `tools/level-editor/src/main.ts`
- Modify: `tools/level-editor/index.html` (title only — already present)
- Test: `packages/editor/tests/host.test.ts`

**Interfaces:**
- Consumes: `createEditorStore`, `createWorldSync`, fly camera, projection, draw model, `GameDefinition`; engine `createThreeRenderer`, `attachCanvasRenderer`, `createRapierPhysics`, `GameLoop`, `startLoopDriver`.
- Produces: `createEditor<Doc>({ definition, mount, render, physics }): { store; dispose }` (testable, no DOM-canvas/Three required when given a render port); the host `main.ts` (shim) that wires real ports + pointer input.

- [ ] **Step 1: Write the failing test (headless host core)**

`packages/editor/tests/host.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../src/host'
import { fakeDefinition, renderDefinition, boxItem, type FakeDoc } from './fixtures/fakeDefinition'

const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

describe('createEditor core', () => {
  it('mounts, renders the doc, and exposes the store', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({ definition: renderDefinition, render: render.port, physics: nullPhysics() })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.tick(0)
    expect(render.calls.some((c) => c.op === 'add')).toBe(true)
    editor.dispose()
  })

  it('builds the 2D draw model from the store', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({ definition: renderDefinition, render: render.port, physics: nullPhysics() })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(editor.drawModel({ w: 800, h: 600 })).toHaveLength(1)
    editor.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor/tests/host.test.ts`
Expected: FAIL — cannot resolve `../src/host`.

- [ ] **Step 3: Implement the editor core host**

`packages/editor/src/host.ts`:
```ts
import type { PhysicsPort, RenderPort } from '@automata/engine'
import type { GameDefinition } from './model/gameDefinition'
import { createEditorStore, type EditorStore } from './state/store'
import { createWorldSync } from './viewport3d/worldSync'
import { buildDrawModel, type DrawOp } from './viewport2d/draw'
import { initialMapView, type MapView, type ScreenSize } from './viewport2d/projection'
import { initialFlyCamera, cameraView, type FlyCamera } from './viewport3d/flyCamera'

export interface EditorCoreOpts<Doc> {
  definition: GameDefinition<Doc>
  render: RenderPort
  physics: PhysicsPort
}

export interface EditorCore<Doc> {
  store: EditorStore<Doc>
  camera: FlyCamera
  mapView: MapView
  /** Re-sync the 3D world from the doc + render a frame. */
  tick(alpha: number): void
  drawModel(size: ScreenSize): DrawOp[]
  dispose(): void
}

export function createEditor<Doc>(opts: EditorCoreOpts<Doc>): EditorCore<Doc> {
  const { definition, render, physics } = opts
  const store = createEditorStore<Doc>(definition)
  const sync = createWorldSync(definition, store, render, physics)
  let camera = initialFlyCamera
  const mapView = initialMapView
  let dirtyDoc = -1

  const core: EditorCore<Doc> = {
    store,
    get camera() { return camera },
    set camera(c: FlyCamera) { camera = c },
    mapView,
    tick(alpha) {
      // Rebuild only when the doc or selection changed (cheap counter on past length + selection).
      const stamp = store.getState().document.past.length + store.getState().selection.length * 1e6
      if (stamp !== dirtyDoc) { sync.syncNow(); dirtyDoc = stamp }
      const v = cameraView(camera)
      render.setCamera(v.position, v.lookAt)
      sync.render(alpha)
    },
    drawModel(size) {
      const s = store.getState()
      return buildDrawModel(definition, definition.scene.listItems(s.document.doc), s.selection, mapView, size)
    },
    dispose() { sync.dispose() }
  }
  return core
}
```

> **Note:** the `dirtyDoc` stamp is a deliberately coarse "did something change" check for M11 (full rebuild). M12+ replaces selection-only changes with a highlight-only update; do not optimize yet.

- [ ] **Step 4: Implement the browser shims + host main**

`packages/editor/src/viewport3d/browser.ts` (untested shim):
```ts
import type { FlyCamera } from './flyCamera'
import { moveFly, rotateFly } from './flyCamera'

/** Pointer-lock mouselook + WASD. Untested shim, keep trivially thin. */
export function attachFlyControls(
  canvas: HTMLCanvasElement, getCamera: () => FlyCamera, setCamera: (c: FlyCamera) => void
): () => void {
  const keys = new Set<string>()
  const onKeyDown = (e: KeyboardEvent): void => { keys.add(e.key.toLowerCase()) }
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.key.toLowerCase()) }
  const onClick = (): void => { void canvas.requestPointerLock() }
  const onMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) return
    setCamera(rotateFly(getCamera(), -e.movementX * 0.003, -e.movementY * 0.003))
  }
  const tick = (): void => {
    const m = { forward: (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0),
      right: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
      up: (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0) }
    if (m.forward || m.right || m.up) setCamera(moveFly(getCamera(), m, 0.25))
    raf = requestAnimationFrame(tick)
  }
  let raf = requestAnimationFrame(tick)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('click', onClick)
  window.addEventListener('mousemove', onMove)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    canvas.removeEventListener('click', onClick)
    window.removeEventListener('mousemove', onMove)
  }
}
```

`packages/editor/src/viewport2d/browser.ts` (untested shim):
```ts
import type { DrawOp } from './draw'

/** Paints the pure draw model onto a 2D canvas. Untested shim, keep trivially thin. */
export function paintMap(ctx: CanvasRenderingContext2D, ops: DrawOp[], size: { w: number; h: number }): void {
  ctx.clearRect(0, 0, size.w, size.h)
  ctx.strokeStyle = '#223'
  for (let x = 0; x <= size.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.h); ctx.stroke() }
  for (let y = 0; y <= size.h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.w, y); ctx.stroke() }
  for (const op of ops) {
    ctx.fillStyle = op.color
    ctx.strokeStyle = op.selected ? '#fff' : '#000'
    if (op.shape === 'rect') { ctx.fillRect(op.x, op.y, op.w!, op.h!); ctx.strokeRect(op.x, op.y, op.w!, op.h!) }
    else { ctx.beginPath(); ctx.arc(op.x, op.y, op.r!, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  }
}
```

`tools/level-editor/src/main.ts` (untested shim — replace the skeleton):
```ts
import {
  GameLoop, attachCanvasRenderer, createLoader, createRapierPhysics, createThreeRenderer,
  fetchTextViaFetch, startLoopDriver
} from '@automata/engine'
import { createEditor, attachFlyControls, paintMap } from '@automata/editor'
import { loadBootData, createMonkeyBallDefinition, type Level } from 'monkey-ball'

async function main(): Promise<void> {
  const app = document.getElementById('app')!
  const canvas3d = document.createElement('canvas')
  const canvas2d = document.createElement('canvas')
  canvas2d.width = 360; canvas2d.height = 360
  canvas2d.className = 'map'
  app.append(canvas3d, canvas2d)

  const loader = createLoader(fetchTextViaFetch())
  const renderer = createThreeRenderer()
  const canvasRenderer = attachCanvasRenderer(renderer, canvas3d)
  const physics = await createRapierPhysics()
  const boot = await loadBootData(loader)
  const definition = createMonkeyBallDefinition(boot.lib, boot.tuning)

  const editor = createEditor<Level>({ definition, render: renderer.port, physics })
  editor.store.dispatch({ type: 'loadDoc', doc: definition.scene.emptyDoc() })
  attachFlyControls(canvas3d, () => editor.camera, (c) => { editor.camera = c })

  const ctx2d = canvas2d.getContext('2d')!
  const loop = new GameLoop({
    fixedUpdate: () => {},
    render: (alpha) => {
      editor.tick(alpha)
      canvasRenderer.renderFrame()
      paintMap(ctx2d, editor.drawModel({ w: canvas2d.width, h: canvas2d.height }), { w: canvas2d.width, h: canvas2d.height })
    }
  })
  startLoopDriver(loop)
}

void main()
```

In `tools/level-editor/package.json`, add `"@automata/editor": "*"` to `dependencies`. Delete `src/skeleton.ts` and `tests/skeleton.test.ts`.

Create `tools/level-editor/vite.config.ts` so the editor host can fetch the same `/data/...` files as the game during the M11 browser checkpoint:
```ts
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: '../../games/monkey-ball/public'
})
```

Append to `packages/editor/src/index.ts`:
```ts
export * from './host'
export { attachFlyControls } from './viewport3d/browser'
export { paintMap } from './viewport2d/browser'
export * from './viewport2d/projection'
export * from './viewport2d/draw'
export * from './viewport3d/flyCamera'
```

- [ ] **Step 5: Run tests + full gate**

```bash
npm install
npx vitest run packages/editor/tests/host.test.ts
npm run ci
```
Expected: host tests PASS; `npm run ci` green (lint incl. dependency rules + typecheck + all tests).

- [ ] **Step 6: Manual checkpoint (human gate)**

```bash
npm run dev -w level-editor
```
Open the URL. Expect: a 3D viewport showing the empty level's floor + spawn/goal, a small 2D map in the corner showing the floor rectangle and spawn/goal icons, and WASD + click-drag fly controls. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(editor): host app shell — live 3D + 2D map over monkey-ball (M11 checkpoint)"
```

---

## Milestone M12 — Palette, place/move/delete, inspector, validation

Delivers: editing in both viewports — pure 3D picking (ray-vs-AABB, ray-vs-ground) and 2D hit-testing; generic cardinality enforcement; point-place/move/delete/change-surface tools that emit `SceneCommand`s; the monkey-ball `SceneModel.apply` completed for add/field edits; the generic inspector form; and the validation panel gating export.

### Task 14: 3D picking — ray build, ray-plane, ray-AABB, item AABB

**Files:**
- Modify: `packages/editor/src/viewport3d/flyCamera.ts` (export `cameraRight`)
- Create: `packages/editor/src/viewport3d/ray.ts`
- Create: `packages/editor/src/viewport3d/aabb.ts`
- Test: `packages/editor/tests/viewport3d/ray.test.ts`
- Test: `packages/editor/tests/viewport3d/aabb.test.ts`

**Interfaces:**
- Consumes: `FlyCamera`, `cameraForward`, `cameraRight`; `Vec3`, `SceneItem`.
- Produces: `EDITOR_FOV_Y` (radians); `Ray` (`{ origin: Vec3; dir: Vec3 }`), `buildRay(cam, screen, size, fovY): Ray`, `rayPlaneY(ray, y): Vec3 | null`; `Aabb` (`{ min: Vec3; max: Vec3 }`), `itemAabb(item): Aabb`, `rayAabb(ray, aabb): number | null`, `pickItem(items, ray): string | null`.

- [ ] **Step 1: Export `cameraRight`**

In `packages/editor/src/viewport3d/flyCamera.ts`, change `function cameraRight` to `export function cameraRight`.

- [ ] **Step 2: Write the failing tests**

`packages/editor/tests/viewport3d/ray.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EDITOR_FOV_Y, buildRay, rayPlaneY } from '../../src/viewport3d/ray'
import { initialFlyCamera } from '../../src/viewport3d/flyCamera'

const size = { w: 800, h: 600 }

describe('ray build', () => {
  it('center pixel shoots along the camera forward', () => {
    const cam = { position: { x: 0, y: 5, z: 0 }, yaw: 0, pitch: 0 }
    const ray = buildRay(cam, { x: 400, y: 300 }, size, EDITOR_FOV_Y)
    expect(ray.origin).toEqual({ x: 0, y: 5, z: 0 })
    expect(ray.dir.z).toBeCloseTo(-1)
    expect(ray.dir.x).toBeCloseTo(0)
    expect(ray.dir.y).toBeCloseTo(0)
  })

  it('a downward ray hits the ground plane', () => {
    const cam = { position: { x: 2, y: 10, z: -3 }, yaw: 0, pitch: -Math.PI / 2 + 0.05 }
    const ray = buildRay(cam, { x: 400, y: 300 }, size, EDITOR_FOV_Y)
    const hit = rayPlaneY(ray, 0)
    expect(hit).not.toBeNull()
    expect(hit!.y).toBeCloseTo(0)
    expect(hit!.x).toBeCloseTo(2, 0)
  })

  it('returns null when the ray is parallel to the plane', () => {
    const ray = { origin: { x: 0, y: 5, z: 0 }, dir: { x: 0, y: 0, z: -1 } }
    expect(rayPlaneY(ray, 0)).toBeNull()
  })
})
```

`packages/editor/tests/viewport3d/aabb.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { itemAabb, pickItem, rayAabb } from '../../src/viewport3d/aabb'
import { boxItem } from '../fixtures/fakeDefinition'

describe('AABB + picking', () => {
  it('builds an AABB centered on a box item', () => {
    const aabb = itemAabb(boxItem('a', 0, 0))
    expect(aabb.min).toEqual({ x: -0.5, y: -0.5, z: -0.5 })
    expect(aabb.max).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
  })

  it('rayAabb returns entry distance for a hit, null for a miss', () => {
    const aabb = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }
    expect(rayAabb({ origin: { x: 0, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } }, aabb)).toBeCloseTo(9)
    expect(rayAabb({ origin: { x: 5, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } }, aabb)).toBeNull()
  })

  it('picks the nearest item under the ray', () => {
    const near = boxItem('near', 0, 0)
    const far = { ...boxItem('far', 0, 0), transform: { position: { x: 0, y: 0, z: -5 }, rotationEuler: { x: 0, y: 0, z: 0 } } }
    const id = pickItem([far, near], { origin: { x: 0, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } })
    expect(id).toBe('near')
  })

  it('returns null when nothing is hit', () => {
    expect(pickItem([boxItem('a', 0, 0)], { origin: { x: 50, y: 0, z: 10 }, dir: { x: 0, y: 0, z: -1 } })).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/viewport3d/ray.test.ts packages/editor/tests/viewport3d/aabb.test.ts`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 4: Implement**

`packages/editor/src/viewport3d/ray.ts`:
```ts
import type { Vec3 } from '@automata/engine'
import { cameraForward, cameraRight, type FlyCamera } from './flyCamera'

/** Must match the engine PerspectiveCamera vertical FOV in createThreeRenderer (60°). */
export const EDITOR_FOV_Y = (60 * Math.PI) / 180

export interface Ray { origin: Vec3; dir: Vec3 }

const norm = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

export function buildRay(
  cam: FlyCamera, screen: { x: number; y: number }, size: { w: number; h: number }, fovY: number
): Ray {
  const ndcX = (screen.x / size.w) * 2 - 1
  const ndcY = -((screen.y / size.h) * 2 - 1)
  const tanY = Math.tan(fovY / 2)
  const aspect = size.w / size.h
  const f = cameraForward(cam)
  const r = cameraRight(cam)
  // up = right × forward (right-handed)
  const up = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x
  }
  const sx = ndcX * tanY * aspect
  const sy = ndcY * tanY
  return {
    origin: cam.position,
    dir: norm({
      x: f.x + r.x * sx + up.x * sy,
      y: f.y + r.y * sx + up.y * sy,
      z: f.z + r.z * sx + up.z * sy
    })
  }
}

/** Intersection with the horizontal plane y = planeY, or null if parallel/behind. */
export function rayPlaneY(ray: Ray, planeY: number): Vec3 | null {
  if (Math.abs(ray.dir.y) < 1e-9) return null
  const t = (planeY - ray.origin.y) / ray.dir.y
  if (t < 0) return null
  return { x: ray.origin.x + ray.dir.x * t, y: planeY, z: ray.origin.z + ray.dir.z * t }
}
```

`packages/editor/src/viewport3d/aabb.ts`:
```ts
import type { Vec3 } from '@automata/engine'
import type { SceneItem } from '../model/types'
import type { Ray } from './ray'

export interface Aabb { min: Vec3; max: Vec3 }

const MARKER_HALF = 0.4

/** Axis-aligned bounds of an item (rotation ignored — a deliberate pick approximation). */
export function itemAabb(item: SceneItem): Aabb {
  const p = item.transform.position
  let hx = MARKER_HALF, hy = MARKER_HALF, hz = MARKER_HALF
  if (item.shape.type === 'box') { hx = item.shape.size.x / 2; hy = item.shape.size.y / 2; hz = item.shape.size.z / 2 }
  else if (item.shape.type === 'cylinder') { hx = item.shape.radius; hy = item.shape.height / 2; hz = item.shape.radius }
  return { min: { x: p.x - hx, y: p.y - hy, z: p.z - hz }, max: { x: p.x + hx, y: p.y + hy, z: p.z + hz } }
}

/** Slab method. Returns entry distance t ≥ 0, or null if the ray misses. */
export function rayAabb(ray: Ray, box: Aabb): number | null {
  let tmin = -Infinity, tmax = Infinity
  for (const axis of ['x', 'y', 'z'] as const) {
    const o = ray.origin[axis], d = ray.dir[axis]
    const lo = box.min[axis], hi = box.max[axis]
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue }
    let t1 = (lo - o) / d, t2 = (hi - o) / d
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }
  return tmax < 0 ? null : Math.max(tmin, 0)
}

export function pickItem(items: SceneItem[], ray: Ray): string | null {
  let best: { id: string; t: number } | null = null
  for (const item of items) {
    const t = rayAabb(ray, itemAabb(item))
    if (t !== null && (best === null || t < best.t)) best = { id: item.id, t }
  }
  return best?.id ?? null
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/viewport3d/ray.test.ts packages/editor/tests/viewport3d/aabb.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(editor): 3D picking — ray build, ray-plane, ray-AABB, item bounds"
```

### Task 15: 2D map hit-testing

**Files:**
- Create: `packages/editor/src/viewport2d/hit.ts`
- Test: `packages/editor/tests/viewport2d/hit.test.ts`

**Interfaces:**
- Consumes: `DrawOp`, `buildDrawModel`, `MapView`, `ScreenSize`; `GameDefinition`, `SceneItem`.
- Produces: `hitTestMap(definition, items, view, size, screen): string | null` (topmost item under a screen point).

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/viewport2d/hit.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { hitTestMap } from '../../src/viewport2d/hit'
import { initialMapView } from '../../src/viewport2d/projection'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'

const size = { w: 800, h: 600 }

describe('2D hit-testing', () => {
  it('hits a box at its center', () => {
    const id = hitTestMap(fakeDefinition, [boxItem('b', 0, 0)], initialMapView, size, { x: 400, y: 300 })
    expect(id).toBe('b')
  })
  it('misses outside any item', () => {
    const id = hitTestMap(fakeDefinition, [boxItem('b', 0, 0)], initialMapView, size, { x: 10, y: 10 })
    expect(id).toBeNull()
  })
  it('returns the topmost (last-drawn) item when overlapping', () => {
    const id = hitTestMap(fakeDefinition, [boxItem('a', 0, 0), boxItem('b', 0, 0)], initialMapView, size, { x: 400, y: 300 })
    expect(id).toBe('b')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/viewport2d/hit.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/viewport2d/hit.ts`:
```ts
import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'
import { buildDrawModel } from './draw'
import type { MapView, ScreenSize } from './projection'

export function hitTestMap<Doc>(
  definition: GameDefinition<Doc>,
  items: SceneItem[],
  view: MapView,
  size: ScreenSize,
  screen: { x: number; y: number }
): string | null {
  const ops = buildDrawModel(definition, items, [], view, size)
  // Topmost first: iterate in reverse draw order.
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]!
    if (op.shape === 'rect') {
      if (screen.x >= op.x && screen.x <= op.x + op.w! && screen.y >= op.y && screen.y <= op.y + op.h!) return op.id
    } else {
      if (Math.hypot(screen.x - op.x, screen.y - op.y) <= op.r!) return op.id
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/viewport2d/hit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): 2D map hit-testing"
```

### Task 16: Cardinality helpers

**Files:**
- Create: `packages/editor/src/tools/cardinality.ts`
- Test: `packages/editor/tests/tools/cardinality.test.ts`

**Interfaces:**
- Consumes: `GameDefinition`, `Brush`, `SceneItem`, `ItemShape`.
- Produces: `brushOf(definition, item): Brush | null`, `countForBrush(definition, items, brush): number`, `canPlace(definition, items, brush): boolean`, `canDelete(definition, items, id): boolean`, `missingRequired(definition, items): string[]` (labels of brushes below `min`).

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/tools/cardinality.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { canDelete, canPlace, countForBrush, missingRequired } from '../../src/tools/cardinality'
import { boxItem, fakeDefinition } from '../fixtures/fakeDefinition'
import type { SceneItem } from '../../src/model/types'

const startMarker = (id: string): SceneItem => ({
  id, kind: 'marker',
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' }, surface: { kind: 'color', value: '#0f0' }
})
const boxBrush = fakeDefinition.palette.geometry[0]!
const markerBrush = fakeDefinition.palette.markers[0]!

describe('cardinality', () => {
  it('counts items per brush', () => {
    expect(countForBrush(fakeDefinition, [boxItem('a'), boxItem('b')], boxBrush)).toBe(2)
  })
  it('allows unbounded geometry placement', () => {
    expect(canPlace(fakeDefinition, [boxItem('a')], boxBrush)).toBe(true)
  })
  it('blocks placing a singleton marker that already exists', () => {
    expect(canPlace(fakeDefinition, [startMarker('marker:start')], markerBrush)).toBe(false)
  })
  it('guards deletion of a required marker at its minimum', () => {
    expect(canDelete(fakeDefinition, [startMarker('marker:start')], 'marker:start')).toBe(false)
    expect(canDelete(fakeDefinition, [boxItem('a')], 'a')).toBe(true)
  })
  it('reports required brushes that are missing', () => {
    expect(missingRequired(fakeDefinition, [])).toEqual(['Start'])
    expect(missingRequired(fakeDefinition, [startMarker('marker:start')])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/tools/cardinality.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/tools/cardinality.ts`:
```ts
import type { GameDefinition } from '../model/gameDefinition'
import type { Brush, SceneItem } from '../model/types'

function allBrushes<Doc>(definition: GameDefinition<Doc>): Brush[] {
  return [...definition.palette.geometry, ...definition.palette.archetypes, ...definition.palette.markers]
}

/** The brush that produced an item, matched by kind + (for archetype/marker) ref. */
export function brushOf<Doc>(definition: GameDefinition<Doc>, item: SceneItem): Brush | null {
  const ref = item.shape.type === 'archetype' ? item.shape.name
    : item.shape.type === 'marker' ? item.shape.markerId : undefined
  return allBrushes(definition).find(
    (b) => b.kind === item.kind && (b.ref === undefined || b.ref === ref)
  ) ?? null
}

export function countForBrush<Doc>(definition: GameDefinition<Doc>, items: SceneItem[], brush: Brush): number {
  return items.filter((i) => brushOf(definition, i)?.id === brush.id).length
}

export function canPlace<Doc>(definition: GameDefinition<Doc>, items: SceneItem[], brush: Brush): boolean {
  return countForBrush(definition, items, brush) < brush.cardinality.max
}

export function canDelete<Doc>(definition: GameDefinition<Doc>, items: SceneItem[], id: string): boolean {
  const item = items.find((i) => i.id === id)
  if (!item) return false
  const brush = brushOf(definition, item)
  if (!brush) return true
  return countForBrush(definition, items, brush) > brush.cardinality.min
}

export function missingRequired<Doc>(definition: GameDefinition<Doc>, items: SceneItem[]): string[] {
  return allBrushes(definition)
    .filter((b) => countForBrush(definition, items, b) < b.cardinality.min)
    .map((b) => b.label)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/tools/cardinality.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): generic cardinality helpers"
```

### Task 17: Placement command builder

Turns a brush + a world point into a `SceneCommand`: a new item for unbounded brushes, or a `moveSelected` for a singleton already at `max` (placing a spawn relocates it).

**Files:**
- Create: `packages/editor/src/tools/place.ts`
- Test: `packages/editor/tests/tools/place.test.ts`

**Interfaces:**
- Consumes: `GameDefinition`, `Brush`, `SceneItem`, `SceneCommand`, `Vec3`; `snapVec3XZ`; `canPlace`, `countForBrush`.
- Produces: `placementCommand(definition, items, brush, world, cell): SceneCommand | null`, `newItemId(brush, items): string`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/tools/place.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { placementCommand } from '../../src/tools/place'
import { fakeDefinition } from '../fixtures/fakeDefinition'
import type { SceneItem } from '../../src/model/types'

const boxBrush = fakeDefinition.palette.geometry[0]!
const markerBrush = fakeDefinition.palette.markers[0]!
const existingMarker: SceneItem = {
  id: 'marker:start', kind: 'marker',
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker', markerId: 'start' }, surface: { kind: 'color', value: '#0f0' }
}

describe('placement command', () => {
  it('adds a snapped item for an unbounded brush', () => {
    const cmd = placementCommand(fakeDefinition, [], boxBrush, { x: 1.2, y: 0, z: -0.3 }, 0.5)
    expect(cmd?.type).toBe('addItem')
    if (cmd?.type === 'addItem') expect(cmd.item.transform.position).toEqual({ x: 1, y: 0, z: -0.5 })
  })

  it('moves an existing singleton marker instead of adding a second', () => {
    const cmd = placementCommand(fakeDefinition, [existingMarker], markerBrush, { x: 2, y: 0, z: 2 }, 1)
    expect(cmd).toMatchObject({ type: 'moveSelected', ids: ['marker:start'] })
    if (cmd?.type === 'moveSelected') expect(cmd.delta).toEqual({ x: 2, y: 0, z: 2 })
  })

  it('adds the first marker when none exists yet', () => {
    const cmd = placementCommand(fakeDefinition, [], markerBrush, { x: 0, y: 0, z: 0 }, 1)
    expect(cmd?.type).toBe('addItem')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/tools/place.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/tools/place.ts`:
```ts
import type { Vec3 } from '@automata/engine'
import type { GameDefinition } from '../model/gameDefinition'
import type { Brush, ItemShape, SceneItem, Surface } from '../model/types'
import type { SceneCommand } from '../model/types'
import { snapVec3XZ } from '../grid'
import { canPlace, countForBrush } from './cardinality'

export function newItemId(brush: Brush, items: SceneItem[]): string {
  if (brush.kind === 'marker') return `marker:${brush.ref}`
  let n = items.length
  let id = `${brush.id}:${n}`
  const taken = new Set(items.map((i) => i.id))
  while (taken.has(id)) { n++; id = `${brush.id}:${n}` }
  return id
}

function shapeFor(brush: Brush): ItemShape {
  switch (brush.kind) {
    case 'box': return { type: 'box', size: { x: 1, y: 1, z: 1 } }
    case 'cylinder': return { type: 'cylinder', radius: 0.5, height: 1 }
    case 'archetype': return { type: 'archetype', name: brush.ref ?? brush.id }
    case 'marker': return { type: 'marker', markerId: brush.ref ?? brush.id }
  }
}

const defaultSurface: Surface = { kind: 'color', value: '#7ec850' }

export function placementCommand<Doc>(
  definition: GameDefinition<Doc>,
  items: SceneItem[],
  brush: Brush,
  world: Vec3,
  cell: number
): SceneCommand | null {
  const pos = snapVec3XZ(world, cell)
  // Singleton already present: relocate it rather than add a second.
  if (!canPlace(definition, items, brush) && brush.cardinality.max === 1) {
    const existing = items.find((i) => i.id === `marker:${brush.ref}`)
    if (!existing) return null
    const p = existing.transform.position
    return { type: 'moveSelected', ids: [existing.id], delta: { x: pos.x - p.x, y: 0, z: pos.z - p.z } }
  }
  if (!canPlace(definition, items, brush)) return null
  const item: SceneItem = {
    id: newItemId(brush, items), kind: brush.kind,
    transform: { position: pos, rotationEuler: { x: 0, y: 0, z: 0 } },
    shape: shapeFor(brush), surface: defaultSurface
  }
  void countForBrush
  return { type: 'addItem', item }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/tools/place.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): placement command builder with cardinality + snap"
```

### Task 18: Complete monkey-ball `SceneModel.apply` — addItem + setItemField

**Files:**
- Modify: `games/monkey-ball/src/editor/sceneModel.ts`
- Test: `games/monkey-ball/tests/editor/sceneModelEdit.test.ts`

**Interfaces:**
- Produces: `levelSceneModel.apply` handling `addItem` (box/cylinder → `geometry`, archetype → `entities`) and `setItemField` (geometry position, box size, cylinder radius/height via `path`).

- [ ] **Step 1: Write the failing tests**

`games/monkey-ball/tests/editor/sceneModelEdit.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { levelSceneModel } from '../../src/editor/sceneModel'
import { levelKind } from '../../src/data/level'
import { parseData } from '@automata/engine'
import { readDataFile } from '../helpers/data'
import type { SceneItem } from '@automata/editor'

const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

const boxItem: SceneItem = {
  id: 'box:9', kind: 'box',
  transform: { position: { x: 1, y: 0, z: 2 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'box', size: { x: 2, y: 0.5, z: 4 } }, surface: { kind: 'color', value: '#abcabc' }
}
const archItem: SceneItem = {
  id: 'banana:9', kind: 'archetype',
  transform: { position: { x: 3, y: 0.6, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'archetype', name: 'banana' }, surface: { kind: 'color', value: '#ffd23f' }
}

describe('level SceneModel edits', () => {
  it('addItem of a box appends a box geometry entry', () => {
    const next = levelSceneModel.apply(level, { type: 'addItem', item: boxItem })
    const added = next.geometry.at(-1)!
    expect(added).toMatchObject({ shape: 'box', size: [2, 0.5, 4], pos: [1, 0, 2], color: '#abcabc' })
  })

  it('addItem of an archetype appends an entity', () => {
    const next = levelSceneModel.apply(level, { type: 'addItem', item: archItem })
    expect(next.entities.at(-1)).toMatchObject({ archetype: 'banana', pos: [3, 0.6, 0] })
  })

  it('setItemField edits a geometry box size component', () => {
    const next = levelSceneModel.apply(level, { type: 'setItemField', id: 'geometry:0', path: 'size.y', value: 1.5 })
    expect(next.geometry[0]!.shape === 'box' && next.geometry[0]!.size[1]).toBe(1.5)
  })

  it('setItemField edits a geometry position component', () => {
    const next = levelSceneModel.apply(level, { type: 'setItemField', id: 'geometry:0', path: 'pos.x', value: 4 })
    expect(next.geometry[0]!.pos[0]).toBe(4)
  })

  it('round-trips: edited level still parses against levelKind', () => {
    const next = levelSceneModel.apply(level, { type: 'addItem', item: boxItem })
    expect(() => levelKind.schema.parse(next)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run games/monkey-ball/tests/editor/sceneModelEdit.test.ts`
Expected: FAIL — `apply` throws "not supported until M12" for `addItem`.

- [ ] **Step 3: Implement**

In `games/monkey-ball/src/editor/sceneModel.ts`, replace the `case 'addItem':` / `case 'setItemField':` arm (the one that throws "not supported until M12") with:
```ts
      case 'addItem': {
        const item = cmd.item
        if (item.shape.type === 'box') {
          return { ...level, geometry: [...level.geometry, {
            shape: 'box', size: [item.shape.size.x, item.shape.size.y, item.shape.size.z],
            pos: [item.transform.position.x, item.transform.position.y, item.transform.position.z],
            color: item.surface.kind === 'color' ? item.surface.value : '#ffffff', friction: 0.6
          }] }
        }
        if (item.shape.type === 'cylinder') {
          return { ...level, geometry: [...level.geometry, {
            shape: 'cylinder', radius: item.shape.radius, height: item.shape.height,
            pos: [item.transform.position.x, item.transform.position.y, item.transform.position.z],
            color: item.surface.kind === 'color' ? item.surface.value : '#ffffff', friction: 0.6
          }] }
        }
        if (item.shape.type === 'archetype') {
          return { ...level, entities: [...level.entities, {
            archetype: item.shape.name,
            pos: [item.transform.position.x, item.transform.position.y, item.transform.position.z]
          }] }
        }
        throw new CommandError('markers are singletons and cannot be added')
      }
      case 'setItemField': {
        if (!cmd.id.startsWith('geometry:')) throw new CommandError(`field edit unsupported for ${cmd.id}`)
        const i = Number(cmd.id.slice('geometry:'.length))
        const axis = { x: 0, y: 1, z: 2 }[cmd.path.split('.')[1] as 'x' | 'y' | 'z']
        return {
          ...level,
          geometry: level.geometry.map((g, gi) => {
            if (gi !== i) return g
            if (cmd.path.startsWith('pos.')) {
              const pos = [...g.pos] as [number, number, number]
              pos[axis] = Number(cmd.value)
              return { ...g, pos }
            }
            if (cmd.path.startsWith('size.') && g.shape === 'box') {
              const size = [...g.size] as [number, number, number]
              size[axis] = Number(cmd.value)
              return { ...g, size }
            }
            if (cmd.path === 'radius' && g.shape === 'cylinder') return { ...g, radius: Number(cmd.value) }
            if (cmd.path === 'height' && g.shape === 'cylinder') return { ...g, height: Number(cmd.value) }
            throw new CommandError(`unsupported field ${cmd.path}`)
          })
        }
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run games/monkey-ball/tests/editor/sceneModelEdit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(game): complete level SceneModel apply (addItem + setItemField)"
```

### Task 19: Inspector field model

**Files:**
- Create: `packages/editor/src/tools/inspector.ts`
- Test: `packages/editor/tests/tools/inspector.test.ts`

**Interfaces:**
- Consumes: `GameDefinition`, `SceneItem`, `Field`, `SceneCommand`.
- Produces: `inspectorFields(definition, doc, selection): Field[]` (metadata fields when nothing selected; otherwise the selected item's pos/size fields), `fieldCommand(selection, field, value): SceneCommand`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/tools/inspector.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { fieldCommand, inspectorFields } from '../../src/tools/inspector'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('inspector', () => {
  it('shows metadata fields when nothing is selected', () => {
    const doc: FakeDoc = { title: 'Hi', items: [] }
    expect(inspectorFields(fakeDefinition, doc, []).map((f) => f.path)).toEqual(['title'])
  })

  it('shows the selected box position and size fields', () => {
    const doc: FakeDoc = { title: 'x', items: [boxItem('a', 2, 3)] }
    const fields = inspectorFields(fakeDefinition, doc, ['a'])
    expect(fields.map((f) => f.path)).toEqual(['pos.x', 'pos.y', 'pos.z', 'size.x', 'size.y', 'size.z'])
    expect(fields[0]).toMatchObject({ value: 2 })
    expect(fields[2]).toMatchObject({ value: 3 })
    expect(fields.find((f) => f.path === 'size.y')).toMatchObject({ value: 1 })
  })

  it('builds a setMetadata command for a metadata field', () => {
    expect(fieldCommand([], { path: 'title', label: 'Title', type: 'text', value: '' }, 'New'))
      .toEqual({ type: 'setMetadata', path: 'title', value: 'New' })
  })

  it('builds a setItemField command for selected item fields', () => {
    expect(fieldCommand(['a'], { path: 'size.x', label: 'Width', type: 'number', value: 1 }, 5))
      .toEqual({ type: 'setItemField', id: 'a', path: 'size.x', value: 5 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/tools/inspector.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/tools/inspector.ts`:
```ts
import type { GameDefinition } from '../model/gameDefinition'
import type { Field, SceneCommand } from '../model/types'

export function inspectorFields<Doc>(
  definition: GameDefinition<Doc>, doc: Doc, selection: string[]
): Field[] {
  if (selection.length !== 1) return definition.scene.metadataFields(doc)
  const item = definition.scene.listItems(doc).find((i) => i.id === selection[0])
  if (!item) return definition.scene.metadataFields(doc)
  const p = item.transform.position
  const fields: Field[] = [
    { path: 'pos.x', label: 'X', type: 'number', value: p.x },
    { path: 'pos.y', label: 'Y', type: 'number', value: p.y },
    { path: 'pos.z', label: 'Z', type: 'number', value: p.z }
  ]
  if (item.shape.type === 'box') {
    fields.push(
      { path: 'size.x', label: 'Width', type: 'number', value: item.shape.size.x },
      { path: 'size.y', label: 'Height', type: 'number', value: item.shape.size.y },
      { path: 'size.z', label: 'Depth', type: 'number', value: item.shape.size.z }
    )
  } else if (item.shape.type === 'cylinder') {
    fields.push(
      { path: 'radius', label: 'Radius', type: 'number', value: item.shape.radius },
      { path: 'height', label: 'Height', type: 'number', value: item.shape.height }
    )
  }
  return fields
}

export function fieldCommand(
  selection: string[], field: Field, value: number | string
): SceneCommand {
  if (
    selection.length === 1 &&
    (field.path.startsWith('pos.') || field.path.startsWith('size.') || field.path === 'radius' || field.path === 'height')
  ) {
    return { type: 'setItemField', id: selection[0]!, path: field.path, value }
  }
  return { type: 'setMetadata', path: field.path, value }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/tools/inspector.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): inspector field model"
```

### Task 20: Validation (schema + cardinality) + exportability

**Files:**
- Create: `packages/editor/src/io/validation.ts`
- Test: `packages/editor/tests/io/validation.test.ts`

**Interfaces:**
- Consumes: `GameDefinition`, `SceneModel.parse`, `missingRequired`.
- Produces: `validateDoc(definition, doc): { issues: string[]; exportable: boolean }`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/io/validation.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { validateDoc } from '../../src/io/validation'
import { fakeDefinition, boxItem, type FakeDoc } from '../fixtures/fakeDefinition'

describe('validateDoc', () => {
  it('flags a missing required marker and blocks export', () => {
    const doc: FakeDoc = { title: 'x', items: [boxItem('a')] }
    const result = validateDoc(fakeDefinition, doc)
    expect(result.exportable).toBe(false)
    expect(result.issues.some((i) => i.includes('Start'))).toBe(true)
  })

  it('is exportable when all required markers are present', () => {
    const doc: FakeDoc = { title: 'x', items: [
      boxItem('a'),
      { id: 'marker:start', kind: 'marker',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'marker', markerId: 'start' }, surface: { kind: 'color', value: '#0f0' } }
    ] }
    expect(validateDoc(fakeDefinition, doc)).toEqual({ issues: [], exportable: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/io/validation.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/io/validation.ts`:
```ts
import type { GameDefinition } from '../model/gameDefinition'
import { missingRequired } from '../tools/cardinality'

export function validateDoc<Doc>(
  definition: GameDefinition<Doc>, doc: Doc
): { issues: string[]; exportable: boolean } {
  const issues: string[] = []
  try {
    definition.scene.parse(doc) // schema check (round-trips the validator)
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error))
  }
  for (const label of missingRequired(definition, definition.scene.listItems(doc))) {
    issues.push(`Missing required: ${label}`)
  }
  return { issues, exportable: issues.length === 0 }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/io/validation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Export tool symbols from barrel + commit**

Append to `packages/editor/src/index.ts`:
```ts
export * from './viewport3d/ray'
export * from './viewport3d/aabb'
export * from './viewport2d/hit'
export * from './tools/cardinality'
export * from './tools/place'
export * from './tools/inspector'
export * from './io/validation'
export * from './grid'
```
Then:
```bash
npm run typecheck
git add -A
git commit -m "feat(editor): document validation (schema + cardinality)"
```

### Task 21: Wire tools into the host + DOM panels (M12 checkpoint)

Adds selection-by-picking, the place tool, surface cycling, delete, the palette panel, the inspector panel, and the validation panel to the host core (testable) and the DOM shim.

**Files:**
- Modify: `packages/editor/src/host.ts`
- Create: `packages/editor/src/tools/surfaceCycle.ts`
- Create: `packages/editor/src/ui/panels.ts`
- Modify: `tools/level-editor/src/main.ts`
- Test: `packages/editor/tests/tools/surfaceCycle.test.ts`
- Test: `packages/editor/tests/hostTools.test.ts`
- Test: `packages/editor/tests/ui/panels.test.ts`

**Interfaces:**
- Consumes: all M12 tools; `EditorCore`.
- Produces: `nextSurface(palette, current): Surface`; `EditorCore` gains `pick3d(screen, size)`, `pick2d(screen, size)`, `placeAt(world)`, `moveSelectionTo(world)`, `cycleSurfaceOn(id)`, `deleteSelected()`; `renderPanels(core, host): () => void` (DOM panels bound to the store).

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/tools/surfaceCycle.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { nextSurface } from '../../src/tools/surfaceCycle'

const palette = [{ kind: 'color', value: '#a' }, { kind: 'color', value: '#b' }, { kind: 'color', value: '#c' }] as const

describe('surface cycle', () => {
  it('advances to the next palette entry', () => {
    expect(nextSurface([...palette], { kind: 'color', value: '#a' })).toEqual({ kind: 'color', value: '#b' })
  })
  it('wraps around and defaults unknown to the first', () => {
    expect(nextSurface([...palette], { kind: 'color', value: '#c' })).toEqual({ kind: 'color', value: '#a' })
    expect(nextSurface([...palette], { kind: 'color', value: '#z' })).toEqual({ kind: 'color', value: '#a' })
  })
})
```

`packages/editor/tests/hostTools.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../src/host'
import { renderDefinition, boxItem, type FakeDoc } from './fixtures/fakeDefinition'

const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

function makeEditor() {
  return createEditor<FakeDoc>({ definition: renderDefinition, render: createNullRenderer().port, physics: nullPhysics() })
}

describe('host tools', () => {
  it('places an item via the active place brush', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'setTool', tool: { brushId: 'box', mode: 'place' } })
    editor.placeAt({ x: 1, y: 0, z: 1 })
    expect(renderDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(1)
    editor.dispose()
  })

  it('selects the topmost item in the 2D map', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a', 0, 0) } })
    editor.pick2d({ x: 400, y: 300 }, { w: 800, h: 600 })
    expect(editor.store.getState().selection).toEqual(['a'])
    editor.dispose()
  })

  it('deletes the selection but guards required markers', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.deleteSelected()
    expect(renderDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    editor.dispose()
  })

  it('moves the selected item to a clicked world point', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.moveSelectionTo({ x: 4, y: 0, z: 5 })
    const item = renderDefinition.scene.listItems(editor.store.getState().document.doc)[0]!
    expect(item.transform.position).toEqual({ x: 4, y: 0, z: 5 })
    editor.dispose()
  })

  it('cycles the surface of an item', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.cycleSurfaceOn('a')
    expect(renderDefinition.scene.getSurface(editor.store.getState().document.doc, 'a').kind).toBe('color')
    editor.dispose()
  })
})
```

`packages/editor/tests/ui/panels.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { renderPanels } from '../../src/ui/panels'
import { renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

describe('panels', () => {
  it('renders palette brushes and a validation issue for the empty doc', () => {
    const host = document.createElement('div')
    const editor = createEditor<FakeDoc>({ definition: renderDefinition, render: createNullRenderer().port, physics: nullPhysics() })
    const dispose = renderPanels(editor, host)
    expect(host.querySelectorAll('[data-brush]').length).toBeGreaterThan(0)
    expect(host.querySelector('[data-validation]')!.textContent).toContain('Start')
    dispose(); editor.dispose()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/tools/surfaceCycle.test.ts packages/editor/tests/hostTools.test.ts packages/editor/tests/ui/panels.test.ts`
Expected: FAIL — modules/methods not found.

- [ ] **Step 3: Implement `nextSurface`**

`packages/editor/src/tools/surfaceCycle.ts`:
```ts
import type { Surface } from '../model/types'

const same = (a: Surface, b: Surface): boolean =>
  a.kind === b.kind && (a.kind === 'color' ? a.value === (b as { value: string }).value : true)

export function nextSurface(palette: Surface[], current: Surface): Surface {
  const i = palette.findIndex((s) => same(s, current))
  return palette[(i + 1) % palette.length] ?? palette[0]!
}
```

- [ ] **Step 4: Extend the host core**

In `packages/editor/src/host.ts`, add imports:
```ts
import { buildRay, rayPlaneY, EDITOR_FOV_Y } from './viewport3d/ray'
import { pickItem } from './viewport3d/aabb'
import { hitTestMap } from './viewport2d/hit'
import { placementCommand } from './tools/place'
import { canDelete } from './tools/cardinality'
import { nextSurface } from './tools/surfaceCycle'
import type { Vec3 } from '@automata/engine'
```
Extend the `EditorCore<Doc>` interface with:
```ts
  pick3d(screen: { x: number; y: number }, size: ScreenSize): void
  pick2d(screen: { x: number; y: number }, size: ScreenSize): void
  placeAt(world: Vec3): void
  moveSelectionTo(world: Vec3): void
  groundPointAt(screen: { x: number; y: number }, size: ScreenSize): Vec3 | null
  cycleSurfaceOn(id: string): void
  deleteSelected(): void
```
and add these methods to the returned `core` object (the `GRID_CELL` constant is `0.5`):
```ts
    pick3d(screen, size) {
      const items = definition.scene.listItems(store.getState().document.doc)
      const ray = buildRay(camera, screen, size, EDITOR_FOV_Y)
      const id = pickItem(items, ray)
      store.dispatch({ type: 'select', ids: id ? [id] : [] })
    },
    pick2d(screen, size) {
      const items = definition.scene.listItems(store.getState().document.doc)
      const id = hitTestMap(definition, items, mapView, size, screen)
      store.dispatch({ type: 'select', ids: id ? [id] : [] })
    },
    groundPointAt(screen, size) {
      return rayPlaneY(buildRay(camera, screen, size, EDITOR_FOV_Y), 0)
    },
    placeAt(world) {
      const s = store.getState()
      const brushId = s.tool.selection.brushId
      if (!brushId) return
      const all = [...definition.palette.geometry, ...definition.palette.archetypes, ...definition.palette.markers]
      const brush = all.find((b) => b.id === brushId)
      if (!brush) return
      const items = definition.scene.listItems(s.document.doc)
      const cmd = placementCommand(definition, items, brush, world, 0.5)
      if (cmd) store.dispatch({ type: 'command', command: cmd })
    },
    moveSelectionTo(world) {
      const s = store.getState()
      const [anchorId] = s.selection
      if (!anchorId) return
      const items = definition.scene.listItems(s.document.doc)
      const anchor = items.find((i) => i.id === anchorId)
      if (!anchor) return
      const p = anchor.transform.position
      store.dispatch({ type: 'command', command: {
        type: 'moveSelected',
        ids: s.selection,
        delta: { x: world.x - p.x, y: world.y - p.y, z: world.z - p.z }
      } })
    },
    cycleSurfaceOn(id) {
      const current = definition.scene.getSurface(store.getState().document.doc, id)
      const surface = nextSurface(definition.surfacePalette, current)
      store.dispatch({ type: 'command', command: { type: 'setSurface', id, surface } })
    },
    deleteSelected() {
      const s = store.getState()
      const items = definition.scene.listItems(s.document.doc)
      const ids = s.selection.filter((id) => canDelete(definition, items, id))
      if (ids.length) store.dispatch({ type: 'command', command: { type: 'deleteItems', ids } })
    },
```

- [ ] **Step 5: Implement the DOM panels**

`packages/editor/src/ui/panels.ts`:
```ts
import type { EditorCore } from '../host'
import { inspectorFields, fieldCommand } from '../tools/inspector'
import { validateDoc } from '../io/validation'

/** Renders palette + inspector + validation panels bound to the store. Returns a disposer. */
export function renderPanels<Doc>(core: EditorCore<Doc>, host: HTMLElement): () => void {
  const definition = core.definition
  const palette = document.createElement('div'); palette.className = 'panel palette'
  const inspector = document.createElement('div'); inspector.className = 'panel inspector'
  const validation = document.createElement('div'); validation.className = 'panel validation'
  validation.setAttribute('data-validation', '')
  host.append(palette, inspector, validation)

  const brushes = [...definition.palette.geometry, ...definition.palette.archetypes, ...definition.palette.markers]
  for (const brush of brushes) {
    const button = document.createElement('button')
    button.textContent = brush.label
    button.setAttribute('data-brush', brush.id)
    button.addEventListener('click', () => core.store.dispatch({ type: 'setTool', tool: { brushId: brush.id, mode: 'place' } }))
    palette.append(button)
  }

  function renderInspectorAndValidation(): void {
    const state = core.store.getState()
    inspector.replaceChildren()
    for (const field of inspectorFields(definition, state.document.doc, state.selection)) {
      const input = document.createElement('input')
      input.value = String(field.value)
      input.setAttribute('data-field', field.path)
      input.addEventListener('change', () => {
        const value = field.type === 'number' ? Number(input.value) : input.value
        core.store.dispatch({ type: 'command', command: fieldCommand(state.selection, field, value) })
      })
      const label = document.createElement('label'); label.textContent = field.label; label.append(input)
      inspector.append(label)
    }
    const result = validateDoc(definition, state.document.doc)
    validation.textContent = result.exportable ? 'Valid ✓' : result.issues.join(' · ')
  }

  renderInspectorAndValidation()
  const unsubscribe = core.store.subscribe(renderInspectorAndValidation)
  return () => { unsubscribe(); palette.remove(); inspector.remove(); validation.remove() }
}
```

> **Note:** `renderPanels` reads `core.definition`. Add `definition` to the `EditorCore` interface and to the returned object in `host.ts` (`get definition() { return definition }`).

- [ ] **Step 6: Wire the shim**

In `tools/level-editor/src/main.ts`, after creating `editor`, add panels + pointer tools (shim — keep thin):
```ts
import { renderPanels, screenToWorldXZ } from '@automata/editor'
// …after editor is created and loadDoc dispatched:
const panelHost = document.createElement('div'); panelHost.id = 'panels'; app.append(panelHost)
renderPanels(editor, panelHost)
canvas2d.addEventListener('pointerdown', (e) => {
  const screen = { x: e.offsetX, y: e.offsetY }
  const size = { w: canvas2d.width, h: canvas2d.height }
  const xz = screenToWorldXZ(editor.mapView, screen, size)
  if (e.shiftKey) {
    editor.moveSelectionTo({ x: xz.x, y: 0, z: xz.z })
    return
  }
  if (editor.store.getState().tool.selection.mode === 'place') {
    editor.placeAt({ x: xz.x, y: 0, z: xz.z })
    return
  }
  editor.pick2d(screen, size)
})
canvas3d.addEventListener('pointerdown', (e) => {
  const rect = canvas3d.getBoundingClientRect()
  const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  const size = { w: rect.width, h: rect.height }
  const world = editor.groundPointAt(screen, size)
  if (e.shiftKey) {
    if (world) editor.moveSelectionTo(world)
    return
  }
  if (editor.store.getState().tool.selection.mode === 'place') {
    if (world) editor.placeAt(world)
    return
  }
  editor.pick3d(screen, size)
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') editor.deleteSelected()
  if (e.key.toLowerCase() === 'c') {
    const [id] = editor.store.getState().selection
    if (id) editor.cycleSurfaceOn(id)
  }
})
```
The shim only converts browser events into `screenToWorldXZ`/`groundPointAt`/`placeAt`/`pick*` calls; the selection, placement, cardinality, and command behavior stay in tested core methods.

Append to `packages/editor/src/index.ts`:
```ts
export * from './ui/panels'
```

- [ ] **Step 7: Run tests + full gate**

```bash
npx vitest run packages/editor/tests/tools/surfaceCycle.test.ts packages/editor/tests/hostTools.test.ts packages/editor/tests/ui/panels.test.ts
npm run ci
```
Expected: all PASS; `npm run ci` green.

- [ ] **Step 8: Manual checkpoint (human gate)**

```bash
npm run dev -w level-editor
```
Pick the Box brush, click in the 2D map to place boxes; click an item to select (highlight in 3D); shift-click the map or 3D ground to move the selection; press Delete to remove; press `C` to cycle the selected item's surface; watch the validation panel flip to "Valid ✓" once spawn + goal exist. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(editor): tools + palette/inspector/validation panels (M12 checkpoint)"
```

---

## Milestone M13 — Instant test-play, import/export, autosave

Delivers: the headless metrics harness (`runHeadlessPlay → TestPlayResult`, real Rapier in Node — AI-readiness constraint #3); the monkey-ball `play` registration; the editor's instant play/edit toggle; import/export round-tripping through the validator (constraint #2); and autosave.

> **Dependency-direction note:** in the generic design the game **implements** the editor's `GameDefinition` interface, so `monkey-ball` depends on `@automata/editor` (type-only). The forbidden reverse edge is `editor → game`, which ESLint enforces (Task 2). `TestPlayResult`/`HeadlessOpts` are owned by `@automata/editor` and imported by the game — no duplicate definitions.

### Task 22: Headless `runHeadlessPlay → TestPlayResult` (Node, real Rapier)

**Files:**
- Modify: `games/monkey-ball/package.json` (add `@automata/editor` dependency — already required since Task 12 imports it)
- Create: `games/monkey-ball/src/level/headlessPlay.ts`
- Test: `games/monkey-ball/tests/level/headlessPlay.test.ts`

**Interfaces:**
- Consumes: `createNullAudio`, `createNullRenderer`, `createRapierPhysics`, `InputSource`, `ArchetypeLibrary` (engine); `HeadlessOpts`, `TestPlayResult` (`@automata/editor`); `createGameStore`, `createGameplay`, `Level`, `PhysicsTuning` (game).
- Produces: `runHeadlessPlay(level, lib, tuning, opts): Promise<TestPlayResult>`.

- [ ] **Step 1: Ensure the editor dependency**

In `games/monkey-ball/package.json`, the `dependencies` must include `@automata/editor` (added because Task 12 imports its types):
```json
  "dependencies": { "@automata/engine": "*", "@automata/editor": "*" },
```
Run `npm install` to link it if not already linked.

- [ ] **Step 2: Write the failing test**

`games/monkey-ball/tests/level/headlessPlay.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { levelKind } from '../../src/data/level'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('runHeadlessPlay', () => {
  it('with no input the ball rests and the run is incomplete', async () => {
    const result = await runHeadlessPlay(level, lib, tuning, { maxSteps: 120 })
    expect(result.outcome).toBe('incomplete')
    expect(result.fallCount).toBe(0)
    expect(result.steps).toBe(120)
    expect(result.timeMs).toBeGreaterThan(0)
    expect(result.bananas).toBe(0)
  })

  it('rolling forward reaches the goal', async () => {
    const result = await runHeadlessPlay(level, lib, tuning, { input: () => ({ x: 0, y: 1 }), maxSteps: 3000 })
    expect(result.outcome).toBe('completed')
    expect(result.steps).toBeLessThan(3000)
  }, 20000)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run games/monkey-ball/tests/level/headlessPlay.test.ts`
Expected: FAIL — cannot resolve `../../src/level/headlessPlay`.

- [ ] **Step 4: Implement**

`games/monkey-ball/src/level/headlessPlay.ts`:
```ts
import {
  createNullAudio, createNullRenderer, createRapierPhysics,
  type ArchetypeLibrary, type InputSource
} from '@automata/engine'
import type { HeadlessOpts, TestPlayResult } from '@automata/editor'
import type { Level } from '../data/level'
import type { PhysicsTuning } from '../data/config'
import { createGameStore } from '../state/root'
import { createGameplay } from '../game/gameplay'

/** Runs the real gameplay systems headless (real Rapier + Null render/audio) and returns metrics. */
export async function runHeadlessPlay(
  level: Level, lib: ArchetypeLibrary, tuning: PhysicsTuning, opts: HeadlessOpts
): Promise<TestPlayResult> {
  const physics = await createRapierPhysics()
  const render = createNullRenderer()
  const audio = createNullAudio()
  const store = createGameStore()

  let step = 0
  const scripted: InputSource = {
    read: () => (opts.input ? opts.input(step) : { x: 0, y: 0 }),
    dispose() {}
  }
  const game = createGameplay({
    store, physics, render: render.port, audio: audio.port, lib, level, tuning, inputSources: [scripted]
  })

  store.dispatch({ type: 'levelStarted', levelId: level.id })
  const dt = 1 / 60
  let steps = 0
  for (; steps < opts.maxSteps; steps++) {
    const scene = store.getState().scene
    if (scene === 'levelComplete' || scene === 'gameOver') break
    game.fixedUpdate(dt)
    step++
  }

  const session = store.getState().session
  const scene = store.getState().scene
  const outcome: TestPlayResult['outcome'] =
    scene === 'levelComplete' ? 'completed' : scene === 'gameOver' ? 'gameOver' : 'incomplete'
  const result: TestPlayResult = {
    outcome,
    timeMs: session.elapsedMs,
    fallCount: Math.max(0, session.runId - 1), // levelStarted sets runId=1; each fall bumps it
    bananas: session.bananas,
    steps
  }
  game.dispose()
  physics.dispose()
  return result
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run games/monkey-ball/tests/level/headlessPlay.test.ts`
Expected: PASS (2 tests). If the "rolling forward" test does not complete, raise `maxSteps` or use input `() => ({ x: 0, y: 1 })` (already forward) — do **not** weaken the harness.

- [ ] **Step 6: Export from the game barrel + commit**

Append to `games/monkey-ball/src/index.ts`:
```ts
export { runHeadlessPlay } from './level/headlessPlay'
```
Then:
```bash
npm run typecheck
git add -A
git commit -m "feat(game): headless runHeadlessPlay → TestPlayResult (AI-readiness #3)"
```

### Task 23: Monkey-ball `play` registration (live + headless)

**Files:**
- Modify: `games/monkey-ball/src/editor/registration.ts`
- Test: `games/monkey-ball/tests/editor/registrationPlay.test.ts`

**Interfaces:**
- Consumes: `createKeyboardInput`, `createGameplay` (game), `runHeadlessPlay`, `createGameStore`.
- Produces: `createMonkeyBallDefinition(lib, tuning).play` = `{ createGameplay, runHeadlessPlay }`.

- [ ] **Step 1: Write the failing test**

`games/monkey-ball/tests/editor/registrationPlay.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { createMonkeyBallDefinition } from '../../src/editor/registration'
import { levelKind } from '../../src/data/level'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('monkey-ball play registration', () => {
  it('exposes a headless runner through play', async () => {
    const def = createMonkeyBallDefinition(lib, tuning)
    expect(def.play).toBeDefined()
    const result = await def.play!.runHeadlessPlay(level, { maxSteps: 60 })
    expect(result.outcome).toBe('incomplete')
    expect(result.steps).toBe(60)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run games/monkey-ball/tests/editor/registrationPlay.test.ts`
Expected: FAIL — `def.play` is undefined.

- [ ] **Step 3: Implement**

In `games/monkey-ball/src/editor/registration.ts`:
- add imports:
```ts
import { createKeyboardInput } from '@automata/engine'
import { createGameStore } from '../state/root'
import { createGameplay } from '../game/gameplay'
import { runHeadlessPlay } from '../level/headlessPlay'
```
- rename the unused `_tuning` parameter to `tuning`;
- add a `play` member to the returned definition (after `resolveSurface`):
```ts
    play: {
      createGameplay(level: Level, render: RenderPort, physics: PhysicsPort) {
        const store = createGameStore()
        const inputs = [createKeyboardInput(window)]
        const game = createGameplay({ store, physics, render, lib, level, tuning, inputSources: inputs })
        store.dispatch({ type: 'levelStarted', levelId: level.id })
        return {
          fixedUpdate: (dt: number) => game.fixedUpdate(dt),
          render: (alpha: number) => game.render(alpha),
          dispose: () => { game.dispose(); for (const input of inputs) input.dispose() }
        }
      },
      runHeadlessPlay: (level: Level, opts) => runHeadlessPlay(level, lib, tuning, opts)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run games/monkey-ball/tests/editor/registrationPlay.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(game): monkey-ball play registration (live + headless)"
```

### Task 24: Editor play controller — instant play/edit toggle

**Files:**
- Modify: `packages/editor/src/host.ts`
- Modify: `packages/editor/tests/fixtures/fakeDefinition.ts` (add a fake `play`)
- Test: `packages/editor/tests/play/controller.test.ts`

**Interfaces:**
- Consumes: `PlayHandle`, `GameDefinition.play`, `validateDoc`.
- Produces: `EditorCore` gains `fixedUpdate(dt)`, `enterPlay()`, `exitPlay()`; `tick(alpha)` renders the play handle while in play mode; invalid documents cannot enter play mode.

- [ ] **Step 1: Add a fake play to the fixture**

Append to `packages/editor/tests/fixtures/fakeDefinition.ts`:
```ts
export const playCalls: string[] = []

export const playableDefinition: GameDefinition<FakeDoc> = {
  ...renderDefinition,
  play: {
    createGameplay: () => {
      playCalls.push('create')
      return {
        fixedUpdate: () => playCalls.push('fixed'),
        render: () => playCalls.push('render'),
        dispose: () => playCalls.push('dispose')
      }
    },
    runHeadlessPlay: async () => ({ outcome: 'incomplete', timeMs: 0, fallCount: 0, bananas: 0, steps: 0 })
  }
}
```

- [ ] **Step 2: Write the failing test**

`packages/editor/tests/play/controller.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { playCalls, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

const startMarker = {
  id: 'marker:start', kind: 'marker' as const,
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker' as const, markerId: 'start' }, surface: { kind: 'color' as const, value: '#0f0' }
}

describe('play controller', () => {
  beforeEach(() => { playCalls.length = 0 })

  it('enters play, drives the handle, and exits back to edit', () => {
    const editor = createEditor<FakeDoc>({ definition: playableDefinition, render: createNullRenderer().port, physics: nullPhysics() })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })
    editor.enterPlay()
    expect(editor.store.getState().mode).toBe('play')
    editor.fixedUpdate(1 / 60)
    editor.tick(0)
    editor.exitPlay()
    expect(editor.store.getState().mode).toBe('edit')
    expect(playCalls).toEqual(['create', 'fixed', 'render', 'dispose'])
    editor.dispose()
  })

  it('refuses to enter play with an invalid document', () => {
    const editor = createEditor<FakeDoc>({ definition: playableDefinition, render: createNullRenderer().port, physics: nullPhysics() })
    expect(() => editor.enterPlay()).toThrow(/invalid document/)
    expect(editor.store.getState().mode).toBe('edit')
    editor.dispose()
  })

  it('clears edit render objects when entering play and after dispose', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({ definition: playableDefinition, render: render.port, physics: nullPhysics() })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })
    editor.tick(0)
    expect(render.port.objectCount).toBeGreaterThan(0)
    editor.enterPlay()
    expect(render.port.objectCount).toBe(0)
    editor.exitPlay()
    editor.tick(0)
    expect(render.port.objectCount).toBeGreaterThan(0)
    editor.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('throws if the definition has no play support', () => {
    const editor = createEditor<FakeDoc>({ definition: { ...playableDefinition, play: undefined }, render: createNullRenderer().port, physics: nullPhysics() })
    expect(() => editor.enterPlay()).toThrow(/play/)
    editor.dispose()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/editor/tests/play/controller.test.ts`
Expected: FAIL — `editor.enterPlay is not a function`.

- [ ] **Step 4: Implement**

In `packages/editor/src/host.ts`:
- import the play handle type: add `import type { PlayHandle } from './model/gameDefinition'`;
- import validation: add `import { validateDoc } from './io/validation'`;
- change `const sync = createWorldSync(...)` to `let sync = createWorldSync(...)`;
- add `let play: PlayHandle | null = null` near `let camera`;
- extend the `EditorCore<Doc>` interface with:
```ts
  fixedUpdate(dt: number): void
  enterPlay(): void
  exitPlay(): void
```
- change `tick(alpha)` so it renders the play handle when active:
```ts
    tick(alpha) {
      if (play) { play.render(alpha); return }
      const stamp = store.getState().document.past.length + store.getState().selection.length * 1e6
      if (stamp !== dirtyDoc) { sync.syncNow(); dirtyDoc = stamp }
      const v = cameraView(camera)
      render.setCamera(v.position, v.lookAt)
      sync.render(alpha)
    },
```
- add these methods to the `core` object:
```ts
    fixedUpdate(dt) { if (play) play.fixedUpdate(dt) },
    enterPlay() {
      if (!definition.play) throw new Error('this definition has no play support')
      const validation = validateDoc(definition, store.getState().document.doc)
      if (!validation.exportable) throw new Error(`invalid document: ${validation.issues.join('; ')}`)
      sync.dispose()
      play = definition.play.createGameplay(store.getState().document.doc, render, physics)
      store.dispatch({ type: 'setMode', mode: 'play' })
    },
    exitPlay() {
      play?.dispose()
      play = null
      sync = createWorldSync(definition, store, render, physics)
      dirtyDoc = -1
      store.dispatch({ type: 'setMode', mode: 'edit' })
    },
```
- in `dispose()`, also dispose the play handle: `play?.dispose()` before `sync.dispose()`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/editor/tests/play/controller.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(editor): instant play/edit toggle via registered play handle"
```

### Task 25: Export — serialize + guard on validity

**Files:**
- Create: `packages/editor/src/io/exportDoc.ts`
- Test: `packages/editor/tests/io/exportDoc.test.ts`

**Interfaces:**
- Consumes: `GameDefinition`, `validateDoc`.
- Produces: `ExportResult` (`{ ok: true; json: string } | { ok: false; issues: string[] }`), `exportDoc(definition, doc): ExportResult`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/io/exportDoc.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { exportDoc } from '../../src/io/exportDoc'
import { boxItem, renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const startMarker = {
  id: 'marker:start', kind: 'marker' as const,
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker' as const, markerId: 'start' }, surface: { kind: 'color' as const, value: '#0f0' }
}

describe('exportDoc', () => {
  it('refuses to export an invalid document', () => {
    const result = exportDoc(renderDefinition, { title: 'x', items: [boxItem('a')] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((i) => i.includes('Start'))).toBe(true)
  })

  it('exports a valid document as JSON that round-trips', () => {
    const doc: FakeDoc = { title: 'x', items: [boxItem('a'), startMarker] }
    const result = exportDoc(renderDefinition, doc)
    expect(result.ok).toBe(true)
    if (result.ok) expect(renderDefinition.scene.parse(JSON.parse(result.json))).toEqual(doc)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/io/exportDoc.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/io/exportDoc.ts`:
```ts
import type { GameDefinition } from '../model/gameDefinition'
import { validateDoc } from './validation'

export type ExportResult = { ok: true; json: string } | { ok: false; issues: string[] }

export function exportDoc<Doc>(definition: GameDefinition<Doc>, doc: Doc): ExportResult {
  const result = validateDoc(definition, doc)
  if (!result.exportable) return { ok: false, issues: result.issues }
  return { ok: true, json: JSON.stringify(doc, null, 2) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/io/exportDoc.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

Append to `packages/editor/src/index.ts`:
```ts
export * from './io/exportDoc'
```
Then:
```bash
git add -A
git commit -m "feat(editor): export with validity guard"
```

### Task 26: Import — parse + validate

**Files:**
- Create: `packages/editor/src/io/importDoc.ts`
- Test: `packages/editor/tests/io/importDoc.test.ts`

**Interfaces:**
- Consumes: `GameDefinition`, `SceneModel.parse`.
- Produces: `ImportResult<Doc>` (`{ ok: true; doc: Doc } | { ok: false; issues: string[] }`), `importDoc(definition, text): ImportResult<Doc>`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/io/importDoc.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { importDoc } from '../../src/io/importDoc'
import { boxItem, renderDefinition } from '../fixtures/fakeDefinition'

describe('importDoc', () => {
  it('imports a valid JSON document', () => {
    const json = JSON.stringify({ title: 'x', items: [boxItem('a')] })
    const result = importDoc(renderDefinition, json)
    expect(result.ok).toBe(true)
    if (result.ok) expect(renderDefinition.scene.listItems(result.doc)).toHaveLength(1)
  })

  it('rejects unparseable input with an issue', () => {
    const result = importDoc(renderDefinition, '{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/io/importDoc.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/io/importDoc.ts`:
```ts
import type { GameDefinition } from '../model/gameDefinition'

export type ImportResult<Doc> = { ok: true; doc: Doc } | { ok: false; issues: string[] }

export function importDoc<Doc>(definition: GameDefinition<Doc>, text: string): ImportResult<Doc> {
  try {
    return { ok: true, doc: definition.scene.parse(JSON.parse(text)) }
  } catch (error) {
    return { ok: false, issues: [error instanceof Error ? error.message : String(error)] }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/io/importDoc.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

Append to `packages/editor/src/index.ts`:
```ts
export * from './io/importDoc'
```
Then:
```bash
git add -A
git commit -m "feat(editor): import with parse + validate"
```

### Task 27: Autosave — debounced write + restore

**Files:**
- Create: `packages/editor/src/io/autosave.ts`
- Test: `packages/editor/tests/io/autosave.test.ts`

**Interfaces:**
- Consumes: `StoragePort` (engine), `EditorStore`, `GameDefinition`.
- Produces: `AUTOSAVE_VERSION`, `installAutosave(store, definition, storage, opts): () => void` (`opts = { key; debounceMs }`), `loadAutosave(definition, storage, key): Doc | null`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/tests/io/autosave.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '@automata/engine'
import { installAutosave, loadAutosave } from '../../src/io/autosave'
import { createEditorStore } from '../../src/state/store'
import { boxItem, renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('debounce-writes the doc and restores it', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const store = createEditorStore<FakeDoc>(renderDefinition)
    const stop = installAutosave(store, renderDefinition, storage, { key: 'edit', debounceMs: 200 })
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(storage.get('edit')).toBeNull() // not yet (debounced)
    vi.advanceTimersByTime(250)
    const restored = loadAutosave(renderDefinition, storage, 'edit')
    expect(restored && renderDefinition.scene.listItems(restored)).toHaveLength(1)
    stop()
  })

  it('returns null for missing, corrupt, or wrong-version data', () => {
    const storage = memoryStorage()
    expect(loadAutosave(renderDefinition, storage, 'edit')).toBeNull()
    storage.set('edit', 'not json')
    expect(loadAutosave(renderDefinition, storage, 'edit')).toBeNull()
    storage.set('edit', JSON.stringify({ version: 999, doc: { title: 'x', items: [] } }))
    expect(loadAutosave(renderDefinition, storage, 'edit')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/editor/tests/io/autosave.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/editor/src/io/autosave.ts`:
```ts
import type { StoragePort } from '@automata/engine'
import type { GameDefinition } from '../model/gameDefinition'
import type { EditorStore } from '../state/store'

export const AUTOSAVE_VERSION = 1

export function installAutosave<Doc>(
  store: EditorStore<Doc>,
  _definition: GameDefinition<Doc>,
  storage: StoragePort,
  opts: { key: string; debounceMs: number }
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const unsubscribe = store.subscribe(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      storage.set(opts.key, JSON.stringify({ version: AUTOSAVE_VERSION, doc: store.getState().document.doc }))
    }, opts.debounceMs)
  })
  return () => { if (timer) clearTimeout(timer); unsubscribe() }
}

export function loadAutosave<Doc>(
  definition: GameDefinition<Doc>, storage: StoragePort, key: string
): Doc | null {
  const raw = storage.get(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { version?: number; doc?: unknown }
    if (parsed.version !== AUTOSAVE_VERSION) return null
    return definition.scene.parse(parsed.doc)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/editor/tests/io/autosave.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

Append to `packages/editor/src/index.ts`:
```ts
export * from './io/autosave'
```
Then:
```bash
git add -A
git commit -m "feat(editor): debounced autosave + restore"
```

### Task 28: Wire test-play + import/export/autosave into the host (M13 checkpoint)

**Files:**
- Modify: `packages/editor/src/ui/panels.ts` (add toolbar: Play/Edit, Export, Import; autosave status)
- Modify: `tools/level-editor/src/main.ts` (drive `fixedUpdate`; restore autosave; wire toolbar)
- Test: `packages/editor/tests/ui/toolbar.test.ts`

**Interfaces:**
- Consumes: `exportDoc`, `importDoc`, `installAutosave`, `loadAutosave`, `EditorCore`.
- Produces: `renderToolbar(core, host): () => void` (Play/Edit toggle, Export, Import buttons bound to the store + io).

- [ ] **Step 1: Write the failing test**

`packages/editor/tests/ui/toolbar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { renderToolbar } from '../../src/ui/panels'
import { playableDefinition, boxItem, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

const startMarker = {
  ...boxItem('m'), id: 'marker:start', kind: 'marker' as const, shape: { type: 'marker' as const, markerId: 'start' }
}

describe('toolbar', () => {
  it('toggles play mode via the Play button', () => {
    const host = document.createElement('div')
    const editor = createEditor<FakeDoc>({ definition: playableDefinition, render: createNullRenderer().port, physics: nullPhysics() })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })
    const dispose = renderToolbar(editor, host)
    host.querySelector<HTMLButtonElement>('[data-action="play"]')!.click()
    expect(editor.store.getState().mode).toBe('play')
    host.querySelector<HTMLButtonElement>('[data-action="play"]')!.click()
    expect(editor.store.getState().mode).toBe('edit')
    dispose(); editor.dispose()
  })

  it('Export reports invalid for the empty doc and valid once required markers exist', () => {
    const host = document.createElement('div')
    const editor = createEditor<FakeDoc>({ definition: playableDefinition, render: createNullRenderer().port, physics: nullPhysics() })
    const dispose = renderToolbar(editor, host)
    const status = host.querySelector('[data-export-status]')!
    host.querySelector<HTMLButtonElement>('[data-action="export"]')!.click()
    expect(status.textContent).toContain('Start') // missing marker
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })
    host.querySelector<HTMLButtonElement>('[data-action="export"]')!.click()
    expect(status.textContent).toContain('Exported')
    dispose(); editor.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor/tests/ui/toolbar.test.ts`
Expected: FAIL — `renderToolbar` is not exported.

- [ ] **Step 3: Implement the toolbar**

Add this import to the existing import block at the top of `packages/editor/src/ui/panels.ts`:
```ts
import { exportDoc } from '../io/exportDoc'
```

Then append:
```ts
/** Play/Edit + Import/Export toolbar. Returns a disposer. File IO is a host shim. */
export function renderToolbar<Doc>(core: EditorCore<Doc>, host: HTMLElement): () => void {
  const bar = document.createElement('div'); bar.className = 'toolbar'
  const play = document.createElement('button'); play.setAttribute('data-action', 'play'); play.textContent = 'Play'
  const importBtn = document.createElement('button'); importBtn.setAttribute('data-action', 'import'); importBtn.textContent = 'Import'
  const exportBtn = document.createElement('button'); exportBtn.setAttribute('data-action', 'export'); exportBtn.textContent = 'Export'
  const status = document.createElement('span'); status.setAttribute('data-export-status', '')
  bar.append(play, importBtn, exportBtn, status)
  host.append(bar)

  play.addEventListener('click', () => {
    try {
      if (core.store.getState().mode === 'edit') core.enterPlay()
      else core.exitPlay()
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
      return
    }
    play.textContent = core.store.getState().mode === 'play' ? 'Edit' : 'Play'
  })
  exportBtn.addEventListener('click', () => {
    const result = exportDoc(core.definition, core.store.getState().document.doc)
    status.textContent = result.ok ? `Exported ${result.json.length} bytes` : result.issues.join(' · ')
    core.onExport?.(result)
  })
  importBtn.addEventListener('click', () => core.onImportRequest?.())
  return () => { bar.remove() }
}
```

> **Note:** add optional `onExport?(result): void` and `onImportRequest?(): void` hooks to the `EditorCore` interface (default unset); the host shim sets them to trigger browser download/file input. The tested path is the status text + the `exportDoc` result.

- [ ] **Step 4: Wire the shim**

In `tools/level-editor/src/main.ts`:
- import `renderToolbar, installAutosave, loadAutosave, importDoc` from `@automata/editor` and `localStorageAdapter` from `@automata/engine`;
- after creating `editor`, restore autosave then install it:
```ts
const storage = localStorageAdapter()
const saved = loadAutosave(definition, storage, 'monkey-ball-editor')
editor.store.dispatch({ type: 'loadDoc', doc: saved ?? definition.scene.emptyDoc() })
installAutosave(editor.store, definition, storage, { key: 'monkey-ball-editor', debounceMs: 400 })
renderToolbar(editor, panelHost)
const fileInput = document.createElement('input')
fileInput.type = 'file'
fileInput.accept = 'application/json'
fileInput.hidden = true
app.append(fileInput)
editor.onExport = (result) => {
  if (!result.ok) return
  const blob = new Blob([result.json], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'level.json'; a.click()
}
editor.onImportRequest = () => fileInput.click()
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  const result = importDoc(definition, await file.text())
  if (result.ok) editor.store.dispatch({ type: 'loadDoc', doc: result.doc })
})
```
- change the `GameLoop` `fixedUpdate` from `() => {}` to `(dt) => editor.fixedUpdate(dt)` so play mode simulates.

- [ ] **Step 5: Run test + full gate**

```bash
npx vitest run packages/editor/tests/ui/toolbar.test.ts
npm run ci
```
Expected: PASS; `npm run ci` green.

- [ ] **Step 6: Manual checkpoint (human gate)**

```bash
npm run dev -w level-editor
```
Place boxes + a goal; press **Play** — the ball drops and rolls with WASD; press **Edit** — back to editing with your layout intact. **Export** downloads `level.json`. Reload the page — your autosaved layout returns. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(editor): test-play toggle + export/import + autosave wiring (M13 checkpoint)"
```

---

## Milestone M14 — Author content + tuning pass

Delivers: 2 worlds × 3 levels (dogfood-authored in the editor, committed as validated JSON), the extended `worlds.json`, a committed headless metric baseline that proves the metric signal per level, a manual tuning pass, and the **Plan 4 / M16** forward-pointer stub.

> **Workflow:** each level is authored by hand in the running editor (`npm run dev -w level-editor`), exported, and dropped into `games/monkey-ball/public/data/levels/`. The JSON below is the committed result; an implementer may reproduce it in the editor or commit it directly. Every level **must** parse against `levelKind` and pass the headless smoke (Task 29 test).

### Task 29: Author 2 worlds × 3 levels + extend the manifest

**Files:**
- Create: `games/monkey-ball/public/data/levels/w1-l2.json`
- Create: `games/monkey-ball/public/data/levels/w1-l3.json`
- Create: `games/monkey-ball/public/data/levels/w2-l1.json`
- Create: `games/monkey-ball/public/data/levels/w2-l2.json`
- Create: `games/monkey-ball/public/data/levels/w2-l3.json`
- Modify: `games/monkey-ball/public/data/levels/worlds.json`
- Test: `games/monkey-ball/tests/content/levels.test.ts`

**Interfaces:**
- Consumes: `levelKind`, `worldsManifestKind`, `buildLevelWorld`, `runHeadlessPlay`, archetype library + tuning.
- Produces: six shipped levels and a 2-world manifest, all validated.

- [ ] **Step 1: Write the failing content test**

`games/monkey-ball/tests/content/levels.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { levelKind, worldsManifestKind } from '../../src/data/level'
import { buildLevelWorld } from '../../src/level/buildWorld'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
const levelIds = manifest.worlds.flatMap((w) => w.levels)

describe('shipped content', () => {
  it('has 2 worlds of 3 levels each', () => {
    expect(manifest.worlds).toHaveLength(2)
    for (const w of manifest.worlds) expect(w.levels).toHaveLength(3)
  })

  it.each(levelIds)('level %s parses and builds a world', (id) => {
    const level = parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
    expect(level.id).toBe(id)
    const { world } = buildLevelWorld(level, lib)
    expect([...world.with('ball')]).toHaveLength(1)
    expect([...world.with('goal')]).toHaveLength(1)
  })

  it.each(levelIds)('level %s rests on solid ground with no input (metric smoke)', async (id) => {
    const level = parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
    const result = await runHeadlessPlay(level, lib, tuning, { maxSteps: 180 })
    expect(result.outcome).toBe('incomplete')   // spawn is on a floor; ball doesn't fall with no input
    expect(result.fallCount).toBe(0)
    expect(result.steps).toBe(180)
  }, 20000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run games/monkey-ball/tests/content/levels.test.ts`
Expected: FAIL — missing level files / manifest has 1 world.

- [ ] **Step 3: Author the levels**

`games/monkey-ball/public/data/levels/w1-l2.json`:
```json
{
  "id": "w1-l2", "name": "Slalom", "timeLimitS": 60, "fallY": -10,
  "spawn": [0, 1, 8], "goal": { "pos": [0, 0, -8] },
  "geometry": [
    { "shape": "box", "size": [8, 0.5, 20], "pos": [0, -0.25, 0], "color": "#7ec850" }
  ],
  "entities": [
    { "archetype": "bumper", "pos": [2, 0.25, 4] },
    { "archetype": "bumper", "pos": [-2, 0.25, 0] },
    { "archetype": "bumper", "pos": [2, 0.25, -4] },
    { "archetype": "banana", "pos": [0, 0.6, 6] },
    { "archetype": "banana", "pos": [-1.5, 0.6, 2] },
    { "archetype": "banana", "pos": [1.5, 0.6, -2] }
  ]
}
```

`games/monkey-ball/public/data/levels/w1-l3.json`:
```json
{
  "id": "w1-l3", "name": "Bumper Box", "timeLimitS": 70, "fallY": -10,
  "spawn": [0, 1, 6], "goal": { "pos": [0, 0, -6] },
  "geometry": [
    { "shape": "box", "size": [12, 0.5, 14], "pos": [0, -0.25, 0], "color": "#7ec850" },
    { "shape": "box", "size": [12, 1, 0.5], "pos": [0, 0.25, 7], "color": "#5fa83c" },
    { "shape": "box", "size": [12, 1, 0.5], "pos": [0, 0.25, -7], "color": "#5fa83c" }
  ],
  "entities": [
    { "archetype": "bumper", "pos": [-3, 0.25, 2] },
    { "archetype": "bumper", "pos": [3, 0.25, 2] },
    { "archetype": "bumper", "pos": [0, 0.25, -2] },
    { "archetype": "banana", "pos": [0, 0.6, 4] },
    { "archetype": "banana", "pos": [-3, 0.6, -3] },
    { "archetype": "banana", "pos": [3, 0.6, -3] }
  ]
}
```

`games/monkey-ball/public/data/levels/w2-l1.json`:
```json
{
  "id": "w2-l1", "name": "First Gap", "timeLimitS": 50, "fallY": -12,
  "spawn": [0, 1, 7], "goal": { "pos": [0, 0, -7] },
  "geometry": [
    { "shape": "box", "size": [6, 0.5, 6], "pos": [0, -0.25, 7], "color": "#4ea0d0" },
    { "shape": "box", "size": [6, 0.5, 6], "pos": [0, -0.25, -7], "color": "#4ea0d0" }
  ],
  "entities": [
    { "archetype": "moving-platform", "pos": [0, -0.25, 0],
      "overrides": { "movingPlatform": { "waypoints": [[0, -0.25, 2.5], [0, -0.25, -2.5]], "speed": 2.0, "mode": "pingpong" } } },
    { "archetype": "banana", "pos": [0, 0.6, 7] },
    { "archetype": "banana", "pos": [0, 0.6, -7] }
  ]
}
```

`games/monkey-ball/public/data/levels/w2-l2.json`:
```json
{
  "id": "w2-l2", "name": "Twin Bridges", "timeLimitS": 55, "fallY": -12,
  "spawn": [0, 1, 10], "goal": { "pos": [0, 0, -10] },
  "geometry": [
    { "shape": "box", "size": [5, 0.5, 5], "pos": [0, -0.25, 10], "color": "#4ea0d0" },
    { "shape": "box", "size": [5, 0.5, 5], "pos": [0, -0.25, 0], "color": "#4ea0d0" },
    { "shape": "box", "size": [5, 0.5, 5], "pos": [0, -0.25, -10], "color": "#4ea0d0" }
  ],
  "entities": [
    { "archetype": "moving-platform", "pos": [0, -0.25, 5],
      "overrides": { "movingPlatform": { "waypoints": [[0, -0.25, 6.5], [0, -0.25, 3.5]], "speed": 2.0, "mode": "pingpong" } } },
    { "archetype": "moving-platform", "pos": [0, -0.25, -5],
      "overrides": { "movingPlatform": { "waypoints": [[0, -0.25, -3.5], [0, -0.25, -6.5]], "speed": 2.0, "mode": "pingpong" } } },
    { "archetype": "banana", "pos": [0, 0.6, 0] }
  ]
}
```

`games/monkey-ball/public/data/levels/w2-l3.json`:
```json
{
  "id": "w2-l3", "name": "Sky Finish", "timeLimitS": 45, "fallY": -12,
  "spawn": [0, 1, 9], "goal": { "pos": [0, 0, -9] },
  "geometry": [
    { "shape": "box", "size": [5, 0.5, 6], "pos": [0, -0.25, 9], "color": "#4ea0d0" },
    { "shape": "box", "size": [3, 0.5, 10], "pos": [0, -0.25, 0], "color": "#3f8fbf" },
    { "shape": "box", "size": [5, 0.5, 6], "pos": [0, -0.25, -9], "color": "#4ea0d0" }
  ],
  "entities": [
    { "archetype": "bumper", "pos": [0, 0.25, 0] },
    { "archetype": "banana", "pos": [0, 0.6, 5] },
    { "archetype": "banana", "pos": [0, 0.6, -5] }
  ]
}
```

- [ ] **Step 4: Extend the manifest**

`games/monkey-ball/public/data/levels/worlds.json`:
```json
{
  "worlds": [
    { "id": "w1", "name": "Grassland", "levels": ["w1-l1", "w1-l2", "w1-l3"] },
    { "id": "w2", "name": "Sky Park", "levels": ["w2-l1", "w2-l2", "w2-l3"] }
  ]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run games/monkey-ball/tests/content/levels.test.ts`
Expected: PASS. If a level fails the "rests on solid ground" smoke, the spawn is over a gap — nudge the spawn or widen the start platform (do not weaken the test).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(content): author 2 worlds × 3 levels + extend manifest"
```

### Task 30: Headless metric baseline + manual tuning pass

Locks in a trustworthy per-level metric signal (the baseline a future tuning agent optimizes against in Plan 4) and runs the human tuning pass.

**Files:**
- Create: `games/monkey-ball/tests/content/baseline.test.ts`
- Create: `games/monkey-ball/tests/fixtures/metric-baselines.json`

**Interfaces:**
- Consumes: `runHeadlessPlay`, the shipped levels.
- Produces: a committed baseline (`{ [levelId]: { restSteps, restOutcome } }`) and a regression test.

- [ ] **Step 1: Write the baseline fixture**

`games/monkey-ball/tests/fixtures/metric-baselines.json`:
```json
{
  "note": "Headless no-input metric baseline. Each level's ball must rest (incomplete, no falls) for 180 steps. Plan 4's tuning agent optimizes richer metrics against this same harness.",
  "restSteps": 180,
  "restOutcome": "incomplete",
  "restFallCount": 0
}
```

- [ ] **Step 2: Write the failing regression test**

`games/monkey-ball/tests/content/baseline.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { levelKind, worldsManifestKind } from '../../src/data/level'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'
import baseline from '../fixtures/metric-baselines.json'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
const levelIds = manifest.worlds.flatMap((w) => w.levels)

describe('metric baseline (regression guard)', () => {
  it.each(levelIds)('%s matches the committed rest baseline', async (id) => {
    const level = parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
    const result = await runHeadlessPlay(level, lib, tuning, { maxSteps: baseline.restSteps })
    expect(result.outcome).toBe(baseline.restOutcome)
    expect(result.fallCount).toBe(baseline.restFallCount)
    expect(result.steps).toBe(baseline.restSteps)
  }, 20000)
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run games/monkey-ball/tests/content/baseline.test.ts`
Expected: PASS (the levels from Task 29 already satisfy this).

- [ ] **Step 4: Manual tuning pass (human gate)**

```bash
npm run dev -w level-editor   # author/adjust, or:
npm run dev -w monkey-ball    # play the shipped levels end to end
```
Play all six levels. Tune by editing `games/monkey-ball/public/data/config/physics.toml` (`max-tilt-deg`, `tilt-smooth`), `camera.toml` if present, and per-level `timeLimitS` until each level is completable but not trivial. Re-run `npx vitest run games/monkey-ball/tests/content` after any data change. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(content): headless metric baseline + tuning pass"
```

### Task 31: Plan 4 / M16 forward-pointer stub

**Files:**
- Create: `docs/superpowers/plans/2026-06-18-editor-mcp-tuning-m16.md`
- Modify: `AGENTS.md` (board: mark M11–M15 in progress/done; add M16 row pointing to the stub)

**Interfaces:**
- Produces: a committed stub recording the deferred AI work and the seams it builds on.

- [ ] **Step 1: Write the stub**

`docs/superpowers/plans/2026-06-18-editor-mcp-tuning-m16.md`:
```markdown
# Editor MCP + Tuning Agent + Chat Overlay (M16) — Plan 4 (STUB)

> **STATUS: STUB.** Full design pending. Write the spec
> (`docs/superpowers/specs/YYYY-MM-DD-editor-mcp-tuning-design.md`) via the
> brainstorming skill once M13's APIs are stable, then this plan.

**Goal:** Add the AI-first authoring pass on top of the generic editor (M11–M15):
an **editor MCP server**, a **tuning-agent loop**, and an in-editor **chat
overlay** — without ever placing an agent in the deterministic runtime loop.

**Builds on the seams M11–M13 already shipped:**
- **MCP tools = `SceneCommand`s.** The server exposes one tool per editor command
  (`addItem`, `moveSelected`, `setItemField`, `setSurface`, `setMetadata`,
  `deleteItems`); an agent emits the same commands the UI does.
- **MCP resources = validated documents.** Levels round-trip through
  `SceneModel.parse` / `validateDoc`; bad agent output bounces off the same
  validator a human's does.
- **MCP test-play tool = `runHeadlessPlay → TestPlayResult`.** The `input`
  policy parameter is the agent's action seam; `TestPlayResult` (plus the
  M14 baseline) is the eval signal the tuning loop optimizes.

**Scope (to be detailed in the spec):**
- M16a — Editor MCP server over the command model + `validateDoc` + headless test-play.
- M16b — Tuning-agent loop: propose tuning/layout edits, score via headless metrics, keep/revert against a target-to-beat.
- M16c — In-editor **chat overlay**: a panel that drives the agent and **previews proposed commands as a diff before applying** (never auto-mutates without confirmation), keeping the human in the loop.

**Open design questions for the spec/brainstorm:**
- Chat applies commands via the MCP server vs. the Agent SDK directly.
- Preview-and-confirm vs. auto-apply granularity.
- Model selection, stop/eval criteria, and how the agent stays strictly in the
  authoring layer (never the runtime loop).

**Note:** this is an LLM application — design against the current Anthropic MCP /
Agent SDK and the latest Claude models when the spec is written.
```

- [ ] **Step 2: Update the board**

In `AGENTS.md`, under the Task Board, mark the M11–M15 items complete as they land and append:
```markdown
- [ ] Plan 4 / M16: editor MCP server + tuning-agent loop + chat overlay
  (stub: docs/superpowers/plans/2026-06-18-editor-mcp-tuning-m16.md;
  spec pending after M13).
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: Plan 4 / M16 forward-pointer stub (editor MCP + tuning + chat)"
```

### Task 32: M14 checkpoint — play all six levels (human gate)

- [ ] **Step 1: Full gate**

```bash
npm run ci
```
Expected: green.

- [ ] **Step 2: Manual checkpoint (human gate)**

```bash
npm run dev -w monkey-ball
```
From the menu, play through World 1 (3 levels) and World 2 (3 levels). Confirm: levels are completable, unlocks progress world-to-world, timers feel fair after tuning. Stop the dev server.

- [ ] **Step 3: Commit (if any tuning changed)**

```bash
git add -A
git commit -m "chore(content): final tuning after full playthrough" || echo "nothing to commit"
```

---

## Milestone M15 — Mobile polish + release

Delivers: a capped pixel ratio (named, tested), visibility-pause for editor test-play, joystick dead-zone feel, Playwright smokes for both apps, and release builds.

> **Engine-additions note:** beyond the three `RenderPort` methods from M11, M15 adds two tiny **pure** engine utilities — `cappedPixelRatio` and `applyDeadzone` — testable replacements for magic numbers in the shims. They are not port methods and pass the engine litmus test.

### Task 33: Capped pixel ratio (named, tested)

**Files:**
- Create: `packages/engine/src/render/pixelRatio.ts`
- Modify: `packages/engine/src/render/browser.ts` (use it)
- Modify: `packages/engine/src/index.ts` (barrel)
- Test: `packages/engine/tests/render/pixelRatio.test.ts`

**Interfaces:**
- Produces: `MAX_PIXEL_RATIO` (= 2), `cappedPixelRatio(devicePixelRatio: number, cap?: number): number`.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/render/pixelRatio.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { MAX_PIXEL_RATIO, cappedPixelRatio } from '../../src/render/pixelRatio'

describe('cappedPixelRatio', () => {
  it('caps at MAX_PIXEL_RATIO', () => {
    expect(cappedPixelRatio(3)).toBe(MAX_PIXEL_RATIO)
    expect(cappedPixelRatio(1.5)).toBe(1.5)
  })
  it('respects an explicit cap and a floor of 1', () => {
    expect(cappedPixelRatio(4, 1)).toBe(1)
    expect(cappedPixelRatio(0.5)).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/tests/render/pixelRatio.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`packages/engine/src/render/pixelRatio.ts`:
```ts
export const MAX_PIXEL_RATIO = 2

/** Clamp a device pixel ratio to [1, cap] — caps GPU cost on high-DPI mobile. */
export function cappedPixelRatio(devicePixelRatio: number, cap: number = MAX_PIXEL_RATIO): number {
  return Math.max(1, Math.min(devicePixelRatio, cap))
}
```

In `packages/engine/src/render/browser.ts`, replace `gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))` with:
```ts
import { cappedPixelRatio } from './pixelRatio'
// …
  gl.setPixelRatio(cappedPixelRatio(window.devicePixelRatio))
```

Add to the engine barrel `packages/engine/src/index.ts`:
```ts
export * from './render/pixelRatio'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/engine/tests/render/pixelRatio.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(engine): cappedPixelRatio utility for high-DPI cost control"
```

### Task 34: Visibility-pause for editor test-play

When the tab is hidden during play, the editor returns to the safe edit state (mirrors the game's auto-pause).

**Files:**
- Modify: `packages/editor/src/host.ts`
- Modify: `tools/level-editor/src/main.ts` (wire `startLoopDriver` onHidden)
- Test: `packages/editor/tests/play/visibility.test.ts`

**Interfaces:**
- Produces: `EditorCore.handleHidden(): void` — exits play mode if playing; no-op in edit mode.

- [ ] **Step 1: Write the failing test**

`packages/editor/tests/play/visibility.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = () => ({ addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
  readPose: () => null, readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
  setKinematicTarget() {}, get bodyCount() { return 0 }, dispose() {} }) as unknown as PhysicsPort

describe('visibility pause', () => {
  it('exits play when hidden, no-ops in edit', () => {
    const editor = createEditor<FakeDoc>({ definition: playableDefinition, render: createNullRenderer().port, physics: nullPhysics() })
    editor.handleHidden() // edit mode: no-op
    expect(editor.store.getState().mode).toBe('edit')
    editor.enterPlay()
    editor.handleHidden()
    expect(editor.store.getState().mode).toBe('edit')
    editor.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor/tests/play/visibility.test.ts`
Expected: FAIL — `editor.handleHidden is not a function`.

- [ ] **Step 3: Implement**

In `packages/editor/src/host.ts`, add to the `EditorCore<Doc>` interface `handleHidden(): void`, and to the `core` object:
```ts
    handleHidden() { if (play) this.exitPlay() },
```
(Reference `this.exitPlay()` — `core` is the object literal; if `this` is awkward under strict mode, call a local `exitPlay` closure instead by extracting the exit logic into a named function and calling it from both `exitPlay` and `handleHidden`.)

In `tools/level-editor/src/main.ts`, change `startLoopDriver(loop)` to `startLoopDriver(loop, () => editor.handleHidden())`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/editor/tests/play/visibility.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): visibility-pause exits test-play when tab hidden"
```

### Task 35: Joystick dead-zone (input feel)

**Files:**
- Modify: `packages/engine/src/input/vector.ts` (add `applyDeadzone`)
- Modify: `packages/engine/src/input/joystick.ts` (replace the existing inline dead-zone with the helper)
- Test: `packages/engine/tests/input/deadzone.test.ts`

**Interfaces:**
- Consumes: `InputVector`.
- Produces: `applyDeadzone(v: InputVector, deadzone: number): InputVector` — zero below the dead-zone, rescaled smoothly above it.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/input/deadzone.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyDeadzone } from '../../src/input/vector'

describe('applyDeadzone', () => {
  it('zeros input inside the dead-zone', () => {
    expect(applyDeadzone({ x: 0.05, y: 0 }, 0.1)).toEqual({ x: 0, y: 0 })
  })
  it('rescales so the dead-zone edge maps to 0 and full input stays ~1', () => {
    const edge = applyDeadzone({ x: 0.1, y: 0 }, 0.1)
    expect(Math.hypot(edge.x, edge.y)).toBeCloseTo(0)
    const full = applyDeadzone({ x: 1, y: 0 }, 0.1)
    expect(full.x).toBeCloseTo(1)
  })
  it('preserves direction', () => {
    const v = applyDeadzone({ x: 0.6, y: 0.8 }, 0.2) // magnitude 1.0
    expect(v.y / v.x).toBeCloseTo(0.8 / 0.6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/tests/input/deadzone.test.ts`
Expected: FAIL — `applyDeadzone` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/engine/src/input/vector.ts`:
```ts
import type { InputVector } from './types'

/** Zero below `deadzone`; above it, rescale [deadzone,1] → [0,1], keeping direction. */
export function applyDeadzone(v: InputVector, deadzone: number): InputVector {
  const mag = Math.hypot(v.x, v.y)
  if (mag <= deadzone) return { x: 0, y: 0 }
  const scaled = (mag - deadzone) / (1 - deadzone)
  const k = Math.min(1, scaled) / mag
  return { x: v.x * k, y: v.y * k }
}
```
> **Note:** if `vector.ts` already imports `InputVector`, do not duplicate the import — add only the function.

In `packages/engine/src/input/joystick.ts`, replace the existing inline `Math.hypot(dx, dy) < deadZone ? ...` branch with the helper — do **not** add a second dead-zone in `read()`. Change the import and assignment to:
```ts
import { applyDeadzone, clampToUnit } from './vector'
// ...
    value = applyDeadzone({ x: dx, y: -dy }, deadZone)
```
Keep `JoystickOptions.deadZone` and the current default (`0.15`) as the source of truth for joystick feel.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/engine/tests/input/deadzone.test.ts`
Expected: PASS (3 tests). Run the existing joystick test too: `npx vitest run packages/engine/tests/input/joystick.test.ts` — if a dead-zone now zeroes a previously-tiny expected value, update that test's input to clear the dead-zone (the feel change is intended).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(engine): joystick dead-zone for input feel"
```

### Task 36: Playwright smokes (game + editor)

Two end-to-end smokes covering the untested shims. Kept out of `npm run ci` (browser-dependent); run via `npm run e2e`.

**Files:**
- Modify: root `package.json` (add `@playwright/test` devDep + `e2e` script + per-app dev `--port`)
- Create: `playwright.config.ts`
- Create: `e2e/game.spec.ts`
- Create: `e2e/editor.spec.ts`

**Interfaces:**
- Produces: `npm run e2e` running both smokes against locally-served apps.

- [ ] **Step 1: Install Playwright + scripts**

```bash
npm install -D @playwright/test
npx playwright install chromium
```
In the root `package.json` scripts, add:
```json
    "dev:game": "vite dev games/monkey-ball --port 5174 --strictPort",
    "dev:editor": "vite dev tools/level-editor --port 5175 --strictPort",
    "e2e": "playwright test"
```
> **Note:** confirm the exact `vite dev <dir>` invocation works in this workspace; if each app must be served from its own dir, use `npm run dev -w monkey-ball -- --port 5174 --strictPort` form instead. The ports must match `playwright.config.ts`.

- [ ] **Step 2: Write the Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { headless: true },
  webServer: [
    { command: 'npm run dev:game', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev:editor', url: 'http://localhost:5175', reuseExistingServer: !process.env.CI }
  ]
})
```

- [ ] **Step 3: Write the smokes**

`e2e/game.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('game boots to the menu and starts a level', async ({ page }) => {
  await page.goto('http://localhost:5174')
  // Boot completes → menu overlay appears.
  await expect(page.locator('#overlays')).toBeVisible()
  // Start the first level (button text/route per the menu view).
  const start = page.getByRole('button').first()
  await start.click()
  // A canvas (the Three viewport) is present and the HUD mounts.
  await expect(page.locator('canvas')).toBeVisible()
})
```

`e2e/editor.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('editor places a box and export reflects it', async ({ page }) => {
  await page.goto('http://localhost:5175')
  await expect(page.locator('canvas.map')).toBeVisible()
  // Select the Box brush, click the 2D map to place a box.
  await page.locator('[data-brush="box"]').click()
  const map = page.locator('canvas.map')
  await map.click({ position: { x: 180, y: 180 } })
  // Export status reflects the document.
  await page.locator('[data-action="export"]').click()
  await expect(page.locator('[data-export-status]')).toContainText(/Exported|Start/)
})
```

> **Note:** these assert the shim path end-to-end; exact selectors (`#overlays`, button text, `canvas.map`) must match the host/game DOM. Adjust selectors to the real markup — do not weaken to trivial always-true assertions.

- [ ] **Step 4: Run the smokes**

```bash
npm run e2e
```
Expected: 2 passed. (CI integration of `e2e` is optional; it is not part of `npm run ci`.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): Playwright smokes for game + editor"
```

### Task 37: Release builds

**Files:**
- Create: `games/monkey-ball/vite.config.ts`
- Modify: `tools/level-editor/vite.config.ts` (keep M11 `publicDir`, add relative base)
- Modify: root `package.json` (add a `build` script)

**Interfaces:**
- Produces: `npm run build` producing `dist/` for both apps with a relative base path.

- [ ] **Step 1: Add per-app vite configs (relative base for static hosting)**

`games/monkey-ball/vite.config.ts`:
```ts
import { defineConfig } from 'vite'

export default defineConfig({ base: './' })
```

Update `tools/level-editor/vite.config.ts`:
```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: '../../games/monkey-ball/public'
})
```

- [ ] **Step 2: Add the root build script**

In the root `package.json` scripts:
```json
    "build": "npm run build -w monkey-ball && npm run build -w level-editor"
```

- [ ] **Step 3: Build + verify output**

```bash
npm run build
ls games/monkey-ball/dist/index.html tools/level-editor/dist/index.html
```
Expected: both `dist/index.html` files exist; the build completes without type or bundling errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "build: release builds for game + editor (relative base)"
```

### Task 38: Final gate + checkpoint (human gate)

- [ ] **Step 1: Full CI + coverage**

```bash
npm run ci
npm run coverage
```
Expected: `npm run ci` green; coverage ≥ 90% lines/branches on non-shim code across `packages/engine/src` and `packages/editor/src`. If editor coverage is short, add focused unit tests for the uncovered pure logic (not the shims).

- [ ] **Step 2: Manual smoke (human gate)**

```bash
npm run dev -w level-editor   # author a level, play it, export
npm run dev -w monkey-ball     # play the exported/shipped content on a narrow viewport
```
Confirm mobile viewport behaves (dvh sizing, joystick dead-zone feel, capped pixel ratio), tab-away pauses test-play, and the release build serves. Stop the dev servers.

- [ ] **Step 3: Update the board + commit**

In `AGENTS.md`, mark M11–M15 complete. Then:
```bash
git add -A
git commit -m "docs: mark M11–M15 complete (generic editor, content, polish)"
```

---

## Plan self-review summary

- **Spec coverage:** generic `packages/editor` (M11 T2–T13), engine grid/highlight (M11 T1), dual viewport (2D map T9–T10, 3D fly T8/T11), command/undo model (T4–T6), picking (T14–T15), cardinality + point-placeable markers/geometry (T16–T17), inspector position + size/radius/height editing (T18–T19), validation-gated test-play/export (T20/T24/T25), live + headless test-play (T22–T24), import/export/autosave (T25–T28), content (T29–T30), AI forward-pointer (T31), polish + release (T33–T37). AI-readiness constraints map to T4/T20/T22.
- **Explicit deferrals:** drag-to-draw box/cylinder footprints, scroll-to-set-height, rotation editing/gizmos, and richer transform tools are not implemented in M11–M15. The plan ships point placement plus inspector size editing and records this in the design deltas.
- **Shim inventory** additions: `tools/level-editor/src/main.ts`, `packages/editor/src/viewport3d/browser.ts`, `packages/editor/src/viewport2d/browser.ts` — all `browser.ts` or app `main.ts`, auto-excluded from coverage.
- **Dependency edges:** `editor → engine` (lint-enforced no game import); `game → editor` (type-only, for the registration); host → both. Engine forbids importing `@automata/editor`.
