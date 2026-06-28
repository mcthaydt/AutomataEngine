# Generic Project Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Monkey-Ball-shaped level editor with one generic project/scene/entity-component/resource editor, then migrate Pulsebreak and Monkey Ball so the same authored project data drives editor preview, headless evaluation, MCP/agent operations, and shipped runtimes.

**Architecture:** A new dependency-light `@automata/project` package owns persisted project schemas, declarative property schemas, generic commands, validation, transforms, and bundle/folder I/O. `@automata/editor` builds a project session, generic viewport, generated controls, storage, and one project chooser on top; game packages provide runtime-safe project definitions plus browser editor registrations. The old `GameDefinition<Doc>` path remains operational until both game registrations and runtime cutovers pass parity, then is deleted.

**Tech Stack:** TypeScript 6 (strict ESM), zod 4, npm workspaces, Vitest 4, happy-dom, Vite 8, Playwright, engine `RenderPort`/`PhysicsPort`, browser File System Access API, IndexedDB.

**Progress:** 47% — 9 of 19 tasks complete (Tasks 1–9 ✓; Phase 2 done). (Updated 2026-06-28)

---

## Source of truth and execution rules

- Approved design: `docs/superpowers/specs/2026-06-27-generic-project-editor-design.md`.
- This plan was originally drafted against commit `936a902`. Re-baseline onto current `PULSEBREAK` HEAD before starting: the `@automata/game-kit` work has since landed. Both games consume the game-kit shell, UI helpers (`dom.ts`/`view.ts`) moved into `packages/game-kit`, gameplay tests use `@automata/game-kit/testing` primitives, the `new-game` scaffold (`tools/scaffold`) exists, and root coverage/project config is glob-derived. Reconcile every file the plan touches against real HEAD, not `936a902`.
- Consequences of the landed `@automata/game-kit` work to honor throughout:
  - New and rewritten gameplay tests use `@automata/game-kit/testing` primitives (`stick` for input, `nullRuntime()` for render + audio doubles) instead of hand-built nulls, matching the established convention. (Non-game packages such as `@automata/editor` may keep using the engine's `createNullRenderer` directly.)
  - Root `vitest.config.ts` derives `projects` and coverage `include` from workspace globs (`packages/*`, `games/*`, `tools/*`). A new workspace package is auto-registered and auto-covered; do not add per-package entries to the root config.
  - The game runtime cutovers (Tasks 12–13) edit `main.ts` files that game-kit already rewired to its View/shell. Preserve the game-kit shell wiring and thread compiled-project data through it; do not reintroduce the pre-game-kit composition.
- Work from an isolated worktree created with `superpowers:using-git-worktrees` when execution starts.
- Follow TDD for every behavior change: focused red test, observe the expected failure, minimal implementation, focused green test.
- Mark each checkbox immediately after its step passes. Do not defer checklist updates.
- Each task ends in the documented commit. Stage only the listed task files.
- At each manual checkpoint, stop and wait for the user. Continue only after `pass, proceed` or equivalent confirmation.
- Keep the current browser-only shim inventory thin. Browser capability calls belong in `tools/level-editor/src/main.ts`; logic behind them stays injected and tested.
- Required final gates are `npm run ci`, `npm run coverage`, `npm run build`, and `npm run e2e`, plus the manual production-preview checklist in Task 19.

## Locked package boundaries

- `@automata/project` may import `zod`; it must not import engine, editor, games, or tools.
- `@automata/contracts` may import/re-export `@automata/project` after Task 15; it must not import editor, engine, games, or tools.
- `@automata/editor` may import project, contracts, and public engine APIs; it must not import a game or `@automata/agent-core`.
- Normal game runtime modules may import project and engine, but not editor. Only each game's `./editor` entry imports editor APIs.
- `tools/level-editor` is the only browser composition root that imports both game editor registrations.
- `tools/editor-mcp-server` selects registrations from a catalog by `manifest.gameId`; it contains no game-specific branches.

## Planned file map

```text
packages/project/
  src/{model,schema,registration,core,transform,pointer,command,edit,validation,bundle,files}.ts
  tests/{model,schema,registration,transform,pointer,edit,validation,bundle,files}.test.ts

packages/editor/src/project/
  {registration,selection,actions,store,spatial,worldSync,host,validation}.ts
  storage/{port,memory,bundle,autosave,fileSystem,recent}.ts
packages/editor/src/ui/project/
  {propertyControl,propertyTable,inspector,hierarchy,resources,palette,validation,chooser,chrome}.ts

games/pulsebreak/src/project/
  {types,definition,compiler,template,editor,evaluation,load}.ts
games/pulsebreak/public/project/{automata.project.json,scenes/arena.scene.json,resources/*.resource.json}

games/monkey-ball/src/project/
  {types,legacyImporter,definition,compiler,template,editor,evaluation,load}.ts
games/monkey-ball/public/project/{automata.project.json,scenes/*.scene.json,resources/*.resource.json}

tools/level-editor/src/{projectCatalog,editorApp,browserWorkspace,main}.ts
```

---

## Phase 1 — `@automata/project` foundation

### Task 1: Scaffold `@automata/project` and persist the v1 model

**Files:**
- Create: `packages/project/package.json`
- Create: `packages/project/tsconfig.json`
- Create: `packages/project/vitest.config.ts`
- Create: `packages/project/src/model.ts`
- Create: `packages/project/src/index.ts`
- Create: `packages/project/tests/model.test.ts`
- Modify: `eslint.config.js`
- Modify: `package-lock.json` via `npm install`

- [x] **Step 1: Create package metadata and the failing model test**

Use the same workspace shape as `packages/contracts`, with this package manifest:

```json
{
  "name": "@automata/project",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^4.4.3" }
}
```

`packages/project/tsconfig.json` extends `../../tsconfig.base.json` and includes `src`, `tests`, and `vitest.config.ts`. The Vitest project name is `project`, environment `node`, include `tests/**/*.test.ts`.

Write `packages/project/tests/model.test.ts` first:

```ts
import { describe, expect, it } from 'vitest'
import { projectSnapshotSchema } from '../src/model'

const snapshot = {
  manifest: {
    formatVersion: 1, id: 'demo', name: 'Demo', gameId: 'fake', entrySceneId: 'main',
    scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
    resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
  },
  scenes: {
    main: {
      formatVersion: 1, id: 'main', name: 'Main',
      entities: [{
        id: 'root', name: 'Root', enabled: true,
        components: [{ id: 'transform', typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 } } }]
      }]
    }
  },
  resources: {
    tuning: { formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 4 } }
  }
}

describe('projectSnapshotSchema', () => {
  it('accepts a v1 project snapshot without erasing component/resource data', () => {
    expect(projectSnapshotSchema.parse(snapshot)).toEqual(snapshot)
  })

  it.each([
    [{ ...snapshot, manifest: { ...snapshot.manifest, formatVersion: 2 } }, 'formatVersion'],
    [{ ...snapshot, manifest: { ...snapshot.manifest, id: '' } }, 'id'],
    [{ ...snapshot, scenes: { main: { ...snapshot.scenes.main, entities: [{ ...snapshot.scenes.main.entities[0], enabled: 'yes' }] } } }, 'enabled']
  ])('rejects malformed persisted data', (value, path) => {
    expect(() => projectSnapshotSchema.parse(value)).toThrow(path)
  })
})
```

- [x] **Step 2: Run the focused test and observe the red state**

Run: `npx vitest run --config packages/project/vitest.config.ts`

Expected: FAIL because `packages/project/src/model.ts` does not exist.

- [x] **Step 3: Implement the persisted model schemas**

Create `packages/project/src/model.ts` with exported zod schemas and inferred types for:

```ts
import { z } from 'zod'

export const PROJECT_FORMAT_VERSION = 1 as const
export const projectIdSchema = z.string().min(1)
export const projectPathSchema = z.string().min(1)

export const componentInstanceSchema = z.object({
  id: projectIdSchema,
  typeId: projectIdSchema,
  data: z.unknown()
})

export const entityDocumentSchema = z.object({
  id: projectIdSchema,
  name: projectIdSchema,
  parentId: projectIdSchema.optional(),
  enabled: z.boolean(),
  components: z.array(componentInstanceSchema)
})

export const sceneDocumentSchema = z.object({
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  id: projectIdSchema,
  name: projectIdSchema,
  entities: z.array(entityDocumentSchema)
})

export const resourceDocumentSchema = z.object({
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  id: projectIdSchema,
  typeId: projectIdSchema,
  data: z.unknown()
})

export const projectManifestSchema = z.object({
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  id: projectIdSchema,
  name: projectIdSchema,
  gameId: projectIdSchema,
  entrySceneId: projectIdSchema,
  scenes: z.array(z.object({ id: projectIdSchema, path: projectPathSchema })),
  resources: z.array(z.object({ id: projectIdSchema, typeId: projectIdSchema, path: projectPathSchema }))
})

export const projectSnapshotSchema = z.object({
  manifest: projectManifestSchema,
  scenes: z.record(projectIdSchema, sceneDocumentSchema),
  resources: z.record(projectIdSchema, resourceDocumentSchema)
})

export type ComponentInstance = z.infer<typeof componentInstanceSchema>
export type EntityDocument = z.infer<typeof entityDocumentSchema>
export type SceneDocument = z.infer<typeof sceneDocumentSchema>
export type ResourceDocument = z.infer<typeof resourceDocumentSchema>
export type ProjectManifest = z.infer<typeof projectManifestSchema>
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>
```

Export `model.ts` from `src/index.ts`.

- [x] **Step 4: Run model tests and package typecheck**

Run: `npx vitest run --config packages/project/vitest.config.ts && npm run typecheck -w @automata/project`

Expected: model tests PASS; typecheck exits 0.

- [x] **Step 5: Wire workspace, lint boundary, and coverage**

Run `npm install` so `package-lock.json` records the workspace. Root `vitest.config.ts` already derives `projects` and coverage `include` from workspace globs (`packages/*`, `packages/*/src/**`), so the new package is auto-registered and auto-covered — confirm this rather than editing the root config. Add an ESLint block for `packages/project/**/*.ts` that forbids imports from `@automata/engine`, `@automata/editor`, `@automata/contracts`, games, and tools; allow direct `zod` because project is the new persisted-model leaf.

- [x] **Step 6: Verify the package boundary**

Run: `npx eslint packages/project && npm run typecheck -w @automata/project && npx vitest run --project project`

Expected: all three commands exit 0.

- [x] **Step 7: Commit**

```bash
git add packages/project eslint.config.js package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(project): add persisted project model"
```

### Task 2: Add declarative property schemas, core components, and registrations

**Files:**
- Create: `packages/project/src/schema.ts`
- Create: `packages/project/src/core.ts`
- Create: `packages/project/src/registration.ts`
- Create: `packages/project/src/transform.ts`
- Create: `packages/project/tests/schema.test.ts`
- Create: `packages/project/tests/registration.test.ts`
- Create: `packages/project/tests/transform.test.ts`
- Modify: `packages/project/src/index.ts`

- [x] **Step 1: Write failing schema and registration tests**

Cover every property kind and the registration invariants:

```ts
import { describe, expect, it } from 'vitest'
import { defineGameProject, validateProperty } from '../src'

const stats = {
  kind: 'object',
  fields: [
    { key: 'speed', label: 'Speed', kind: 'number', required: true, min: 0, max: 20, step: 0.5 },
    { key: 'mode', label: 'Mode', kind: 'enum', required: true, values: ['chase', 'kite'] },
    { key: 'tint', label: 'Tint', kind: 'color', required: true },
    { key: 'target', label: 'Target', kind: 'reference', required: false, target: 'resource', typeIds: ['fake.target'] }
  ]
} as const

describe('property schemas', () => {
  it('validates nested values and reports JSON Pointer locations', () => {
    expect(validateProperty(stats, { speed: -1, mode: 'other', tint: '#fff' })).toEqual([
      expect.objectContaining({ pointer: '/speed', code: 'number.min' }),
      expect.objectContaining({ pointer: '/mode', code: 'enum.value' })
    ])
  })

  it('validates object-array tables', () => {
    const table = { kind: 'array', item: stats, presentation: 'table' } as const
    expect(validateProperty(table, [{ speed: 4, mode: 'chase', tint: '#fff' }])).toEqual([])
  })
})

describe('defineGameProject', () => {
  it('rejects duplicate type ids and invalid defaults at registration time', () => {
    expect(() => defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: () => ({} as never),
      components: [
        { typeId: 'fake.stats', label: 'Stats', schema: stats, defaultData: { speed: -1, mode: 'chase', tint: '#fff' }, cardinality: { min: 0, max: 1 } },
        { typeId: 'fake.stats', label: 'Duplicate', schema: stats, defaultData: { speed: 1, mode: 'chase', tint: '#fff' }, cardinality: { min: 0, max: 1 } }
      ],
      resources: [], validate: () => [], compile: () => ({})
    })).toThrow(/duplicate|default/i)
  })
})
```

Write transform tests that prove local transforms compose through parents and can convert a world target back to local coordinates:

```ts
expect(resolveWorldTransform(scene, 'child').position).toEqual({ x: 10, y: 0, z: -2 })
expect(worldToLocalPosition(parentWorld, { x: 10, y: 0, z: -2 })).toEqual({ x: 0, y: 0, z: 2 })
```

- [x] **Step 2: Run tests and observe missing-module failures**

Run: `npx vitest run --project project --testNamePattern="property schemas|defineGameProject|world transform"`

Expected: FAIL because schema/registration/transform exports do not exist.

- [x] **Step 3: Implement the finite schema language**

In `schema.ts`, define `ObjectSchema` and the discriminated `PropertySchema` union with these exact kinds: `number`, `string`, `boolean`, `enum`, `color`, `vec3`, `reference`, `object`, `array`. Common property fields are `key`, `label`, `description?`, and `required`; number adds `min?`, `max?`, `step?`; reference adds `target: 'entity' | 'resource'` and `typeIds?`; array adds `item`, `presentation: 'list' | 'table'`, `minItems?`, `maxItems?`.

Implement:

```ts
export interface PropertyIssue { code: string; message: string; pointer: string }
export function validateProperty(schema: ObjectSchema | PropertySchema, value: unknown, pointer = ''): PropertyIssue[]
export function defaultObject(schema: ObjectSchema): Record<string, unknown>
```

`validateProperty` must recurse, escape JSON Pointer tokens, reject unknown object keys, enforce required fields/ranges/enums/array lengths, and validate references as non-empty strings without resolving them yet.

- [x] **Step 4: Add standard authoring component registrations**

In `core.ts`, export `CORE_TYPE_IDS` and registrations for:

```ts
export const CORE_TYPE_IDS = {
  transform: 'core.transform', primitive: 'core.primitive', surface: 'core.surface',
  collider: 'core.collider', zone: 'core.zone', camera: 'core.camera'
} as const
```

`core.transform` defaults to position/rotation `{x:0,y:0,z:0}` and scale `{x:1,y:1,z:1}`. Primitive supports `box | cylinder | sphere | plane`; surface supports color plus optional texture reference; collider supports `none | box | cylinder | sphere`; zone supports `box | circle`, dimensions, and editor color; camera supports perspective FOV plus eye target settings.

- [x] **Step 5: Implement runtime-safe registration validation**

In `registration.ts`, define `ComponentTypeRegistration`, `ResourceTypeRegistration`, `GameProjectDefinition<Compiled>`, `ValidationIssue`, and `defineGameProject`. The helper must verify non-empty/unique component and resource type IDs, cardinality (`min >= 0`, `max >= min`), valid defaults, and that a template's `gameId` matches the registration.

- [x] **Step 6: Implement hierarchy transform resolution**

In `transform.ts`, implement pure authoring math without importing engine. Positions are local to `parentId`. Compose parent scale, quaternion rotation from Euler radians, and translation. Detect a missing parent or cycle and throw `ProjectTransformError`. Export `resolveWorldTransform`, `worldToLocalPosition`, and structural `Vec3`/`WorldTransform` types.

- [x] **Step 7: Run the complete project tests and typecheck**

Run: `npx vitest run --project project && npm run typecheck -w @automata/project`

Expected: all project tests PASS; typecheck exits 0.

- [x] **Step 8: Commit**

```bash
git add packages/project/src packages/project/tests
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(project): add declarative schemas and registrations"
```

### Task 3: Add JSON Pointer helpers and immutable project commands

**Files:**
- Create: `packages/project/src/pointer.ts`
- Create: `packages/project/src/command.ts`
- Create: `packages/project/src/edit.ts`
- Create: `packages/project/tests/pointer.test.ts`
- Create: `packages/project/tests/edit.test.ts`
- Modify: `packages/project/src/index.ts`

- [x] **Step 1: Write failing pointer and command tests**

Test RFC 6901 escaping (`~0`, `~1`), immutable nested replacement, array insertion/removal/move, semantic no-ops, descendant deletion, reparent cycle rejection, component cardinality, missing IDs, entry-scene protection, and referenced-resource protection.

The core red test should use this command sequence:

```ts
const renamed = applyProjectCommand(definition, snapshot, {
  type: 'setProperty', target: { kind: 'entity', sceneId: 'main', entityId: 'root' },
  pointer: '/name', value: 'Renamed'
})
const withChild = applyProjectCommand(definition, renamed, {
  type: 'addEntity', sceneId: 'main',
  entity: { id: 'child', name: 'Child', parentId: 'root', enabled: true, components: [] }
})
expect(withChild.scenes.main!.entities.map((entity) => entity.id)).toEqual(['root', 'child'])
expect(() => applyProjectCommand(definition, withChild, {
  type: 'reparentEntity', sceneId: 'main', entityId: 'root', parentId: 'child'
})).toThrow(/cycle/)
```

- [x] **Step 2: Run focused tests and confirm red**

Run: `npx vitest run --project project --testNamePattern="JSON Pointer|project commands"`

Expected: FAIL because pointer/edit modules do not exist.

- [x] **Step 3: Implement pointer helpers**

Export `escapePointerToken`, `parsePointer`, `getAtPointer`, `setAtPointer`, `insertAtPointer`, `removeAtPointer`, and `moveAtPointer`. Reject non-root paths without a leading `/`, invalid array indices, `-` outside insertion, missing object keys, and descent through primitives. Every write clones only containers on the path and returns the original root for deep-equal primitive no-ops.

- [x] **Step 4: Define the command contract**

In `command.ts`, export the zod-backed `ProjectCommand` union for:

```ts
type ProjectCommand =
  | { type: 'addScene'; scene: SceneDocument; path: string }
  | { type: 'removeScene'; sceneId: string }
  | { type: 'addEntity'; sceneId: string; entity: EntityDocument }
  | { type: 'removeEntities'; sceneId: string; entityIds: string[] }
  | { type: 'reparentEntity'; sceneId: string; entityId: string; parentId?: string }
  | { type: 'addComponent'; sceneId: string; entityId: string; component: ComponentInstance }
  | { type: 'removeComponent'; sceneId: string; entityId: string; componentId: string }
  | { type: 'addResource'; resource: ResourceDocument; path: string }
  | { type: 'removeResource'; resourceId: string }
  | { type: 'setProperty'; target: ProjectTarget; pointer: string; value: unknown }
  | { type: 'insertArrayItem'; target: ProjectTarget; pointer: string; index: number; value: unknown }
  | { type: 'removeArrayItem'; target: ProjectTarget; pointer: string; index: number }
  | { type: 'moveArrayItem'; target: ProjectTarget; pointer: string; from: number; to: number }
  | { type: 'loadSnapshot'; snapshot: ProjectSnapshot }
```

`ProjectTarget` is discriminated across manifest, scene, entity, component, and resource IDs.

- [x] **Step 5: Implement the immutable command reducer**

`applyProjectCommand(definition, snapshot, command)` must locate targets by stable ID, validate structural operations, validate modified component/resource data through its registered schema, preserve original references for no-ops, and throw `ProjectCommandError` with `code` plus `target` for expected failures. `applyProjectCommands` reduces into a local snapshot and throws on the first failure; because inputs are immutable, the caller's original snapshot remains unchanged and no partial result escapes.

- [x] **Step 6: Run project tests, typecheck, and coverage for the package**

Run: `npx vitest run --project project --coverage.enabled=false && npm run typecheck -w @automata/project`

Expected: all tests PASS; typecheck exits 0.

- [x] **Step 7: Commit**

```bash
git add packages/project/src packages/project/tests
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(project): add immutable project commands"
```

### Task 4: Add structural validation, canonical bundles, and folder loading

**Files:**
- Create: `packages/project/src/validation.ts`
- Create: `packages/project/src/bundle.ts`
- Create: `packages/project/src/files.ts`
- Create: `packages/project/tests/validation.test.ts`
- Create: `packages/project/tests/bundle.test.ts`
- Create: `packages/project/tests/files.test.ts`
- Modify: `packages/project/src/index.ts`

- [x] **Step 1: Write failing validation and serialization tests**

Cover duplicate IDs, manifest/map mismatches, missing entry scene, path traversal, missing parent, cycles, duplicate component IDs, unknown registered types, component cardinality, bad references, game validation issues, canonical ordering, bundle round-trip, folder read ordering, missing files, and `gameId` mismatch.

Use an injected reader:

```ts
const files = new Map<string, string>([
  ['automata.project.json', JSON.stringify(snapshot.manifest)],
  ['scenes/main.scene.json', JSON.stringify(snapshot.scenes.main)],
  ['resources/tuning.resource.json', JSON.stringify(snapshot.resources.tuning)]
])
const loaded = await loadProjectFiles({ readText: async (path) => files.get(path)! })
expect(loaded).toEqual(snapshot)
```

- [x] **Step 2: Run focused tests and confirm red**

Run: `npx vitest run --project project --testNamePattern="project validation|project bundle|project files"`

Expected: FAIL because validation/bundle/files modules do not exist.

- [x] **Step 3: Implement layered validation**

Export `validateProject(definition, snapshot): ValidationIssue[]`. Run format/identity/path checks first, schema and registration checks second, hierarchy/reference checks third, `definition.validate` fourth, and compile preflight last. Catch compile errors as `compile.failed` issues. Sort issues by severity, location IDs, pointer, then code for deterministic UI/tests.

References are resolved by walking registered schemas: entity references must name an entity in the target/current scene; resource references must exist and match any allowed `typeIds`.

- [x] **Step 4: Implement canonical bundle I/O**

Define `ProjectBundle` as `{ formatVersion: 1; manifest; scenes: SceneDocument[]; resources: ResourceDocument[] }`. `toProjectBundle` sorts scenes/resources/entities/components by stable ID without mutating the snapshot. `stringifyProjectBundle` uses two-space JSON plus trailing newline. `parseProjectBundle` reconstructs maps, validates the snapshot, and never silently fixes invalid IDs.

- [x] **Step 5: Implement folder reader/writer documents**

Define:

```ts
export interface ProjectFileReader { readText(path: string): Promise<string> }
export interface ProjectFileDocument { path: string; text: string; kind: 'manifest' | 'scene' | 'resource' }
export async function loadProjectFiles(reader: ProjectFileReader): Promise<ProjectSnapshot>
export function projectFileDocuments(snapshot: ProjectSnapshot): ProjectFileDocument[]
```

Normalize relative POSIX paths, reject absolute/backslash/empty/`.`/`..` segments, load manifest first, then referenced documents in manifest order, and verify every loaded document ID/type matches its reference.

- [x] **Step 6: Run package and root boundary checks**

Run: `npx vitest run --project project && npm run typecheck -w @automata/project && npx eslint packages/project`

Expected: all commands exit 0.

- [x] **Step 7: Commit**

```bash
git add packages/project/src packages/project/tests
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(project): validate and serialize project workspaces"
```

---

## Phase 2 — generic editor in parallel with the legacy host

### Task 5: Add editor registrations and a project-session store

**Files:**
- Modify: `packages/editor/package.json`
- Create: `packages/editor/src/project/registration.ts`
- Create: `packages/editor/src/project/selection.ts`
- Create: `packages/editor/src/project/actions.ts`
- Create: `packages/editor/src/project/store.ts`
- Create: `packages/editor/tests/fixtures/fakeProject.ts`
- Create: `packages/editor/tests/project/registration.test.ts`
- Create: `packages/editor/tests/project/store.test.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `packages/editor/src/headless.ts`

- [x] **Step 1: Add `@automata/project` to editor dependencies**

Add `"@automata/project": "*"` to `packages/editor/package.json`. Run `npm install` only if the workspace link is not already present from Task 1.

- [x] **Step 2: Write a fake third-game registration fixture**

`fakeProject.ts` must create one project with a main scene, a root box entity, and a `fake.tuning` resource. Register `fake.spawn` as a point-gizmo component and `fake.tuning` as an object with number/enum/color plus an object-array table. The compiler returns `{ snapshot }`; preview/evaluation spies append calls to exported arrays.

Use this fixture in a failing registration test:

```ts
const erased = registerEditorProject(fakeEditorRegistration)
expect(erased.gameId).toBe('fake')
expect(erased.createTemplate().manifest.gameId).toBe('fake')
expect(erased.compile(fakeSnapshot)).toEqual({ snapshot: fakeSnapshot })
expect(await erased.evaluate(fakeSnapshot, { maxSteps: 10 })).toEqual({
  outcome: 'passed', score: 1, metrics: { boxes: 1 }, steps: 1
})
```

- [x] **Step 3: Write failing project-store tests**

Assert command dispatch, batch atomicity, 200-entry undo cap, undo/redo, typed selection, active scene, dirty document paths, partial `markSaved`, play mode, and save error state:

```ts
const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot)
store.dispatch({ type: 'projectCommand', command: {
  type: 'setProperty', target: { kind: 'resource', resourceId: 'tuning' },
  pointer: '/speed', value: 8
} })
expect(store.getState().dirtyPaths).toEqual(['resources/tuning.resource.json'])
store.dispatch({ type: 'markSaved', paths: ['resources/tuning.resource.json'] })
expect(store.getState().dirtyPaths).toEqual([])
store.dispatch({ type: 'undo' })
expect(store.getState().dirtyPaths).toEqual(['resources/tuning.resource.json'])
```

- [x] **Step 4: Run the tests and observe the red state**

Run: `npx vitest run --project editor --testNamePattern="editor project registration|project editor store"`

Expected: FAIL because the project editor modules do not exist.

- [x] **Step 5: Implement the browser/headless registration boundary**

Define:

```ts
export interface ProjectPlayHandle {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt?: number): void
  dispose(): void
}

