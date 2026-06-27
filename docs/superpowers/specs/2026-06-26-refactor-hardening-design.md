# AutomataEngine Refactor Hardening Design

> **Status: Designed (approved 2026-06-26).** This is a behavior-preserving
> hardening pass over the completed M0-M16 implementation. Every behavior change
> lands test-first; performance changes must preserve the existing ports and
> gameplay/editor contracts.

## Context

The completed project passes its current CI and coverage gates, but the final
architecture audit found seven gaps:

1. camera and editor movement depend on render frequency;
2. editor commands can report success without changing the document;
3. game and tool production code is absent from coverage accounting;
4. browser resources have no single lifecycle owner;
5. repeated renderables allocate and destroy duplicate Three.js resources;
6. every editor document edit rebuilds the entire preview world; and
7. package barrels and the ECS wrapper expose broader implementation detail than
   headless consumers need.

This pass fixes all seven. It does not replace the store, scheduler, ECS model,
renderer, physics engine, editor command model, or agent loop.

## Goals

- Make visible motion independent of display refresh rate.
- Make command success mean that a real, valid mutation occurred.
- Make browser teardown complete and idempotent.
- Reuse render resources across entity churn.
- Synchronize changed editor entities without rebuilding unaffected entities.
- Keep Miniplex and browser/provider-heavy modules behind explicit package seams.
- Enforce coverage over all testable production code.

## Architecture

### 1. One timing owner

`GameLoop` remains the only animation-frame owner. Its render hook gains a
second argument, `frameDt`, containing non-negative, clamped wall-clock seconds
since the prior tick. The fixed-step accumulator continues to use the existing
`fixedDt` and `maxSubSteps` protection.

Gameplay threads `frameDt` through `Gameplay.render`, `PlayHandle.render`, and
`GameCtx`. Camera follow uses exponential smoothing:

```ts
const factor = 1 - Math.exp(-responsePerSecond * frameDt)
```

The response constant is calibrated to match the current 0.1-per-frame feel at
60 Hz. The first camera sample still snaps to its initial target. Tests compare
equal elapsed time at 60 Hz and 120 Hz, rather than equal frame counts.

Editor fly controls stop creating their own `requestAnimationFrame` chain. The
browser adapter only owns key/pointer listeners and exposes `update(dt)`. The
level-editor composition root calls that update from `GameLoop.fixedUpdate`, so
movement speed is expressed in units per second and all animation stops through
one loop driver.

### 2. Effective command semantics

`SceneModel.apply` keeps its existing `Doc -> Doc` API and uses reference
identity as the effect signal, matching the editor's existing dirty-flag
contract:

- invalid targets throw `CommandError`;
- valid commands that would not change a value return the original document;
- duplicate added IDs throw `CommandError`;
- empty command sets return the original document.

The document reducer does not create history for an unchanged result. The
editor ToolHost records only effective commands and returns `changed: false`
for a valid no-op. A missing target returns an error and is never recorded.
Command batches remain atomic in the live editor reducer.

### 3. Complete lifecycle ownership

Add a small engine `CleanupStack`: callbacks register as resources are created,
run in LIFO order, and run at most once. It is the only new lifecycle primitive.

Both browser composition roots use one stack for subscriptions, DOM listeners,
scene-manager stop functions, fly controls, loop drivers, editor/game handles,
canvas renderers, renderer ports, and physics ports. Boot failure disposes the
partially-created stack before rendering the error panel. `beforeunload` invokes
the same idempotent cleanup path.

`SceneManager` becomes generic in its scene ID and requires a complete scene
record. Unknown scene IDs are therefore compile-time errors instead of silent
optional lookups. Monkey Ball keeps async level loading in its existing guarded
lifecycle helper, while the playing scene owns mounting and unmounting the
active level.

### 4. Flyweight geometry and pooled meshes

`createThreeRenderer` owns two renderer-lifetime caches:

- a geometry flyweight cache keyed by primitive dimensions; and
- a detached mesh pool keyed by full renderable definition, including color.

Adding an entity reuses a pooled mesh when available or creates a mesh with a
cached geometry. Removing an entity resets highlight and transform state,
detaches the mesh, and returns it to the pool. Geometry is never disposed by an
individual entity removal. Renderer disposal destroys active and pooled
materials exactly once, disposes each cached geometry exactly once, and clears
all maps. This bounds allocations at the peak simultaneous count for each
renderable definition and directly covers short-lived particles and level
respawns.

