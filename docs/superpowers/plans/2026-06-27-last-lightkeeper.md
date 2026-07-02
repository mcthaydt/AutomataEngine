# LAST LIGHTKEEPER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ship LAST LIGHTKEEPER as a polished 12-15 minute deterministic side-view lighthouse action-management game with PixelLab production art, Three.js orthographic sprite presentation, headless victory/failure runs, and complete repository/browser verification.

**Architecture:** Gameplay is a pure fixed-step simulation under games/last-lightkeeper/src/sim. A minimal engine-owned SpriteRenderPort is implemented with Three.js textured planes on the XY plane, authored Z layers, and an OrthographicCamera; the game imports only @automata/engine APIs. Browser main.ts composes validated local assets, renderer, audio, input, scenes, and DOM HUD while the same rules run headlessly with recording ports.

**Tech Stack:** TypeScript strict ESM, Three.js through @automata/engine, Vitest/happy-dom, Vite, Playwright, zod through @automata/engine, npm workspaces, PixelLab MCP PNG assets.

**Progress:** 63% (84/133 steps complete)

## Global Constraints

- Work on branch last-lightkeeper from commit 4ed7c71 and preserve existing games and unrelated work.
- Follow strict red-green-refactor for all production behavior: add one focused test, run it and confirm the intended failure, then add the minimum implementation.
- games/last-lightkeeper must not import Three.js, Rapier, Miniplex, Monkey Ball, PULSEBREAK, editor code, or internal engine paths.
- Three.js remains wrapped under packages/engine. The game uses no physics adapter; movement and interactions are deterministic 2D rules.
- Main browser composition stays in games/last-lightkeeper/src/main.ts. Do not add another untested engine browser shim.
- PixelLab MCP is required for final art. Do not substitute another generator or claim primitive/temporary art is final.
- Mark each checkbox complete immediately when its step lands. Each task ends with its documented scoped commit.
- Run npm run coverage after engine changes and before final completion. Repository thresholds remain 90% lines and 90% branches.

---

## Phase 1: Package and Three.js Sprite Foundation

### Task 1: Scaffold and wire the game package

**Files:**
- Create: games/last-lightkeeper/package.json
- Create: games/last-lightkeeper/tsconfig.json
- Create: games/last-lightkeeper/vite.config.ts
- Create: games/last-lightkeeper/vitest.config.ts
- Create: games/last-lightkeeper/index.html
- Create: games/last-lightkeeper/src/index.ts
- Create: games/last-lightkeeper/src/main.ts
- Create: games/last-lightkeeper/src/vite-env.d.ts
- Modify: package.json
- Modify: playwright.config.ts
- Modify: package-lock.json

**Scaffold contract:**

~~~text
npm run new-game last-lightkeeper 5177
=> package name last-lightkeeper
=> dev:last-lightkeeper binds 127.0.0.1:5177 with strictPort
=> root build appends npm run build -w last-lightkeeper
=> Playwright webServer includes http://127.0.0.1:5177
~~~

- [x] **Step 1: Run the existing scaffold generator**

  Run npm run new-game last-lightkeeper 5177.
  Expected: games/last-lightkeeper is created and root package/Playwright wiring is updated.

- [x] **Step 2: Install workspace links**

  Run npm install.
  Expected: package-lock.json registers last-lightkeeper and node_modules/last-lightkeeper resolves.

- [x] **Step 3: Verify the generated package**

  Run npm run typecheck -w last-lightkeeper.
  Expected: PASS with no diagnostics.

- [x] **Step 4: Verify root wiring**

  Run rg -n "last-lightkeeper|5177" package.json playwright.config.ts package-lock.json.
  Expected: dev, build, workspace lock entry, and Playwright server are present exactly once.

- [x] **Step 5: Run the untouched generated test project**

  Run npx vitest run --project last-lightkeeper --passWithNoTests.
  Expected: PASS with no tests collected.

- [x] **Step 6: Commit the scaffold**

  Stage only the generated package and root wiring. Commit as feat(last-lightkeeper): scaffold game package.

### Task 2: Define sprite, atlas, animation, and camera contracts

**Files:**
- Create: packages/engine/src/sprite/types.ts
- Create: packages/engine/src/sprite/animation.ts
- Create: packages/engine/src/sprite/camera.ts
- Create: packages/engine/tests/sprite/animation.test.ts
- Create: packages/engine/tests/sprite/camera.test.ts
- Modify: packages/engine/src/index.ts

**Public contract:**

