# LAST LIGHTKEEPER Design

Status: approved design. Date: 2026-06-27.

## Product Summary

LAST LIGHTKEEPER is a complete side-view action-management game set during one
catastrophic night in a five-floor lighthouse. A run lasts 12-15 minutes. The
player moves physically through the building, carries one tool or supply,
operates machinery, repairs failures, routes constrained power, decodes radio
distress calls, and aims the lantern-room beacon to guide ships through danger.

The game is a deterministic systems challenge rather than a combat game. Its
depth comes from spatial prioritization, overlapping failures, limited carrying
capacity, circuit tradeoffs, and the readable rescue procedure. It has no
combat, roguelite upgrades, procedural campaign, crafting tree, or level editor.

## Experience Goals

- Make every rescue a legible physical sequence: acknowledge, identify bearing,
  route power, climb, aim, hold, confirm.
- Make power scarcity understandable at a glance. A healthy generator supplies
  three of four circuits; heat and damage can reduce that budget.
- Make repairs spatial. Machinery cannot be restored from a menu: the keeper
  must reach the fault with the appropriate carried item.
- Escalate from contextual teaching into overlapping emergencies and a final
  blackout without losing causal readability.
- Deliver a cohesive low-resolution pixel-art presentation with production
  sprites, strong state silhouettes, warm/cold contrast, and restrained effects.
- Keep all gameplay rules headless, seeded, and independent of DOM, Canvas,
  wall-clock time, and real audio.

## Run Structure and Outcomes

The default night is 780 simulated seconds and is divided into five phases:

1. **First signal (0-150 s):** one forgiving rescue teaches radio, power, and
   beacon operation. Early failures are isolated and repair prompts are explicit.
2. **Rising storm (150-330 s):** flooding and equipment failures overlap; a
   second ship introduces a tighter rescue window.
3. **Severe weather (330-540 s):** generator output degrades, lightning and radio
   interference begin, and power tradeoffs become mandatory.
4. **Blackout crisis (540-690 s):** a scripted lightning strike trips circuits,
   jams the pump, and forces a full recovery sequence around the final rescue.
5. **Dawn (690-780 s):** pressure eases, outstanding outcomes resolve, the sky
   warms, and the run transitions to its scored result.

Victory requires reaching dawn with positive structural integrity, flooding
below the terminal threshold, no unsafe-dark timeout, and at least three rescued
ships. Defeat occurs immediately when flooding reaches 100%, integrity reaches
0, or the lighthouse stays dark longer than the safe limit. Reaching dawn with
fewer than three rescues is also a defeat.

The score is deterministic and rewards rescued ships, remaining integrity, low
outage time, and generator efficiency. The highest valid score is persisted.
Malformed or incompatible stored progress is ignored and replaced with safe
defaults without preventing boot.

## Lighthouse Layout

The lighthouse is rendered as a single side-view cutaway on a 480x270 logical
canvas. Floors occupy fixed world-space bands and are joined by ladders. The
camera normally frames the full tower and applies only bounded shake and small
focus offsets, preserving spatial memory.

| Floor | Primary stations | Persistent risks |
| --- | --- | --- |
| 1. Lantern room | Beacon motor, lens controls | misalignment, broken glass, darkness |
| 2. Navigation | Radio, chart/bearing console | interference, damaged aerial |
| 3. Quarters | Four-circuit breaker panel | blown fuses, tripped circuits |
| 4. Workshop | Tool and supply racks | unpowered interior, depleted supplies |
| 5. Machinery | Generator, bilge pump, sump | heat, fuel interruption, flooding, pump jam |

Horizontal movement, ladder climbing, carrying, dropping, and station operation
all happen in world space. A nearby-interactable query chooses one prompt by
distance and priority, avoiding overlapping action labels.

## Controls

- `A`/`D` or left/right arrows: move.
- `W`/`S` or up/down arrows: climb ladders; vertical input also adjusts the
  beacon while operating it.
- `E` or `Space`: interact, acknowledge, operate, repair, or confirm the focused
  station.
- `Q`: take, carry, or drop the focused item.
- `Escape` or `P`: pause/resume.
- Existing controller movement is consumed through `InputSource` where
  practical. Browser keyboard actions remain a thin injected action source so
  gameplay does not depend on `KeyboardEvent`.

## Core Simulation

### Deterministic model

`games/last-lightkeeper/src/sim` owns pure state and ordered systems. A run is
created from a seed and updated with the engine's fixed timestep. The state
contains the keeper, stations, circuits, storm, active calls, score metrics,
scene-independent notifications, and terminal status. Randomness flows only
through a small seeded RNG passed to the storm director.

The fixed update order is explicit:

1. read normalized movement and action intents;
2. update keeper movement, ladders, carrying, and focused interaction;
3. apply station operation and repair progress;
4. resolve circuit requests against current generator capacity;
5. advance generator heat, flooding, integrity, and darkness pressure;
6. advance distress calls, bearing identification, beacon lock, and rescue
   windows;
7. run due deterministic storm events;
8. emit audiovisual feedback events;
9. evaluate victory or defeat.

Each system is a small pure function over an explicit `NightState` and `dt`.
The browser runtime adapts input into intents and drains feedback into the
renderer, HUD, and `AudioPort`.

### Power

Four circuits are independently requested at the breaker panel: beacon, radio,
bilge, and workshop/interior. Effective capacity is normally three. Generator
damage and heat thresholds reduce it to two or one. Requested circuits are
powered in player-defined priority order; the HUD and breaker station show both
requested and actually powered states. A tripped or blown-fuse circuit cannot
power until repaired.

Power has immediate systemic consequences:

- Beacon power enables lamp output and motorized aiming.
- Radio power permits call acknowledgement and bearing work.
- Bilge power lets an unjammed pump reduce water.
- Workshop power lights interiors and enables powered repair equipment.

### Failures and repairs

Failure definitions identify a target station, required carried item, repair
duration, severity, and ongoing consequence. The shipped set includes broken
windows, blown fuses, jammed pump, beacon misalignment, generator damage,
overheating, lightning damage, and radio interference. Repair progress advances
only while the keeper is at the correct station, holds the interaction action,
and carries the required item. Interrupted work preserves partial progress where
appropriate. Consumed supplies disappear; reusable tools remain carryable.

The workshop provides a wrench, fuse, pump handle, window boards, and coolant.
One-item carrying capacity forces routing choices. Item sprites appear both on
racks and in the keeper's carry pose.

### Distress calls and rescues

Each authored ship call has an id, ship visual, arrival time, bearing, identify
duration, rescue-window interval, required beacon hold time, and danger text.
The complete state machine is:

`incoming -> acknowledged -> identifying -> bearingKnown -> guiding -> rescued`

or, when its window expires without a completed hold, `lost`.

A call can be acknowledged only at a powered, non-interfered radio. Holding the
radio interaction identifies its bearing and reveals the rescue window. Guiding
requires a powered beacon, a functional lantern assembly, the keeper operating
the controls, aim within the bearing tolerance, and uninterrupted hold until the
ship crosses danger. Loss of power, aim, or operation pauses or decays lock
progress. Rescue and loss each emit unique notifications, sprites, light
effects, screen response, and sound cues.

### Storm director

The director combines an authored phase timeline with a seeded choice among
eligible failure variants. Events are scheduled in simulation time and are
stable for a given seed. Phase budgets prevent impossible event stacks while
still allowing variation. The final blackout is authored and deterministic.
Tests assert exact schedules for fixed seeds, eligibility rules, cooldowns, and
capacity pressure.

### Headless harness

`scripts/headless.ts` runs the real ordered systems without browser APIs. It
offers deterministic scripted inputs, records state snapshots and feedback, and
exits non-zero when assertions fail. Two committed scenarios prove:

- a complete victory with at least three rescues and dawn scoring;
- a complete defeat through terminal flooding or unsafe darkness.

The harness is also exercised by Vitest integration tests; the script exists as
a useful developer and CI diagnostic.

## Minimal Engine Sprite Slice

The engine gains a focused sprite module implemented on Three.js. The game is a
2D simulation presented in a shallow 3D scene, matching a Unity-style 2D setup:
textured quads sit on a fixed XY gameplay plane, Z encodes visual layers, and an
orthographic camera looks straight down the Z axis. Three.js remains wrapped
inside `@automata/engine`; game code never imports it directly. Rapier is not
used and the existing perspective/primitive renderer contracts remain intact.

### Public types

- `SpriteSource`: image id and source rectangle.
- `SpriteFrame`: source, logical pivot, optional duration, and optional event.
- `SpriteAnimation`: named ordered frames and loop mode.
- `SpriteDef`: texture id, frame/source rectangle, world-unit size, pivot, tint,
  alpha, and transparency mode.
- `SpritePose`: XY world position, Z layer/depth, scale, flip, and rotation around
  the gameplay-plane normal.
- `OrthographicCameraDef`: logical viewport, position, zoom, pixel snap, and
  shake offset.
- `SpriteRenderPort`: add/update/remove sprite, set frame/visibility/tint, update
  camera, report object count, and dispose.

### Pure production logic

- Animation timing selects frames deterministically, including non-looping
  completion and large-`dt` advancement.
- Camera transforms convert world positions to orthographic clip/screen space
  and apply bounded, seeded shake without changing simulation state.