export interface ProjectPreviewAdapter<Compiled> {
  create(compiled: Compiled, sceneId: string, render: RenderPort, physics: PhysicsPort): ProjectPlayHandle
}

export interface ProjectEvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}

export interface EditorProjectRegistration<Compiled> {
  project: GameProjectDefinition<Compiled>
  prefabs: PrefabRegistration[]
  preview?: ProjectPreviewAdapter<Compiled>
  evaluation?: { evaluate(snapshot: ProjectSnapshot, opts: { maxSteps: number }): Promise<ProjectEvaluationResult> }
}
```

`registerEditorProject` returns a non-generic `RegisteredEditorProject` whose compile/preview/evaluate closures preserve the concrete type internally. Validate unique prefab IDs and that prefab component defaults satisfy the project registration.

- [x] **Step 6: Implement project state and actions**

Selection is exactly:

```ts
export type ProjectSelection =
  | { kind: 'project' }
  | { kind: 'scene'; sceneId: string }
  | { kind: 'entity'; sceneId: string; entityIds: string[] }
  | { kind: 'component'; sceneId: string; entityId: string; componentId: string }
  | { kind: 'resource'; resourceId: string }
```

State contains `snapshot`, `savedSnapshot`, `dirtyPaths`, `past`, `future`, `activeSceneId`, `selection`, `mode`, `saveStatus`, existing tool/UI slices, and the registered project. Actions include single/batch project commands, load snapshot, select, set active scene, undo/redo, set mode, begin save, mark saved paths, save failed, and existing snap/viewport/tool actions.

Dirty-path computation compares manifest, scenes, and resources by identity/content and uses manifest paths. `markSaved` copies only successful documents from current into `savedSnapshot`; it must not clear failed dirty documents.

- [x] **Step 7: Run editor project-store tests and typecheck**

Run: `npx vitest run --project editor --testNamePattern="editor project registration|project editor store" && npm run typecheck -w @automata/editor`

Expected: focused tests PASS; typecheck exits 0; legacy editor tests still compile.

- [x] **Step 8: Commit**

```bash
git add packages/editor/package.json packages/editor/src/project packages/editor/src/index.ts packages/editor/src/headless.ts packages/editor/tests/fixtures/fakeProject.ts packages/editor/tests/project package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor): add generic project session"
```

### Task 6: Add generic spatial projection, viewport world sync, and project host

**Files:**
- Create: `packages/editor/src/project/spatial.ts`
- Create: `packages/editor/src/project/worldSync.ts`
- Create: `packages/editor/src/project/host.ts`
- Create: `packages/editor/src/viewport2d/projectDraw.ts`
- Create: `packages/editor/src/viewport2d/projectHit.ts`
- Modify: `packages/editor/src/viewport2d/browser.ts`
- Modify: `packages/editor/src/viewport3d/aabb.ts`
- Create: `packages/editor/tests/project/spatial.test.ts`
- Create: `packages/editor/tests/project/worldSync.test.ts`
- Create: `packages/editor/tests/project/host.test.ts`
- Create: `packages/editor/tests/viewport2d/projectDraw.test.ts`
- Modify: `packages/editor/tests/viewport3d/aabb.test.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `packages/editor/src/viewport.ts`

