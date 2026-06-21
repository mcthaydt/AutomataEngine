# Shared Contracts Package (M16a-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@automata/contracts`, the dependency-free package that is the single source of truth for the command, eval, and tool-registry contracts shared across the MCP server, Editor, and Engine.

**Architecture:** A new leaf package `packages/contracts` defines zod schemas + TS types + JSON-Schema derivations for the three cross-boundary surfaces. The `SceneCommand` cluster and the headless-eval types are *lifted* out of `packages/editor` into contracts; the editor re-exports them from contracts so every existing import keeps working. A new tool contract (`ToolHost`, `ToolDef`, per-tool JSON Schemas) is added here for later hosts (browser chat overlay, MCP server) to implement.

**Tech Stack:** TypeScript (ES2022, ESM, strict), zod ^4.4.3 (native `z.toJSONSchema`), Vitest ^4.1.8, npm workspaces.

This is the first slice of M16a. Follow-on plans (not in this document): M16a-2 `@automata/agent-core` (providers + agent loop), M16c chat overlay preview/confirm, M16b tuning loop (which also widens the headless input seam to consume `PlayObservation`), M16d MCP server host. Full design: `docs/superpowers/specs/2026-06-21-editor-mcp-tuning-design.md`.

## Global Constraints

- ESM only (`"type": "module"`); package layout matches existing packages: `"exports": { ".": "./src/index.ts" }`, `"types": "./src/index.ts"`, `"scripts": { "typecheck": "tsc --noEmit" }`.
- TS config extends `../../tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `isolatedModules`).
- zod `^4.4.3` (same floor as `@automata/engine`); use zod's native `z.toJSONSchema(...)` — do not add any JSON-schema library.
- `contracts` is the dependency-free leaf: it must **not** import `@automata/editor`, `@automata/engine`, games, or tools. It owns its own structural `Vec3` (`{ x, y, z }`).
- Tests live in `packages/contracts/tests/**/*.test.ts`; per-package Vitest project name `contracts`, `environment: 'node'`.
- The 90% line/branch coverage gate (`vitest.config.ts`) must stay green; add `packages/contracts/src/**` to its `include`.
- Type names lifted into contracts must keep their exact existing spelling so the editor re-export is a drop-in: `Vec3`, `Surface`, `ItemKind`, `BoxShape`, `CylinderShape`, `ArchetypeRef`, `MarkerRef`, `ItemShape`, `ItemTransform`, `SceneItem`, `SceneCommand`, `HeadlessOpts`, `TestPlayResult`.
- Drop-in invariant (the fact the whole lift rests on): `@automata/engine`'s `Vec3` is a *structural* interface — `export interface Vec3 { x: number; y: number; z: number }` in `packages/engine/src/math/vec3.ts`, not a class or branded type. Contracts' own `Vec3` (`z.object({ x, y, z })`) infers to the identical shape, so under TypeScript structural typing the two are mutually assignable. This is what lets the editor files that still import `Vec3` from `@automata/engine` interoperate with the contracts-sourced `SceneItem`/`ItemTransform` without any call-site changes. Do **not** have contracts import `@automata/engine` to "share" the type — that would break the leaf rule and is unnecessary.

---

### Task 1: Scaffold the `@automata/contracts` package

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tests/smoke.test.ts`
- Modify: `eslint.config.js` (add the contracts leaf rule)
- Modify: `vitest.config.ts` (add contracts to coverage `include`)

**Interfaces:**
- Consumes: nothing.
- Produces: an installable workspace package `@automata/contracts` resolvable via `import ... from '@automata/contracts'`, with a working Vitest project named `contracts`.

- [ ] **Step 1: Create the package manifest**

`packages/contracts/package.json`:

```json
{
  "name": "@automata/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^4.4.3" }
}
```

- [ ] **Step 2: Create the TS + Vitest config**

`packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/contracts/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'contracts', environment: 'node', include: ['tests/**/*.test.ts'] }
})
```

- [ ] **Step 3: Create an empty barrel and a smoke test**

`packages/contracts/src/index.ts`:

```ts
export const CONTRACTS_VERSION = '0.1.0'
```

`packages/contracts/tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CONTRACTS_VERSION } from '../src/index'