- Layer/depth helpers map authored integer layers to stable Z positions; material
  transparency and render order preserve deterministic overlap.
- Atlas UV calculations and destination-pixel snapping are pure.
- A recording sprite renderer stores definitions, poses, frames, camera calls,
  and removals for unit and game tests.

### Three.js composition

`createThreeSpriteRenderer` owns a `Scene`, `OrthographicCamera`, shared plane
geometry, texture/material caches, sprite meshes, and disposal. Texture creation
uses nearest-neighbor min/mag filters, disables mipmap blur where appropriate,
and updates atlas UVs without replacing simulation objects. Sprite materials are
unlit so pixel colors remain authored; explicit ambient/light sprites and screen
effects provide the visual lighting model.

Image loading and WebGL canvas attachment remain thin browser composition.
App `main.ts` resolves manifest images, passes them through the engine adapter,
attaches the engine's renderer surface, and starts the loop. The app remains the
only newly accepted untested browser shim; orthographic math, animation, UVs,
layering, sizing, mesh reuse, and resource disposal are covered with pure tests
and direct Three scene assertions.

The runtime uses a 480x270 backing canvas and integer nearest-neighbor scaling.
CSS letterboxes the canvas at 16:9. Resize logic selects the largest integer
scale that fits when possible and keeps `image-rendering: pixelated`, avoiding
blurry sprite scaling.

## Rendering and Presentation

The world renderer draws, back to front:

1. cold sky, sea, distant rocks, rain, and lightning;
2. lighthouse exterior and five cutaway floor modules;
3. ladders, stations, damage overlays, water, and interactable items;
4. keeper, carried item, sparks, spray, and repair effects;
5. beacon cone, rescue ship silhouettes, and foreground storm effects.

Warm amber interior pools contrast with blue-green storm layers. Machinery has
distinct idle, powered, damaged, overheated, jammed, and operating frames where
applicable. Effects combine PixelLab sprites with deterministic procedural rain,
screen flash, camera shake, water fill, and light cones. Primitive debug art is
never used as a final substitute for required production sprites.

The HUD is DOM-based for crisp readable text and shows time to dawn, rescues,
integrity, flooding, generator heat/capacity, beacon state, active distress call,
carried item, requested/powered circuits, and the focused interaction prompt.
It is compact enough not to obscure the tower at 16:9 and has warning-state
color plus text/icon redundancy.

## PixelLab Production Asset Pipeline

PixelLab MCP is mandatory. Before generation, the implementation records one
concise style guide covering logical pixel density, palette, outline weight,
lighting direction, silhouette scale, animation cadence, and transparent
background rules. Assets are generated in coherent batches and retried in
smaller batches if a call fails. No other generator may silently replace it.

Required batches:

- keeper: idle, run, climb, carry, operate/repair;
- modular lighthouse cutaway, exterior shell, ladders, and five distinct floors;
- beacon, radio, breaker, workshop, generator, pump, plus active/damaged states;
- wrench, fuse, pump handle, boards, coolant, and carried variants;
- at least three distinct ship silhouettes;
- sea, sky, storm cloud, distant rock, and dawn layers;
- broken glass, sparks, spray, rescue flare, and failure effects where sprites
  improve the presentation.

Generated files are normalized to local PNG sheets or frames under
`games/last-lightkeeper/public/assets`. Runtime never hotlinks. A checked
`assets/manifest.json` records every asset id, relative file, pixel dimensions,
frame geometry, animation names, source prompt, PixelLab generation mapping,
and required-state tags. Loader validation rejects missing, malformed, duplicate,
or dimensionally inconsistent entries and produces a useful boot error.

Tests validate manifest schema, file existence, dimensions, unique ids, required
animation/state coverage, three ship silhouettes, and the absence of runtime
URLs. Final visual inspection rejects placeholder rectangles or primitive-only
characters, machines, ships, and environment.

If PixelLab MCP is not exposed or remains unavailable after retries, all other
work may continue, but the game cannot be declared complete and the missing MCP
must be reported as the concrete blocker.

## Scenes and Browser Runtime

The scene ids are `title`, `instructions`, `playing`, `paused`, `victory`, and
`defeat`. `createSceneManager` owns DOM overlay enter/exit. UI views have
idempotent teardown and tests assert listener cleanup and transition behavior.

- Title: name, premise, best score, start, and instructions.
- Instructions: controls and the six-step rescue loop.
- Playing: simulation, canvas, HUD, prompts, and feedback.
- Pause: frozen simulation with resume/restart/title actions.
- Victory: dawn result and score breakdown.
- Defeat: explicit terminal cause and score breakdown.