- [x] **Step 1: Write failing spatial projection tests**

Build a fake scene with nested entities and assert:

- `core.transform + core.primitive + core.surface` projects to a box/cylinder/sphere/plane spatial item with resolved world transform and color.
- `core.zone` projects to a translucent box/circle gizmo even without a primitive.
- An entity with only game components is absent from viewport items unless its component registration declares a point/zone gizmo.
- Moving a nested entity from a world target produces a `setProperty` command for its local `/position`.
- Picking and 2D drawing use entity IDs, not component IDs.

- [x] **Step 2: Write failing host lifecycle tests**

Use NullRenderer/null physics and the fake registration. Assert edit render, selection highlight, prefab placement, move/delete, compile-before-dispose play entry, fixed/render forwarding, exit-play rebuild, and compiler/preview failure preserving edit mode/world.

```ts
const editor = createProjectEditor({ registration: fakeEditorRegistration, snapshot: fakeSnapshot, render, physics })
editor.enterPlay()
expect(editor.store.getState().mode).toBe('play')
editor.exitPlay()
expect(editor.store.getState().mode).toBe('edit')
```

- [x] **Step 3: Run focused tests and observe red**

Run: `npx vitest run --project editor --testNamePattern="project spatial|project world sync|project editor host|project draw"`

Expected: FAIL because the new project host/viewport modules do not exist.

- [x] **Step 4: Implement spatial projection and generic draw/hit models**

Define a `SpatialItem` with entity ID, world transform, bounds shape, renderable definition, color, and gizmo flag. Resolve standard components through `resolveWorldTransform`; derive primitive sizes after world scale. Registration gizmos use the entity transform plus `core.zone` dimensions. `buildProjectDrawModel` and `hitTestProjectMap` accept `SpatialItem[]` directly and contain no game/registration branching. Move the shared `DrawOp` type to `projectDraw.ts` and repoint the thin canvas painter to it while leaving legacy draw output structurally compatible. Generalize `itemAabb`/`pickItem` to a minimal `{ id, position, bounds }` input so project picking does not depend on legacy `SceneItem`.

- [x] **Step 5: Implement project world sync**

Create one render group and a world of `{ editorId, transform, renderable }`. Reconcile by stable entity ID: remove deleted/changed seeds, add changed/new seeds, then reapply highlight from project selection. Keep the current world if only selection changes. Use `registerRenderables` and `renderSystem` exactly as the legacy sync does.

- [x] **Step 6: Implement `createProjectEditor`**

Match the useful legacy `EditorCore` surface with project semantics:

```ts
export interface ProjectEditorCore {
  registration: RegisteredEditorProject
  store: ProjectEditorStore
  camera: FlyCamera
  mapView: MapView
  tick(alpha: number, frameDt?: number): void
  fixedUpdate(dt: number): void
  enterPlay(): void
  exitPlay(): void
  placePrefabAt(prefabId: string, world: Vec3): void
  moveSelectionTo(world: Vec3): void
  deleteSelected(): void
  pick2d(screen: Vec2, size: ScreenSize): void
  pick3d(screen: Vec2, size: ScreenSize): void
  drawModel(size: ScreenSize): DrawOp[]
  dispose(): void
}
```

Placement creates a stable entity ID, clones prefab components, writes snapped `core.transform.position`, and dispatches one `addEntity`. Play validates and compiles the current snapshot, creates the next preview handle, then disposes edit sync; failure leaves edit sync live.

- [x] **Step 7: Run focused and full editor tests**

Run: `npx vitest run --project editor && npm run typecheck -w @automata/editor`

Expected: all editor tests PASS, including legacy tests.

- [x] **Step 8: Commit**

```bash
git add packages/editor/src/project packages/editor/src/viewport2d packages/editor/src/index.ts packages/editor/src/viewport.ts packages/editor/tests/project packages/editor/tests/viewport2d
git add packages/editor/src/viewport3d/aabb.ts packages/editor/tests/viewport3d/aabb.test.ts docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor): add generic project viewport host"
```

### Task 7: Generate property controls, nested groups, and editable tables

**Files:**
- Create: `packages/editor/src/ui/project/propertyControl.ts`
- Create: `packages/editor/src/ui/project/propertyTable.ts`
- Create: `packages/editor/src/ui/project/inspector.ts`
- Create: `packages/editor/tests/ui/project/propertyControl.test.ts`
- Create: `packages/editor/tests/ui/project/propertyTable.test.ts`
- Create: `packages/editor/tests/ui/project/inspector.test.ts`
- Modify: `packages/editor/src/ui/index.ts`

- [x] **Step 1: Write failing generated-control tests**

Test number min/max/step, string/multiline, checkbox, enum select, color, vec3, entity/resource reference, nested object groups, optional values, and invalid input. Each change must emit one exact `setProperty` command target/pointer/value.

For tables, test add/remove/reorder rows and cell edits:

```ts
expect(dispatched).toEqual({
  type: 'insertArrayItem', target: { kind: 'resource', resourceId: 'waves' },
  pointer: '/waves', index: 2, value: { rammer: 0, shooter: 0, boss: 0 }
})
```

- [x] **Step 2: Run focused tests and confirm red**

Run: `npx vitest run --project editor --testNamePattern="property control|property table|project inspector"`

Expected: FAIL because project UI modules do not exist.

