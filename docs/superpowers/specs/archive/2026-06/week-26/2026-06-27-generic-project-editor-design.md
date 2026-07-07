# Generic Project Editor — Design

> **Status: Approved design (2026-06-27).** This supersedes the assumption in
> the M11–M16 editor documents that the editor may operate on an opaque,
> game-owned level document through `GameDefinition<Doc>`. Existing editor,
> agent, and MCP behavior must remain available through compatibility adapters
> until both shipped games have migrated.

## Context

`packages/editor` contains reusable state, viewport, command, validation, and UI
code, but the only browser host in `tools/level-editor` imports Monkey Ball's
`Level`, boot data, `createMonkeyBallDefinition`, and autosave key directly.
Pulsebreak exposes no editor registration at all; its arena, player and enemy
tuning, waves, upgrades, and procedural spawn rules are TypeScript constants.

That split makes the editor generic in type parameters but not in its authored
data model or product workflow. Supporting Pulsebreak by adding another opaque
document adapter and custom panels would move the game switch without removing
it. The target is instead one Unity/Godot-style Automata editor: a common
project, scene, entity/component, and resource model that any game can register
against without changing editor core or shared UI.

This design establishes that platform and migrates both Monkey Ball and
Pulsebreak as proof that it is not tied to one game or genre.

## Decisions

- The editor owns a universal project model; games do not supply opaque root
  document types.
- Authored scenes contain hierarchical entities with typed component instances.
- Non-spatial authored data is stored as typed resources.
- Component and resource controls are generated from declarative schemas.
- A single browser editor chooses among registered games/projects; there are no
  separate game-specific editor applications.
- The project files edited by the editor are the runtime source of truth.
- Pulsebreak uses authored spawn zones/rules while preserving seeded,
  deterministic placement within those zones.
- Generic project commands are the only mutation path for UI, undo/redo,
  agents, and MCP.
- Game registrations may supply compilers, validation, previews, prefabs, and
  evaluation adapters. They may not replace shared editor panels in this
  effort.

## Goals

- Create a dependency-light `@automata/project` package for persisted project
  data, schemas, commands, immutable edits, validation issues, and bundle I/O.
- Make `@automata/editor` operate on `ProjectSnapshot` rather than
  `GameDefinition<Doc>`.
- Provide one project chooser and one editing shell for all registered games.
- Generate hierarchy, inspector, resource, and table editing from schemas.
- Save project folders directly where the browser permits, with portable bundle
  import/export as the fallback.
- Migrate Pulsebreak arena, spawn, waves, and tuning data out of TypeScript
  constants and into an authored project.
- Migrate Monkey Ball shipped levels and world data into the same format.
- Generalize editor-agent and MCP operations around projects, entities,
  components, resources, and property paths.
- Preserve deterministic runtime and headless behavior for both games.

## Non-goals

- Feature parity with Unity or Godot beyond the project/scene/component/resource
  authoring architecture.
- A general scripting language, script hot reload, shader graph, animation
  editor, binary asset pipeline, package marketplace, or collaborative editing.
- Editing transient runtime ECS entities directly. Runtime worlds remain
  compiled products of authored project data.
- Game-defined replacement panels or arbitrary editor DOM plugins. The initial
  extension surface is declarative schemas, prefabs, validators, gizmo kinds,
  runtime compilation, preview, and evaluation.
- Changing deterministic simulation into editor-driven runtime state.
- Removing legacy formats before both games pass parity and migration tests.

## Architecture

```text
                          @automata/project
        persisted model, schemas, commands, validation, serialization
                              (no games)
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             @automata/editor            @automata/contracts
       store, generic UI, viewport,       agent/MCP tool schemas
       storage ports, project session            │
                    │                            ▼
                    │                 editor-agent / MCP server
                    ▼
       tools/level-editor composition root
        project chooser + registration catalog
              ┌────────────┴────────────┐
              ▼                         ▼
     monkey-ball/editor         pulsebreak/editor
      schemas/compiler           schemas/compiler
      preview/evaluation         preview/evaluation
              │                         │
              ▼                         ▼
      Monkey Ball runtime        Pulsebreak runtime
        load same project          load same project
```

