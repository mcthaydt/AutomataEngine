# AutomataEngine + Monkey Ball Clone — Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorm complete, awaiting implementation plan)

## Vision

AutomataEngine is a reusable, web-first game engine. Its first proving-ground
project is a mobile-friendly Super Monkey Ball clone — the smallest version of
a *full* clone (all the feature categories, minimal depth in each) — plus a
level editor. Everything is built with strict TDD.

The engine is the product; the game and editor exist to prove it. The
reusability claim is enforced by dependency rules and a review litmus test,
not speculative abstraction. The second game, whenever it comes, is the real
test.

## Decisions (from brainstorm Q&A)

| Question | Decision |
|---|---|
| Platform | Web — TypeScript, runs in mobile + desktop browsers |
| Fidelity | Full 3D: Three.js rendering, Rapier (WASM) physics |
| Data formats | One format per concern: TOML = tuning config, YAML = entity archetypes, JSON = levels/manifests |
| State | Redux-style store (app/meta state) + ECS world (per-frame gameplay state) |
| Scope | Smallest version of a full clone: moving platforms, bumpers, level select, progression saves, sound, particles, 2 worlds × 3 levels |
| Mobile input | Virtual joystick (gyro deferred); keyboard on desktop |
| Architecture | Monorepo; engine package + game app + editor app; ECS via library |
| ECS library | miniplex (plain-object entities, TS-first) |
| Level editor | Separate Vite app; depends on game's data modules; desktop-first |

## Repo layout

```
AutomataEngine/
  package.json            # npm workspaces: packages/*, games/*, tools/*
  packages/engine/        # @automata/engine — the product
    src/
      ecs/                # world factory, system scheduler/stages, event queue
      state/              # redux-style store, persistence middleware
      data/               # TOML/YAML/JSON loaders, zod registry, archetype spawner
      loop/               # fixed-timestep loop (rAF-free core)
      input/              # InputSourcePort: keyboard, virtual joystick → InputState
      physics/            # PhysicsPort + Rapier adapter
      render/             # RenderPort + Three.js adapter, NullRenderer
      audio/              # AudioPort + WebAudio adapter, NullAudio
      storage/            # StoragePort + localStorage adapter, in-memory adapter
      scene/              # SceneManager (store-driven, string scene ids)
      particles/          # burst emitter simulation
  games/monkey-ball/      # first game (Vite app)
    src/
      components/         # ball, collectible, goal, bumper, movingPlatform, spinAnim
      systems/            # tiltControl, movingPlatform, collection, bumper, goal,
                          # fallOff, timer, cameraFollow
      scenes/             # boot, menu, levelSelect, gameplay, paused,
                          # levelComplete, gameOver
      state/              # slices: session, progress, settings
      ui/                 # DOM overlay views, virtual joystick element, HUD
      level/              # level zod schema, buildLevelWorld()
    data/
      config/*.toml       # physics.toml, game.toml, camera.toml
      archetypes/*.yaml   # banana, bumper, goal, moving-platform, ball
      levels/*.json       # w1-l1.json … w2-l3.json + worlds.json manifest
  tools/level-editor/     # editor for monkey-ball (engine-powered Vite app)
    src/
      state/              # editorDoc slice, selection slice, undo/redo stack
      viewport/           # orbit camera, grid, selection highlight
      tools/              # palette, place/move/delete, inspector
      io/                 # import/export/autosave, validation panel
  docs/superpowers/specs/ # this document and future specs
```

## Dependency rules (lint-enforced)

- `game → engine`. `editor → game` (data modules + gameplay systems for
  test-play) and `editor → engine`. Never any reverse edge.
- Third-party libs (three, rapier, miniplex, smol-toml, yaml) are imported
  **only inside engine** (adapters/wrappers). Game and editor import only
  `@automata/engine` and (editor only) the game's exports.
- **Engine litmus test**, applied in review on every engine change: *"Would a
  top-down racer or a platformer use this API unchanged?"* Zero game-flavored
  concepts in engine: no ball, banana, tilt, goal, or level notions.

## Architecture

### Core mechanic

Monkey Ball "tilts the world." We use the standard clone trick: **input tilts
the gravity vector** in the physics world (clamped max angle, smoothed), while
a game-side cosmetic system tilts a render **group** containing the stage by
the same angles. The ball genuinely rolls, falls off edges, and is pushed by
platforms/bumpers via real Rapier dynamics.

### Frame flow

Fixed timestep (default 60 Hz) with accumulator (clamped to avoid
spiral-of-death) and render interpolation:

