# Tuning Loop + Headless Input Seam (M16b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the autonomous difficulty-banded **tuning loop**: widen the headless input seam so a closed-loop policy can see the world, add a deterministic seek-goal scoring player, a fitness function, a keep/revert optimizer in `@automata/agent-core`, and an editor runner that proposes edits with the LLM, scores them headless, and presents the net change as an undoable batch diff with a score delta.

**Architecture:** Four layers. (1) **Contracts**: widen `HeadlessOpts.input` from `(step) => {x,y}` to `(step, observation: PlayObservation) => {x,y}` — the observation type already exists. (2) **Monkey-ball runtime**: thread a per-step `PlayObservation` (ball position/velocity from the `ball` entity's transform, goal from the level) into `runHeadlessPlay`. (3) **agent-core (pure, contracts-only)**: `createSeekGoalPlayer` (tilt toward the goal each step), `scoreFitness` (band + falls + banana), and `runTuningLoop` — a generic keep/revert optimizer over injected `propose`/`score`/`validate` callbacks, so the game/editor stay out of the leaf. (4) **Editor**: `runTuning` wires the optimizer's callbacks to the real definition (`runHeadlessPlay` + seek-goal + fitness, `validateDoc`, and the LLM via `runAgent` over a sandbox `ToolHost`), and a Tune button in the chat overlay applies the result as a single `commandBatch` with a `diffDocs` preview + score delta.

**Tech Stack:** TypeScript (ES2022, ESM, strict), `@automata/contracts`, `@automata/agent-core`, `@automata/engine` (rapier headless), Vitest ^4.1.8.

Builds on M16a-1 ([contracts](2026-06-21-m16a-shared-contracts.md)), M16a-2 ([agent-core](2026-06-21-m16a-2-agent-core.md)), M16a-3 ([editor host + chat shell](2026-06-21-m16a-3-editor-host-chat-shell.md)), and M16c ([preview/confirm](2026-06-21-m16c-preview-confirm.md) — reuses `commandBatch` + `diffDocs`). Follow-on: M16d ([MCP server](2026-06-21-m16d-mcp-server.md)). Full design: [`docs/superpowers/specs/2026-06-21-editor-mcp-tuning-design.md`](../specs/2026-06-21-editor-mcp-tuning-design.md).

## Global Constraints

- The agent is **never** in the deterministic runtime loop — it only proposes authoring edits. The runtime runs scripted/headless play **only for scoring**.
- `agent-core` stays a contracts-only leaf: `seekGoalPlayer`, `fitness`, and `loop` import nothing but `@automata/contracts`. The optimizer is generic over an opaque `State`; the game-specific `score`/`propose`/`validate` are injected by the editor.
- The headless input-seam widening is **backward-compatible**: `input` stays optional and the no-input baseline plus existing `() => {x,y}` callers keep working (a `() => …` / `(step) => …` lambda is assignable to `(step, observation) => …`).
- The tuning result applies as a **single** `commandBatch` (one undo step) — the optimizer tracks the cumulative command list from the original doc to the best doc by advancing its seed only on accepted iterations.
- `validateDoc` is the hard floor: proposals that don't validate are rejected before scoring.
- Coverage gate (90% over `packages/engine/src/**`, `packages/editor/src/**`, `packages/contracts/src/**`, `packages/agent-core/src/**`) stays green. Monkey-ball's own per-package suite stays green; `games/**` is not in the coverage `include`, but its tests must pass.

---

### Task 1: Widen `HeadlessOpts.input` to receive a `PlayObservation`

**Files:**
- Modify: `packages/contracts/src/eval.ts` (input signature)
- Modify: `packages/contracts/tests/eval.test.ts` (lock the new signature)

**Interfaces:**
- Consumes: `PlayObservation` (already defined in `eval.ts`).
- Produces: `HeadlessOpts.input?: (step: number, observation: PlayObservation) => { x: number; y: number }`.

- [x] **Step 1: Write the failing test**

Append to `packages/contracts/tests/eval.test.ts`:

```ts
import type { HeadlessOpts, PlayObservation } from '../src/eval'

describe('HeadlessOpts.input', () => {
  it('receives a PlayObservation and returns a 2D tilt input', () => {
    const obs: PlayObservation = {
      step: 1,
      ball: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
      goal: { x: 0, y: 0, z: -6 }
    }
    const opts: HeadlessOpts = { maxSteps: 10, input: (step, o) => ({ x: o.goal.z, y: step }) }
    expect(opts.input!(2, obs)).toEqual({ x: -6, y: 2 })
  })

  it('still accepts a no-arg input lambda (backward compatible)', () => {
    const opts: HeadlessOpts = { maxSteps: 10, input: () => ({ x: 0, y: 1 }) }
    expect(opts.input!(0, { step: 0, ball: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }, goal: { x: 0, y: 0, z: 0 } })).toEqual({ x: 0, y: 1 })
  })
})
```

> If `eval.test.ts` already imports `describe/it/expect`, do not re-import them; add only the type import.

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project contracts tests/eval.test.ts`
Expected: FAIL — typecheck error: `input` declared as `(step: number) => ...` cannot be called with two args / the `(step, o)` lambda's second param has no type. (Vitest surfaces this as a transform/type error.)

- [x] **Step 3: Widen the signature**

In `packages/contracts/src/eval.ts`, change the `HeadlessOpts` interface:

```ts
export interface HeadlessOpts {
  input?: (step: number, observation: PlayObservation) => { x: number; y: number }
  maxSteps: number
}
```

Leave `PlayObservation` (declared later in the file) unchanged; TypeScript hoists the interface so the forward reference resolves.

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project contracts tests/eval.test.ts`
Expected: PASS (existing eval tests + 2 new ones).

- [x] **Step 5: Confirm the whole repo still typechecks (existing callers unaffected)**

Run: `npm run typecheck && npm run test`
Expected: PASS. The monkey-ball headless tests (`input: () => ({ x: 0, y: 1 })` and the no-input baseline) still compile and pass — `input` is still optional and the old lambda shape is assignable to the widened signature.

- [x] **Step 6: Commit**

```bash
git add packages/contracts/src/eval.ts packages/contracts/tests/eval.test.ts
git commit -m "feat(contracts): widen HeadlessOpts.input to receive a PlayObservation"
```

---

### Task 2: Thread `PlayObservation` through monkey-ball's `runHeadlessPlay`

**Files:**
- Modify: `games/monkey-ball/src/level/headlessPlay.ts`
- Modify: `games/monkey-ball/tests/level/headlessPlay.test.ts` (add an observation-driven test)

**Interfaces:**
- Consumes: `PlayObservation` from `@automata/editor` (re-exported from contracts); `World`, `Vec3` from `@automata/engine`; `Entity` from `../entity`.
- Produces: `runHeadlessPlay` populates a per-step `PlayObservation` (ball pos from `world.with('ball','transform').first`, velocity from `position - prevPosition` over `dt`, goal from `level.goal.pos`) and passes it to `opts.input`.

- [x] **Step 1: Write the failing test**

Append to `games/monkey-ball/tests/level/headlessPlay.test.ts`:

```ts
it('exposes the ball position and goal to a closed-loop input policy', async () => {
  const seen: { ballZ: number; goalZ: number }[] = []
  await runHeadlessPlay(level, lib, tuning, {
    input: (_step, obs) => {
      seen.push({ ballZ: obs.ball.position.z, goalZ: obs.goal.z })
      return { x: 0, y: 1 }
    },
    maxSteps: 30
  })
  expect(seen.length).toBeGreaterThan(0)
  // w1-l1: ball spawns near z=6, goal sits at z=-6.
  expect(seen[0]!.goalZ).toBe(-6)
  expect(seen[0]!.ballZ).toBeGreaterThan(0)
}, 20000)
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project monkey-ball tests/level/headlessPlay.test.ts`
Expected: FAIL — the current `input` is called with one argument, so `obs` is `undefined` and `obs.ball.position.z` throws.

- [x] **Step 3: Thread the observation**

Replace the whole of `games/monkey-ball/src/level/headlessPlay.ts` with:

```ts
import {
  createNullAudio,
  createNullRenderer,
  createRapierPhysics,
  type ArchetypeLibrary,
  type InputSource,
  type Vec3,
  type World
} from '@automata/engine'
import type { HeadlessOpts, PlayObservation, TestPlayResult } from '@automata/editor'
import type { PhysicsTuning } from '../data/config'
import type { Level } from '../data/level'
import type { Entity } from '../entity'
import { createGameplay } from '../game/gameplay'
import { createGameStore } from '../state/root'

/** Reads the live ball pose into a PlayObservation; velocity is the per-step displacement. */
function readObservation(world: World<Entity>, goal: Vec3, step: number, dt: number): PlayObservation {
  const ball = world.with('ball', 'transform').first
  const position = ball ? ball.transform.position : { x: 0, y: 0, z: 0 }
  const prev = ball ? ball.transform.prevPosition : position
  const inv = 1 / dt
  return {
    step,
    ball: {
      position: { x: position.x, y: position.y, z: position.z },
      velocity: { x: (position.x - prev.x) * inv, y: (position.y - prev.y) * inv, z: (position.z - prev.z) * inv }
    },
    goal
  }
}

/** Runs real gameplay systems headless and returns deterministic play metrics. */
export async function runHeadlessPlay(
  level: Level,
  lib: ArchetypeLibrary,
  tuning: PhysicsTuning,
  opts: HeadlessOpts
): Promise<TestPlayResult> {
  const physics = await createRapierPhysics()
  const render = createNullRenderer()
  const audio = createNullAudio()
  const store = createGameStore()

  const goal: Vec3 = { x: level.goal.pos[0], y: level.goal.pos[1], z: level.goal.pos[2] }
  let step = 0
  let observation: PlayObservation = {
    step: 0,
    ball: {
      position: { x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] },
      velocity: { x: 0, y: 0, z: 0 }
    },
    goal
  }
  const scripted: InputSource = {
    read: () => (opts.input ? opts.input(step, observation) : { x: 0, y: 0 }),
    dispose() {}
  }

  const game = createGameplay({
    store,
    physics,
    render: render.port,
    audio: audio.port,
    lib,
    level,
    tuning,
    inputSources: [scripted]
  })

  store.dispatch({ type: 'levelStarted', levelId: level.id })

  const dt = 1 / 60
  let steps = 0
  for (; steps < opts.maxSteps; steps++) {
    const scene = store.getState().scene
    if (scene === 'levelComplete' || scene === 'gameOver') break

    observation = readObservation(game.world, goal, step, dt)
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
    fallCount: Math.max(0, session.runId - 1),
    bananas: session.bananas,
    steps
  }

  game.dispose()
  physics.dispose()

  return result
}
```

> The observation is read **before** each `game.fixedUpdate`, so the `scripted` input source (read inside `fixedUpdate` via `mergeInputs`) sees the current pose. `game.world` is the existing `readonly world` on the `Gameplay` handle; the `ball` tag + `transform.prevPosition` come from the engine `Entity`.

- [x] **Step 4: Run the new + existing headless tests**

Run: `npx vitest run --project monkey-ball tests/level/headlessPlay.test.ts`
Expected: PASS — the new observation test, plus the existing "no input rests" and "rolling forward reaches the goal" tests (the no-input and `() => ({ x: 0, y: 1 })` callers are unchanged in behavior).

- [x] **Step 5: Commit**

```bash
git add games/monkey-ball/src/level/headlessPlay.ts games/monkey-ball/tests/level/headlessPlay.test.ts
git commit -m "feat(monkey-ball): thread PlayObservation through runHeadlessPlay"
```

---

### Task 3: Fitness function (`scoreFitness`)

**Files:**
- Create: `packages/agent-core/src/tuning/fitness.ts`
- Create: `packages/agent-core/tests/tuning/fitness.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `TestPlayResult` from `@automata/contracts`.
- Produces: type `FitnessTarget`; value `scoreFitness(result, target): number`.

- [x] **Step 1: Write the failing test**

`packages/agent-core/tests/tuning/fitness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { scoreFitness, type FitnessTarget } from '../../src/tuning/fitness'
import type { TestPlayResult } from '@automata/contracts'

const result = (over: Partial<TestPlayResult>): TestPlayResult => ({
  outcome: 'completed', timeMs: 1000, fallCount: 0, bananas: 0, steps: 600, ...over
})
const band: FitnessTarget = { minSteps: 300, maxSteps: 900 }

describe('scoreFitness', () => {
  it('scores an in-band completion with no falls at 1', () => {
    expect(scoreFitness(result({ steps: 600 }), band)).toBe(1)
  })

  it('scores an unsolved level at 0', () => {
    expect(scoreFitness(result({ outcome: 'incomplete' }), band)).toBe(0)
    expect(scoreFitness(result({ outcome: 'gameOver' }), band)).toBe(0)
  })

  it('penalizes rest-falls', () => {
    expect(scoreFitness(result({ fallCount: 1 }), band)).toBeLessThan(1)
  })

  it('tapers reward for completions outside the step band', () => {
    expect(scoreFitness(result({ steps: 1800 }), band)).toBeLessThan(1) // slower than the band
    expect(scoreFitness(result({ steps: 150 }), band)).toBeLessThan(1) // faster than the band
  })

  it('adds a banana bonus when the target is met', () => {
    const target: FitnessTarget = { ...band, bananas: 2 }
    expect(scoreFitness(result({ bananas: 3 }), target)).toBeGreaterThan(1)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project agent-core tests/tuning/fitness.test.ts`
Expected: FAIL ("Cannot find module '../../src/tuning/fitness'").

- [x] **Step 3: Implement fitness**

`packages/agent-core/src/tuning/fitness.ts`:

```ts
import type { TestPlayResult } from '@automata/contracts'

export interface FitnessTarget {
  /** Reward completion in the step band [minSteps, maxSteps]; outside it tapers. */
  minSteps: number
  maxSteps: number
  /** Optional: bonus when the run picks up at least this many bananas. */
  bananas?: number
}

/** Scores a TestPlayResult; higher is better. Completion in-band + zero falls (+ optional banana). */
export function scoreFitness(result: TestPlayResult, target: FitnessTarget): number {
  if (result.outcome !== 'completed') return 0
  let score = 1
  if (result.steps < target.minSteps) score -= (target.minSteps - result.steps) / target.minSteps
  else if (result.steps > target.maxSteps) score -= (result.steps - target.maxSteps) / target.maxSteps
  score -= result.fallCount * 0.5
  if (target.bananas !== undefined && result.bananas >= target.bananas) score += 0.25
  return score
}
```

- [x] **Step 4: Export from the barrel**

In `packages/agent-core/src/index.ts`, add:

```ts
export * from './tuning/fitness'
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project agent-core tests/tuning/fitness.test.ts`
Expected: PASS (5 tests).

- [x] **Step 6: Commit**

```bash
git add packages/agent-core/src/tuning/fitness.ts packages/agent-core/src/index.ts \
  packages/agent-core/tests/tuning/fitness.test.ts
git commit -m "feat(agent-core): difficulty-band fitness function"
```

---

### Task 4: Seek-goal player + monkey-ball integration test

**Files:**
- Create: `packages/agent-core/src/tuning/seekGoalPlayer.ts`
- Create: `packages/agent-core/tests/tuning/seekGoalPlayer.test.ts`
- Create: `games/monkey-ball/tests/level/seekGoalPlay.test.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `games/monkey-ball/package.json` (dev-dep on `@automata/agent-core` for the integration test)

**Interfaces:**
- Consumes: `PlayObservation` from `@automata/contracts`.
- Produces: type `SeekGoalOptions`; value `createSeekGoalPlayer(opts?): (step, observation) => { x: number; y: number }`.

- [x] **Step 1: Write the failing unit test (agent-core)**

`packages/agent-core/tests/tuning/seekGoalPlayer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSeekGoalPlayer } from '../../src/tuning/seekGoalPlayer'
import type { PlayObservation } from '@automata/contracts'

const obs = (bx: number, bz: number, gx: number, gz: number): PlayObservation => ({
  step: 0,
  ball: { position: { x: bx, y: 0, z: bz }, velocity: { x: 0, y: 0, z: 0 } },
  goal: { x: gx, y: 0, z: gz }
})

describe('createSeekGoalPlayer', () => {
  it('steers toward a goal ahead in -z with positive input.y and ~zero input.x', () => {
    const seek = createSeekGoalPlayer()
    const input = seek(0, obs(0, 6, 0, -6))
    expect(input.y).toBeGreaterThan(0)
    expect(Math.abs(input.x)).toBeLessThan(1e-9)
  })

  it('returns zero input within the arrive radius', () => {
    const seek = createSeekGoalPlayer({ arriveRadius: 1 })
    expect(seek(0, obs(0, 0.2, 0, 0))).toEqual({ x: 0, y: 0 })
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project agent-core tests/tuning/seekGoalPlayer.test.ts`
Expected: FAIL ("Cannot find module '../../src/tuning/seekGoalPlayer'").

- [x] **Step 3: Implement the seek-goal player**

`packages/agent-core/src/tuning/seekGoalPlayer.ts`:

```ts
import type { PlayObservation } from '@automata/contracts'

export interface SeekGoalOptions {
  /** Stop steering within this XZ distance of the goal. Default 0.5. */
  arriveRadius?: number
}

/**
 * A deterministic closed-loop scoring controller: each step, tilt toward the goal in the
 * XZ plane. `input.y` drives the forward/back (z) axis, `input.x` the lateral (x) axis —
 * matching tiltControl's input→gravity mapping. Used only for scoring, never in real play.
 */
export function createSeekGoalPlayer(opts: SeekGoalOptions = {}): (step: number, observation: PlayObservation) => { x: number; y: number } {
  const arrive = opts.arriveRadius ?? 0.5
  return (_step, observation) => {
    const dx = observation.goal.x - observation.ball.position.x
    const dz = observation.goal.z - observation.ball.position.z
    const dist = Math.hypot(dx, dz)
    if (dist <= arrive) return { x: 0, y: 0 }
    // Forward toward -z needs input.y > 0 (tiltControl: input.y → tiltX → gravity in ±z;
    // the proven straight-roll input is { x: 0, y: 1 } toward -z). Lateral uses input.x.
    return { x: dx / dist, y: -dz / dist }
  }
}
```

> The `input.x` sign is not exercised by the `w1-l1` integration test below (its goal sits at `x = 0`, same as spawn, so `dx ≈ 0`). If a future laterally-offset level steers the wrong way, flip the `x` term to `-dx / dist`.

- [x] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run --project agent-core tests/tuning/seekGoalPlayer.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Export from the barrel**

In `packages/agent-core/src/index.ts`, add:

```ts
export * from './tuning/seekGoalPlayer'
```

- [x] **Step 6: Add the integration test (monkey-ball)**

In `games/monkey-ball/package.json`, add `"@automata/agent-core": "*"` to the `devDependencies` object (create the object if absent), then run `npm install`.

`games/monkey-ball/tests/level/seekGoalPlay.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { createSeekGoalPlayer } from '@automata/agent-core'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { levelKind, type Level } from '../../src/data/level'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('seek-goal player drives headless play', () => {
  it('completes a solvable level', async () => {
    const result = await runHeadlessPlay(level, lib, tuning, { input: createSeekGoalPlayer(), maxSteps: 3000 })
    expect(result.outcome).toBe('completed')
  }, 20000)

  it('does not complete when the goal is unreachable', async () => {
    // Lift the goal sensor out of reach in y; the player still seeks its XZ position but never overlaps it.
    const unreachable: Level = { ...level, goal: { pos: [level.goal.pos[0], 100, level.goal.pos[2]] } }
    const result = await runHeadlessPlay(unreachable, lib, tuning, { input: createSeekGoalPlayer(), maxSteps: 600 })
    expect(result.outcome).not.toBe('completed')
  }, 20000)
})
```

- [x] **Step 7: Run the integration test**

Run: `npx vitest run --project monkey-ball tests/level/seekGoalPlay.test.ts`
Expected: PASS (2 tests). The solvable run rolls straight down `-z` (goal at `x=0`) and reaches the goal; the unreachable run never overlaps the lifted goal sensor.

- [x] **Step 8: Commit**

```bash
git add packages/agent-core/src/tuning/seekGoalPlayer.ts packages/agent-core/src/index.ts \
  packages/agent-core/tests/tuning/seekGoalPlayer.test.ts \
  games/monkey-ball/tests/level/seekGoalPlay.test.ts games/monkey-ball/package.json package-lock.json
git commit -m "feat(agent-core): seek-goal scoring player + monkey-ball integration test"
```

---

### Task 5: Keep/revert tuning optimizer (`runTuningLoop`)

**Files:**
- Create: `packages/agent-core/src/tuning/loop.ts`
- Create: `packages/agent-core/tests/tuning/loop.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: nothing (generic over `State`).
- Produces: types `TuningLoopOptions<State>`, `TuningResult<State>`; value `runTuningLoop<State>(opts): Promise<TuningResult<State>>`.

- [ ] **Step 1: Write the failing test**

`packages/agent-core/tests/tuning/loop.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runTuningLoop } from '../../src/tuning/loop'

describe('runTuningLoop', () => {
  it('keeps a candidate only when it beats the best score', async () => {
    const proposals = [10, 5, 20] // state IS its score in this test
    let i = 0
    const result = await runTuningLoop<number>({
      initial: 0,
      score: async (s) => s,
      propose: async () => proposals[i++]!,
      validate: () => true,
      maxIterations: 3
    })
    expect(result.best).toBe(20)
    expect(result.bestScore).toBe(20)
    expect(result.accepted).toBe(2) // 10 (>0) and 20 (>10) kept; 5 reverted
  })

  it('rejects proposals that fail validation and stops after patience', async () => {
    const result = await runTuningLoop<number>({
      initial: 1,
      score: async (s) => s,
      propose: async () => 99,
      validate: () => false,
      maxIterations: 5,
      patience: 2
    })
    expect(result.best).toBe(1)
    expect(result.accepted).toBe(0)
    expect(result.iterations).toBe(2)
  })

  it('stops early once the target score is reached', async () => {
    let calls = 0
    const result = await runTuningLoop<number>({
      initial: 0,
      score: async (s) => s,
      propose: async () => {
        calls += 1
        return 100
      },
      validate: () => true,
      target: 50,
      maxIterations: 10
    })
    expect(result.bestScore).toBeGreaterThanOrEqual(50)
    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project agent-core tests/tuning/loop.test.ts`
Expected: FAIL ("Cannot find module '../../src/tuning/loop'").

- [ ] **Step 3: Implement the optimizer**

`packages/agent-core/src/tuning/loop.ts`:

```ts
export interface TuningLoopOptions<State> {
  /** Starting state; also the baseline score the first proposal must beat. */
  initial: State
  /** Propose an edited state from the current best (LLM-driven in the editor). */
  propose: (best: State, bestScore: number, iteration: number) => Promise<State>
  /** Fitness of a state; higher is better. */
  score: (state: State) => Promise<number>
  /** Hard floor: proposals that fail validation are reverted before scoring. */
  validate: (state: State) => boolean
  /** Stop once bestScore ≥ target. */
  target?: number
  /** Max proposal iterations. Default 10. */
  maxIterations?: number
  /** Stop after this many consecutive non-improving (or invalid) iterations. Default 3. */
  patience?: number
}

export interface TuningResult<State> {
  best: State
  bestScore: number
  /** Number of proposal iterations attempted. */
  iterations: number
  /** Number of proposals kept (beat the best). */
  accepted: number
}

export async function runTuningLoop<State>(opts: TuningLoopOptions<State>): Promise<TuningResult<State>> {
  const maxIterations = opts.maxIterations ?? 10
  const patience = opts.patience ?? 3

  let best = opts.initial
  let bestScore = await opts.score(best)
  let accepted = 0
  let stale = 0
  let iterations = 0

  while (iterations < maxIterations) {
    if (opts.target !== undefined && bestScore >= opts.target) break
    iterations += 1

    const candidate = await opts.propose(best, bestScore, iterations - 1)
    if (!opts.validate(candidate)) {
      if (++stale >= patience) break
      continue
    }

    const candidateScore = await opts.score(candidate)
    if (candidateScore > bestScore) {
      best = candidate
      bestScore = candidateScore
      accepted += 1
      stale = 0
    } else if (++stale >= patience) {
      break
    }
  }

  return { best, bestScore, iterations, accepted }
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/agent-core/src/index.ts`, add:

```ts
export * from './tuning/loop'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project agent-core tests/tuning/loop.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/tuning/loop.ts packages/agent-core/src/index.ts \
  packages/agent-core/tests/tuning/loop.test.ts
git commit -m "feat(agent-core): keep/revert tuning optimizer (target + patience)"
```

---

### Task 6: Editor tuning runner (wire the optimizer to the real definition)

**Files:**
- Create: `packages/editor/src/agent/tuningRunner.ts`
- Create: `packages/editor/tests/agent/tuningRunner.test.ts`
- Modify: `packages/editor/src/index.ts`

**Interfaces:**
- Consumes: `createSeekGoalPlayer`, `runAgent`, `runTuningLoop`, `scoreFitness`, types `FitnessTarget`, `ProviderAdapter` from `@automata/agent-core`; `SceneCommand` from `@automata/contracts`; `EditorCore` from `../host`; `createEditorToolHost` from `./editorToolHost`; `validateDoc` from `../io/validation`.
- Produces: types `TuningState<Doc>`, `TuningRunOptions<Doc>`, `TuningRunResult<Doc>`; value `runTuning<Doc>(opts): Promise<TuningRunResult<Doc>>`.

- [ ] **Step 1: Write the failing test**

`packages/editor/tests/agent/tuningRunner.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import type { TestPlayResult } from '@automata/contracts'
import type { ProviderAdapter } from '@automata/agent-core'
import { createEditor } from '../../src/host'
import { runTuning } from '../../src/agent/tuningRunner'
import { boxItem, markerItem, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = (): PhysicsPort =>
  ({
    addBody() {}, removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {}, setKinematicTarget() {},
    get bodyCount() { return 0 }, dispose() {}
  }) as PhysicsPort

const provider: ProviderAdapter = { id: 'anthropic', defaultModel: 'm', send: vi.fn() }

function definitionScoring(scores: number[]) {
  // Each runHeadlessPlay call returns a result whose `steps` drives the injected fitness.
  let i = 0
  return {
    ...playableDefinition,
    play: {
      ...playableDefinition.play!,
      runHeadlessPlay: async (): Promise<TestPlayResult> =>
        ({ outcome: 'completed', timeMs: 0, fallCount: 0, bananas: 0, steps: scores[i++] ?? 0 })
    }
  }
}

describe('runTuning', () => {
  it('keeps a proposal that beats the baseline and returns its cumulative commands + score', async () => {
    // Fitness band is [300, 900] steps. Baseline scores 1800 (out of band → fitness 0);
    // proposal #1 scores 600 (in band → fitness 1) and is kept; proposal #2 scores 1800 (rejected).
    const definition = definitionScoring([1800, 600, 1800])
    const editor = createEditor<FakeDoc>({ definition, render: createNullRenderer().port, physics: nullPhysics() })
    // Seed a `start` marker so the doc validates (the fake palette requires one, cardinality min 1);
    // without it the validateDoc floor rejects every proposal before it can be scored, and the
    // keep/accept path never runs.
    editor.store.dispatch({ type: 'loadDoc', doc: { title: 'lvl', items: [boxItem('a'), markerItem('start')] } })

    // Each proposal adds one box via the agent (we drive the host directly here).
    const runAgentFn = vi.fn(async ({ host }: { host: { executeTool: (n: string, a: unknown) => Promise<unknown> } }) => {
      await host.executeTool('addItem', { item: boxItem(`b${runAgentFn.mock.calls.length}`) })
      return { finalText: '', messages: [], executed: [], stoppedBy: 'end' as const }
    })

    const result = await runTuning<FakeDoc>({
      core: editor,
      provider,
      prompt: 'make it easier',
      target: { minSteps: 300, maxSteps: 900 },
      maxIterations: 2,
      runAgentFn
    })

    // The accept path actually ran: one proposal beat the baseline and was kept.
    expect(runAgentFn).toHaveBeenCalled()
    expect(result.accepted).toBe(1)
    expect(result.score).toBe(1)
    expect(result.commands).toHaveLength(1) // the single kept proposal added one box
    // boxItem('a') + start marker + the one kept box.
    expect(playableDefinition.scene.listItems(result.doc)).toHaveLength(3)
    // The live store was not mutated by tuning (apply is the caller's job).
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(2)
  })

  it('throws when the definition has no test-play support', async () => {
    const { play, ...noPlay } = playableDefinition
    void play
    const editor = createEditor<FakeDoc>({ definition: noPlay, render: createNullRenderer().port, physics: nullPhysics() })
    await expect(
      runTuning<FakeDoc>({ core: editor, provider, prompt: 'x', target: { minSteps: 1, maxSteps: 2 } })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/agent/tuningRunner.test.ts`
Expected: FAIL ("Cannot find module '../../src/agent/tuningRunner'").

- [ ] **Step 3: Implement the tuning runner**

`packages/editor/src/agent/tuningRunner.ts`:

```ts
import {
  createSeekGoalPlayer,
  runAgent,
  runTuningLoop,
  scoreFitness,
  type FitnessTarget,
  type ProviderAdapter
} from '@automata/agent-core'
import type { SceneCommand } from '@automata/contracts'
import type { EditorCore } from '../host'
import { validateDoc } from '../io/validation'
import { createEditorToolHost } from './editorToolHost'

const TUNING_SYSTEM =
  'You tune a game level for solvability. Use the tools to make small layout/tuning edits that ' +
  'keep the level valid and beatable, then stop. Prefer the smallest change that helps.'

export interface TuningState<Doc> {
  doc: Doc
  /** Cumulative commands from the original doc to this state (for a single-undo-step apply). */
  commands: SceneCommand[]
}

export interface TuningRunOptions<Doc> {
  core: EditorCore<Doc>
  provider: ProviderAdapter
  /** The tuning instruction handed to the LLM each proposal. */
  prompt: string
  target: FitnessTarget
  /** Headless play step cap per scoring run. Default 3000. */
  maxSteps?: number
  maxIterations?: number
  /** Injected for tests; defaults to the real agent-core loop. */
  runAgentFn?: typeof runAgent
}

export interface TuningRunResult<Doc> {
  doc: Doc
  commands: SceneCommand[]
  score: number
  iterations: number
  accepted: number
}

/** Drives the keep/revert optimizer with LLM proposals scored by seek-goal headless play. */
export async function runTuning<Doc>(opts: TuningRunOptions<Doc>): Promise<TuningRunResult<Doc>> {
  const { core, provider } = opts
  const definition = core.definition
  if (!definition.play) throw new Error('this game has no test-play support')
  const play = definition.play
  const maxSteps = opts.maxSteps ?? 3000
  const runAgentFn = opts.runAgentFn ?? runAgent
  const seek = createSeekGoalPlayer()

  const score = async (state: TuningState<Doc>): Promise<number> => {
    const result = await play.runHeadlessPlay(state.doc, { maxSteps, input: seek })
    return scoreFitness(result, opts.target)
  }
  const validate = (state: TuningState<Doc>): boolean => validateDoc(definition, state.doc).exportable
  const propose = async (best: TuningState<Doc>): Promise<TuningState<Doc>> => {
    const host = createEditorToolHost<Doc>({ definition, initialDoc: best.doc })
    await runAgentFn({ provider, host, system: TUNING_SYSTEM, prompt: opts.prompt })
    return { doc: host.doc, commands: [...best.commands, ...host.commands] }
  }

  const loop = await runTuningLoop<TuningState<Doc>>({
    initial: { doc: core.store.getState().document.doc, commands: [] },
    propose,
    score,
    validate,
    maxIterations: opts.maxIterations
  })

  return {
    doc: loop.best.doc,
    commands: loop.best.commands,
    score: loop.bestScore,
    iterations: loop.iterations,
    accepted: loop.accepted
  }
}
```

- [ ] **Step 4: Export from the editor barrel**

In `packages/editor/src/index.ts`, add after the `diff` export:

```ts
export * from './agent/tuningRunner'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/agent/tuningRunner.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/agent/tuningRunner.ts packages/editor/tests/agent/tuningRunner.test.ts \
  packages/editor/src/index.ts
git commit -m "feat(editor): tuning runner (LLM propose + seek-goal score + keep/revert)"
```

---

### Task 7: Tune button in the chat overlay (net diff + score delta + apply)

**Files:**
- Modify: `packages/editor/src/ui/chatOverlay.ts` (Tune affordance + result rendering)
- Modify: `packages/editor/src/ui/theme.css.ts` (tune button style)
- Modify: `packages/editor/tests/ui/chatOverlay.test.ts` (assert tune renders diff + score + applies)

**Interfaces:**
- Consumes: `diffDocs` from `../agent/diff`; `TuningRunResult` from `../agent/tuningRunner`; `core.store.dispatch({ type: 'commandBatch', commands })`.
- Produces: `ChatOverlayDeps<Doc>` gains an optional `tune` callback; a `.ed-chat-tune` button renders the net diff + `score N.NN` line + an `.ed-chat-apply` button.

- [ ] **Step 1: Write the failing test**

Add to `packages/editor/tests/ui/chatOverlay.test.ts` a new test (reuse the file's `makeEditor`/`settings`/`flush` helpers):

```ts
it('runs a tuning pass, shows the net diff + score, and applies as one undo step', async () => {
  const editor = makeEditor()
  const parent = document.createElement('div')
  const tune = vi.fn(async () => ({
    doc: { title: 'lvl', items: [boxItem('a'), boxItem('tuned')] } as FakeDoc,
    commands: [{ type: 'addItem' as const, item: boxItem('tuned') }],
    score: 0.87,
    iterations: 2,
    accepted: 1
  }))
  const panel = mountChatOverlay(editor, parent, { loadSettings: () => settings, saveSettings: () => {}, run: vi.fn(), tune })
  panel.update(editor.store.getState())

  parent.querySelector<HTMLButtonElement>('.ed-chat-tune')!.click()
  await flush()

  expect(tune).toHaveBeenCalled()
  const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
  expect(log).toContain('score 0.87')
  expect(log).toContain('added box (tuned)')

  const pastBefore = editor.store.getState().document.past.length
  parent.querySelector<HTMLButtonElement>('.ed-chat-apply')!.click()
  expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(2)
  expect(editor.store.getState().document.past.length).toBe(pastBefore + 1)
  panel.dispose()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/ui/chatOverlay.test.ts`
Expected: FAIL (`.ed-chat-tune` not found; `tune` is not a recognized dep).

- [ ] **Step 3: Add the Tune affordance to the overlay**

In `packages/editor/src/ui/chatOverlay.ts`:

Add the import after the existing `../agent/diff` import:

```ts
import type { TuningRunResult } from '../agent/tuningRunner'
```

Add `tune` to the `ChatOverlayDeps` interface (after the `run` member):

```ts
  run: (doc: Doc, prompt: string, core: EditorCore<Doc>, settings: AgentSettings) => Promise<ChatRunOutput<Doc>>
  /** Optional autonomous tuning pass; when present, a Tune button is shown. */
  tune?: (prompt: string, core: EditorCore<Doc>, settings: AgentSettings) => Promise<TuningRunResult<Doc>>
```

Add a shared diff/apply renderer and a tune-result renderer. Place these next to `renderProposal` (after it):

```ts
  const appendDiffBlock = (commands: typeof renderProposalCommands, beforeDoc: Doc, afterDoc: Doc, extraLine?: string): void => {
    const diff = diffDocs(core.definition, beforeDoc, afterDoc)
    const block = document.createElement('div')
    block.className = 'ed-chat-msg ed-chat-diff'
    block.dataset.role = 'diff'
    const summary = document.createElement('div')
    summary.className = 'ed-chat-diff-summary'
    summary.textContent =
      `${commands.length} command${commands.length === 1 ? '' : 's'}: +${diff.addedCount} ~${diff.modifiedCount} -${diff.removedCount}` +
      (extraLine ? ` · ${extraLine}` : '')
    block.append(summary)
    for (const change of diff.changes) {
      const row = document.createElement('div')
      row.className = `ed-chat-diff-row ed-chat-diff-${change.kind}`
      row.textContent = `${change.kind} ${change.label} (${change.id})`
      block.append(row)
    }
    if (commands.length > 0) {
      const apply = document.createElement('button')
      apply.type = 'button'
      apply.className = 'ed-chat-apply'
      apply.textContent = 'Apply'
      apply.addEventListener('click', () => {
        core.store.dispatch({ type: 'commandBatch', commands })
        apply.disabled = true
        apply.textContent = 'Applied'
      })
      block.append(apply)
    }
    log.append(block)
  }

  const runTuningPass = async (): Promise<void> => {
    if (!deps.tune || busy) return
    busy = true
    send.disabled = true
    tuneButton.disabled = true
    appendMessage('user', 'Tune for solvability')
    try {
      const result = await deps.tune('Improve this level\'s solvability.', core, deps.loadSettings())
      appendDiffBlock(result.commands, currentDoc, result.doc, `score ${result.score.toFixed(2)}`)
    } catch (error) {
      appendMessage('error', error instanceof Error ? error.message : String(error))
    } finally {
      busy = false
      send.disabled = false
      tuneButton.disabled = false
    }
  }
```

> `renderProposalCommands` above is a type-only reference: replace it with the actual command array type by changing the `appendDiffBlock` signature to `(commands: import('@automata/contracts').SceneCommand[], beforeDoc: Doc, afterDoc: Doc, extraLine?: string)`. (Add `SceneCommand` to the file's `@automata/contracts` import instead of the inline import if the file already imports from it.) Then refactor the M16c `renderProposal` body to call `appendDiffBlock(output.host.commands, currentDoc, output.host.doc)` so both paths share the renderer.

Add the Tune button to the controls. Where the `send` button is created and appended, add a sibling Tune button (only wired when `deps.tune` exists):

```ts
  const tuneButton = document.createElement('button')
  tuneButton.type = 'button'
  tuneButton.className = 'ed-chat-tune'
  tuneButton.textContent = 'Tune'
  tuneButton.hidden = deps.tune === undefined
  tuneButton.addEventListener('click', () => void runTuningPass())
```

Append `tuneButton` next to `send` in the panel assembly (change `root.append(head, controls, log, input, send)` to `root.append(head, controls, log, input, send, tuneButton)`).

- [ ] **Step 4: Add the Tune button style**

In `packages/editor/src/ui/theme.css.ts`, append to the `SLATE_PRO_CSS` template (before its closing backtick):

```css
.ed-chat-tune { align-self: flex-end; padding: 5px 12px; background: var(--panel-2);
  border: 1px solid #2f394e; border-radius: 5px; box-shadow: inset 0 1px 0 var(--bevel); }
.ed-chat-tune[hidden] { display: none; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/ui/chatOverlay.test.ts`
Expected: PASS (all overlay tests; the M16c send/diff/apply tests still pass because `renderProposal` now delegates to `appendDiffBlock`).

- [ ] **Step 6: Full verification (typecheck, lint, coverage)**

Run: `npm run typecheck && npm run lint && npm run coverage`
Expected: PASS, coverage gate green across all four included packages.

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/ui/chatOverlay.ts packages/editor/src/ui/theme.css.ts \
  packages/editor/tests/ui/chatOverlay.test.ts
git commit -m "feat(editor): Tune button — net tuning diff + score delta, applied as one batch"
```

---

## Self-Review

- **Spec coverage:** Implements the spec's tuning surface and the headless seam. The input seam is widened in contracts and threaded through monkey-ball (Tasks 1–2). agent-core gains `seekGoalPlayer` (deterministic closed-loop scoring controller, Task 4), `fitness` (completion within a step **band** + zero rest-falls + optional banana, Task 3), and `runTuningLoop` (autonomous keep/revert optimizer with `target` = beat-current/human-stated and `patience`/`maxIterations` stop, Task 5). The editor `runTuning` (Task 6) wires `validateDoc` as the hard floor, LLM proposals via `runAgent` over a sandbox `ToolHost`, and seek-goal `runHeadlessPlay` scoring; the chat overlay's Tune button presents the **net diff with a score delta** and applies it as one undoable `commandBatch` (Task 7), reusing M16c's diff/apply machinery. Edit-scope (`tuning-only` vs `tuning+layout`) is expressible through the `prompt` handed to `runTuning`; target-source (`beat-current` vs `human-stated`) maps to the optimizer's optional `target`.
- **Placeholder scan:** No TBD/TODO. The Task 7 `renderProposalCommands` reference is explicitly flagged as a type placeholder to replace with `SceneCommand[]` in the same step (a real refactor instruction with the exact type given), and the `appendDiffBlock` shared-renderer refactor of M16c's `renderProposal` is spelled out — not a deferred "TODO".
- **Type consistency:** `PlayObservation { step, ball: { position, velocity }, goal }` (contracts) is produced by `readObservation` and consumed by `createSeekGoalPlayer` identically. `FitnessTarget { minSteps, maxSteps, bananas? }` and `scoreFitness(result, target)` match across fitness, `runTuning`, and tests. `runTuningLoop`'s `TuningLoopOptions<State> { initial, propose, score, validate, target?, maxIterations?, patience? }` / `TuningResult<State> { best, bestScore, iterations, accepted }` match the editor's `TuningState<Doc> { doc, commands }` instantiation. `TuningRunResult<Doc> { doc, commands, score, iterations, accepted }` is what the overlay's `tune` dep returns and renders. `commandBatch` + `diffDocs` reuse the exact M16c shapes. `runAgent`/`createEditorToolHost`/`validateDoc` signatures match M16a-2/M16a-3.