Dependency rules:

- `@automata/project` imports no engine, editor, tool, or game package.
- `@automata/contracts` may depend on `@automata/project` to expose project
  commands as tool schemas. This intentionally replaces its current ownership
  of level-shaped `SceneCommand` types.
- `@automata/editor` depends on project, contracts, and public engine APIs, but
  imports no game.
- Game editor entry points may depend on project, editor headless contracts,
  and their own runtime. A game's normal runtime entry point does not import
  `@automata/editor`.
- Only the `tools/level-editor` composition root imports the game registration
  entry points. Registering a game changes the catalog, not editor core or UI.
- ESLint enforces these directions and forbids game-name conditionals/imports
  under shared project/editor packages.

## Persisted project model

The logical in-memory model is a `ProjectSnapshot` containing a manifest, all
loaded scenes, and all loaded resources. A workspace stores those documents in
separate files so saves are small and conflicts are localized:

```text
my-game-project/
├── automata.project.json
├── scenes/
│   ├── arena.scene.json
│   └── tutorial.scene.json
└── resources/
    ├── tuning.resource.json
    ├── enemies.resource.json
    └── waves.resource.json
```

The initial format version is `1`.

```ts
interface ProjectManifest {
  formatVersion: 1
  id: string
  name: string
  gameId: string
  entrySceneId: string
  scenes: Array<{ id: string; path: string }>
  resources: Array<{ id: string; typeId: string; path: string }>
}

interface SceneDocument {
  formatVersion: 1
  id: string
  name: string
  entities: EntityDocument[]
}

interface EntityDocument {
  id: string
  name: string
  parentId?: string
  enabled: boolean
  components: ComponentInstance[]
}

interface ComponentInstance {
  id: string
  typeId: string
  data: unknown
}

interface ResourceDocument {
  formatVersion: 1
  id: string
  typeId: string
  data: unknown
}

interface ProjectSnapshot {
  manifest: ProjectManifest
  scenes: Record<string, SceneDocument>
  resources: Record<string, ResourceDocument>
}
```

IDs are stable, non-empty strings and unique within their owning scope.
Component instance IDs permit multiple instances of a component type when its
registration allows that. Parent references must remain within one scene and
must not form cycles. Manifest file paths are relative, normalized, and cannot
escape the project directory.

A `ProjectBundle` embeds the manifest, scenes, and resources in one JSON value
for download/upload, autosave recovery, tests, and transport. Loading either a
folder or bundle produces the same `ProjectSnapshot`.

### Standard authored types

`@automata/project` defines stable IDs and schemas for the small cross-game set
needed by generic viewport tools:

- `core.transform` — position, Euler rotation, and scale.
- `core.primitive` — box, cylinder, sphere, or plane geometry.
- `core.surface` — color or texture reference.
- `core.collider` — box, cylinder, sphere, or disabled collider description.
- `core.zone` — box or circle/cylinder editing volume, including visible editor
  color; games decide its runtime meaning through another component.
- `core.camera` — authored camera eye/projection properties when a game elects
  to use an authored camera.

These are authoring components, not engine ECS component types. Game compilers
translate them into their own runtime entity shapes.

## Declarative type registration

The project package exposes a finite schema language that shared UI and headless
validation both understand:

```ts
type PropertySchema =
  | NumberProperty
  | StringProperty
  | BooleanProperty
  | EnumProperty
  | ColorProperty
  | Vec3Property
  | ReferenceProperty
  | ObjectProperty
  | ArrayProperty

interface ComponentTypeRegistration {
  typeId: string
  label: string
  description?: string
  schema: ObjectProperty
  defaultData: unknown
  cardinality: { min: number; max: number }
  gizmo?: 'none' | 'point' | 'box-zone' | 'circle-zone'
}

interface ResourceTypeRegistration {
  typeId: string
  label: string
  description?: string
  schema: ObjectProperty
  defaultData: unknown
  singleton?: boolean
}
```