~~~ts
interface SpriteFrame {
  textureId: string
  source: { x: number; y: number; width: number; height: number }
  durationS: number
  event?: string
}
interface SpriteAnimation { name: string; loop: boolean; frames: readonly SpriteFrame[] }
interface AnimationState { animation: string; frame: number; elapsedS: number; complete: boolean }
interface OrthographicCameraDef {
  x: number; y: number; viewportWidth: number; viewportHeight: number
  zoom: number; shakeX: number; shakeY: number; pixelSnap: number
}
~~~

- [x] **Step 1: Write animation timing tests**

  Cover first-frame selection, multi-frame advancement, looping overflow, non-looping completion, zero/negative duration rejection, large dt, and emitted frame events.

- [x] **Step 2: Run animation tests red**

  Run npx vitest run --project engine packages/engine/tests/sprite/animation.test.ts.
  Expected: FAIL because packages/engine/src/sprite/animation.ts does not exist.

- [x] **Step 3: Implement animation contracts and advanceAnimation**

  Add validated definitions and a pure advanceAnimation(def, state, dt) result containing next state plus crossed frame events.

- [x] **Step 4: Run animation tests green**

  Run the focused animation test.
  Expected: PASS.

- [x] **Step 5: Write orthographic camera tests**

  Cover world-to-screen center/corners, zoom, logical pixel snapping, shake offsets, bounded shake sampling, and exponential shake decay.

- [x] **Step 6: Run camera tests red**

  Run npx vitest run --project engine packages/engine/tests/sprite/camera.test.ts.
  Expected: FAIL because the camera helpers do not exist.

- [x] **Step 7: Implement camera helpers and export the sprite API**

  Add pure worldToOrthographicScreen, snapWorldPixel, sampleCameraShake, and decayCameraShake functions. Export sprite types, animation, and camera from @automata/engine.

- [x] **Step 8: Run focused engine tests and commit**

  Run both sprite test files, npm run typecheck -w @automata/engine, and git diff --check.
  Commit as feat(engine): add sprite animation and orthographic camera math.

### Task 3: Add SpriteRenderPort and recording renderer

**Files:**
- Create: packages/engine/src/sprite/port.ts
- Create: packages/engine/src/sprite/recording.ts
- Create: packages/engine/tests/sprite/recording.test.ts
- Modify: packages/engine/src/index.ts

**Port contract:**

~~~ts
interface SpriteDef {
  textureId: string
  frame: SpriteFrame['source']
  width: number
  height: number
  pivot: { x: number; y: number }
  tint?: string
  alpha?: number
}
interface SpritePose {
  x: number; y: number; layer: number; depth: number
  scaleX: number; scaleY: number; rotationRad: number
}
interface SpriteRenderPort {
  add(entity: object, def: SpriteDef): void
  setPose(entity: object, pose: SpritePose): void
  setFrame(entity: object, textureId: string, frame: SpriteFrame['source']): void
  setVisible(entity: object, visible: boolean): void
  setTint(entity: object, color: string, alpha: number): void
  remove(entity: object): void
  setCamera(camera: OrthographicCameraDef): void
  readonly objectCount: number
  dispose(): void
}
~~~

- [x] **Step 1: Write recording-renderer tests**

  Assert add idempotence, pose/frame/visibility/tint updates, unknown-entity no-ops, deterministic layer-to-Z mapping, camera recording, remove, object count, and idempotent dispose.

- [x] **Step 2: Run the recording tests red**

  Run npx vitest run --project engine packages/engine/tests/sprite/recording.test.ts.
  Expected: FAIL because the port/recording modules do not exist.

- [x] **Step 3: Implement the port and createRecordingSpriteRenderer**

  Store immutable observable snapshots per entity and expose reads only from the recording test adapter.

- [x] **Step 4: Run the recording tests green**

  Run the focused test.
  Expected: PASS.

- [x] **Step 5: Add package exports and boundary verification**

  Export the port/recording surface from @automata/engine and run npm run lint -- --quiet plus engine typecheck.

- [x] **Step 6: Commit**

  Commit as feat(engine): add sprite render port and recording adapter.

### Task 4: Implement the Three.js orthographic sprite adapter

**Files:**
- Create: packages/engine/src/sprite/three.ts
- Create: packages/engine/tests/sprite/three.test.ts
- Modify: packages/engine/src/render/rendererFactory.ts
- Modify: packages/engine/src/render/three.ts
- Modify: packages/engine/src/render/browser.ts
- Modify: packages/engine/tests/render/browser.test.ts
- Modify: packages/engine/src/index.ts