- [x] **Step 3: Implement leaf controls**

`mountPropertyControl` receives schema, current value, JSON Pointer, target, reference options, and dispatch callback. It returns a disposable handle. Number changes reject non-finite values and clamp only when the schema explicitly supplies a min/max; invalid text stays visible with `aria-invalid=true` and does not dispatch. Reference selects contain a blank option for optional fields and only compatible IDs.

- [x] **Step 4: Implement array lists/tables**

Tables support arrays whose item is an object with scalar/color/enum/reference cells. Nested arrays/objects inside table cells render a read-only summary and are edited in list mode instead. Add uses schema defaults; remove/reorder dispatch generic array commands. Every row key is its current index because array identity is command/path-based in v1.

- [x] **Step 5: Implement the project inspector**

Project/scene/entity/component/resource selections resolve their registered schema and target. Entity selection renders name/enabled plus collapsible component cards; component selection focuses one card; resource selection renders the resource schema; multi-entity selection renders only shared transform position controls. No game name/type ID branches are permitted.

- [x] **Step 6: Run UI tests and editor typecheck**

Run: `npx vitest run --project editor --testNamePattern="property control|property table|project inspector" && npm run typecheck -w @automata/editor`

Expected: focused tests PASS; typecheck exits 0.

- [x] **Step 7: Commit**

```bash
git add packages/editor/src/ui/project packages/editor/src/ui/index.ts packages/editor/tests/ui/project
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor): generate project property controls"
```

### Task 8: Add hierarchy, resources, palette, validation, and project chrome

**Files:**
- Create: `packages/editor/src/ui/project/hierarchy.ts`
- Create: `packages/editor/src/ui/project/resources.ts`
- Create: `packages/editor/src/ui/project/palette.ts`
- Create: `packages/editor/src/ui/project/validation.ts`
- Create: `packages/editor/src/ui/project/toolbar.ts`
- Create: `packages/editor/src/ui/project/chrome.ts`
- Modify: `packages/editor/src/ui/viewportRegion.ts`
- Create: `packages/editor/tests/ui/project/hierarchy.test.ts`
- Create: `packages/editor/tests/ui/project/resources.test.ts`
- Create: `packages/editor/tests/ui/project/palette.test.ts`
- Create: `packages/editor/tests/ui/project/validation.test.ts`
- Create: `packages/editor/tests/ui/project/chrome.test.ts`
- Modify: `packages/editor/src/ui/theme.css.ts`
- Modify: `packages/editor/src/ui/index.ts`

- [x] **Step 1: Write failing panel tests**

Assert scene switching, nested hierarchy indentation, entity selection, cascading delete confirmation hook, resource type grouping, singleton resource disablement, prefab placement tool selection, add-component cardinality, validation issue focus, dirty/save states, undo/redo buttons, and play/stop status.

The chrome test must render only the fake registration and assert the shared regions:

```ts
expect(root.querySelector('[data-project-hierarchy]')).not.toBeNull()
expect(root.querySelector('[data-project-resources]')).not.toBeNull()
expect(root.querySelector('[data-project-inspector]')).not.toBeNull()
expect(root.textContent).not.toContain('Monkey Ball')
expect(root.textContent).not.toContain('Pulsebreak')
```

- [x] **Step 2: Run focused tests and confirm red**

Run: `npx vitest run --project editor --testNamePattern="project hierarchy|project resources|project palette|project validation panel|project chrome"`

Expected: FAIL because the panels do not exist.

- [x] **Step 3: Implement hierarchy/resources/palette panels**

Hierarchy renders manifest scenes then a depth-first entity tree ordered by scene array order. Reparenting is exposed through explicit Move Up/Down/Into Parent actions rather than HTML drag-and-drop in v1. Resources render registered types and current documents. Palette renders registration prefabs plus an Add Component menu generated from component registrations/cardinality. Narrow `viewportRegion.ts` to a shared interface containing only project/legacy-compatible UI state and store dispatch so both chrome paths compile during migration.

- [x] **Step 4: Implement validation and toolbar**

Validation calls the shared layered validator, renders severity/code/message, and dispatches the issue's typed selection when clicked. Toolbar exposes project switch, Save, Export Bundle, Import Bundle, Undo, Redo, Play/Stop and save status. Its callbacks are injected through `ProjectChromeOptions`; UI code never invokes browser file APIs directly.

- [x] **Step 5: Compose project chrome and theme**

Reuse the existing docked shell and dual viewport. Replace Outliner with Hierarchy, add Resources below it, retain the schema inspector in the right column, keep the agent panel mount optional, and add stable `data-*` selectors used by tests/e2e. Keep `renderEditorChrome` untouched until final cutover; export `renderProjectChrome` alongside it.

- [x] **Step 6: Run all editor tests and typecheck**

Run: `npx vitest run --project editor && npm run typecheck -w @automata/editor`

Expected: all editor tests PASS; typecheck exits 0.

- [x] **Step 7: Commit**

```bash
git add packages/editor/src/ui packages/editor/tests/ui
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor): add generic project chrome"
```

### Task 9: Add project storage, autosave, folder writes, and recent handles

**Files:**
- Create: `packages/editor/src/project/storage/port.ts`
- Create: `packages/editor/src/project/storage/memory.ts`
- Create: `packages/editor/src/project/storage/bundle.ts`
- Create: `packages/editor/src/project/storage/autosave.ts`
- Create: `packages/editor/src/project/storage/fileSystem.ts`
- Create: `packages/editor/src/project/storage/recent.ts`
- Create: `packages/editor/tests/project/storage/memory.test.ts`
- Create: `packages/editor/tests/project/storage/bundle.test.ts`
- Create: `packages/editor/tests/project/storage/autosave.test.ts`
- Create: `packages/editor/tests/project/storage/fileSystem.test.ts`
- Create: `packages/editor/tests/project/storage/recent.test.ts`
- Modify: `packages/editor/src/index.ts`

- [x] **Step 1: Write failing port and memory-storage tests**

Define expected capabilities and per-path save results:

```ts
interface ProjectSaveResult {
  saved: string[]
  failed: Array<{ path: string; message: string }>
}
```

Test opening, saving only dirty paths, preserving failed paths, importing/exporting an invalid work-in-progress bundle, autosave debounce/flush-on-stop, and memory round-trip.

- [x] **Step 2: Write failing filesystem ordering tests**

Use structural fake directory/file handles. Assert new/changed scene/resource files write first, manifest writes after referenced files, orphan deletion runs last, path traversal never calls the handle, and a write failure skips manifest/orphan deletion while returning exact failures.

- [x] **Step 3: Write failing recent-handle registry tests**

Inject an `IDBFactory`-shaped fake. Assert put/list/get/delete, stale handle removal, permission `prompt`/`denied` behavior, and deterministic recent ordering. Do not add a browser database dependency.

- [x] **Step 4: Run focused tests and confirm red**

Run: `npx vitest run --project editor --testNamePattern="project storage|filesystem project storage|recent project handles"`

Expected: FAIL because storage modules do not exist.

- [x] **Step 5: Implement storage ports and bundle/autosave adapters**

`ProjectStoragePort` exposes capabilities, `open`, `save(snapshot, dirtyPaths)`, `importBundle`, and `exportBundle`. Bundle export always works for parseable snapshots and returns current validation issues. Autosave uses `StoragePort`, key `automata/project-autosave/<projectId>`, version 1, and flushes only a pending write on stop.

- [x] **Step 6: Implement injected filesystem and IndexedDB adapters**

Define structural `DirectoryHandleLike`, `FileHandleLike`, and `WritableLike` interfaces so tests do not require browser globals. For recent projects, accept `IDBFactory` and store directory handles in database `automata-editor`, object store `project-handles`, keyed by project ID. Permission checks remain injected callbacks so happy-dom tests are deterministic.

- [x] **Step 7: Run editor tests, typecheck, and focused coverage**

Run: `npx vitest run --project editor && npm run typecheck -w @automata/editor`

Expected: all editor tests PASS; typecheck exits 0.

- [x] **Step 8: Commit**

```bash
git add packages/editor/src/project packages/editor/src/index.ts packages/editor/tests/project
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor): add project workspace storage"
```

---

## Phase 3 — game project definitions and authored data

### Task 10: Define and compile the Pulsebreak project format

**Files:**
- Modify: `games/pulsebreak/package.json`
- Modify: `games/pulsebreak/tsconfig.json`
- Create: `games/pulsebreak/src/project/types.ts`
- Create: `games/pulsebreak/src/project/definition.ts`
- Create: `games/pulsebreak/src/project/compiler.ts`
- Create: `games/pulsebreak/src/project/template.ts`
- Create: `games/pulsebreak/src/project/load.ts`
- Create: `games/pulsebreak/src/project/index.ts`
- Create: `games/pulsebreak/scripts/validate-project.ts`
- Create: `games/pulsebreak/tests/project/definition.test.ts`
- Create: `games/pulsebreak/tests/project/compiler.test.ts`
- Create: `games/pulsebreak/tests/project/content.test.ts`
- Create: `games/pulsebreak/public/project/automata.project.json`
- Create: `games/pulsebreak/public/project/scenes/arena.scene.json`
- Create: `games/pulsebreak/public/project/resources/tuning.resource.json`
- Create: `games/pulsebreak/public/project/resources/enemies.resource.json`
- Create: `games/pulsebreak/public/project/resources/waves.resource.json`
- Create: `games/pulsebreak/public/project/resources/upgrades.resource.json`

- [ ] **Step 1: Add project dependencies and exports**

Add `@automata/project` to Pulsebreak dependencies and `tsx` to devDependencies. Add exports `./project` -> `./src/project/index.ts`. Add `validate:project` and make `build` run it before Vite. Do not add an editor dependency in this task; the runtime-safe graph must typecheck independently.

- [ ] **Step 2: Write failing project-definition/content tests**

Parse all six public project files with `loadProjectFiles`. Assert `gameId === 'pulsebreak'`, one arena scene, exactly four typed resources, one player start, one ordinary enemy zone, and one boss zone. Assert `validateProject(pulsebreakProjectDefinition, snapshot)` returns no errors.

Add negative cases for missing player start, no eligible spawn zone, duplicate enemy IDs, a wave that references an unknown enemy, non-positive zone weight, and no boss wave.

- [ ] **Step 3: Write the failing compiler parity test**

Compile the public snapshot and compare every currently authored constant:

```ts
const compiled = pulsebreakProjectDefinition.compile(snapshot)
expect(compiled.arena).toEqual(ARENA)
expect(compiled.camera).toEqual(CAMERA)
expect(compiled.player).toEqual(PLAYER)
expect(compiled.enemy).toEqual(ENEMY)
expect(compiled.waves).toEqual(WAVES)
expect(compiled.upgradeStep).toEqual(UPGRADE_STEP)
expect(compiled.projectileLifetimeS).toBe(PROJECTILE_LIFETIME_S)
```

Also assert the compiled arena scene contains the floor render seed, player start, and zones ordered by entity ID.

- [ ] **Step 4: Run focused tests and observe red**

Run: `npx vitest run --project pulsebreak --testNamePattern="Pulsebreak project|Pulsebreak project compiler|Pulsebreak project content"`

Expected: FAIL because Pulsebreak project modules/files do not exist.

- [ ] **Step 5: Define typed Pulsebreak resources and compiler output**

`PulsebreakCompiledProject` contains:

```ts
export interface PulsebreakCompiledProject {
  projectId: string
  sceneId: string
  arena: { half: number; y: number }
  camera: { eye: Vec3; look: Vec3 }
  player: PlayerSpec & { spawn: Vec3 }
  enemy: Record<EnemyKind, EnemySpec>
  waves: WaveSpec[]
  upgrades: Record<UpgradeId, UpgradeDef>
  upgradeStep: Record<UpgradeId, number>
  projectileLifetimeS: number
  floor: { position: Vec3; size: Vec3; color: string }
  spawnZones: SpawnZone[]
}
```