Number schemas include optional minimum, maximum, and step. String schemas can
identify plain text or multiline text. References state their target kind and
optional allowed type IDs. Arrays declare their item schema and presentation as
`list` or `table`; object-array tables derive columns from the child property
labels. Defaults are validated when registration is created.

Every property has a stable key, label, optional description, and required
status. Unknown data is rejected rather than silently discarded. Schema
validation returns structured issues rather than UI strings.

A game first exports a runtime-safe `GameProjectDefinition` from a module that
depends on `@automata/project` and game code, but not `@automata/editor`:

```ts
interface GameProjectDefinition<Compiled> {
  gameId: string
  label: string
  createTemplate(): ProjectSnapshot
  components: ComponentTypeRegistration[]
  resources: ResourceTypeRegistration[]
  validate(snapshot: ProjectSnapshot): ValidationIssue[]
  compile(snapshot: ProjectSnapshot): Compiled
}

interface EditorProjectRegistration<Compiled> {
  project: GameProjectDefinition<Compiled>
  prefabs: PrefabRegistration[]
  preview?: ProjectPreviewAdapter<Compiled>
  evaluation?: ProjectEvaluationAdapter<Compiled>
}
```

`compile` is the typed boundary between authored and runtime data. The concrete
compiled result stays private to the game. Its browser and headless runtimes
import the runtime-safe definition directly. A separate game editor entry point
adds prefabs and adapters through `EditorProjectRegistration`; the shared editor
catalog exposes that registration through a type-erased facade after its
compiler and adapters have been closed over the same `Compiled` type. Shared
editor code never examines the compiled value.

Prefabs are declarative entity templates with component defaults and palette
metadata. The editor's palette inserts these templates through generic project
commands. Games do not provide palette DOM.

## Generic command model

All mutations are immutable `ProjectCommand`s validated at dispatch. Commands
target stable IDs and use RFC 6901 JSON Pointers for nested property paths so
keys are unambiguous and shared tools do not invent game-specific commands.

The initial union covers:

- Add, rename, reorder, and remove scenes.
- Add, duplicate, rename, enable/disable, reparent, and remove entities.
- Add, reorder, and remove component instances.
- Add, duplicate, rename, reorder, and remove resources.
- Set a project, scene, entity, component, or resource property.
- Insert, remove, move, and replace array entries.
- Load a complete snapshot or bundle at an explicit session boundary.

Removal commands define cascading behavior explicitly. Removing an entity also
removes its descendants in one undoable command. Removing a referenced resource
is rejected until references are removed; it is never silently nulled. Removing
the entry scene is rejected until another entry scene is selected.

The reducer returns the original snapshot for semantic no-ops and throws a
typed `ProjectCommandError` for invalid targets, paths, values, cardinality, or
cycles. UI, keyboard operations, agent proposals, MCP calls, and migration tools
all use the same reducer.

## Editor session and UI

`@automata/editor` replaces `EditorStore<Doc>` with a project session containing:

- Current `ProjectSnapshot`.
- Active scene ID.
- Selection discriminated as project, scene, entity, component, or resource.
- Tool and viewport state.
- Undo/redo history of applied command batches.
- Dirty document paths and save status.
- Edit/play mode.

The single editor shell begins with a project chooser that can create a project
from any registered template, open a project folder, import a bundle, or reopen
a recent project. `?game=<id>` preselects a template and `?project=<recent-id>`
opens a previously granted workspace when browser permission remains valid.
Invalid or unavailable IDs return to the chooser with a visible error.

The shared layout contains:

- **Hierarchy:** scene list plus nested entities for the active scene.
- **Viewport:** generic spatial rendering, picking, placement, transform edits,
  and zone gizmos driven by standard components and registration metadata.
- **Palette:** registered prefabs and add-component actions.
- **Resources:** typed resource list with create/duplicate/delete actions.
- **Inspector:** schema-generated controls for the current selection.
- **Validation:** structured issues that focus their referenced selection/path.
- **Toolbar:** project switcher, save, import/export, undo/redo, play/stop, and
  dirty/save status.

