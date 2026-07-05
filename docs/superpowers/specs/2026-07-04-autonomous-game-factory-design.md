# Autonomous Game Factory Design

Status: approved in discussion; awaiting written-spec review. Date: 2026-07-04.

Roadmap placement: this document is the strategic parent of the P-series
roadmap (P2 schema unification through P6 generated agent documentation).
Phase 0 below absorbs P3 (project-file migrations) and the other
platform-integrity items (editor hardening, P4 game-kit expansion, deeper
acceptance coverage); Phase 1 is the expanded form of P5 (persistent MCP
sessions). The numbering axes are distinct: P3 is not Phase 3.

## North star

A developer describes a game in natural language. AutomataEngine turns that
description into a complete, coherent browser game by designing, building,
running, evaluating, repairing, and packaging it through a durable autonomous
workflow.

The first credible target is deliberately narrower than arbitrary game
generation:

> Generate a coherent one-to-two-hour game-jam-quality browser game set in a
> compact stylized 3D hub, with three human approval checkpoints and no manual
> code editing.

The target experience may combine social-life RPG, compact open-district,
vehicle, combat, quest, and relationship systems. It must use original names,
characters, writing, and assets rather than copying protected game content.

## Product contract

### Supported envelope

The first production envelope includes:

- one compact outdoor district;
- several instanced interiors;
- player movement and one vehicle type;
- small crowds with schedules;
- dialogue, relationships, quests, shops, inventory, and progression;
- one combat model and a bounded enemy roster;
- a finite main story with optional side content;
- save/load, menus, settings, and credits;
- original stylized 3D art, portraits, animation, SFX, and music; and
- a complete beginning, middle, ending, and playable critical path.

The first shipping target is the browser. Desktop wrappers, native runtimes,
multiplayer, seamless large cities, arbitrary user scripting, photorealism,
and console delivery are outside the initial contract.

Unsupported requests are translated into the nearest supported design and
disclosed at the design checkpoint. The system must not attempt an unbounded
feature and quietly ship a broken approximation.

### Quality bar

"Complete" means coherent game-jam quality:

- the main path is finishable in one to two hours;
- visual and audio direction is consistent;
- generated content contains no placeholders;
- critical systems, saves, and failure recovery work;
- performance remains within the browser budget; and
- known rough edges are non-blocking and disclosed.

It does not mean commercial-indie polish, photorealism, unlimited content, or
perfectly bespoke mechanics.

### Human checkpoints

The workflow pauses at exactly three product checkpoints:

1. **Design approval** — premise, mechanics, supported translations, story
   outline, capability selection, content budget, and acceptance criteria.
2. **Vertical-slice approval** — art direction, controls, dialogue tone, camera,
   combat feel, and the core play loop in a small playable artifact.
3. **Release-candidate approval** — complete playable build, automated evidence,
   known rough edges, and bounded tuning options.

Between checkpoints, the system operates autonomously. A checkpoint presents a
playable artifact and evidence, not only a prose summary.

## Strategic choice

AutomataEngine becomes a **constrained game factory**, not a general-purpose
engine attempting to match Godot or Unreal feature-for-feature.

The factory wins through:

- a bounded class of games;
- machine-readable creative intent;
- reusable, composable capability packs;
- deterministic simulation and headless evaluation;
- structured editor/MCP operations;
- durable build sessions; and
- closed-loop repair.

An unrestricted agent that invents a new architecture for every prompt has
maximum theoretical flexibility and minimum reliability. Compiling into Godot
would gain mature production tooling but introduce a second object model,
runtime, language, editor, and automation boundary. Both remain valid future
options; neither is the first strategy.

## Core model: `GameSpec`

The central new artifact is a versioned `GameSpec`. It is the machine-readable
creative and production contract produced from the user's prompt and approved
at the first checkpoint.

Conceptually, it contains:

```ts
interface GameSpec {
  specVersion: number
  identity: {
    id: string
    title: string
    logline: string
    themes: string[]
    contentRating: string
  }
  direction: {
    visualStyle: string
    audioStyle: string
    dialogueTone: string
    camera: string
  }
  budgets: {
    targetMinutes: number
    districtCount: number
    interiorCount: number
    characterCount: number
    mainQuestCount: number
    sideQuestCount: number
    enemyTypeCount: number
    assetBudget: number
    buildTimeMinutes: number
  }
  capabilities: CapabilitySelection[]
  world: WorldSpec
  cast: CharacterSpec[]
  story: StorySpec
  progression: ProgressionSpec
  assets: AssetRequirement[]
  acceptance: AcceptanceCriterion[]
}
```

These names describe the design boundary, not a final TypeScript API. Each
subsystem receives only the slice it owns.

`GameSpec` is immutable after approval. Later checkpoint changes create a new
version with a recorded reason. Generated code, project documents, assets,
evaluators, and reports record the spec version that produced them.

## System architecture

### 1. Intent compiler

The intent compiler converts the initial prompt into a valid `GameSpec` and a
human-readable design brief.

Responsibilities:

- normalize vague requests into supported mechanics;
- select capability packs and content budgets;
- identify contradictions and unsupported requirements;
- preserve the user's desired fantasy, tone, and differentiators;
- enforce originality and content policy;
- generate acceptance criteria; and
- produce the design checkpoint.

It does not generate game code or assets.

### 2. Capability registry

A capability pack is a reusable, testable vertical gameplay feature. Initial
packs are:

- interaction and inventory;
- branching dialogue and quests;
- schedules and relationships;
- combat and enemy AI;
- economy, shops, and progression;
- compact-hub navigation and one vehicle type; and
- save/load integration.

Each pack owns:

- its `GameSpec` configuration schema;
- project component and resource schemas;
- compiler/runtime systems;
- editor prefabs and preview support;
- headless evaluation hooks;
- generated acceptance tests;
- compatibility declarations with other packs; and
- deterministic fixtures and examples.

Game-specific TypeScript remains an escape hatch. Every escape is recorded as a
capability gap. Repeated gaps should become capability-pack work rather than
repeated one-off generation.

### 3. Content compiler

The content compiler consumes an approved `GameSpec` plus selected capability
packs and produces:

- project scenes and resources;
- world layout and location graph;
- character schedules and relationship data;
- quest and dialogue graphs;
- encounters, rewards, economy, and progression;
- runtime configuration; and
- generated deterministic acceptance fixtures.

It must enforce budgets and graph invariants before browser execution. Content
generation is deterministic from a recorded seed where practical.

### 4. Asset pipeline

The asset pipeline operates through a normalized, versioned asset manifest.
Each asset has a stable logical ID, requirement, provider provenance, license or
generation record, source prompt, transformation history, optimization status,
and references from project content.

Provider adapters may generate or import:

- modular environments and props;
- characters and portraits;
- textures and materials;
- animation clips;
- sound effects, ambience, and music; and
- UI imagery and icons.

Validation checks type, dimensions, poly/texture/audio budgets, import success,
missing references, visual-family consistency, and browser compatibility. A
failed asset is regenerated independently without changing its stable ID.
Fallback assets keep the build diagnosable but cannot remain in a release
candidate.

### 5. Build orchestrator

The orchestrator owns a durable build session. It coordinates the existing
scaffold, project MCP host, build commands, browser execution, evaluators, and
repair jobs.

The session is persisted outside model context and contains:

- approved `GameSpec` versions and checkpoint decisions;
- generated files and artifact hashes;
- asset manifest and provenance;
- commands, patches, and changed-file lists;
- test, build, browser, and evaluation results;
- unresolved defects and repair attempts;
- seeds, token/time/content budgets, and cost; and
- current state plus resumable next action.

The orchestrator is a state machine:

```text
design
  -> waiting-for-design-approval
  -> vertical-slice-production
  -> waiting-for-slice-approval
  -> full-production
  -> release-evaluation
  -> waiting-for-release-approval
  -> complete
```

Every state transition is idempotent or guarded by artifact hashes. A crash,
provider failure, context reset, or process restart resumes from durable state
without replaying successful work blindly.

### 6. Evaluator suite

Evaluation is the core reliability product. Generation quality improves only
when failure is detectable.

The evaluator suite converts results into typed findings with severity,
evidence, affected artifact IDs, reproducible seeds or steps, and suggested
repair scope.

## Data flow

The complete flow is:

```text
prompt
  -> intent compiler
  -> GameSpec and design checkpoint
  -> capability composition
  -> project/content compilation and asset generation
  -> vertical-slice evaluation and checkpoint
  -> full content production
  -> build and evaluation
  -> bounded repair jobs
  -> release checkpoint
  -> browser artifact
```

Agents do not communicate through prose-only handoffs. They exchange versioned
artifacts, typed findings, stable IDs, and declared budgets.

## Evaluation and acceptance

### Structural evaluation

- schemas and project validation;
- reference and asset integrity;
- capability compatibility;
- project-format compatibility;
- required entry scene and ending;
- no placeholder or fallback release assets.

### Deterministic simulation

- quest and progression graph reachability;
- economy solvency;
- combat difficulty envelopes;
- schedule and relationship-state transitions;
- save/load replay equivalence;
- critical-path completion over fixed seeds.

### Automated play

- new game through credits;
- side-content sampling;
- death, mission failure, and recovery;
- save interruption and reload;
- navigation through every required location;
- keyboard and controller critical paths.

### Browser evaluation

- console and network failures;
- frame-time, memory, and loading budgets;
- broken cameras and navigation;
- missing or visually invalid assets;
- unreadable or clipped UI;
- screenshot consistency across required scenes.

### Narrative evaluation

- character, world, and terminology consistency;
- dialogue preconditions and state changes;
- unresolved main-story threads;
- duplicated content and placeholder language;
- pacing against the target playtime.

### Pass rule

A release candidate passes only when:

- the critical path completes repeatedly across fixed seeds;
- every hard structural, runtime, and browser gate passes;
- no unresolved finding can block completion or corrupt saves;
- content and asset budgets are met; and
- remaining defects are explicitly classified as non-blocking.

Subjective model scores may rank alternatives but cannot override deterministic
failures.

## Failure and repair policy