`SpawnZone` has stable `id`, `mode: 'ring' | 'point'`, world `center`, `radius`, `weight`, `enemyTypeIds`, `minSeparation`, `edgePaddingMin`, `edgePaddingMax`, and `angleJitterRad`.

- [ ] **Step 6: Register Pulsebreak component/resource schemas**

Register `pulsebreak.player-start` and `pulsebreak.spawn-zone` components. Register singleton resources `pulsebreak.tuning`, `pulsebreak.enemy-types`, `pulsebreak.wave-set`, and `pulsebreak.upgrade-set`. Waves and enemy/upgrade collections use object-array tables with stable string IDs and reference fields. `definition.validate` enforces exactly one player start, at least one zone per referenced enemy type, unique table IDs, valid references, positive weights, one-or-more waves, and at least one boss count in the final wave.

- [ ] **Step 7: Author the default project files with current values**

Use these resource values as the parity baseline:

```json
{
  "arena": { "half": 13, "y": 0.5 },
  "camera": { "eye": { "x": 0, "y": 24, "z": 19 }, "look": { "x": 0, "y": 0, "z": 0 } },
  "player": {
    "radius": 0.6, "startHealth": 100, "baseDamage": 12, "baseFireRate": 3,
    "baseMoveSpeed": 8.5, "projectileSpeed": 24, "projectileRadius": 0.22,
    "range": 26, "invulnS": 0.6, "color": "#27e0ff"
  },
  "projectileLifetimeS": 3
}
```

Enemy rows reproduce rammer/shooter/boss values from current `config.ts`. Wave rows are `[3/0/0, 3/1/0, 4/2/0, 5/3/0, 0/0/1]` by enemy reference. Upgrade rows preserve current labels/descriptions and steps `damage=6`, `fireRate=1`, `moveSpeed=1.5`, `maxHealth=25`.

The arena scene contains:

- `floor`: transform `(0,-0.15,0)`, box `(28,0.3,28)`, color `#0a1124`.
- `player-start`: transform `(0,0.5,0)`, component `pulsebreak.player-start`.
- `enemy-ring`: transform `(0,0.5,0)`, circle zone radius `13`, ring mode, rammer/shooter filters, weight `1`, padding `1..3`, jitter `0.35`.
- `boss-north`: transform `(0,0.5,-11)`, point mode, boss filter, weight `1`.

- [ ] **Step 8: Implement compiler and runtime-safe loader**

Compiler resolves the singleton resources by type, resolves local/world scene transforms, converts tables to typed lookup maps, and sorts zones by stable ID. `loadPulsebreakProject(reader)` calls `loadProjectFiles`, checks `gameId`, validates, and returns the compiled result or throws an error containing every error issue path. `scripts/validate-project.ts` adapts `games/pulsebreak/public/project` to a filesystem reader, validates/compiles it, prints structured errors to stderr, and exits nonzero on any error.

- [ ] **Step 9: Run focused Pulsebreak tests and typecheck**

Run: `npx vitest run --project pulsebreak --testNamePattern="Pulsebreak project|Pulsebreak project compiler|Pulsebreak project content" && npm run validate:project -w pulsebreak && npm run typecheck -w pulsebreak`

Expected: project/content/parity tests PASS; typecheck exits 0.

- [ ] **Step 10: Commit**

```bash
git add games/pulsebreak/package.json games/pulsebreak/tsconfig.json games/pulsebreak/src/project games/pulsebreak/scripts games/pulsebreak/tests/project games/pulsebreak/public/project package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(pulsebreak): define authored project format"
```

### Task 11: Import Monkey Ball legacy content into the generic project

**Files:**
- Modify: `games/monkey-ball/package.json`
- Create: `games/monkey-ball/src/project/types.ts`
- Create: `games/monkey-ball/src/project/legacyImporter.ts`
- Create: `games/monkey-ball/src/project/definition.ts`
- Create: `games/monkey-ball/src/project/compiler.ts`
- Create: `games/monkey-ball/src/project/template.ts`
- Create: `games/monkey-ball/src/project/load.ts`
- Create: `games/monkey-ball/src/project/index.ts`
- Create: `games/monkey-ball/scripts/build-project.ts`
- Create: `games/monkey-ball/scripts/validate-project.ts`
- Create: `games/monkey-ball/tests/project/legacyImporter.test.ts`
- Create: `games/monkey-ball/tests/project/compiler.test.ts`
- Create: `games/monkey-ball/tests/project/content.test.ts`
- Generate: `games/monkey-ball/public/project/automata.project.json`
- Generate: `games/monkey-ball/public/project/scenes/{w1-l1,w1-l2,w1-l3,w2-l1,w2-l2,w2-l3}.scene.json`
- Generate: `games/monkey-ball/public/project/resources/{physics,worlds}.resource.json`

- [ ] **Step 1: Add the runtime-safe project dependency/export**

Add `@automata/project` to Monkey Ball dependencies and `tsx` to devDependencies, then export `./project` from `./src/project/index.ts`. Add `validate:project` and make `build` run it before Vite. Existing root/headless exports stay intact until Task 18.

- [ ] **Step 2: Write failing deterministic importer tests**

Load current physics TOML, worlds JSON, and six levels through existing kinds, then call `importLegacyMonkeyBallProject`. Assert:

- Two imports serialize to byte-identical canonical bundles.
- Scene IDs/order equal worlds manifest level IDs.
- Every legacy geometry/entity UID maps to a stable entity ID.
- Spawn and goal are components on dedicated entities.
- Box/cylinder size/rotation/color/friction survive exactly.
- Moving-platform `overrides` survive in its game component data.
- Physics/world resource values match the legacy inputs.

- [ ] **Step 3: Write failing compile-back parity tests**

For each of six scenes, compile the imported snapshot and compare the resulting legacy-compatible `Level` to the parsed current JSON after normalizing optional UIDs. Compare compiled `PhysicsTuning` and `WorldsManifest` to current boot values. Run existing headless baselines against the compiled levels and require the recorded outcomes/metrics to remain unchanged.

- [ ] **Step 4: Run focused tests and observe red**

Run: `npx vitest run --project monkey-ball --testNamePattern="legacy project importer|Monkey Ball project compiler|Monkey Ball project content"`

Expected: FAIL because project modules do not exist.

- [ ] **Step 5: Define Monkey Ball schemas and compiler types**

Register components:

- `monkey-ball.spawn` and `monkey-ball.goal` (cardinality exactly one per playable scene).
- `monkey-ball.archetype` with `archetypeId` enum/reference and an overrides object.
- Use core transform/primitive/surface/collider for level geometry.

Register singleton `monkey-ball.physics` and `monkey-ball.worlds` resources. `CompiledMonkeyBallProject` contains `tuning`, `manifest`, `levels: Record<string, Level>`, and the source snapshot.

- [ ] **Step 6: Implement the importer and compiler**

The importer creates stable IDs using existing UID helpers, otherwise `geometry:<index>` / `entity:<index>`, with `marker:spawn` and `marker:goal`. Euler degrees from legacy files convert to radians in `core.transform`; the compiler converts back to degrees. Friction lives in `core.collider`. Legacy archetype names/overrides live in `monkey-ball.archetype`.

The compiler rejects scenes without spawn/goal or geometry, converts scene entities back into current `Level` values for reuse by gameplay, and compiles physics/world resources into current runtime types.

- [ ] **Step 7: Add and run the deterministic content generator**

`scripts/build-project.ts` reads current public legacy data, calls the importer, and writes `projectFileDocuments(snapshot)` using stable two-space JSON plus trailing newline. It accepts `--source` and `--out` arguments so Task 18 can point it at retained legacy test fixtures.

Run:

```bash
npx tsx games/monkey-ball/scripts/build-project.ts --source games/monkey-ball/public/data --out games/monkey-ball/public/project
```

Expected: manifest, six scenes, and two resources are written.

`scripts/validate-project.ts` loads `games/monkey-ball/public/project`, validates/compiles all scenes/resources, prints structured errors to stderr, and exits nonzero on any error.

- [ ] **Step 8: Add content tests against generated files**

Load `games/monkey-ball/public/project` through an fs-backed `ProjectFileReader`, validate it, compare its canonical bundle with a fresh legacy import, and assert all six levels compile and run their existing baselines.

- [ ] **Step 9: Run focused Monkey Ball tests and typecheck**

Run: `npx vitest run --project monkey-ball --testNamePattern="legacy project importer|Monkey Ball project compiler|Monkey Ball project content" && npm run validate:project -w monkey-ball && npm run typecheck -w monkey-ball`

Expected: all new project/import/parity tests PASS; typecheck exits 0.

- [ ] **Step 10: Commit**

```bash
git add games/monkey-ball/package.json games/monkey-ball/src/project games/monkey-ball/scripts games/monkey-ball/tests/project games/monkey-ball/public/project package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(monkey-ball): migrate content to generic project"
```

---

## Phase 4 — runtime and single-editor cutovers

### Task 12: Make Pulsebreak runtime consume the compiled project

**Files:**
- Modify: `games/pulsebreak/package.json`
- Create: `games/pulsebreak/src/project/editor.ts`
- Create: `games/pulsebreak/src/project/evaluation.ts`
- Modify: `games/pulsebreak/src/project/index.ts`
- Modify: `games/pulsebreak/src/game/context.ts`
- Modify: `games/pulsebreak/src/game/gameplay.ts`
- Modify: `games/pulsebreak/src/sim/arena.ts`
- Modify: `games/pulsebreak/src/sim/spawn.ts`
- Modify: `games/pulsebreak/src/sim/upgrades.ts`
- Modify: `games/pulsebreak/src/sim/headlessRun.ts`
- Modify: `games/pulsebreak/src/state/run.ts`
- Modify: `games/pulsebreak/src/state/root.ts`
- Modify: `games/pulsebreak/src/systems/{collision,director,enemyAI,enemyWeapon,playerWeapon,projectiles}.ts`
- Modify: `games/pulsebreak/src/ui/hud.ts`
- Modify: `games/pulsebreak/src/main.ts`
- Modify: `games/pulsebreak/src/index.ts`
- Modify: `games/pulsebreak/tests/helpers/ctx.ts`
- Modify: `games/pulsebreak/tests/game/gameplay.test.ts`
- Modify: `games/pulsebreak/tests/sim/spawn.test.ts`
- Modify: `games/pulsebreak/tests/state/{root,run}.test.ts`
- Modify: `games/pulsebreak/tests/systems/{collision,director,enemyAI,enemyWeapon,playerControl,playerWeapon,projectiles}.test.ts`
- Modify: `games/pulsebreak/tests/ui/hud.test.ts`
- Create: `games/pulsebreak/tests/project/editor.test.ts`
- Create: `games/pulsebreak/tests/project/runtimeParity.test.ts`
- Modify: `e2e/pulsebreak.spec.ts`

- [ ] **Step 1: Write failing runtime-injection tests**

Clone the default compiled config, change arena half-size, player speed/damage, wave counts, projectile lifetime, and enemy speed, then prove each affected system uses the injected value. Add a gameplay test whose floor/camera/grid come from compiled project data rather than constants.

```ts
const config = { ...defaultConfig, arena: { ...defaultConfig.arena, half: 5 } }
const ctx = playingCtx({ config, input: { x: 1, y: 0 }, dt: 1 })
const player = spawnPlayer(ctx.world, config)
createPlayerControl().run(ctx)
expect(player.transform!.position.x).toBe(5)
```

- [ ] **Step 2: Write failing editor registration/evaluation tests**