The generated inspector supports numbers, strings, booleans, enums, colors,
vectors, references, nested groups, lists, and editable tables. Every edit
dispatches a `ProjectCommand`; controls do not mutate data directly. Multi-select
initially supports shared transform movement and entity deletion. Mixed-value
component editing is outside this effort.

## Project storage

Storage is isolated behind a `ProjectStoragePort` with operations to open,
read, save dirty documents, import/export a bundle, and report capabilities.

Browser implementations:

- `FileSystemProjectStorage` uses the File System Access API to open a directory
  and write `automata.project.json`, scene files, and resource files. It writes
  only dirty documents and clears each dirty flag only after that file succeeds.
- `BundleProjectStorage` imports and downloads `ProjectBundle` JSON where direct
  filesystem access is unavailable or denied.
- `AutosaveProjectStorage` stores a debounced bundle in `StoragePort`, namespaced
  by project ID. It is recovery state, not evidence of a successful workspace
  save.
- `MemoryProjectStorage` is the deterministic test double.

Recent directory handles are stored through a small IndexedDB-backed handle
registry because file handles cannot be serialized into `localStorage`.
Reopening requests permission again when the browser no longer grants it. A
missing, denied, or stale handle returns to the chooser without discarding the
autosaved bundle.

Folder saves write new and changed scene/resource files first, write the
manifest only after all referenced files exist, and remove orphaned files last.
The port reports success per path so a partial failure cannot incorrectly mark
the whole project clean.

The project session exposes unsaved, saving, saved, and save-error states.
Partial save failure preserves dirty state for failed files and reports their
paths. Closing or switching a dirty project requires explicit discard or export
unless the current state is already recoverable through autosave.

## Runtime data flow

Game browser and headless entry points load project files through a small
`ProjectFileReader` abstraction, parse them with `@automata/project`, verify the
manifest `gameId` against their runtime-safe `GameProjectDefinition`, run all
validation, and call the game's compiler. The runtime receives only the
compiler's typed output and never imports `@automata/editor`.

```text
project files -> parse -> schema validation -> game validation -> compile
              -> typed game config -> create gameplay/runtime world
```

Play mode uses the editor's current in-memory snapshot, including unsaved edits,
through the same validation and compiler path. It constructs the next preview
before disposing the edit-world sync. Compile or preview construction failure
leaves the editor in edit mode with the previous world intact.

An evaluation adapter returns a normalized result:

```ts
interface ProjectEvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}
```

Game-specific metrics remain named data, while generic tuning and comparison
can use `outcome` and `score`.

## Pulsebreak registration and migration

Pulsebreak ships one default project under `games/pulsebreak/public/project/`.
Its authored arena scene contains:

- Floor/arena geometry using core components.
- Player start entity with `pulsebreak.player-start`.
- One or more entities with `core.zone` and `pulsebreak.spawn-zone`.
- Optional authored camera entity.

Typed resources contain:

- `pulsebreak.tuning` — arena bounds, player baseline stats, projectile lifetime,
  camera defaults, and global run settings.
- `pulsebreak.enemy-types` — rammer, shooter, and boss definitions.
- `pulsebreak.wave-set` — ordered waves and per-enemy counts/rules.
- `pulsebreak.upgrade-set` — upgrade definitions and increments.

The wave table references enemy type resources by stable ID. Spawn-zone data
includes enabled enemy-type filters, positive weight, minimum separation, and
edge padding. For each spawn, the runtime orders eligible zones by stable ID,
uses the seeded RNG for weighted selection and position sampling, and applies a
bounded deterministic retry sequence for separation. Exhausting retries uses a
documented deterministic fallback at the sampled zone center; it never changes
RNG consumption based on rendering or frame timing.

The compiler produces the inputs currently derived from `config.ts`,
`sim/spawn.ts`, and `game/gameplay.ts`. After parity is proven, authored values
are removed from TypeScript. Code-only invariants and algorithms remain code.