The public `RenderPort` does not change.

### 5. ID-keyed incremental editor world synchronization

`GameDefinition` gains an optional `syncWorld(world, previousDoc, nextDoc)` hook.
When present, `createWorldSync` calls it for document changes and only falls back
to a full rebuild when the hook reports that incremental synchronization is not
supported.

Monkey Ball extracts level entity construction into deterministic, stable-ID
seeds. Its sync hook builds previous/next seed maps keyed by `editorId`:

- removed IDs remove one live entity;
- added IDs add one seed;
- changed seeds replace only that entity; and
- metadata-only changes leave the world untouched.

World query subscriptions already connect entity add/remove operations to the
physics and render ports, so replacing one entity updates both adapters without
new adapter methods. Selection highlighting is re-applied after synchronization.

### 6. Real ECS facade and narrow package entry points

`packages/engine/src/ecs/world.ts` stops re-exporting Miniplex's `World` type.
It exposes engine-owned `World` and `EntityQuery` interfaces containing only the
operations used by engine/game/editor code: `add`, `remove`, `clear`, `has`,
`entities`, `with`, iteration, `first`, and add/remove subscriptions. Miniplex
is instantiated and adapted only inside that module.

Backward-compatible root exports remain, while package export maps add narrow
entry points for headless consumers:

- `@automata/engine/data` for parsing/data contracts;
- `@automata/editor/headless` for `GameDefinition`, validation, and ToolHost;
- `monkey-ball/editor` for the Monkey Ball editor registration; and
- `@automata/contracts` directly for headless evaluation types.

The MCP server migrates to these entry points. Monkey Ball headless play imports
evaluation types directly from `@automata/contracts`. Browser/provider modules
are no longer instantiated through a headless import path.

### 7. Coverage as a refactoring gate

Root coverage includes:

- `packages/*/src/**` as today;
- `games/monkey-ball/src/**`; and
- `tools/editor-mcp-server/src/**`.

The intended browser-only shims remain excluded: app `main.ts` files,
`**/browser.ts`, index barrels, and version files. Any newly exposed gap is
closed with focused behavior tests; thresholds remain at 90% lines and 90%
branches.

## Error handling

- Negative or repeated loop timestamps produce `frameDt = 0`.
- Large frame gaps are clamped to the same maximum interval used to protect the
  fixed-step accumulator.
- Cleanup continues through all registered callbacks even if one throws, then
  reports the first error after the stack is drained.
- Command target errors remain domain errors (`CommandError`) and are converted
  to structured ToolHost failures at the host boundary.
- Incremental world synchronization falls back to a full rebuild only when a
  game definition explicitly lacks the hook; a throwing hook is not hidden.

## Testing strategy

Every production change follows red-green-refactor.

- **Timing:** loop tests for `frameDt` baseline/clamping and camera/fly-control
  tests proving equal elapsed time gives equal motion across frame rates.
- **Commands:** Monkey Ball scene-model tests for missing/duplicate targets and
  no-op identity; editor reducer/ToolHost tests for no history and no recorded
  command.
- **Lifecycle:** engine tests for LIFO/idempotent/error cleanup and typed scene
  coverage; composition roots remain intentionally thin browser shims.
- **Renderer:** Three adapter tests for shared geometry, exact mesh reuse, state
  reset, and one-time disposal.
- **World sync:** editor tests proving metadata changes preserve entity identity
  and item changes replace only the affected entity.
- **Boundaries:** engine facade tests preserve query/add/remove behavior;
  package typecheck/build verifies narrow exports and headless imports.
- **Coverage:** the expanded coverage command is the red gate; focused tests are
  added until the unchanged thresholds pass.

Final verification is `npm run ci`, `npm run coverage`, and `npm run build`.

## Sequencing

1. Effective command semantics.
2. Centralized timing.
3. Cleanup ownership and typed scenes.
4. Renderer flyweights and mesh pooling.
5. Incremental editor world synchronization.
6. ECS facade and narrow package entry points.
7. Expanded coverage and final verification.

This order lands correctness and safety seams before the broader internal
refactors, while keeping each checkpoint independently testable.