```
rAF → loop.tick(now)
  ├─ input adapters (keyboard / virtual joystick) → InputState (tilt vector)
  ├─ while (accumulator ≥ dt):            # fixed update
  │    1. tiltControl       input → rotated gravity + cosmetic stage-group tilt
  │    2. movingPlatform    waypoint motion → kinematic body targets
  │    3. physics.step(dt)  Rapier integrates; collision/sensor events out
  │    4. physicsSync       body transforms → transform components
  │    5. gameplay systems  collection / bumper / goal / fallOff / timer
  │    6.                   …dispatch store actions (bananas, lives, scene)
  └─ render (every rAF):
       renderSystem: transform components → Three scene (interpolated)
       DOM UI: subscribed to store (HUD numbers, menus)
```

### State model — two homes, one rule

- **ECS world** (miniplex): per-frame gameplay state; rebuilt on every level
  load; torn down completely on scene exit.
- **Store**: everything that outlives a level. Slices: `scene`
  (boot/menu/levelSelect/playing/paused/levelComplete/gameOver), `session`
  (lives, bananas, timer), `progress` (per-level completed/bestTimeMs/
  maxBananas — persisted), `settings` (volume, joystick side — persisted).
- Systems read the world and dispatch actions; UI and SceneManager react to
  the store. Nothing else holds state.

## Engine package design

### ECS conventions (wrapping miniplex)

- `createWorld<E>()` returns a typed miniplex `World`. Game extends the engine
  entity type with its own optional component fields (TS intersection).
- Systems: named functions `(ctx) => void`, `ctx = { world, dt, store, ports,
  events }`, registered into ordered stages: `input → update → postPhysics →
  render`.
- Engine-owned generic components: `transform` (pos/rot + previous-frame copy
  for interpolation), `rigidBody` (type: dynamic/kinematic/fixed; shape:
  sphere/box/cylinder; friction/restitution/sensor; adapter stores body handle
  on the entity), `renderable` (primitive desc + color), `lifetime`,
  `particleEmitter`.
- **EventQueue**: physics adapter translates Rapier collision/sensor pairs
  into `{ type: 'contact' | 'sensorEnter', a, b }` entity-mapped events;
  systems may emit custom events; queue drains at frame end.

### Store

Hand-rolled (~100 lines), fully TDD'd: `createStore(rootReducer, initial,
middleware)`, discriminated-union actions, slice composition, `subscribe` with
per-slice shallow change detection. **Persistence middleware**: slices marked
persistent are debounce-written through `StoragePort`; saves carry a schema
version; corrupt/old saves migrate or reset to defaults (tested).

### Data loading

`DataRegistry`: register a data *kind* as `{ extension, schema (zod) }`.
`load(kind, url)` → fetch text → parse (smol-toml / yaml / JSON.parse) →
`schema.parse` → typed object. Errors carry file, kind, and flattened zod
issues. Format conventions: **TOML = tuning config**, **YAML = archetypes**,
**JSON = levels/manifests**. `spawn(world, archetypeName, overrides)` helper
instantiates archetype component bundles.

### Loop & input

`GameLoop` core is rAF-free: `tick(nowMs)` over an accumulator, calling
`fixedUpdate(dt)` 0..n times then `render(alpha)` — directly callable in
tests. A thin browser driver hooks rAF and `visibilitychange` (auto-dispatches
pause). Input adapters implement `InputSourcePort`: keyboard (WASD/arrows) and
virtual joystick (pointer events on a DOM nub, normalized, dead-zone), merged
each frame into an `InputState` resource. Testable with synthetic DOM events.

### Ports & adapters

| Port | Production adapter | Test double |
|---|---|---|
| `PhysicsPort` — bodies, colliders, gravity, step, event drain | Rapier `rapier3d-compat` (WASM, runs in Node) | real Rapier in Node, or stub |
| `RenderPort` — mesh/group handles, parenting, transforms, camera | Three.js | `NullRenderer` (records calls) |
| `AudioPort` — load/play/volume | WebAudio | `NullAudio` (records calls) |
| `StoragePort` — get/set string | localStorage | in-memory map |

`RenderPort` exposes generic scene-graph **groups** (`createGroup()`, parent
handles to groups, transform groups) — the game builds its cosmetic tilt group
from these. No game-specific node concepts in the engine.

### Particles

Engine-side burst-emitter simulation (spawn, velocity/gravity/lifetime decay —
pure logic). Particles render as ordinary `renderable` entities (small
spheres); no special render path in v1.

## Game package design

### Components (game-meaning)

`ball` (player tag + spawn ref), `collectible { value }`, `goal`,
`bumper { impulseStrength }`, `movingPlatform { waypoints[], speed, mode:
loop|pingpong }`, `spinAnim` (cosmetic). Level-wide values (fall-off Y, time
limit) live in level data, not components.

### Systems

- `tiltControl` — InputState → clamped/smoothed tilt → `physics.setGravity`
  (rotated g) + cosmetic stage-group rotation.
- `movingPlatform` — waypoint interpolation → kinematic body targets (Rapier
  kinematics push/carry the ball).
- `collection` — `sensorEnter(ball, collectible)` → despawn + `dispatch
  (bananaCollected)` + particle burst + sound.
- `bumper` — `contact(ball, bumper)` → radial impulse + sound + particles.
- `goal` — `sensorEnter(ball, goal)` → `dispatch(levelCompleted({ timeMs,
  bananas }))`.
- `fallOff` — ball y < level `fallY` → `dispatch(ballFell)`: lives−1 → level
  retry (ball at spawn, timer and this-run bananas reset, world rebuilt), or
  game-over at 0 lives.
- `timer` — counts elapsed ms while `playing`; at `timeLimitS` →
  `dispatch(timeExpired)` → treated as a fall.
- `cameraFollow` — smoothed chase cam behind ball velocity, look-at ball.

### Scenes & UI

Engine `SceneManager` watches `store.scene`; each scene = `{ onEnter, onExit }`.
**Boot** (async Rapier WASM init; load config/archetypes/manifest; error panel
on failure) → **Menu** → **LevelSelect** (2×3 grid; locked/unlocked/best-time
from progress) → **Gameplay** (load level JSON, build world via archetype
spawner, HUD) with **Paused** overlay → **LevelComplete** / **GameOver**.
Gameplay teardown disposes physics bodies, render handles, and entities
(leak-tested).

UI: DOM overlay, no framework — hand-rolled `view(store)` render functions +
event delegation dispatching actions; virtual joystick is a DOM element over
the canvas. Mobile viewport care: `dvh` units, `touch-action: none` on canvas,
safe-area insets. Views unit-tested in happy-dom.

### Data files

```toml
# data/config/physics.toml (also game.toml, camera.toml)
max-tilt-deg = 12.0
tilt-smooth = 0.15
gravity = 9.81
[ball]
radius = 0.5
mass = 1.0
friction = 0.6
```

```yaml
# data/archetypes/standard.yaml
banana:
  collectible: { value: 1 }
  renderable: { shape: sphere, radius: 0.25, color: "#ffd23f" }
  rigidBody: { type: fixed, sensor: true, shape: sphere, radius: 0.4 }
  spinAnim: { speed: 2.0 }