`main.ts` loads and validates the asset manifest and required images, constructs
storage/audio/input/Three sprite adapters, wires scenes, and starts `GameLoop`. Any
failure before a valid runtime exists replaces the app with a clear boot-error
panel. The visibility callback automatically pauses an active run. Cleanup is
owned by `createCleanupStack` and covers the loop, renderer, input, audio,
listeners, views, and DOM nodes.

Audio uses the existing `AudioPort` with synthesized storm, machinery, radio,
alarm, repair, beacon, rescue, failure, UI, and dawn definitions. Headless tests
use null/recording audio; no gameplay decision depends on sound playback.

## State, Persistence, and Data

Game configuration is local, versioned JSON validated through `zod` imported
from `@automata/engine`. It contains timing, ship calls, storm phase budgets,
station positions, item definitions, power thresholds, and score weights. Invalid
required config is a boot failure rather than an implicit fallback.

Run state is transient. Progress persistence stores only schema version, best
score, best rescue count, and completed-run count through `StoragePort`. Parsing
uses validation and catches storage exceptions. Unknown versions and malformed
values safely produce defaults.

## Package Boundaries

`games/last-lightkeeper` imports shared runtime APIs only from
`@automata/engine`, `@automata/engine/browser`, and `@automata/game-kit`. It does
not import Monkey Ball, PULSEBREAK, editor packages, Three.js, Rapier, Miniplex,
or their implementation files. The game does not register with the generic
project editor because a level editor is explicitly out of scope.

The sprite engine slice lives under `packages/engine` and exports through the
engine public surface. Three.js remains an engine implementation detail, and the
new slice requires no additional runtime dependency.

## Test Strategy

TDD is mandatory for behavior changes. Each production unit begins with a
focused failing test, the failure is observed, and only then is the minimum
implementation added.

Engine tests cover:

- animation timing, looping, completion, and frame events;
- orthographic world/camera transforms, pixel snapping, shake bounds, and decay;
- layer/depth mapping, stable overlap, and atlas UV math;
- recording sprite renderer behavior, resize, and disposal;
- Three sprite mesh/material/texture caching and disposal through direct scene
  assertions.

Game unit and integration tests cover:

- movement, ladders, collision bounds, focus, carry/drop, and prompts;
- circuit requests, priority, capacity loss, trips, and repair;
- every station/failure consequence and item-gated repair;
- generator heat, pump/flooding, structural damage, and darkness;
- distress state transitions, bearing work, lock decay, rescue, and loss;
- seeded storm schedules and final-blackout behavior;
- victory, every defeat condition, scoring, and malformed persistence;
- scene transitions, visibility pause, UI teardown, and HUD state;
- asset manifest validation and completeness;
- deterministic full victory and failure playthroughs.

## Repository Integration

- `games/last-lightkeeper/vitest.config.ts` registers project
  `last-lightkeeper`; root glob coverage includes all new production files.
- Root `dev:last-lightkeeper` serves `127.0.0.1:5177` with strict port binding.
- Root `build` includes the game's production build.
- Playwright starts the fourth game server and runs a smoke covering boot,
  start, movement/interaction, pause/resume, and visible HUD.
- README documents controls, gameplay loop, architecture, asset provenance,
  commands, and production preview.
- `AGENTS.md` is updated only after the game and its real gates are complete.

## Verification and Release Gate

Completion requires current evidence for every gate:

1. focused red/green tests throughout implementation;
2. full `last-lightkeeper` Vitest project;
3. `npm run ci`;
4. `npm run coverage` with repository thresholds met for new game and engine
   code;
5. root `npm run build`;
6. Playwright e2e;
7. production build served and inspected in a browser;
8. visual inspection of title, normal play, severe storm, rescue feedback,
   pause, victory, and defeat;
9. one automated browser playthrough far enough to exercise the real rescue
   loop;
10. final diff, package-boundary, dead-code, diagnostic, asset, and checklist
    audit.

Meaningful implementation slices are committed independently. The final tree is
clean and the handoff reports gameplay, PixelLab assets, verification results,
production preview URL, controls, and commit hashes.

## Risks and Mitigations

- **The pressure curve becomes unreadable.** Phase budgets, authored teaching
  events, deterministic seeds, and headless scenarios keep escalation tunable.
- **Sprite presentation leaks Three.js into the game.** The sprite port, pure
  animation/camera helpers, injected texture sources, and engine-owned Three
  adapter keep game and headless code independent.
- **Power tradeoffs feel arbitrary.** Requested versus powered circuits,
  priority ordering, generator capacity, and consequences are displayed
  together in the HUD and breaker panel.
- **Required art is incomplete or inconsistent.** One style guide, coherent
  PixelLab batches, a strict manifest, asset completeness tests, and visual
  release inspection guard the production set.
- **A wide feature set hides incomplete terminal paths.** Scripted full victory
  and failure runs exercise the real ordered simulation before browser polish.