**Adapter contract:**

~~~ts
interface ThreeSpriteRenderer {
  port: SpriteRenderPort
  scene: Scene
  camera: OrthographicCamera
  resizeViewport(width: number, height: number): void
}
function createThreeSpriteRenderer(
  textures: ReadonlyMap<string, TextureSource>,
  logicalSize?: { width: number; height: number }
): ThreeSpriteRenderer
~~~

- [x] **Step 1: Write failing Three sprite construction tests**

  Assert OrthographicCamera creation, XY plane geometry, MeshBasicMaterial, NearestFilter textures, transparent sprite materials, source-rectangle UV mapping, pivot offsets, authored Z order, flip/rotation/scale, and camera updates.

- [x] **Step 2: Run Three sprite tests red**

  Run npx vitest run --project engine packages/engine/tests/sprite/three.test.ts.
  Expected: FAIL because createThreeSpriteRenderer does not exist.

- [x] **Step 3: Implement the minimal Three adapter**

  Use one shared PlaneGeometry, texture/material caches keyed by texture/frame/tint, MeshBasicMaterial, and orthographic bounds derived from the 480x270 logical viewport. Keep all Three imports inside packages/engine.

- [x] **Step 4: Run Three sprite tests green**

  Run the focused sprite adapter test.
  Expected: PASS.

- [x] **Step 5: Write failing reuse/disposal tests**

  Assert detached mesh reuse, reset transforms/visibility/tint before reuse, shared geometry, and exactly-once geometry/material/texture disposal.

- [x] **Step 6: Implement pooling and disposal**

  Reuse exact sprite-definition meshes, clear maps on dispose, and make unknown/remove/repeated-dispose calls safe.

- [x] **Step 7: Generalize canvas scene attachment**

  Add resizeViewport to the shared Three scene renderer contract. Update createThreeRenderer and attachCanvasRenderer so perspective and orthographic renderers both resize correctly. Update existing browser tests before implementation and prove their intended red failure.

- [x] **Step 8: Verify the full engine render surface**

  Run npx vitest run --project engine packages/engine/tests/sprite packages/engine/tests/render, engine typecheck, and lint.
  Expected: PASS.

- [x] **Step 9: Run coverage and commit**

  Run npm run coverage. Fix uncovered new production branches with behavior tests. Commit as feat(engine): render orthographic sprites with Three.js.

---

## Phase 2: Deterministic Night Simulation

### Task 5: Add validated night data, geometry, RNG, and fixtures

**Files:**
- Create: games/last-lightkeeper/src/data/schema.ts
- Create: games/last-lightkeeper/src/data/night.ts
- Create: games/last-lightkeeper/src/sim/types.ts
- Create: games/last-lightkeeper/src/sim/rng.ts
- Create: games/last-lightkeeper/tests/data/night.test.ts
- Create: games/last-lightkeeper/tests/sim/rng.test.ts

- [x] **Step 1: Write schema and authored-night failing tests**

  Assert five ordered floors, ladders connecting adjacent floors, all seven stations, four circuits, five tool/supply items, at least four calls including three ship visuals, five timed phases totaling 780 seconds, valid bearings/windows, and invalid-data rejection.

- [x] **Step 2: Run data tests red**

  Run npx vitest run --project last-lightkeeper games/last-lightkeeper/tests/data/night.test.ts.
  Expected: FAIL because the data modules do not exist.

- [x] **Step 3: Implement schemas and the shipped night definition**

  Use z from @automata/engine. Define exact floor/station/item/call/storm/score types and parse the local authored object at module load.

- [x] **Step 4: Write RNG failing tests**

  Assert identical sequences for identical seeds, distinct known sequence for another seed, bounded integer choice, deterministic shuffle, and zero-seed normalization.

- [x] **Step 5: Implement createRng**

  Add a compact unsigned 32-bit deterministic generator with next, int, choose, and shuffle.

- [x] **Step 6: Run focused tests and commit**

  Run both test files and package typecheck. Commit as feat(last-lightkeeper): define the deterministic night.

### Task 6: Create state, actions, reducer, and safe progress persistence

**Files:**
- Create: games/last-lightkeeper/src/state/actions.ts
- Create: games/last-lightkeeper/src/state/night.ts
- Create: games/last-lightkeeper/src/state/progress.ts
- Create: games/last-lightkeeper/src/state/root.ts
- Create: games/last-lightkeeper/tests/state/night.test.ts
- Create: games/last-lightkeeper/tests/state/progress.test.ts
- Create: games/last-lightkeeper/tests/state/root.test.ts