bumper:
  bumper: { impulseStrength: 8.0 }
  renderable: { shape: cylinder, radius: 0.6, height: 0.5, color: "#ff5964" }
  rigidBody: { type: fixed, shape: cylinder, restitution: 1.2 }
```

```jsonc
// data/levels/w1-l1.json
{ "id": "w1-l1", "name": "First Roll", "timeLimitS": 60, "fallY": -10,
  "spawn": [0, 1, 6], "goal": { "pos": [0, 0, -6] },
  "geometry": [ { "shape": "box", "size": [8, 0.5, 16],
                  "pos": [0, -0.25, 0], "color": "#7ec850" } ],
  "entities": [ { "archetype": "banana", "pos": [0, 0.6, 2] },
                { "archetype": "bumper", "pos": [2, 0.25, -2] } ] }
```

Stage geometry is box/cylinder primitives (floors, rotated boxes as ramps,
walls): exact colliders, hand-editable levels. `worlds.json` manifest lists
worlds → ordered level ids. The level zod schema and `buildLevelWorld()` are
exported by the game for the editor.

### Content (smallest full clone)

World 1 "Grassland": flat + ramps + bananas, introduce bumpers. World 2 "Sky
Park": gaps, moving platforms, tighter timers. 3 levels each. Audio ~5 sounds
(pickup, bumper, goal, fall, UI click). Particles: pickup sparkle, goal
confetti, fall poof.

### Saves & unlocks

Progress per level `{ completed, bestTimeMs, maxBananas }` (`bestTimeMs` =
elapsed completion time, lower is better). Completing a level unlocks the
next; completing World 1 unlocks World 2. Settings: volume,
joystick side. Persisted via engine persistence middleware (versioned;
corruption → defaults + warning).

## Editor package design (tools/level-editor)

Separate Vite app. Dependency direction: **editor → game → engine** (editor
imports the game's level schema, archetypes, `buildLevelWorld()`, and gameplay
systems for test-play). Game never imports editor.

- **Editing model:** store-driven. `editorDoc` slice = working level JSON +
  dirty flag; `selection` slice; all mutations are reducer actions
  (`addGeometry`, `moveEntity`, `setMetadata`, `deleteSelected`, …).
  **Undo/redo = bounded stack over `editorDoc`** (pure reducer logic).
- **Viewport:** Three.js via engine `RenderPort` — orbit camera (drag/wheel,
  pinch), ground grid, selection highlight.
- **Tools:** palette of geometry primitives + game archetypes (banana, bumper,
  moving platform, goal, spawn); click-to-place on ground plane with grid
  snap; drag to move on the ground plane (vertical position via inspector);
  inspector panel for exact numbers (pos/rot/size, waypoints, level metadata).
- **Validation:** game's level schema + sanity checks (spawn exists, goal
  exists) with an error panel. Invalid levels cannot be exported or
  test-played.
- **Test-play:** one button swaps the viewport to the real gameplay systems
  running the working level; back returns with editing state intact.
- **Persistence:** autosave working copy to localStorage; Export downloads
  `.json`; Import opens one; shipped levels can be opened as starting points.
  Shipping a level = drop file into `games/monkey-ball/data/levels/` + add to
  manifest (no asset pipeline in v1).
- Desktop-first, pointer-based (usable on tablet).
- Future work (explicitly out of scope): game-agnostic editor where a game
  registers schemas/palette into a generic tool.

## Testing strategy (strict TDD)

Vitest workspace across all three packages; red-green-refactor for every
behavior; tests written first; run before any green claim.

1. **Pure unit tests (bulk):** store/reducers/persistence; parsers + zod
   validation (good and bad fixtures); scheduler stage ordering; loop
   accumulator math; input mapping from synthetic DOM events; particle sim;
   waypoint math; timer/lives/unlock rules; editor reducers + undo/redo; DOM
   views in happy-dom.
2. **System tests with doubles:** gameplay systems against in-memory world +
   scripted EventQueue + Null adapters; assert dispatched actions,
   spawns/despawns, port calls (sounds played, impulses applied).
3. **Integration tests with real physics (Node):** `rapier3d-compat` runs in
   Node — rotated gravity rolls ball on floor; ball falls off edge;
   banana/goal sensors fire; bumper impulse bounces; kinematic platform
   carries ball. Full data pipeline: real fixture files → build world →
   assert entities.
4. **Browser-only shims** (rAF driver, WebGL context creation, pointer
   capture, WebAudio unlock): kept tiny, explicitly listed, excluded from
   coverage gate; covered by one Playwright smoke test per app (game: boot →
   menu → play → ball moves on input; editor: place box → export contains it).

Coverage gate: 90% lines and branches on non-shim code. CI script: lint (incl.
dependency-direction rules) + typecheck + tests across the workspace.

## Error handling

- Loader errors: file + kind + flattened zod issues; boot scene error panel;
  no silent fallback for shipped data.
- Saves: versioned; corrupt/old → migrate or reset to defaults with warning
  (tested).
- WebGL unavailable / WASM load failure → readable boot error screen with
  retry.
- Scene teardown disposes physics bodies, render handles, entities; leak
  assertions in tests.
- Editor: refuses export/test-play of invalid level, shows why.

## Milestones (each PR-sized, TDD throughout)

Editor lands **before** content so shipped levels are authored in the editor
(dogfooding validates it).

| # | Milestone |
|---|---|
| M0 | Monorepo scaffold: workspaces, strict TS, Vitest, ESLint boundaries, CI script, walking-skeleton pages |
| M1 | Engine: store + persistence middleware + StoragePort adapters (localStorage, in-memory) |
| M2 | Engine: data registry (TOML/YAML/JSON + zod) + archetype spawner |
| M3 | Engine: ECS conventions — world factory, scheduler/stages, event queue |
| M4 | Engine: loop + input (keyboard, virtual joystick) |
| M5 | Engine: physics port + Rapier adapter + Node integration rig |
| M6 | Engine: render port + Three adapter, camera, groups, NullRenderer |
| M7 | Game: first playable — load level, floor + ball + tilt + fall-off + goal + respawn, HUD skeleton |
| M8 | Game: bananas, timer, lives, bumpers, moving platforms, camera polish |
| M9 | Engine SceneManager; Game: scenes/menus/level-select, saves + unlocks, pause |
| M10 | Engine: AudioPort adapters + particle emitter sim; Game: sounds + particle effects |
| M11 | Editor: app shell, document/selection reducers, undo/redo, viewport + orbit + grid |
| M12 | Editor: palette, place/move/delete, inspector, validation panel |
| M13 | Editor: test-play + import/export/autosave |
| M14 | Content: 2 worlds × 3 levels authored in the editor, tuning pass |
| M15 | Mobile polish (joystick feel, visibility-pause, pixel-ratio cap), Playwright smokes, release build |

## Known risks (planned for)

- Rapier WASM init is async → handled in boot scene with error/retry.
- Kinematic platform carrying the ball has friction quirks → integration-test
  early (M5).
- iOS WebAudio requires a user gesture → unlock on first tap.
- Low-end mobile perf → primitive geometry, capped pixel ratio, fixed
  timestep with clamp.

## Out of scope for v1

- Gyro/tilt input (settings option later)
- Game-agnostic editor
- Publishing `@automata/engine` to npm / semver ceremony
- Instanced rendering, custom meshes/assets, skeletal animation
- Multiplayer, leaderboards, replays