The project template reproduces the current arena, camera, player/enemy values,
five waves, boss behavior, and upgrades. Existing deterministic title-to-victory
and defeat/retry tests run against compiled project data.

## Monkey Ball registration and migration

Monkey Ball exports the same registration shape. Its project contains one scene
per current level. Geometry, spawn, goal, bananas, bumpers, and moving platforms
become entities/components; world ordering and physics tuning become resources.

A deterministic legacy importer accepts existing level/world JSON and produces
project scenes/resources with stable IDs. Importing the same legacy inputs twice
must produce byte-identical canonical bundles. Legacy files remain readable
during migration, but runtime boot switches to project data only after all six
shipped levels pass structural and headless parity tests.

Existing `monkey-ball-editor` localStorage data receives a one-time recovery
action in the project chooser. Recovery parses the old level through the legacy
importer, creates a new project bundle, and leaves the old key untouched until
the new project is explicitly saved or exported.

## Agent and MCP migration

`@automata/project` becomes the source of project command schemas.
`@automata/contracts` re-exports those commands and defines generic tools:

- Read project manifest, hierarchy, active scene, selection, resources,
  validation, and evaluation baseline.
- Add/remove/reparent entities.
- Add/remove components and resources.
- Set properties and edit arrays through JSON Pointer paths.
- Validate, compile, preview/test-play, and evaluate.

The browser agent continues to apply proposals in a sandbox snapshot and shows
one command-batch diff before the user approves it. The MCP server loads a
project or bundle rather than a Monkey Ball level and selects its registration
from `gameId`. Unknown game IDs fail at startup with the available IDs listed.

Legacy level tools remain as adapters while Monkey Ball migration is incomplete.
They translate to `ProjectCommand`s and are deleted, with their schemas and
resource URIs, in the final cleanup phase. Provider adapters and approval rules
do not change.

## Validation and error handling

Validation is additive and ordered:

1. Persisted format and path safety.
2. Registered component/resource property schemas.
3. Entity hierarchy and cross-reference integrity.
4. Game registration rules.
5. Runtime compilation preconditions.

```ts
interface ValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  location: {
    sceneId?: string
    entityId?: string
    componentId?: string
    resourceId?: string
    pointer?: string
  }
}
```

Errors block play, evaluation, runtime boot, and production content builds.
Warnings do not. Ordinary workspace save and portable bundle export remain
available for invalid work-in-progress projects, with the invalid status
included in the export result. UI issue selection focuses the referenced object
and field. Headless and MCP responses return the same structured issues.

Unknown types are load errors unless a registered migration maps them. Version
migrations are pure `n -> n + 1` functions and must be deterministic and
idempotent after reaching the current version. Failed migration never overwrites
source files.

## Delivery phases

The implementation is one coordinated plan with independently shippable phases:

1. **Project foundation:** add `@automata/project`, persisted schemas,
   registration schemas, commands, immutable reducer, validation, bundles, and
   boundary lint rules.
2. **Generic editor session:** migrate state/history/selection and generic
   viewport seams while retaining a temporary Monkey Ball compatibility bridge.
3. **Generic product UI and storage:** add project chooser, hierarchy,
   resources, generated inspector/table controls, storage ports, dirty tracking,
   and browser adapters.
4. **Pulsebreak proof:** add registration, default project, compiler, preview,
   evaluation, deterministic zone spawning, and switch runtime boot to project
   data.
5. **Monkey Ball proof:** add registration, legacy importer, shipped-project
   content, local autosave recovery, parity tests, and switch runtime boot.
6. **Agent/MCP generalization:** replace level tools/resources with project
   operations and make MCP registration selection project-driven.
7. **Legacy removal and production verification:** delete `GameDefinition<Doc>`,
   `SceneModel<Doc>`, level-shaped command adapters, and hard-coded authored
   game values after all gates and manual checks pass.

Each phase keeps root CI and coverage green and ends in a focused commit. The
implementation plan must retain explicit browser checkpoints after the generic
UI/storage phase and after each game migration.

## Testing strategy