- [x] **Step 1: Write initial-state and scene-action tests**

  Assert title defaults, seeded new-run reset, pause/resume restrictions, instructions/title transitions, and terminal scene transitions.

- [x] **Step 2: Run reducer tests red**

  Run npx vitest run --project last-lightkeeper games/last-lightkeeper/tests/state.
  Expected: FAIL because state modules do not exist.

- [x] **Step 3: Implement actions and reducers with createStore**

  Keep scene/progress/night responsibilities separate. New runs construct fresh deterministic state and pause never mutates simulation time.

- [x] **Step 4: Write persistence validation tests**

  Cover missing value, valid value, malformed JSON, wrong schema version, NaN/negative score, storage read/write exceptions, lower-score no-op, and higher-score save.

- [x] **Step 5: Implement progress load/save**

  Persist schemaVersion, bestScore, bestRescues, and completedRuns through StoragePort; all malformed/error paths return defaults.

- [x] **Step 6: Run state tests and commit**

  Run state tests, package typecheck, and lint. Commit as feat(last-lightkeeper): add run state and safe progress.

### Task 7: Implement keeper movement, ladders, focus, and carrying

**Files:**
- Create: games/last-lightkeeper/src/sim/movement.ts
- Create: games/last-lightkeeper/src/sim/interactions.ts
- Create: games/last-lightkeeper/src/sim/step.ts
- Create: games/last-lightkeeper/tests/sim/movement.test.ts
- Create: games/last-lightkeeper/tests/sim/interactions.test.ts
- Create: games/last-lightkeeper/tests/sim/step.test.ts

- [x] **Step 1: Write movement tests**

  Cover horizontal speed/direction, floor bounds, ladder enter/exit, vertical clamp, collision with floor platforms, fixed-step equivalence, and no movement outside playing.

- [x] **Step 2: Run movement tests red**

  Run the focused movement test and confirm missing implementation failure.

- [x] **Step 3: Implement movement**

  Consume normalized InputVector plus action intents; produce a new keeper pose with movement mode idle/run/climb/carry/operate.

- [x] **Step 4: Write interaction/carry tests**

  Cover nearest focus with priority tie-break, one prompt, take/drop, one-item capacity, rack restoration for reusable tools, consumed supplies, and out-of-range no-op.

- [x] **Step 5: Implement focus and carry/drop**

  Keep interaction queries pure and station/item ids data-driven.

- [x] **Step 6: Compose ordered step input phase**

  Add stepNight(state, intents, dt, services) and prove input/movement/interactions execute before systems that consume station operation.

- [x] **Step 7: Run focused sim tests and commit**

  Commit as feat(last-lightkeeper): add keeper movement and physical interactions.

### Task 8: Implement power routing and machinery pressure

**Files:**
- Create: games/last-lightkeeper/src/sim/power.ts
- Create: games/last-lightkeeper/src/sim/machinery.ts
- Create: games/last-lightkeeper/tests/sim/power.test.ts
- Create: games/last-lightkeeper/tests/sim/machinery.test.ts
- Modify: games/last-lightkeeper/src/sim/step.ts

- [x] **Step 1: Write power tests**

  Assert healthy capacity three, explicit player priority, requested versus powered states, tripped circuits, heat/damage reductions to two/one, deterministic over-capacity cutoff, and breaker-only changes.

- [x] **Step 2: Run power tests red**

  Confirm missing-module failure.

- [x] **Step 3: Implement resolvePower**

  Resolve actual power from generator capacity, circuit availability, requested state, and priority order without hidden globals.

- [x] **Step 4: Write machinery tests**

  Cover generator heat rise/cooldown, overheat damage, pump water reduction, unpowered/jammed pump flooding rise, broken-window ingress, structure damage at high water, and darkness timeout accumulation/reset.

- [x] **Step 5: Implement machinery**

  Keep rates in authored config and clamp all meters. Emit threshold feedback only on state crossings.

- [x] **Step 6: Integrate step order and commit**

  Prove power resolves before machinery consequences. Commit as feat(last-lightkeeper): simulate power and lighthouse machinery.

### Task 9: Implement failures, item-gated repair, and storm scheduling

**Files:**
- Create: games/last-lightkeeper/src/sim/failures.ts
- Create: games/last-lightkeeper/src/sim/director.ts
- Create: games/last-lightkeeper/tests/sim/failures.test.ts
- Create: games/last-lightkeeper/tests/sim/director.test.ts
- Modify: games/last-lightkeeper/src/sim/step.ts