Assert the registration has no Pulsebreak-specific DOM, exposes Floor/Player Start/Spawn Zone prefabs, creates gameplay from a compiled unsaved snapshot, and returns normalized headless evaluation. Mutate wave 1 in a snapshot and assert preview/evaluation sees the mutation.

- [ ] **Step 3: Run focused tests and observe red**

Run: `npx vitest run --project pulsebreak --testNamePattern="project runtime parity|Pulsebreak editor registration"`

Expected: FAIL because gameplay still imports module constants and editor registration does not exist.

- [ ] **Step 4: Thread compiled config through store and game context**

Add `config: PulsebreakCompiledProject` to `GameCtx` and `GameplayDeps`. Replace `initialRun` with `initialRun(config)` and `runReducer` with `createRunReducer(config)`. Build root slices/reducer inside `createGameStore({ config, storage })`; default to `compilePulsebreakTemplate()` only for tests/backward-compatible callers during this task. Upgrade application reads `config.upgradeStep`.

- [ ] **Step 5: Replace gameplay/system constant reads**

Make spawn/arena helpers accept config explicitly and make systems read `ctx.config`. `createGameplay` builds floor/camera/grid from compiled scene/config and passes config into context. `createHud(store, waveCount)` receives `config.waves.length`. `chooseUpgrades(rng, ids, count)` receives compiled upgrade IDs instead of module `UPGRADE_IDS`.

Update every affected test to obtain `defaultPulsebreakCompiledProject` from `src/project/template.ts` instead of importing authored values from `config.ts`. Tests that customize data clone the default.

- [ ] **Step 6: Implement deterministic zone spawning**

Replace `ringPosition` with:

```ts
export function spawnPositions(
  zones: readonly SpawnZone[], enemyTypeId: EnemyKind, count: number, rng: Rng
): Vec3[]
```

Filter eligible zones, sort by ID, perform weighted selection, then sample ring/point mode. Ring sampling preserves the current per-index base angle plus configured jitter and edge padding. Enforce minimum separation with a fixed maximum of eight retries, consuming the same number/order of RNG calls for a fixed project/seed. On exhaustion use the zone center. Add golden fixed-seed expectations to `spawn.test.ts`.

- [ ] **Step 7: Add browser project loading and editor registration**

`main.ts` creates a prefixed `ProjectFileReader` over `fetch('/project/' + path)`, awaits `loadPulsebreakProject`, then creates store/game/HUD with the compiled result. `editor.ts` adds prefabs and a preview adapter using keyboard input; runtime-safe `evaluation.ts` runs `createHeadlessRun({ config })` and maps victory/defeat/incomplete to normalized outcome/score/metrics without importing editor. The editor registration wraps that function.

Add package export `./editor` -> `./src/project/editor.ts` and dependency `@automata/editor`. Normal `src/main.ts` imports only `./project`, not `@automata/editor`.

`main.ts` already wires the `@automata/game-kit` View/shell; edit it in place so the compiled project feeds that existing shell. Do not revert to a pre-game-kit composition.

- [ ] **Step 8: Run the complete Pulsebreak and root CI gates**

Run: `npx vitest run --project pulsebreak && npm run typecheck -w pulsebreak && npm run ci`

Expected: all Pulsebreak tests and root CI PASS.

- [ ] **Step 9: Commit**

```bash
git add games/pulsebreak e2e/pulsebreak.spec.ts package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(pulsebreak): boot gameplay from authored project"
```

- [ ] **Step 10: Manual Pulsebreak runtime checkpoint — stop and wait**

Run: `npm run dev:pulsebreak`

Verify in desktop Chromium:

- Title -> start -> HUD -> pause/resume works.
- Wave 1 spawns around authored zones and the boss uses the boss point.
- Upgrade selection advances waves.
- No console exceptions or failed project-file requests.

Stop here. Continue only after the user confirms the Pulsebreak runtime checkpoint passes.

### Task 13: Make Monkey Ball runtime consume the compiled project

**Files:**
- Create: `games/monkey-ball/src/project/editor.ts`
- Create: `games/monkey-ball/src/project/evaluation.ts`
- Modify: `games/monkey-ball/src/project/index.ts`
- Modify: `games/monkey-ball/src/scenes/boot.ts`
- Modify: `games/monkey-ball/src/scenes/levelLifecycle.ts`
- Modify: `games/monkey-ball/src/main.ts`
- Modify: `games/monkey-ball/src/index.ts`
- Modify: `games/monkey-ball/src/headless.ts`
- Create: `games/monkey-ball/tests/project/editor.test.ts`
- Create: `games/monkey-ball/tests/project/runtimeParity.test.ts`
- Modify: `games/monkey-ball/tests/scenes/boot.test.ts`
- Modify: `games/monkey-ball/tests/scenes/levelLifecycle.test.ts`
- Modify: `games/monkey-ball/tests/content/{levels,baseline}.test.ts`
- Modify: `e2e/game.spec.ts`

- [ ] **Step 1: Write failing boot/lifecycle tests**

Assert `loadBootData(loader, projectReader)` reads six scene files and two resources through `projectReader`, and the existing archetype YAML through `DataLoader`; it must not request physics TOML, worlds JSON, or legacy level JSON. Assert selecting `w1-l1` resolves `compiled.levels['w1-l1']` without another fetch and stale scene transitions still refuse to mount.

- [ ] **Step 2: Write failing registration/evaluation tests**

Assert the editor registration exposes box/cylinder/banana/bumper/moving-platform/spawn/goal prefabs, compiles the active scene, creates gameplay with injected archetype library/physics tuning, and evaluates through the existing headless runner. Modify a project scene before preview and assert the created level contains the modification.

- [ ] **Step 3: Run focused tests and observe red**

Run: `npx vitest run --project monkey-ball --testNamePattern="project runtime parity|Monkey Ball editor registration|loadBootData|loadRequestedLevel"`

Expected: FAIL because boot/lifecycle still load legacy data and editor registration is legacy-shaped.

- [ ] **Step 4: Cut boot and lifecycle over to project data**

`BootData` becomes `{ project: CompiledMonkeyBallProject; lib: ArchetypeLibrary }`. `loadBootData(loader, projectReader)` loads/compiles the project through the reader and separately loads `standard.yaml` through the existing `DataLoader`. In `main.ts`, create the reader from `fetchTextViaFetch()` with a `/project/` prefix and pass both dependencies. `loadRequestedLevel` accepts compiled project data and returns the selected in-memory level after the existing state/epoch checks; it no longer performs I/O.

Update menu/level-select consumers to use `boot.project.manifest`; gameplay receives `boot.project.tuning` and compiled levels.

`main.ts` already wires the `@automata/game-kit` View/shell; thread the project reader and compiled boot data through that existing shell rather than reintroducing the pre-game-kit composition.

- [ ] **Step 5: Implement editor registration and normalized evaluation**

Prefabs are declarative generic entities. Preview compiles the current snapshot, selects the active scene, and delegates to existing `createGameplay`. Runtime-safe evaluation compiles and calls `runHeadlessPlay`; map completed/gameOver/incomplete to passed/failed/incomplete and expose time/falls/bananas in `metrics` with score derived from completion and falls. `editor.ts` wraps the evaluator but the evaluator itself imports no editor APIs.

Export `./editor` and keep `./headless` compatibility exports until Task 18.

- [ ] **Step 6: Repoint content tests to shipped project data**

Existing level/baseline tests load compiled project scenes rather than public legacy level files. Keep importer tests as the proof that old JSON converts correctly. Assert no production source path contains `/data/levels/` or `/data/config/physics.toml` after the cutover.

- [ ] **Step 7: Run complete Monkey Ball and root CI gates**

Run: `npx vitest run --project monkey-ball && npm run typecheck -w monkey-ball && npm run ci`

Expected: all Monkey Ball tests and root CI PASS.

- [ ] **Step 8: Commit**

```bash
git add games/monkey-ball e2e/game.spec.ts package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(monkey-ball): boot gameplay from authored project"
```

- [ ] **Step 9: Manual Monkey Ball runtime checkpoint — stop and wait**

Run: `npm run dev:game`

Verify in desktop Chromium:

- Menu and world/level select show all six project scenes in the expected worlds.
- Start `w1-l1`, collect a banana, pause/resume, reach the goal, and return to level select.
- Start one moving-platform level and confirm platform/bumper behavior.
- No console exceptions or legacy level/config requests.

Stop here. Continue only after the user confirms the Monkey Ball runtime checkpoint passes.

### Task 14: Cut `tools/level-editor` over to one multi-game project app

**Files:**
- Modify: `tools/level-editor/package.json`
- Modify: `tools/level-editor/vite.config.ts`
- Create: `tools/level-editor/src/projectCatalog.ts`
- Create: `tools/level-editor/src/browserWorkspace.ts`
- Create: `tools/level-editor/src/legacyAutosave.ts`
- Create: `tools/level-editor/src/editorApp.ts`
- Rewrite: `tools/level-editor/src/main.ts`
- Modify: `tools/level-editor/tests/layout.test.ts`
- Create: `tools/level-editor/tests/projectCatalog.test.ts`
- Create: `tools/level-editor/tests/browserWorkspace.test.ts`
- Create: `tools/level-editor/tests/legacyAutosave.test.ts`
- Modify: `e2e/editor.spec.ts`

- [ ] **Step 1: Write failing catalog and browser-workspace tests**

Catalog tests assert exactly Monkey Ball and Pulsebreak registrations, unique IDs, and template `gameId` consistency. Browser-workspace tests inject `showDirectoryPicker`, download, file input, IndexedDB, and permission callbacks; assert folder open, bundle fallback, recent reopen, denied permission, and download URL revocation. Legacy-autosave tests seed `monkey-ball-editor`, recover it through `importLegacyMonkeyBallProject`, and prove the old key remains until a successful workspace save or bundle export.

- [ ] **Step 2: Rewrite the e2e test to express the generic workflow**

Use two tests:

```ts
test('creates and edits a Pulsebreak project', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175/?game=pulsebreak')
  await page.getByRole('button', { name: 'Create Pulsebreak Project' }).click()
  await page.getByText('arena').click()
  await page.getByText('Spawn Zone').click()
  await page.locator('[data-vp="main"] canvas').click({ position: { x: 180, y: 180 } })
  await page.getByRole('button', { name: 'Export Bundle' }).click()
  await expect(page.locator('[data-save-status]')).toContainText(/Exported/)
})

test('opens Monkey Ball in the same editor shell', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175/?game=monkey-ball')
  await page.getByRole('button', { name: 'Create Monkey Ball Project' }).click()
  await expect(page.locator('[data-project-hierarchy]')).toContainText('w1-l1')
  await expect(page.locator('[data-project-resources]')).toContainText('Physics')
})
```

- [ ] **Step 3: Run focused tests/e2e and observe red**

Run: `npx vitest run --project level-editor && npx playwright test e2e/editor.spec.ts`

Expected: FAIL because the host still boots Monkey Ball directly and has no chooser/catalog.

- [ ] **Step 4: Implement the catalog and browser capability adapter**

`projectCatalog.ts` imports only `monkey-ball/editor` and `pulsebreak/editor`, registers them through `registerEditorProject`, and exports a lookup by `gameId`. It contains no behavior branches. `browserWorkspace.ts` converts browser directory handles/downloads/file inputs/IndexedDB into tested project storage adapters.

`legacyAutosave.ts` is the one explicit migration seam: it detects the version-1 `monkey-ball-editor` payload, parses its legacy level, imports a new Monkey Ball project with that scene active, and exposes a Recover action in the chooser. It never runs inside editor core and deletes the old key only after the new project is explicitly saved/exported.

- [ ] **Step 5: Implement `mountEditorApp`**