### `@automata/project`

- Schema acceptance/rejection for manifests, scenes, components, resources, and
  bundles.
- Path traversal, duplicate ID, hierarchy cycle, and bad-reference rejection.
- Every command's success, no-op identity, and typed failure behavior.
- Undo/redo round trips for entity, component, resource, array-row, and property
  changes.
- Canonical bundle ordering and parse/serialize round trips.
- Registration defaults and property schemas validate at registration time.

### `@automata/editor`

- A fake third-game registration drives all core and UI tests; shared tests do
  not import Monkey Ball or Pulsebreak.
- Project chooser creation/open/recent/error states.
- Hierarchy selection, reparenting, scene switching, and cascading delete.
- Generated control behavior for every property kind, nested object, list, and
  table.
- Resource creation, references, validation navigation, and dirty tracking.
- Memory storage success/partial failure; browser capability fallback seams.
- Edit/play transitions preserve the edit world on compiler/preview failure.

### Game parity

- Pulsebreak default project compiles to current arena, camera, player, enemy,
  wave, and upgrade values.
- Fixed seed plus project snapshot produces stable spawn zone selection and
  positions.
- Current Pulsebreak headless title-to-victory and defeat/retry flows run through
  project loading and compilation.
- Each Monkey Ball legacy level imports deterministically and matches current
  scene items, physics values, and headless outcomes.
- Both browser games boot only from shipped project files after cutover.

### Agent, MCP, and browser

- Tool JSON Schemas derive from project command schemas and reject bad IDs,
  pointers, values, and arrays.
- Sandbox diffs and approval dispatch remain one undoable batch.
- MCP can open and manipulate both game projects without game-specific server
  branches.
- Playwright covers chooser -> Pulsebreak project -> edit -> play -> stop ->
  save/export, plus the equivalent Monkey Ball flow.

## Acceptance criteria

- A fake third game registers components, resources, prefabs, validation, and a
  preview without modifications under `packages/project` or `packages/editor`.
- Pulsebreak and Monkey Ball are available in the same project chooser and use
  the same hierarchy, resource browser, inspector, tables, validation, storage,
  and play controls.
- Both games can create, open, edit, validate, play, save, reload, and export a
  project.
- Pulsebreak arena geometry, player start, spawn zones/rules, waves, enemies,
  upgrades, camera, and tuning are authored data and runtime truth.
- Monkey Ball's shipped world/levels are authored project data and runtime truth.
- No shared editor package imports or branches on either game.
- Workspace saves write only dirty documents; partial failures remain dirty and
  recoverable.
- Unsupported or denied File System Access falls back to bundle import/export.
- Agent and MCP project operations work with both shipped games.
- `npm run ci`, `npm run coverage`, `npm run build`, and `npm run e2e` pass.
- Manual desktop Chromium verification passes for project chooser, folder open,
  direct save, bundle fallback, both game authoring flows, production editor
  preview, and both production game builds.

## Risks and mitigations

- **Scope expansion into a full commercial editor.** The schema language,
  standard components, viewport gizmos, and panels are deliberately finite;
  scripting, binary assets, and custom panel plugins are non-goals.
- **Abstract model fails a second genre.** Pulsebreak and Monkey Ball must both
  migrate before legacy APIs are removed; a fake third registration protects
  the shared boundary in unit tests.
- **Runtime/editor schema drift.** Project parsing, game validation, and compile
  functions are shared by editor preview, headless tests, and shipped runtime.
- **Large migration breaks existing content.** Compatibility adapters and
  deterministic importers remain until parity tests and browser gates pass.
- **Browser filesystem support varies.** Capability detection selects direct
  folder storage only where supported; bundle import/export remains complete.
- **Generic tables become an unbounded UI framework.** The first schema language
  supports only the listed property kinds and flat object-array tables. More
  specialized editing requires a later approved extension design.
- **Agent contracts drift during command replacement.** Project commands own the
  schemas; UI, agent, and MCP consume the same definitions and migrate in a
  dedicated phase before legacy deletion.