- [x] **Step 1: Write failure/repair tests**

  Cover blown fuse, jammed pump, broken window, beacon misalignment, generator damage, overheating, lightning damage, and radio interference. Assert station proximity, required item, held interaction, duration, interruption behavior, consumption/reuse, and consequence removal.

- [x] **Step 2: Run failure tests red**

  Confirm missing-module failure.

- [x] **Step 3: Implement failure activation and repair**

  Use data-defined requirements and progress; do not special-case repairs in UI.

- [x] **Step 4: Write director tests**

  Assert exact schedules for two seeds, phase eligibility, event cooldowns, stack budget, rising severity, and the authored final-blackout event.

- [x] **Step 5: Implement the deterministic director**

  Advance only on simulation time and use injected RNG. Emit events once and preserve schedule in snapshots.

- [x] **Step 6: Integrate and commit**

  Prove repairs run before due storm events and terminal evaluation remains last. Commit as feat(last-lightkeeper): direct storm failures and repairs.

### Task 10: Implement distress calls, beacon aiming, and rescue outcomes

**Files:**
- Create: games/last-lightkeeper/src/sim/rescue.ts
- Create: games/last-lightkeeper/tests/sim/rescue.test.ts
- Modify: games/last-lightkeeper/src/sim/step.ts

- [x] **Step 1: Write call-state tests**

  Cover incoming, powered-radio acknowledgement, identifying duration, interference pause, bearingKnown, rescue-window open/close, and lost outcome.

- [x] **Step 2: Run rescue tests red**

  Confirm missing-module failure.

- [x] **Step 3: Implement radio call progression**

  Keep each transition explicit and produce readable active-call text data for the HUD.

- [x] **Step 4: Write beacon tests**

  Cover powered/functional requirements, operator proximity, aim bounds, tolerance, hold progress, lock pause/decay on lost aim or power, rescued outcome, unique feedback, and no duplicate scoring.

- [x] **Step 5: Implement aim and guide progression**

  Use vertical intent while operating the beacon; do not advance guidance from UI state.

- [x] **Step 6: Integrate and commit**

  Commit as feat(last-lightkeeper): complete the ship rescue loop.

### Task 11: Add terminal conditions, scoring, and full headless paths

**Files:**
- Create: games/last-lightkeeper/src/sim/terminal.ts
- Create: games/last-lightkeeper/src/sim/score.ts
- Create: games/last-lightkeeper/src/sim/headless.ts
- Create: games/last-lightkeeper/scripts/headless.ts
- Create: games/last-lightkeeper/tests/sim/terminal.test.ts
- Create: games/last-lightkeeper/tests/sim/score.test.ts
- Create: games/last-lightkeeper/tests/integration/headless.test.ts
- Modify: games/last-lightkeeper/package.json

- [x] **Step 1: Write terminal tests**

  Cover flood 100%, integrity 0, unsafe darkness, dawn with fewer than three rescues, and victory at dawn with at least three rescues and valid lighthouse state.

- [x] **Step 2: Implement terminal evaluation**

  Return one stable terminal reason and never mutate a completed run.

- [x] **Step 3: Write scoring tests**

  Assert rescue points, integrity bonus, outage penalty, efficiency bonus, non-negative result, and deterministic rounding.

- [x] **Step 4: Implement score breakdown**

  Return named line items used directly by victory/defeat views and persistence.

- [x] **Step 5: Write full headless integration tests**

  Script real movement, carrying, radio operation, power routing, repairs, beacon aiming, and time advancement to prove one three-rescue victory and one terminal failure.

- [x] **Step 6: Run headless tests red**

  Confirm the harness is absent or cannot complete both paths.

- [x] **Step 7: Implement the harness and CLI**

  Add npm run headless -w last-lightkeeper -- victory and failure modes. Exit non-zero when the expected terminal state or key rescue sequence is not observed.

- [x] **Step 8: Run full game sim tests and commit**

  Run npx vitest run --project last-lightkeeper games/last-lightkeeper/tests/sim games/last-lightkeeper/tests/integration and both CLI modes. Commit as feat(last-lightkeeper): prove complete headless night outcomes.

---

## Phase 3: PixelLab Assets and Presentation

### Task 12: Generate and normalize the PixelLab production set