`editorApp.ts` owns chooser/session transitions and cleanup. It creates renderer/physics/canvases only after a project opens, mounts `renderProjectChrome`, installs project autosave, wires import/export/save callbacks, pointer/key handling, fly controls, and the loop. Switching or closing a dirty project requires Save, Export, or Discard; cancellation keeps the current session mounted. Switching projects disposes the full previous session before mounting another. URL query parsing preselects a game/recent project but never bypasses validation.

- [ ] **Step 6: Reduce `main.ts` to browser composition**

`main.ts` obtains `#app`, constructs the catalog/browser workspace, calls `mountEditorApp`, handles `beforeunload`, and renders boot errors. Remove Monkey Ball boot data, legacy autosave key, `GameDefinition<Level>`, and legacy chrome usage. Update dependencies to include `@automata/project`, `pulsebreak`, and both editor exports.

- [ ] **Step 7: Run editor/host tests, e2e, CI, and coverage**

Run:

```bash
npx vitest run --project editor --project level-editor
npx playwright test e2e/editor.spec.ts
npm run ci
npm run coverage
```

Expected: all commands PASS and coverage remains at least 90% lines/branches.

- [ ] **Step 8: Commit**

```bash
git add tools/level-editor packages/editor e2e/editor.spec.ts package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor): launch one multi-game project editor"
```

- [ ] **Step 9: Manual generic editor/storage checkpoint — stop and wait**

Run: `npm run dev:editor`

Verify in desktop Chromium:

- Chooser offers both games; `?game=pulsebreak` and `?game=monkey-ball` preselect correctly.
- Pulsebreak hierarchy/resources/first-class wave table render and edit.
- Monkey Ball hierarchy/resources render and edit in the same shell.
- Add/move/delete entities; add/remove components; edit a table; undo/redo each.
- Play/Stop uses unsaved edits for both games.
- Open a folder, save, reload from disk, and verify only dirty files changed.
- Deny folder permission and verify bundle import/export fallback.
- Reload and recover each project from namespaced autosave/recent entries.
- No game-specific shared editor labels, failed requests, or console exceptions.

Stop here. Continue only after the user confirms the editor checkpoint passes.

---

## Phase 5 — generic agent and MCP surfaces

### Task 15: Add project command contracts and a project ToolHost beside legacy tools

**Files:**
- Modify: `packages/contracts/package.json`
- Create: `packages/contracts/src/projectCommand.ts`
- Create: `packages/contracts/src/projectEval.ts`
- Create: `packages/contracts/src/projectTools.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tests/projectCommand.test.ts`
- Create: `packages/contracts/tests/projectEval.test.ts`
- Create: `packages/contracts/tests/projectTools.test.ts`
- Modify: `eslint.config.js`
- Create: `packages/editor/src/project/toolHost.ts`
- Modify: `packages/editor/src/project/registration.ts`
- Create: `packages/editor/tests/project/toolHost.test.ts`
- Modify: `packages/editor/src/headless.ts`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing project-contract tests**

Assert `@automata/contracts` re-exports the same `ProjectCommand` schema/type identity from `@automata/project`, and the new project tool schemas parse valid project operations while rejecting missing IDs, invalid JSON Pointers, negative array indices, and unknown tools. Existing level contracts stay exported until Task 18 so every commit remains root-green.

Lock the tool names:

```ts
const expected: ProjectToolName[] = [
  'addEntity', 'removeEntities', 'reparentEntity', 'addComponent', 'removeComponent',
  'addResource', 'removeResource', 'setProperty', 'insertArrayItem', 'removeArrayItem',
  'moveArrayItem', 'getProject', 'getHierarchy', 'getResources', 'validate', 'evaluate'
]
expect(projectToolDefs().map((tool) => tool.name)).toEqual(expected)
```

Lock resource URIs to `editor://project`, `editor://hierarchy`, `editor://resources`, `editor://validation`, and `editor://baseline`.

- [ ] **Step 2: Write failing sandbox project ToolHost tests**

Using the fake registration/snapshot, assert writes mutate only the sandbox, record exact `ProjectCommand[]`, expected command failures leave snapshot/commands unchanged, read tools/resources return generic project data, validation is structured, evaluation delegates to registration, and a registration without evaluation returns an error result.

- [ ] **Step 3: Run focused tests and observe red**

Run: `npx vitest run --project contracts --project editor --testNamePattern="project command contract|project tools|project ToolHost"`

Expected: FAIL because the additive project contract/ToolHost modules do not exist.

- [ ] **Step 4: Add project contracts without breaking legacy consumers**

Add `@automata/project` dependency. Change the contracts ESLint rule to permit only `@automata/project` as an internal import while still forbidding engine/editor/games/tools. Re-export project commands/schemas from `projectCommand.ts`. Define normalized `ProjectEvaluationResult` plus `{ maxSteps: positive integer }` options in `projectEval.ts`.

In `projectTools.ts`, prefix shared names during coexistence: `ProjectToolName`, `ProjectToolHost`, `PROJECT_RESOURCE_URIS`, `projectToolDefs`, and `parseProjectToolArgs`. Derive write-tool argument schemas from project command schemas with `type` omitted. Read/evaluate schemas stay local. Tool descriptions use project/entity/component/resource terminology only. Keep current `command.ts`, `eval.ts`, and `tools.ts` untouched until Task 18. Repoint `EditorProjectRegistration` to the contracts-owned `ProjectEvaluationResult` so editor, agent, and MCP share one normalized type.

- [ ] **Step 5: Implement `createProjectToolHost`**

Options are `{ registration, initialSnapshot, baseline? }`. Write tools parse args, construct a project command, apply it atomically, and append only semantic changes. Read tools return canonical hierarchy/resources rather than viewport items. `evaluate` parses `maxSteps`, validates first, then delegates to registration evaluation. Expose readonly `snapshot` and `commands`.

- [ ] **Step 6: Run contracts/editor tests and typechecks**

Run:

```bash
npx vitest run --project contracts --project editor
npm run typecheck -w @automata/contracts
npm run typecheck -w @automata/editor
npm run typecheck
```

Expected: all tests PASS; package and root typechecks exit 0; legacy editor-agent/MCP tests remain green on the coexistence exports.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts packages/editor/src/project/toolHost.ts packages/editor/src/project/registration.ts packages/editor/src/headless.ts packages/editor/tests/project/toolHost.test.ts eslint.config.js package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(contracts): expose generic project tools"
```

### Task 16: Migrate editor-agent diff, chat, and tuning to project snapshots

**Files:**
- Rewrite: `packages/editor-agent/src/diff.ts`
- Rewrite: `packages/editor-agent/src/tuningRunner.ts`
- Modify: `packages/editor-agent/src/chatOverlay.ts`
- Modify: `packages/editor-agent/src/index.ts`
- Move: `packages/editor-agent/tests/fixtures/fakeDefinition.ts` to `packages/editor-agent/tests/fixtures/fakeProject.ts`
- Rewrite: `packages/editor-agent/tests/diff.test.ts`
- Rewrite: `packages/editor-agent/tests/tuningRunner.test.ts`
- Modify: `packages/editor-agent/tests/chatOverlay.test.ts`
- Modify: `packages/agent-core/src/index.ts`
- Delete: `packages/agent-core/src/tuning/fitness.ts`
- Delete: `packages/agent-core/src/tuning/seekGoalPlayer.ts`
- Delete: `packages/agent-core/tests/tuning/fitness.test.ts`
- Delete: `packages/agent-core/tests/tuning/seekGoalPlayer.test.ts`
- Modify: `games/monkey-ball/src/project/evaluation.ts`
- Modify: `games/monkey-ball/tests/project/editor.test.ts`

- [ ] **Step 1: Write failing project-diff tests**

Diff two snapshots and report changes across scenes, entities, components, resources, and properties. Stable labels must look like `scene:w1-l1`, `entity:arena/spawn-east`, `component:spawn-east/pulsebreak.spawn-zone`, and `resource:waves`. Counts cover added/removed/modified and output ordering is stable.

- [ ] **Step 2: Write failing generic tuning tests**

The tuning runner receives `ProjectEditorCore`, provider, prompt, target score, max steps/iterations, and an injected agent loop. It uses `createProjectToolHost`, validates project snapshots, evaluates through `registration.evaluate`, accepts only improving normalized scores, returns cumulative project commands, and never mutates the live store before approval.

Assert provider-stop/max-turn errors and missing evaluation adapters remain explicit.

- [ ] **Step 3: Update chat-overlay tests first**

Replace fake document/core fixtures with fake project registration/session. Assert command batch preview, generic diff labels, apply dispatch as one `projectCommandBatch`, stale selection reconciliation, Tune visibility only when evaluation exists, and existing provider/settings behavior unchanged.

- [ ] **Step 4: Run editor-agent tests and observe red**

Run: `npx vitest run --project editor-agent`

Expected: FAIL because editor-agent expects `GameDefinition<Doc>`, `SceneCommand`, and document state.

- [ ] **Step 5: Implement generic diff/tuning/chat behavior**

`diffProjects(before, after)` compares canonical project structures by stable IDs. `runTuning` seeds from `core.store.getState().snapshot`, evaluates normalized score, proposes through project ToolHost, and applies nothing. Chat Apply dispatches one project command batch; the store owns undo/selection reconciliation.

- [ ] **Step 6: Remove Monkey-Ball-shaped fitness from agent-core**

Move the seek-goal controller and Monkey Ball score mapping into `games/monkey-ball/src/project/evaluation.ts`, with its tests under Monkey Ball. `@automata/agent-core` retains only provider adapters, agent loop, and generic keep/revert `runTuningLoop<T>`. No `ball`, `goal`, `banana`, `fall`, or Monkey Ball result fields remain in agent-core.

- [ ] **Step 7: Run package and root tests/typecheck**

Run:

```bash
npx vitest run --project agent-core --project editor-agent --project monkey-ball
npm run typecheck -w @automata/agent-core
npm run typecheck -w @automata/editor-agent
npm run ci
```

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/editor-agent packages/agent-core games/monkey-ball/src/project/evaluation.ts games/monkey-ball/tests/project/editor.test.ts
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor-agent): operate on generic projects"
```

### Task 17: Make the MCP server open either game project through a registration catalog

**Files:**
- Modify: `tools/editor-mcp-server/package.json`
- Create: `tools/editor-mcp-server/src/projectCatalog.ts`
- Create: `tools/editor-mcp-server/src/projectReader.ts`
- Rewrite: `tools/editor-mcp-server/src/headlessHost.ts`
- Modify: `tools/editor-mcp-server/src/main.ts`
- Modify: `tools/editor-mcp-server/src/mcpAdapter.ts`
- Modify: `tools/editor-mcp-server/src/server.ts`
- Rewrite: `tools/editor-mcp-server/tests/headlessHost.test.ts`
- Modify: `tools/editor-mcp-server/tests/mcpAdapter.test.ts`
- Modify: `tools/editor-mcp-server/tests/server.test.ts`
- Modify: `tools/editor-mcp-server/tests/smoke.test.ts`
- Modify: `tools/editor-mcp-server/README.md`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing multi-game headless-host tests**

Create a host from Monkey Ball's project directory and Pulsebreak's project directory. Assert `manifest.gameId` selects the matching registration, tools operate on each snapshot, evaluate works, and an unknown game ID reports available IDs. Add bundle JSON input coverage and path traversal/missing file failures.

- [ ] **Step 2: Update protocol tests to generic resources/tools**

Assert MCP list-tools returns the Task 15 names/schemas, resource reads expose project/hierarchy/resources/validation/baseline, invalid args map to MCP `InvalidParams`, unknown resource URIs fail, and write errors set `isError` without mutating the snapshot.

- [ ] **Step 3: Run MCP tests and observe red**