describe('contracts package', () => {
  it('is importable', () => {
    expect(CONTRACTS_VERSION).toBe('0.1.0')
  })
})
```

- [ ] **Step 4: Add the eslint leaf rule**

In `eslint.config.js`, add a new config block (after the existing `packages/engine/**` block, before the closing `)`):

```js
  ,{
    // contracts is the dependency-free leaf; it must not depend on anything else in the repo.
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@automata/engine', '@automata/editor', '@automata/editor/*',
                  'monkey-ball', 'monkey-ball/*', 'level-editor', 'level-editor/*'],
          message: 'contracts is the dependency-free leaf; do not import editor, engine, games, or tools.'
        }]
      }]
    }
  }
```

- [ ] **Step 5: Add contracts to coverage include**

In `vitest.config.ts`, change the `coverage.include` array to:

```ts
      include: ['packages/engine/src/**', 'packages/editor/src/**', 'packages/contracts/src/**'],
```

- [ ] **Step 6: Install workspaces so the new package resolves**

Run: `npm install`
Expected: completes without error; `node_modules/@automata/contracts` symlink exists.

- [ ] **Step 7: Run the smoke test**

Run: `npx vitest run --project contracts`
Expected: PASS (1 test).

- [ ] **Step 8: Lint + typecheck the new package**

Run: `npm run lint && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 9: Commit**

```bash
git add packages/contracts eslint.config.js vitest.config.ts package-lock.json
git commit -m "feat(contracts): scaffold @automata/contracts leaf package"
```

---

### Task 2: Command contract (lift `SceneCommand` into contracts)

**Files:**
- Create: `packages/contracts/src/command.ts`
- Create: `packages/contracts/tests/command.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/editor/src/model/types.ts` (re-export the lifted types)
- Modify: `packages/editor/package.json` (depend on `@automata/contracts`)

**Interfaces:**
- Consumes: nothing (zod only).
- Produces:
  - Schemas: `vec3Schema`, `surfaceSchema`, `boxShapeSchema`, `cylinderShapeSchema`, `archetypeRefSchema`, `markerRefSchema`, `itemShapeSchema`, `itemKindSchema`, `itemTransformSchema`, `sceneItemSchema`, `addItemSchema`, `moveSelectedSchema`, `setItemFieldSchema`, `setSurfaceSchema`, `setMetadataSchema`, `deleteItemsSchema`, `loadDocSchema`, `sceneCommandSchema`.
  - Types: `Vec3`, `Surface`, `ItemKind`, `BoxShape`, `CylinderShape`, `ArchetypeRef`, `MarkerRef`, `ItemShape`, `ItemTransform`, `SceneItem`, `SceneCommand`.

- [ ] **Step 1: Write the failing test**

`packages/contracts/tests/command.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sceneCommandSchema, type SceneCommand } from '../src/command'

describe('sceneCommandSchema', () => {
  it('parses an addItem command', () => {
    const cmd: SceneCommand = {
      type: 'addItem',
      item: {
        id: 'box:0',
        kind: 'box',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
        surface: { kind: 'color', value: '#7ec850' }
      }
    }
    expect(sceneCommandSchema.parse(cmd)).toEqual(cmd)
  })

  it('parses a moveSelected command', () => {
    const cmd = { type: 'moveSelected', ids: ['a', 'b'], delta: { x: 1, y: 0, z: -2 } }
    expect(sceneCommandSchema.parse(cmd)).toEqual(cmd)
  })

  it('parses a setSurface command with a texture surface', () => {
    const cmd = { type: 'setSurface', id: 'g:0', surface: { kind: 'texture', textureId: 't1' } }
    expect(sceneCommandSchema.parse(cmd)).toEqual(cmd)
  })

  it('rejects an unknown command type', () => {
    expect(() => sceneCommandSchema.parse({ type: 'nope' })).toThrow()
  })

  it('rejects moveSelected with a non-numeric delta', () => {
    expect(() => sceneCommandSchema.parse({ type: 'moveSelected', ids: [], delta: { x: 'a', y: 0, z: 0 } })).toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project contracts tests/command.test.ts`
Expected: FAIL ("Cannot find module '../src/command'").

- [ ] **Step 3: Implement the command contract**

`packages/contracts/src/command.ts`:

```ts
import { z } from 'zod'

export const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() })
export type Vec3 = z.infer<typeof vec3Schema>

export const surfaceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('color'), value: z.string() }),
  z.object({ kind: z.literal('texture'), textureId: z.string() })
])
export type Surface = z.infer<typeof surfaceSchema>

export const itemKindSchema = z.enum(['box', 'cylinder', 'archetype', 'marker'])
export type ItemKind = z.infer<typeof itemKindSchema>

export const boxShapeSchema = z.object({ type: z.literal('box'), size: vec3Schema })
export type BoxShape = z.infer<typeof boxShapeSchema>

export const cylinderShapeSchema = z.object({
  type: z.literal('cylinder'),
  radius: z.number(),
  height: z.number()
})
export type CylinderShape = z.infer<typeof cylinderShapeSchema>

export const archetypeRefSchema = z.object({ type: z.literal('archetype'), name: z.string() })
export type ArchetypeRef = z.infer<typeof archetypeRefSchema>

export const markerRefSchema = z.object({ type: z.literal('marker'), markerId: z.string() })
export type MarkerRef = z.infer<typeof markerRefSchema>

export const itemShapeSchema = z.discriminatedUnion('type', [
  boxShapeSchema,
  cylinderShapeSchema,
  archetypeRefSchema,
  markerRefSchema
])
export type ItemShape = z.infer<typeof itemShapeSchema>

export const itemTransformSchema = z.object({ position: vec3Schema, rotationEuler: vec3Schema })
export type ItemTransform = z.infer<typeof itemTransformSchema>

export const sceneItemSchema = z.object({
  id: z.string(),
  kind: itemKindSchema,
  transform: itemTransformSchema,
  shape: itemShapeSchema,
  surface: surfaceSchema
})
export type SceneItem = z.infer<typeof sceneItemSchema>

export const addItemSchema = z.object({ type: z.literal('addItem'), item: sceneItemSchema })
export const moveSelectedSchema = z.object({
  type: z.literal('moveSelected'),
  ids: z.array(z.string()),
  delta: vec3Schema
})
export const setItemFieldSchema = z.object({
  type: z.literal('setItemField'),
  id: z.string(),
  path: z.string(),
  value: z.unknown()
})
export const setSurfaceSchema = z.object({
  type: z.literal('setSurface'),
  id: z.string(),
  surface: surfaceSchema
})
export const setMetadataSchema = z.object({
  type: z.literal('setMetadata'),
  path: z.string(),
  value: z.unknown()
})
export const deleteItemsSchema = z.object({ type: z.literal('deleteItems'), ids: z.array(z.string()) })
export const loadDocSchema = z.object({ type: z.literal('loadDoc'), doc: z.unknown() })

export const sceneCommandSchema = z.discriminatedUnion('type', [
  addItemSchema,
  moveSelectedSchema,
  setItemFieldSchema,
  setSurfaceSchema,
  setMetadataSchema,
  deleteItemsSchema,
  loadDocSchema
])
export type SceneCommand = z.infer<typeof sceneCommandSchema>
```

- [ ] **Step 4: Export it from the barrel**

Replace `packages/contracts/src/index.ts` with:

```ts
export const CONTRACTS_VERSION = '0.1.0'
export * from './command'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project contracts tests/command.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Lift the editor's command types onto contracts**

Make the editor depend on contracts — `packages/editor/package.json` `dependencies`:

```json
  "dependencies": { "@automata/engine": "*", "@automata/contracts": "*" }
```

Replace the whole of `packages/editor/src/model/types.ts` with:

```ts
import type { ItemKind } from '@automata/contracts'

export type {
  Vec3,
  Surface,
  ItemKind,
  BoxShape,
  CylinderShape,
  ArchetypeRef,
  MarkerRef,
  ItemShape,
  ItemTransform,
  SceneItem,
  SceneCommand
} from '@automata/contracts'

/** A brush is a placeable; cardinality is enforced generically by the editor. */
export interface Brush {
  id: string
  label: string
  kind: ItemKind
  place: 'point' | 'draw-box' | 'draw-circle'
  cardinality: { min: number; max: number }
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

- [ ] **Step 7: Re-install and verify the whole repo still typechecks + tests pass**

Run: `npm install && npm run typecheck && npm run test`
Expected: PASS. (The editor + monkey-ball suites are unchanged because `SceneCommand`/`SceneItem`/etc. are re-exported with identical shapes.)

> No type changes are expected here. Per the drop-in invariant in Global Constraints, `@automata/engine`'s `Vec3` is the structural interface `{ x: number; y: number; z: number }` (`packages/engine/src/math/vec3.ts`) and contracts' `Vec3` infers to the identical shape, so the lifted/re-exported types are assignment-compatible with the editor files that continue to import `Vec3` from the engine (`host.ts`, `grid.ts`, `tools/place.ts`, and the viewport modules). In the unlikely event typecheck flags a `Vec3` assignment, fix it at that editor call site — pass `{ x, y, z }` literals (e.g. `host.ts` already does at `host.ts:160`). Do **not** weaken the contracts leaf rule or have contracts import `@automata/engine`.

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/command.ts packages/contracts/src/index.ts \
  packages/contracts/tests/command.test.ts packages/editor/src/model/types.ts \
  packages/editor/package.json package-lock.json
git commit -m "feat(contracts): command contract; editor re-exports SceneCommand from contracts"
```

---

### Task 3: Eval contract (lift `TestPlayResult` / `HeadlessOpts`, add `PlayObservation`)

**Files:**
- Create: `packages/contracts/src/eval.ts`
- Create: `packages/contracts/tests/eval.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/editor/src/model/gameDefinition.ts` (re-export the lifted types)

**Interfaces:**
- Consumes: `vec3Schema` / `Vec3` from `./command`.
- Produces:
  - Schema: `testPlayResultSchema`.
  - Types: `TestPlayResult`, `HeadlessOpts`, `PlayObservation`.

`PlayObservation` is defined now but not yet consumed; the M16b tuning plan widens `HeadlessOpts.input` to receive it and wires the monkey-ball runtime to populate it. `HeadlessOpts` keeps its current `input?: (step: number) => { x: number; y: number }` signature in this slice (no runtime behavior change).

- [ ] **Step 1: Write the failing test**

`packages/contracts/tests/eval.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { testPlayResultSchema, type TestPlayResult } from '../src/eval'

describe('testPlayResultSchema', () => {
  it('parses the no-input rest baseline result', () => {
    const r: TestPlayResult = { outcome: 'incomplete', timeMs: 0, fallCount: 0, bananas: 0, steps: 180 }
    expect(testPlayResultSchema.parse(r)).toEqual(r)
  })

  it('rejects an invalid outcome', () => {
    expect(() =>
      testPlayResultSchema.parse({ outcome: 'won', timeMs: 0, fallCount: 0, bananas: 0, steps: 0 })
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project contracts tests/eval.test.ts`
Expected: FAIL ("Cannot find module '../src/eval'").

- [ ] **Step 3: Implement the eval contract**

`packages/contracts/src/eval.ts`:

```ts
import { z } from 'zod'
import type { Vec3 } from './command'

export const testPlayResultSchema = z.object({
  outcome: z.enum(['completed', 'gameOver', 'incomplete']),
  timeMs: z.number(),
  fallCount: z.number(),
  bananas: z.number(),
  steps: z.number()
})
export type TestPlayResult = z.infer<typeof testPlayResultSchema>

export interface HeadlessOpts {
  input?: (step: number) => { x: number; y: number }
  maxSteps: number
}

/** Per-step world readout exposed to a closed-loop scoring policy (consumed by the M16b tuning loop). */
export interface PlayObservation {
  step: number
  ball: { position: Vec3; velocity: Vec3 }
  goal: Vec3
}
```

- [ ] **Step 4: Export it from the barrel**

Replace `packages/contracts/src/index.ts` with:

```ts
export const CONTRACTS_VERSION = '0.1.0'
export * from './command'
export * from './eval'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project contracts tests/eval.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Re-export the eval types from the editor**

In `packages/editor/src/model/gameDefinition.ts`: remove the local `HeadlessOpts` and `TestPlayResult` interface declarations (lines 21–32) and instead import + re-export them from contracts. The top of the file becomes:

```ts
import type { PhysicsPort, RenderPort, World } from '@automata/engine'
import type { Brush, Field, SceneCommand, SceneItem, Surface } from './types'
import type { HeadlessOpts, TestPlayResult } from '@automata/contracts'

export type { HeadlessOpts, TestPlayResult, PlayObservation } from '@automata/contracts'

/** Thrown by SceneModel.apply when a command cannot be applied. */
export class CommandError extends Error {}
```

Leave the rest of the file (`SceneModel`, `PlayHandle`, `PlayDefinition`, `GameDefinition`) unchanged — they already reference `HeadlessOpts` / `TestPlayResult`, now sourced from contracts via the import above.

- [ ] **Step 7: Verify the whole repo still typechecks + tests pass**

Run: `npm run typecheck && npm run test`
Expected: PASS. (`games/monkey-ball/src/level/headlessPlay.ts` imports `HeadlessOpts`/`TestPlayResult` from `@automata/editor` and keeps working via the re-export.)

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/eval.ts packages/contracts/src/index.ts \
  packages/contracts/tests/eval.test.ts packages/editor/src/model/gameDefinition.ts
git commit -m "feat(contracts): eval contract (TestPlayResult, HeadlessOpts, PlayObservation)"
```

---

### Task 4: Tool contract (ToolHost interface + per-tool JSON Schemas)

**Files:**
- Create: `packages/contracts/src/tools.ts`
- Create: `packages/contracts/tests/tools.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: the per-command schemas from `./command` (`addItemSchema`, `moveSelectedSchema`, `setItemFieldSchema`, `setSurfaceSchema`, `setMetadataSchema`, `deleteItemsSchema`).
- Produces:
  - Types: `ToolName`, `ToolDef`, `ToolResult`, `ToolHost`, `ResourceUri`.
  - Values: `toolArgSchemas` (record of zod schemas keyed by `ToolName`), `RESOURCE_URIS`, `toolDefs()` → `ToolDef[]`, `parseToolArgs(name, args)`.

These are the contracts the browser chat-overlay host and the MCP server host will both implement in later plans.

- [ ] **Step 1: Write the failing test**

`packages/contracts/tests/tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toolDefs, parseToolArgs, RESOURCE_URIS } from '../src/tools'

describe('tool contract', () => {
  it('exposes one def per tool, each with a JSON schema + description', () => {
    const defs = toolDefs()
    const names = defs.map((d) => d.name).sort()
    expect(names).toEqual([
      'addItem', 'deleteItems', 'getDoc', 'listItems', 'moveSelected',
      'setItemField', 'setMetadata', 'setSurface', 'testPlay', 'validate'
    ])
    for (const d of defs) {
      expect(typeof d.schema).toBe('object')
      expect(d.description.length).toBeGreaterThan(0)
    }
  })

  it('validates moveSelected args without the type discriminant', () => {
    const args = parseToolArgs('moveSelected', { ids: ['a'], delta: { x: 1, y: 2, z: 3 } })
    expect(args).toEqual({ ids: ['a'], delta: { x: 1, y: 2, z: 3 } })
  })

  it('rejects bad testPlay args', () => {
    expect(() => parseToolArgs('testPlay', { maxSteps: -1 })).toThrow()
  })

  it('exposes editor resource uris', () => {
    expect(RESOURCE_URIS.doc).toBe('editor://doc')
    expect(RESOURCE_URIS.baseline).toBe('editor://baseline')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project contracts tests/tools.test.ts`
Expected: FAIL ("Cannot find module '../src/tools'").

- [ ] **Step 3: Implement the tool contract**

`packages/contracts/src/tools.ts`:

```ts
import { z } from 'zod'
import {
  addItemSchema,
  moveSelectedSchema,
  setItemFieldSchema,
  setSurfaceSchema,
  setMetadataSchema,
  deleteItemsSchema
} from './command'

export type ToolName =
  | 'addItem'
  | 'moveSelected'
  | 'setItemField'
  | 'setSurface'
  | 'setMetadata'
  | 'deleteItems'
  | 'getDoc'
  | 'listItems'
  | 'validate'
  | 'testPlay'

/** Arg schema per tool. Write tools = command schema minus its `type` discriminant. */
export const toolArgSchemas = {
  addItem: addItemSchema.omit({ type: true }),
  moveSelected: moveSelectedSchema.omit({ type: true }),
  setItemField: setItemFieldSchema.omit({ type: true }),
  setSurface: setSurfaceSchema.omit({ type: true }),
  setMetadata: setMetadataSchema.omit({ type: true }),
  deleteItems: deleteItemsSchema.omit({ type: true }),
  getDoc: z.object({}),
  listItems: z.object({}),
  validate: z.object({}),
  testPlay: z.object({ maxSteps: z.number().int().positive() })
} as const

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  addItem: 'Add a placeable item (geometry, archetype, or marker) to the level.',
  moveSelected: 'Move the given items by a delta vector.',
  setItemField: 'Set a single field (by dotted path) on one item.',
  setSurface: 'Set an item\'s surface (color or texture).',
  setMetadata: 'Set a document-level metadata field by dotted path.',
  deleteItems: 'Delete the given items from the level.',
  getDoc: 'Read the current level document.',
  listItems: 'List all placeable items in the current level.',
  validate: 'Validate the current level and return any issues.',
  testPlay: 'Run a deterministic headless play and return TestPlayResult metrics.'
}

export interface ToolDef {
  name: ToolName
  description: string
  /** JSON Schema (from z.toJSONSchema) for the tool's arguments. */
  schema: unknown
}

export interface ToolResult {
  ok: boolean
  content: unknown
  isError?: boolean
}

export type ResourceUri = 'editor://doc' | 'editor://items' | 'editor://validation' | 'editor://baseline'

export const RESOURCE_URIS = {
  doc: 'editor://doc',
  items: 'editor://items',
  validation: 'editor://validation',
  baseline: 'editor://baseline'
} as const satisfies Record<string, ResourceUri>

/** A host that exposes the editor's command/eval surface as tools + resources. */
export interface ToolHost {
  listTools(): ToolDef[]
  executeTool(name: ToolName, args: unknown): Promise<ToolResult>
  readResource(uri: ResourceUri): Promise<unknown>
}

export function toolDefs(): ToolDef[] {
  return (Object.keys(toolArgSchemas) as ToolName[]).map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(toolArgSchemas[name])
  }))
}

export function parseToolArgs(name: ToolName, args: unknown): unknown {
  return toolArgSchemas[name].parse(args)
}
```

- [ ] **Step 4: Export it from the barrel**

Replace `packages/contracts/src/index.ts` with:

```ts
export const CONTRACTS_VERSION = '0.1.0'
export * from './command'
export * from './eval'
export * from './tools'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project contracts tests/tools.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Full verification (typecheck, lint, coverage gate)**

Run: `npm run typecheck && npm run lint && npm run coverage`
Expected: PASS, with `packages/contracts/src/**` reported in coverage at ≥90% lines/branches.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/tools.ts packages/contracts/src/index.ts \
  packages/contracts/tests/tools.test.ts
git commit -m "feat(contracts): tool contract (ToolHost, ToolDef, per-tool JSON schemas)"
```

---

## Self-Review

- **Spec coverage:** This plan covers the spec's Component 0 (`packages/contracts`) in full — command contract (Task 2), eval contract incl. `PlayObservation` type (Task 3), tool contract (Task 4) — plus the spec's "lift `SceneCommand` / eval types, editor re-exports" requirement and the "add contracts to the coverage gate / lint leaf rule" constraints (Task 1). The headless input-seam *widening* and its runtime population are explicitly deferred to the M16b plan (its only consumer), as the spec's sequencing allows; `agent-core`, chat overlay, tuning loop, and MCP server are out of scope for this slice and listed as follow-on plans.
- **Placeholder scan:** No TBD/TODO; every code step contains complete content; the one contingency note (Task 2 Step 7) is a real verification branch, not a placeholder.
- **Type consistency:** Lifted names match the originals exactly (`SceneCommand`, `SceneItem`, `Surface`, `ItemKind`, `BoxShape`, `CylinderShape`, `ArchetypeRef`, `MarkerRef`, `ItemShape`, `ItemTransform`, `Vec3`, `HeadlessOpts`, `TestPlayResult`). `toolArgSchemas` keys, the `toolDefs()` name list in the test, and the `ToolName` union are identical (10 tools). `RESOURCE_URIS` values match the `ResourceUri` union.