**Files:**
- Create: games/last-lightkeeper/assets/style-guide.md
- Create: games/last-lightkeeper/assets/manifest.json
- Create: games/last-lightkeeper/assets/prompts.json
- Create: games/last-lightkeeper/public/assets/**/*.png
- Create: games/last-lightkeeper/src/assets/schema.ts
- Create: games/last-lightkeeper/src/assets/load.ts
- Create: games/last-lightkeeper/tests/assets/manifest.test.ts
- Create: games/last-lightkeeper/tests/assets/load.test.ts

- [x] **Step 1: Inspect PixelLab MCP tools**

  Record available generation/edit/animation/output controls. If absent, keep this task open and report the concrete MCP blocker; do not substitute another generator.

- [x] **Step 2: Write the concise style guide**

  Lock palette, logical pixel density, outline weight, lighting direction, silhouette scale, frame size, cadence, transparency, and file naming before generation.

- [x] **Step 3: Write asset manifest schema tests**

  Require unique ids, local PNG paths, dimensions, frame geometry, animation names, PixelLab mapping, source prompt, required-state tags, five keeper animation groups, all station states, five items, three ships, storm layers, dawn, and effects. Reject remote URLs and out-of-bounds frames.

- [x] **Step 4: Run manifest tests red**

  Confirm missing schema/manifest failure.

- [x] **Step 5: Implement manifest validation and loader**

  Parse through zod, verify image lookup completeness, and return actionable missing/invalid asset errors.

- [x] **Step 6: Generate keeper and lighthouse batches with PixelLab**

  Produce idle/run/climb/carry/operate-repair keeper frames plus modular cutaway exterior, ladders, and five distinct floors. Retry smaller coherent batches on failure.

- [x] **Step 7: Generate machinery, item, ship, environment, and effect batches**

  Produce beacon/radio/breaker/workshop/generator/pump active and damaged states; tools/supplies; at least three ships; sea/sky/storm/rocks/dawn; damage/rescue effects.

- [x] **Step 8: Normalize and document generated files**

  Store local PNGs, remove unused generations, record prompts and generated-file mappings, and ensure consistent runtime frame geometry.

- [x] **Step 9: Run asset tests and visually inspect sheets**

  Run the asset test directory. Open all sheets at original resolution and reject clipped, inconsistent, unreadable, or primitive-only results.

- [x] **Step 10: Commit**

  Commit as feat(last-lightkeeper): add PixelLab production art.

### Task 13: Bind simulation state to Three sprite presentation

**Files:**
- Create: games/last-lightkeeper/src/render/world.ts
- Create: games/last-lightkeeper/src/render/animations.ts
- Create: games/last-lightkeeper/src/render/effects.ts
- Create: games/last-lightkeeper/src/render/camera.ts
- Create: games/last-lightkeeper/tests/render/world.test.ts
- Create: games/last-lightkeeper/tests/render/animations.test.ts
- Create: games/last-lightkeeper/tests/render/effects.test.ts
- Create: games/last-lightkeeper/tests/render/camera.test.ts

- [ ] **Step 1: Write world-binding tests**

  With createRecordingSpriteRenderer, assert layers for sky/sea/rocks/tower/stations/items/water/keeper/ships/effects, add/update/remove behavior, station state frames, carried-item pose, and stable object counts.

- [ ] **Step 2: Run world-binding tests red**

  Confirm missing render modules.

- [ ] **Step 3: Implement createWorldPresentation**

  Build sprite entities from manifest ids and update solely from NightState plus render alpha. Keep HUD out of the world renderer.

- [ ] **Step 4: Write and implement animation tests**

  Map keeper idle/run/climb/carry/operate modes, machinery powered/damaged states, rescue ships, and one-shot effect completion through engine animation timing.

- [ ] **Step 5: Write and implement effect tests**

  Cover seeded rain/spray/sparks, water-height visualization, lightning flash, beacon glow/cone, rescue flare, and bounded screen shake triggers.

- [ ] **Step 6: Write and implement camera tests**

  Assert fixed full-tower framing, small focus offset, 480x270 logical viewport, pixel snapping, and shake decay without simulation mutation.

- [ ] **Step 7: Run render tests and commit**

  Commit as feat(last-lightkeeper): present the lighthouse with Three sprites.

### Task 14: Add synthesized audio and feedback routing

**Files:**
- Create: games/last-lightkeeper/src/audio/sounds.ts
- Create: games/last-lightkeeper/src/systems/feedback.ts
- Create: games/last-lightkeeper/tests/audio/sounds.test.ts
- Create: games/last-lightkeeper/tests/systems/feedback.test.ts

- [ ] **Step 1: Write sound registration tests**

  Require storm, machinery, radio, alarm, repair, beacon, rescue, failure, dawn, and UI definitions with valid frequency/duration/gain.