Run: `npx vitest run --project editor-mcp-server`

Expected: FAIL because the server still boots Monkey Ball data/one level directly.

- [ ] **Step 4: Implement catalog and filesystem reader**

Catalog imports headless-capable registrations from `monkey-ball/project` and `pulsebreak/project`, closes evaluation dependencies, and exposes lookup by game ID. `projectReader.ts` adapts a root directory to `ProjectFileReader` with `resolve` containment checks before every read.

- [ ] **Step 5: Rewrite headless host options**

```ts
export interface HeadlessHostOptions {
  projectDir?: string
  bundleJson?: string
  baseline?: unknown
}
```

Exactly one source may be supplied. Default to `games/monkey-ball/public/project` for CLI backward convenience, but report the selected project/game on stderr only. Load/parse, select registration, validate, then create `ProjectToolHost`.

- [ ] **Step 6: Update stdio CLI and README**

Support `--project <directory>` and `--bundle <file>`; reject both together. Keep stdout protocol-clean. Document example Claude/Codex MCP configs for each shipped project and list the generic tools/resources.

- [ ] **Step 7: Run MCP executable/protocol and root gates**

Run:

```bash
npx vitest run --project editor-mcp-server
npm run typecheck -w editor-mcp-server
npm rebuild editor-mcp-server
node_modules/.bin/automata-editor-mcp --help
npm run ci
```

Expected: tests/typechecks/CI PASS; launcher prints usage to stderr and exits 0 without corrupting stdout.

- [ ] **Step 8: Commit**

```bash
git add tools/editor-mcp-server package-lock.json
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "feat(editor-mcp): host generic game projects"
```

---

## Phase 6 — legacy removal, documentation, and release gates

### Task 18: Remove legacy level-editor contracts, files, and public content

**Files:**
- Delete: `packages/editor/src/model/{gameDefinition,types}.ts`
- Delete: `packages/editor/src/agent/editorToolHost.ts`
- Delete: `packages/editor/src/io/{autosave,exportDoc,importDoc,validation}.ts`
- Delete: `packages/editor/src/state/{actions,document,mode,selection,store}.ts`
- Delete: `packages/editor/src/tools/{cardinality,inspector,place,surfaceCycle}.ts`
- Delete: `packages/editor/src/ui/{chrome,inspectorView,menubar,outliner,palette,statusbar,toolbar}.ts`
- Delete: `packages/editor/src/viewport2d/{draw,hit}.ts`
- Delete: `packages/editor/src/viewport3d/worldSync.ts`
- Delete: `packages/editor/tests/agent/editorToolHost.test.ts`
- Delete: `packages/editor/tests/fixtures/{editorHarness,fakeDefinition}.ts`
- Delete: `packages/editor/tests/{host,hostTools,smoke}.test.ts`
- Delete: `packages/editor/tests/io/{autosave,exportDoc,importDoc,validation}.test.ts`
- Delete: `packages/editor/tests/model/fakeDefinition.test.ts`
- Delete: `packages/editor/tests/play/{controller,visibility}.test.ts`
- Delete: `packages/editor/tests/state/{document,store}.test.ts`
- Delete: `packages/editor/tests/tools/{cardinality,inspector,place,surfaceCycle}.test.ts`
- Delete: `packages/editor/tests/ui/{chrome,inspectorView,menubar,outliner,palette,statusbar,toolbar}.test.ts`
- Delete: `packages/editor/tests/viewport2d/{draw,hit}.test.ts`
- Delete: `packages/editor/tests/viewport3d/worldSync.test.ts`
- Modify: `packages/editor/src/{index,headless,viewport}.ts`
- Modify: `packages/editor/src/ui/index.ts`
- Delete: `packages/contracts/src/{command,eval,tools}.ts` (legacy implementations)
- Move: `packages/contracts/src/{projectCommand,projectEval,projectTools}.ts` to `packages/contracts/src/{command,eval,tools}.ts`
- Modify: `packages/contracts/src/index.ts`
- Delete: `packages/contracts/tests/{command,eval,tools}.test.ts`
- Move: `packages/contracts/tests/{projectCommand,projectEval,projectTools}.test.ts` to `packages/contracts/tests/{command,eval,tools}.test.ts`
- Modify: `packages/contracts/tests/smoke.test.ts`
- Delete: `games/monkey-ball/src/editor/{registration,headlessRegistration,sceneModel}.ts`
- Delete: `games/monkey-ball/tests/editor/{registrationBrowser,registrationPlay,sceneModel,sceneModelEdit,worldSync}.test.ts`
- Move: `games/monkey-ball/public/data/config/physics.toml` to `games/monkey-ball/tests/fixtures/legacy/config/physics.toml`
- Move: `games/monkey-ball/public/data/levels/{worlds,w1-l1,w1-l2,w1-l3,w2-l1,w2-l2,w2-l3}.json` to `games/monkey-ball/tests/fixtures/legacy/levels/`
- Modify: `games/monkey-ball/src/project/{legacyImporter,types,compiler}.ts`
- Create: `games/monkey-ball/src/project/legacyTypes.ts`
- Modify: `games/monkey-ball/scripts/build-project.ts`
- Modify: `games/monkey-ball/src/{index,headless}.ts`
- Delete: `games/pulsebreak/src/config.ts`
- Modify: `README.md`
- Modify: `games/pulsebreak/README.md`
- Create: `tools/level-editor/README.md`
- Create: `tools/level-editor/tests/boundaries.test.ts`
- Modify: `AGENTS.md`
- Modify: `vitest.config.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: Add failing architecture/deletion guards**

Add focused smoke tests or source guards that fail while legacy surfaces remain:

```ts
expect(editorHeadless).not.toHaveProperty('GameDefinition')
expect(editorHeadless).not.toHaveProperty('SceneModel')
expect(contracts).not.toHaveProperty('SceneCommand')
expect(contracts).not.toHaveProperty('TestPlayResult')
```

Add a repo source test under `tools/level-editor/tests/boundaries.test.ts` that scans `packages/editor/src` and fails on `monkey-ball`, `pulsebreak`, `GameDefinition`, `SceneModel`, or legacy `SceneCommand` tokens outside migration comments.

- [ ] **Step 2: Run guards and observe red**

Run: `npx vitest run --project editor --project contracts --project level-editor --testNamePattern="legacy|boundary"`

Expected: FAIL because legacy exports/files still exist.

- [ ] **Step 3: Remove legacy editor path and normalize generic exports**

Delete superseded files/tests, update project modules to import shared fly camera/ray/projection helpers directly, and make root/headless/UI exports project-first. Rename temporary Task 15 prefixed project ToolHost names to the canonical `ToolHost`, `ToolName`, `toolDefs`, and `RESOURCE_URIS` only after all consumers use them.

Keep reusable `grid.ts`, viewport projection/browser paint, fly camera/controls/ray/AABB, panel/theme primitives, state `tool.ts`, and state `ui.ts` where the project editor still imports them.

- [ ] **Step 4: Retain legacy import fixtures without shipping them**

Use `git mv` to move physics TOML, worlds JSON, and six legacy level JSON files into `games/monkey-ball/tests/fixtures/legacy/` with the same relative `config/` and `levels/` layout. Update importer tests/generator source argument. Leave `public/data/archetypes/standard.yaml` in place because it remains a runtime asset registry, not an editor level document.

Move legacy `Level`/physics parse schemas into private `games/monkey-ball/src/project/legacyTypes.ts`; do not export them from package root/headless. Compiled runtime types live in `src/project/types.ts`.

- [ ] **Step 5: Remove Pulsebreak authored constants**

Delete `config.ts`. All runtime/tests use `PulsebreakCompiledProject` and `defaultPulsebreakCompiledProject`; algorithms may retain numeric invariants only when they are not authored values (for example fixed retry count and fixed timestep).

- [ ] **Step 6: Strengthen ESLint boundaries and coverage**

Update messages from “registers itself via GameDefinition” to project-registration terminology. Forbid both game names under `packages/project`, `packages/editor`, and `packages/contracts`; allow `contracts -> project` only. Ensure root coverage includes all new project/editor logic and excludes only the already-approved browser shims/main files.

- [ ] **Step 7: Update user-facing documentation and task board**

Document one editor command (`npm run dev:editor`), chooser/deep links, folder/bundle workflow, schema-generated components/resources, project directory format, both game project locations, and MCP `--project`. In `AGENTS.md`, add the generic project editor milestone and mark it complete only after this task's tests pass; preserve all prior completed milestones.

- [ ] **Step 8: Run deletion guards, full tests, typecheck, and coverage**

Run:

```bash
! rg -n "GameDefinition|SceneModel|SceneCommand|TestPlayResult|monkey-ball|pulsebreak" packages/editor/src packages/project/src
npm run ci
npm run coverage
```

Expected: `rg` reports no forbidden shared-editor/project dependencies or legacy types; CI PASS; coverage is at least 90% lines/branches.

- [ ] **Step 9: Commit**

```bash
git add packages/editor packages/contracts packages/project games/monkey-ball games/pulsebreak tools/level-editor README.md AGENTS.md eslint.config.js vitest.config.ts docs/superpowers/plans/2026-06-27-generic-project-editor.md
git commit -m "refactor(editor): remove legacy game-shaped editor path"
```

### Task 19: Run complete release verification and close the plan

**Files:**
- Modify: `docs/superpowers/plans/2026-06-27-generic-project-editor.md` (final checkboxes)
- Modify: `AGENTS.md` only if final gate results require status correction

- [ ] **Step 1: Run fresh static and unit gates**

Run:

```bash
git diff --check
npm run ci
npm run coverage
```

Expected: diff check clean; lint/typecheck/tests PASS; coverage at least 90% lines and branches.

- [ ] **Step 2: Run all browser e2e gates**

Run: `npm run e2e`

Expected: Monkey Ball, Pulsebreak, and both editor project workflows PASS with zero unexpected page errors.

- [ ] **Step 3: Build every production app**

Run: `npm run build`

Expected: exits 0 and creates:

- `games/monkey-ball/dist/index.html`
- `games/pulsebreak/dist/index.html`
- `tools/level-editor/dist/index.html`

- [ ] **Step 4: Verify the MCP executable against both shipped projects**

Run one protocol smoke through the existing test harness for each directory:

```bash
npx vitest run --project editor-mcp-server --testNamePattern="Monkey Ball project|Pulsebreak project|stdio smoke"
```

Expected: both project catalogs and stdio smoke PASS.

- [ ] **Step 5: Serve production builds for the final manual checkpoint — stop and wait**

Serve the three `dist/` outputs on separate loopback ports using `npx vite preview` and their package Vite configs. Verify:

- Production editor chooser opens both games.
- Folder open/save and bundle fallback work in the production editor build.
- Pulsebreak: edit a spawn zone/wave, play unsaved, export/reload, then launch production game.
- Monkey Ball: edit geometry/goal, play unsaved, export/reload, then launch production game.
- Both production games load only project data and show no console/network errors.
- Mobile-sized Pulsebreak still shows joystick/HUD and pauses correctly.

Stop here. Continue only after the user confirms the production checkpoint passes.

- [ ] **Step 6: Close trackers and commit final verification state**

Mark every completed checkbox in this plan. Confirm the generic editor milestone remains checked in `AGENTS.md`. Run `git diff --check` once more.

```bash
git add docs/superpowers/plans/2026-06-27-generic-project-editor.md AGENTS.md
git commit -m "docs(editor): complete generic project editor plan"
```

## Completion definition

The work is complete only when all nineteen tasks are checked, every documented commit exists, all three manual checkpoints plus the production checkpoint have explicit user approval, the four root gates pass fresh, and neither shared project/editor code nor its UI imports or branches on a shipped game.