Repairs are bounded jobs. They preserve good artifacts and change the smallest
owned slice that can resolve the finding.

| Failure | Default response |
|---|---|
| Schema or compile failure | Repair from diagnostics and rerun focused gates. |
| Test regression | Isolate the causing change; repair or revert it. |
| Unreachable quest or ending | Use graph/headless traces; repair content constraints. |
| Impossible combat/economy | Tune bounded parameters against deterministic seeds. |
| Browser or visual failure | Use console, trace, performance, and screenshot evidence. |
| Asset failure | Regenerate the asset behind its stable manifest ID. |
| Budget exhaustion | Cut optional content before degrading the critical path. |
| Unsupported prompt feature | Translate to a supported capability and disclose it. |
| Repeated repair failure | Stop with a concrete blocker and evidence. |

The system never suppresses a hard evaluator, weakens a threshold, or deletes a
test merely to declare success.

## Implementation phases

This design spans independent subsystems. It must be executed as separate
spec/plan/verification cycles rather than one monolithic implementation plan.

### Phase 0: Platform integrity

- execute P3 project-file migrations;
- correct editor entity-ID and render-timing hardening;
- expand `@automata/game-kit` around literal game duplication;
- add save/reopen and longer browser acceptance coverage.

Exit: generated projects survive engine evolution and long editing sessions.

### Phase 1: Persistent MCP build sessions

- add project open/swap behavior to workspace MCP mode;
- persist session state, artifacts, findings, budgets, and resume position;
- expose changed-file, build, test, browser, and evaluation results;
- make every operation idempotent or artifact-hash guarded.

Exit: an agent can create, reopen, modify, evaluate, and repair a game across
process and context resets.

### Phase 2: Versioned `GameSpec`

- define the first supported envelope and schemas;
- implement prompt-to-spec generation and validation;
- enforce budgets and capability compatibility;
- produce the design checkpoint artifact.

Exit: ten differently worded prompts produce valid, bounded, reviewable specs.

### Phase 3: Capability packs

Implement the initial seven capability packs with composition, headless
evaluation, and generated acceptance coverage.

Exit: packs compose without game-specific editor or MCP changes.

### Phase 4: Asset pipeline

Add the normalized manifest, provider adapters, provenance, validation,
optimization, stable replacement, and fallback behavior.

Exit: a failed asset can be regenerated independently and every release asset
has valid provenance and browser budgets.

### Phase 5: Content compiler

Generate complete world, cast, quest, dialogue, encounter, economy, and
progression content from `GameSpec` within declared budgets.

Exit: deterministic automation can complete the generated critical path.

### Phase 6: Closed-loop repair

Integrate structural, simulation, browser, visual, narrative, and performance
findings with bounded repair planning.

Exit: seeded platform/content/asset defects are detected and repaired without
human intervention.

### Phase 7: Golden validation game

Generate the compact social/crime hub game from a fresh prompt using only the
three product checkpoints.

Exit: three consecutive fresh runs deliver complete one-to-two-hour games with
no manual code edits. Record generation time, intervention count, repair count,
cost, critical-path completion rate, and remaining non-blocking defects.

## Success metrics

Primary metrics:

- zero manual code or project-file edits;
- three checkpoints or fewer;
- 100% critical-path completion across the acceptance seed set;
- zero blocker/critical findings at release;
- browser performance within declared budget;
- one-to-two-hour measured target playtime; and
- three consecutive successful fresh generations.

Secondary metrics:

- wall-clock and compute cost;
- number and locality of repair attempts;
- percentage of generated behavior covered by capability packs;
- asset regeneration rate;
- content reuse/duplication rate; and
- human checkpoint rejection rate.

## Risks

- **Evaluator blindness:** a game can pass mechanical tests and still be dull.
  Human slice/release checkpoints remain required until evaluation correlates
  with player judgment.
- **Capability combinatorics:** individually correct packs may interact badly.
  Compatibility declarations and pairwise/scenario composition suites are
  required.
- **Content incoherence:** long-form story generation drifts. The story model
  needs explicit facts, state preconditions, arcs, and validation.
- **Asset inconsistency:** provider output varies. Stable manifests, style
  references, validation, and selective regeneration limit drift.
- **Repair loops:** agents may oscillate. Attempt budgets, artifact comparison,
  and escalation stop unbounded retries.
- **Platform scope creep:** requests may push toward a general engine. The intent
  compiler must enforce and disclose the supported envelope.
- **Provider dependence:** all model and asset providers remain behind adapters,
  with durable artifacts preventing provider continuation state from becoming
  the project source of truth.

## Non-goals for the first validation

- a general replacement for Godot, Unity, or Unreal;
- a seamless GTA-scale city;
- multiplayer or live services;
- console delivery;
- photorealistic assets;
- commercial-indie polish;
- arbitrary game genres or arbitrary generated engine code; and
- removal of human creative direction at the three checkpoints.

## Immediate consequence

The next work should not be another game or broad engine feature. Complete the
current P3/platform-integrity work, then design Phase 1 as its own executable
spec: durable MCP build sessions that can create, open, modify, evaluate, and
resume a game across context resets. Every later autonomous-generation feature
depends on that foundation.