- [ ] **Step 2: Run audio tests red**

  Confirm missing sound table.

- [ ] **Step 3: Implement registerSounds**

  Register synthesized definitions through AudioPort only.

- [ ] **Step 4: Write feedback-routing tests**

  Assert each simulation feedback kind maps to the correct sound and presentation trigger exactly once, with unknown feedback safely ignored.

- [ ] **Step 5: Implement feedback drain**

  Consume queued feedback after simulation and before render; use recording audio/presentation in tests.

- [ ] **Step 6: Commit**

  Commit as feat(last-lightkeeper): add storm and rescue feedback.

---

## Phase 4: Scenes, HUD, Browser Runtime, and Release

### Task 15: Build title, instructions, HUD, pause, victory, and defeat views

**Files:**
- Create: games/last-lightkeeper/src/ui/title.ts
- Create: games/last-lightkeeper/src/ui/instructions.ts
- Create: games/last-lightkeeper/src/ui/hud.ts
- Create: games/last-lightkeeper/src/ui/overlays.ts
- Create: games/last-lightkeeper/tests/ui/title.test.ts
- Create: games/last-lightkeeper/tests/ui/instructions.test.ts
- Create: games/last-lightkeeper/tests/ui/hud.test.ts
- Create: games/last-lightkeeper/tests/ui/overlays.test.ts

- [ ] **Step 1: Write title/instructions tests**

  Assert LAST LIGHTKEEPER heading, premise, best score, start button, instructions route, controls, and numbered six-step rescue loop.

- [ ] **Step 2: Implement title and instructions views**

  Use @automata/game-kit DOM helpers and idempotent dispose.

- [ ] **Step 3: Write HUD tests**

  Assert time, rescues, integrity, flood, heat/capacity, beacon, active call, carried item, requested/powered/tripped circuits, and context prompt update from store without duplicate nodes.

- [ ] **Step 4: Implement HUD**

  Use text/icon/state-class redundancy and one unsubscribe owner.

- [ ] **Step 5: Write terminal/pause overlay tests**

  Assert pause resume/restart/title actions and victory/defeat reason plus score breakdown. Verify all event listeners and subscriptions are removed on dispose.

- [ ] **Step 6: Implement overlays**

  Keep actions store-driven and views simulation-free.

- [ ] **Step 7: Run UI tests and commit**

  Commit as feat(last-lightkeeper): add complete scene UI and HUD.

### Task 16: Compose the browser runtime and responsive presentation

**Files:**
- Create: games/last-lightkeeper/src/game/gameplay.ts
- Create: games/last-lightkeeper/src/input/actions.ts
- Create: games/last-lightkeeper/src/style.css
- Create: games/last-lightkeeper/tests/game/gameplay.test.ts
- Create: games/last-lightkeeper/tests/input/actions.test.ts
- Create: games/last-lightkeeper/tests/main/boot.test.ts
- Modify: games/last-lightkeeper/src/main.ts
- Modify: games/last-lightkeeper/index.html

- [ ] **Step 1: Write gameplay runner tests**

  Assert playing-only fixed updates, paused/terminal freeze, interpolation render, feedback drain, restart disposal, and no DOM/real-time dependency.

- [ ] **Step 2: Implement createGameplay**

  Compose ordered simulation, recording/real sprite port, audio, and store with explicit dispose.

- [ ] **Step 3: Write action-input tests**

  Cover E/Space interact, Q carry/drop, Escape/P pause, key repeat suppression, release state, disposal, and movement through existing keyboard InputSource.

- [ ] **Step 4: Implement action input**

  Return an injected action source with read/consume/dispose; browser events remain outside simulation.

- [ ] **Step 5: Write boot seam and scene-transition tests**

  Exercise a testable boot helper for missing manifest, invalid manifest, failed image, storage failure fallback, scene manager transitions, automatic visibility pause, and complete teardown.

- [ ] **Step 6: Implement main composition**

  Load local manifest/images, create Three sprite renderer, attach canvas, create store/audio/inputs/game/HUD/scenes, start GameLoop, and show a graceful boot error for required data/assets.

- [ ] **Step 7: Implement 16:9 pixel presentation CSS**

  Use a 480x270 logical canvas, nearest-neighbor textures, pixelated CSS scaling, integer-fit letterboxing where possible, safe-area HUD, readable compact prompts, and responsive overlays.

- [ ] **Step 8: Run package tests/build and commit**

  Run npx vitest run --project last-lightkeeper, package typecheck, and npm run build -w last-lightkeeper. Commit as feat(last-lightkeeper): ship browser game runtime.

### Task 17: Add e2e smoke, automated rescue loop, and documentation

**Files:**
- Create: e2e/last-lightkeeper.spec.ts
- Create: games/last-lightkeeper/README.md
- Modify: package.json
- Modify: playwright.config.ts

- [ ] **Step 1: Write the Playwright smoke**

  Assert boot/title, instructions, start, visible Three canvas/HUD, keyboard movement, one interaction prompt/action, pause/resume, no page errors, and no failed asset requests.

- [ ] **Step 2: Run e2e red**

  Run npx playwright test e2e/last-lightkeeper.spec.ts.
  Expected: FAIL until stable test hooks and browser flow are complete.

- [ ] **Step 3: Add minimal deterministic browser test hooks**

  Expose only environment-gated seed/time helpers needed to reach a real call/rescue loop; do not bypass movement, interactions, power, radio, or beacon rules.

- [ ] **Step 4: Add automated rescue-loop e2e**

  Drive the keeper far enough to acknowledge a call, identify its bearing, route power, operate the beacon, and observe rescue confirmation.

- [ ] **Step 5: Run last-lightkeeper e2e green**

  Run the focused Playwright spec and confirm no console errors or failed requests.

- [ ] **Step 6: Write README**

  Document premise, controls, six-step rescue loop, outcomes/scoring, architecture boundaries, PixelLab provenance/manifest, headless/test/build/e2e commands, and production preview command/URL.

- [ ] **Step 7: Commit**

  Commit as test(last-lightkeeper): add browser playthrough and release docs.

### Task 18: Full verification, visual audit, tracker closure, and final commit

**Files:**
- Modify: docs/superpowers/plans/2026-06-27-last-lightkeeper.md
- Modify: AGENTS.md
- Modify: any source/test/assets required by verification findings

- [ ] **Step 1: Run the full game project**

  Run npx vitest run --project last-lightkeeper.
  Expected: all test files pass.

- [ ] **Step 2: Run headless victory and failure**

  Run both CLI modes and capture terminal reasons, rescue count, and score.

- [ ] **Step 3: Run repository CI**

  Run npm run ci.
  Expected: lint, all workspace typechecks, and full Vitest suite pass.

- [ ] **Step 4: Run repository coverage**

  Run npm run coverage.
  Expected: at least 90% lines and branches with no uncovered new production code hidden by exclusions.

- [ ] **Step 5: Run root production build**

  Run npm run build.
  Expected: Monkey Ball, editor, PULSEBREAK, and LAST LIGHTKEEPER production builds pass.

- [ ] **Step 6: Run all Playwright e2e**

  Run npm run e2e.
  Expected: all existing and new browser smokes pass.

- [ ] **Step 7: Serve the production build**

  Serve games/last-lightkeeper/dist at a documented local URL and verify that network requests resolve from built output rather than Vite source.

- [ ] **Step 8: Inspect title and normal play**

  Verify crisp nearest-neighbor scaling, correct 16:9 letterboxing, readable HUD/prompts, production sprites, movement/ladders/carrying, and no console errors.

- [ ] **Step 9: Inspect severe storm and rescue feedback**

  Reach overlapping failures and validate rain/water/sparks/lightning/shake, circuit readability, radio/bearing sequence, beacon aim/hold, three ship silhouettes, and clear success/failure feedback.

- [ ] **Step 10: Inspect pause, victory, and defeat**

  Verify simulation freeze/resume, visibility pause, dawn transition/score, each terminal reason, replay/title flows, and teardown without duplicate UI/listeners.

- [ ] **Step 11: Audit architecture and assets**

  Search for forbidden direct imports, remote runtime URLs, diagnostic logging, dead code, primitive final art, missing manifest entries, unchecked shortcuts, and untracked generated files.

- [ ] **Step 12: Review full diff and task checklist**

  Run git diff --check, git status --short, and rg -n "^- \\[ \\]" this plan. Resolve every incomplete implementation requirement; leave no unchecked item except an explicitly reported unavailable external-tool blocker.

- [ ] **Step 13: Update AGENTS.md only after gates prove completion**

  Add LAST LIGHTKEEPER to the completed/current designs board and record its real dev/build/e2e commands.

- [ ] **Step 14: Commit release closure**

  Commit as docs: mark Last Lightkeeper complete. Confirm a clean worktree and collect all branch commit hashes for handoff.
