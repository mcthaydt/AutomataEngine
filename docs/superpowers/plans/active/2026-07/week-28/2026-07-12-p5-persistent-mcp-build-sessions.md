# Persistent MCP Build Sessions (P5 / Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agent can create, reopen, modify, evaluate, and repair a game across process/context resets — durable sessions, hash-guarded idempotency, server-executed checks as typed findings, a seeded-replay harness, and the pack-composition seam.

**Architecture:** Types in `@automata/contracts`; a new leaf package `@automata/build-session` owns the session store/ledger/check-runners; `tools/editor-mcp-server` collapses to a single workspace mode whose `sessionHost` composes catalog + project tool host + session engine with write-through persistence; `@automata/game-kit` gains the empty `GamePack`/`composePacks` seam.

**Tech Stack:** TypeScript ESM workspaces, zod v4, vitest, `node:crypto` sha256, `node:child_process` spawn, MCP SDK (existing).

**Spec:** `docs/superpowers/specs/active/2026-07/week-28/2026-07-12-p5-persistent-mcp-build-sessions-design.md`

**Overall progress:** 40/62 steps complete (65%)

## Global Constraints

- TDD per AGENTS.md: failing test before implementation, `npm run ci` green before claiming done; `npm run coverage` must hold **90% lines / 90% branches** (new package included).
- `games/*`/`tools/*` import engine APIs only from `@automata/engine`; only `@automata/contracts`/`@automata/project` may import `zod` directly.
- Session home: `.automata/sessions/<gameId>/`, **gitignored**.
- Check vocabulary is closed: build / test / browser / evaluate. No arbitrary shell tool.
- Check failures are **results** (typed findings), never tool errors; tool errors are contract violations only (no project open, unknown game, lock held, budget exhausted, bad args).
- Default per-check attempt budget: `DEFAULT_CHECK_BUDGET_LIMIT = 25`; no tool raises budgets in this phase.
- `--project`/`--bundle` CLI modes are removed; workspace mode is the only mode.
- Refinement of spec §5 noted during planning: check tools default to the currently open project, and `runBuild`/`runTests`/`runBrowserEval` also accept an **optional explicit `gameId`** — a freshly scaffolded game must be installable/buildable *before* its first `openProject` can succeed (opening dynamically imports the workspace package, which requires `npm install`). `changedFiles` requires an open project (it needs the session baseline).
- Step-kind naming convention (used by cache lookups and stale marking): `scaffold`, `author:<toolName>`, `check:build|test|browser|evaluate`, `generate:<name>`.
- Commits at every task checkpoint; end commit messages with `Co-Authored-By:` per harness rules.

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/contracts/src/session.ts` | Build-session zod schema, findings, steps, budgets, summary |
| Create | `packages/contracts/src/sessionTools.ts` | Session/check tool defs + unified arg parser + clientStepId split |
| Modify | `packages/contracts/src/tools.ts` | Export `writeToolNames` |
| Modify | `packages/contracts/src/index.ts`, `prompts.ts` | Exports; build-game prompt copy (openProject) |
| Create | `packages/engine/src/math/random.ts` | `createSeededRng`, `hashStringToSeed` |
| Modify | `packages/engine/src/index.ts` | Export random module |
| Create | `packages/build-session/{package.json,tsconfig.json,vitest.config.ts}` | New leaf package |
| Create | `packages/build-session/src/hash.ts` | `stableStringify`, `hashText`, `hashJson` |
| Create | `packages/build-session/src/files.ts` | `snapshotFiles`, `diffFiles` |
| Create | `packages/build-session/src/store.ts` | Atomic session store, quarantine, lockfile |
| Create | `packages/build-session/src/engine.ts` | Session engine: ledger, guards, seeded steps, findings, budgets |
| Create | `packages/build-session/src/checks.ts` | Spawner, per-kind commands, `runCheck` normalization |
| Create | `packages/build-session/src/index.ts` | Package surface |
| Create | `packages/game-kit/src/packs.ts` | `GamePack`, `composePacks` (empty seam) |
| Modify | `packages/game-kit/src/index.ts` | Export packs |
| Modify | `tools/scaffold/src/templates/srcFiles.ts` | Template `main.ts` boots through `composePacks([])` |
| Modify | `tools/scaffold/src/templates/configFiles.ts` | README copy: workspace mode + openProject |
| Create | `tools/editor-mcp-server/src/projectWriter.ts` | Write-through snapshot serialization |
| Create | `tools/editor-mcp-server/src/sessionHost.ts` | The composed workspace host (catalog/lifecycle/authoring/checks) |
| Modify | `tools/editor-mcp-server/src/main.ts` | Single `--workspace` mode |
| Delete | `tools/editor-mcp-server/src/workspaceHost.ts` (+ its test) | Superseded by sessionHost |
| Modify | `tools/scaffold/scripts/verify-new-game.ts` | Drive workspace mode + `openProject` over stdio |
| Modify | `.gitignore`, `AGENTS.md`, `docs/ROADMAP.md` | Session dir ignore; docs; status flip |
| Tests | `packages/contracts/tests/session.test.ts`, `sessionTools.test.ts`; `packages/engine/tests/random.test.ts` (or engine's test dir convention); `packages/build-session/tests/*.test.ts`; `packages/game-kit/tests/packs.test.ts`; `tools/editor-mcp-server/tests/{sessionHost,sessionChecks,acceptance}.test.ts` | Per task below |

---

### Task 1: Contracts — build-session schema module

**Files:**
- Create: `packages/contracts/src/session.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/tests/session.test.ts`

**Interfaces:**
- Consumes: zod (direct import allowed in contracts).
- Produces (used by Tasks 4–12): `SESSION_SCHEMA_VERSION = 1`, `buildSessionSchema`/`BuildSession`, `stepRecordSchema`/`StepRecord`, `findingSchema`/`Finding`/`FindingSource`, `checkKindSchema`/`CheckKind` (`'build'|'test'|'browser'|'evaluate'`), `budgetStateSchema`/`BudgetState`, `DEFAULT_CHECK_BUDGET_LIMIT = 25`, `baselineSchema`/`Baseline`, `createBuildSession(init)`, `summarizeSession(session): SessionSummary`.

- [x] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/session.test.ts
import { describe, expect, it } from 'vitest'
import {
  SESSION_SCHEMA_VERSION, buildSessionSchema, createBuildSession, summarizeSession
} from '../src/session'

const NOW = '2026-07-12T00:00:00.000Z'

describe('build-session schema', () => {
  it('creates an empty v1 session that round-trips through the schema', () => {
    const session = createBuildSession({
      gameId: 'probe', projectDir: 'games/probe/public/project', engineVersion: '0.1.0', now: NOW
    })
    expect(session.version).toBe(SESSION_SCHEMA_VERSION)
    expect(session.baseline).toBeNull()
    expect(session.formatVersion).toBeNull()
    expect(buildSessionSchema.parse(JSON.parse(JSON.stringify(session)))).toEqual(session)
  })

  it('rejects unknown top-level fields and wrong versions', () => {
    const session = createBuildSession({ gameId: 'g', projectDir: 'p', engineVersion: 'e', now: NOW })
    expect(buildSessionSchema.safeParse({ ...session, extra: 1 }).success).toBe(false)
    expect(buildSessionSchema.safeParse({ ...session, version: 2 }).success).toBe(false)
  })

  it('summarizes open findings, step counts, resume, and budgets', () => {
    const session = createBuildSession({ gameId: 'g', projectDir: 'p', engineVersion: 'e', now: NOW })
    session.steps.push(
      { id: 'step-0001', kind: 'check:build', inputHash: 'a', status: 'completed', completedAt: NOW, artifacts: [] },
      { id: 'step-0002', kind: 'check:test', inputHash: 'b', status: 'stale', completedAt: NOW, artifacts: [] }
    )
    session.findings.push(
      { id: 'f1', source: 'build', severity: 'error', code: 'build-failed', message: 'boom', inputHash: 'a', createdAt: NOW },
      { id: 'f2', source: 'test', severity: 'error', code: 'test-failed', message: 'boom', inputHash: 'b', createdAt: NOW, resolvedAt: NOW }
    )
    session.resume = { lastStepId: 'step-0001', nextAction: 'fix build' }
    const summary = summarizeSession(session)
    expect(summary.completedSteps).toBe(1)
    expect(summary.staleSteps).toBe(1)
    expect(summary.openFindings.map((finding) => finding.id)).toEqual(['f1'])
    expect(summary.resume.nextAction).toBe('fix build')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project contracts -t 'build-session schema'`
Expected: FAIL — `../src/session` does not exist.

- [x] **Step 3: Implement `session.ts`**

```ts
// packages/contracts/src/session.ts
import { z } from 'zod'

/** Durable build-session document — the Phase 1 contract every phase builds on. */
export const SESSION_SCHEMA_VERSION = 1

export const checkKindSchema = z.enum(['build', 'test', 'browser', 'evaluate'])
export type CheckKind = z.infer<typeof checkKindSchema>

export const findingSourceSchema = z.enum(['build', 'test', 'browser', 'eval', 'validate', 'session'])
export type FindingSource = z.infer<typeof findingSourceSchema>

export const findingSchema = z.strictObject({
  id: z.string(),
  source: findingSourceSchema,
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  location: z.string().optional(),
  inputHash: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().optional()
})
export type Finding = z.infer<typeof findingSchema>

export const stepStatusSchema = z.enum(['completed', 'failed', 'stale'])

export const stepRecordSchema = z.strictObject({
  id: z.string(),
  kind: z.string(),
  inputHash: z.string(),
  resultHash: z.string().optional(),
  status: stepStatusSchema,
  seed: z.number().int().optional(),
  clientStepId: z.string().optional(),
  completedAt: z.string(),
  artifacts: z.array(z.string()),
  result: z.unknown().optional()
})
export type StepRecord = z.infer<typeof stepRecordSchema>

export const budgetStateSchema = z.strictObject({
  limit: z.number().int().positive(),
  spent: z.number().int().nonnegative()
})
export type BudgetState = z.infer<typeof budgetStateSchema>

export const DEFAULT_CHECK_BUDGET_LIMIT = 25

export const baselineSchema = z.strictObject({
  gitRef: z.string().optional(),
  contentHash: z.string(),
  files: z.record(z.string(), z.string())
})
export type Baseline = z.infer<typeof baselineSchema>

export const resumeSchema = z.strictObject({
  lastStepId: z.string().optional(),
  nextAction: z.string().optional()
})

export const buildSessionSchema = z.strictObject({
  version: z.literal(SESSION_SCHEMA_VERSION),
  gameId: z.string(),
  projectDir: z.string(),
  engineVersion: z.string(),
  formatVersion: z.number().int().nullable(),
  baseline: baselineSchema.nullable(),
  lastKnownContentHash: z.string().nullable(),
  steps: z.array(stepRecordSchema),
  findings: z.array(findingSchema),
  budgets: z.record(z.string(), budgetStateSchema),
  resume: resumeSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})
export type BuildSession = z.infer<typeof buildSessionSchema>

export function createBuildSession(init: {
  gameId: string
  projectDir: string
  engineVersion: string
  now: string
}): BuildSession {
  return {
    version: SESSION_SCHEMA_VERSION,
    gameId: init.gameId,
    projectDir: init.projectDir,
    engineVersion: init.engineVersion,
    formatVersion: null,
    baseline: null,
    lastKnownContentHash: null,
    steps: [],
    findings: [],
    budgets: {},
    resume: {},
    createdAt: init.now,
    updatedAt: init.now
  }
}

export interface SessionSummary {
  gameId: string
  resume: z.infer<typeof resumeSchema>
  completedSteps: number
  staleSteps: number
  openFindings: Finding[]
  budgets: Record<string, BudgetState>
  updatedAt: string
}

export function summarizeSession(session: BuildSession): SessionSummary {
  return {
    gameId: session.gameId,
    resume: session.resume,
    completedSteps: session.steps.filter((step) => step.status === 'completed').length,
    staleSteps: session.steps.filter((step) => step.status === 'stale').length,
    openFindings: session.findings.filter((finding) => finding.resolvedAt === undefined),
    budgets: session.budgets,
    updatedAt: session.updatedAt
  }
}
```

Add to `packages/contracts/src/index.ts`:

```ts
export * from './session'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project contracts`
Expected: PASS (including existing prompts tests).

- [x] **Step 5: Commit**

```bash
git add packages/contracts/src/session.ts packages/contracts/src/index.ts packages/contracts/tests/session.test.ts
git commit -m "feat(contracts): add durable build-session schema, findings, budgets, summary"
```

---

### Task 2: Contracts — session tool defs, unified parser, prompt copy

**Files:**
- Create: `packages/contracts/src/sessionTools.ts`
- Modify: `packages/contracts/src/tools.ts` (export `writeToolNames`), `packages/contracts/src/index.ts`, `packages/contracts/src/prompts.ts`
- Test: `packages/contracts/tests/sessionTools.test.ts`; update `packages/contracts/tests/prompts.test.ts` if it asserts the old step-4 copy

**Interfaces:**
- Consumes: `gameSlugSchema` (workspaceTools), `parseWorkspaceToolArgs`, `workspaceToolArgSchemas`, `parseToolArgs`, `ToolDef`, `ToolName`.
- Produces (used by Tasks 9–11): `SessionToolName` = `'openProject'|'getSession'|'setResumePoint'|'runBuild'|'runTests'|'runBrowserEval'|'changedFiles'`; `sessionToolArgSchemas`; `sessionToolDefs(): ToolDef[]`; `parseSessionToolArgs(name, args)`; `splitClientStepId(args): { clientStepId?: string; rest: unknown }`; `parseUnifiedToolArgs(name, args)`; `writeToolNames: readonly ToolName[]` (from tools.ts).

- [x] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/sessionTools.test.ts
import { describe, expect, it } from 'vitest'
import { getWorkspacePrompt } from '../src/prompts'
import {
  parseUnifiedToolArgs, sessionToolDefs, splitClientStepId
} from '../src/sessionTools'

describe('session tools', () => {
  it('advertises the seven session tools with JSON schemas', () => {
    expect(sessionToolDefs().map((def) => def.name)).toEqual([
      'openProject', 'getSession', 'setResumePoint', 'runBuild', 'runTests', 'runBrowserEval', 'changedFiles'
    ])
    for (const def of sessionToolDefs()) expect(def.schema).toBeTruthy()
  })

  it('routes unified parsing across workspace, session, and project tools', () => {
    expect(parseUnifiedToolArgs('listGames', {})).toEqual({})
    expect(parseUnifiedToolArgs('openProject', { gameId: 'probe' })).toEqual({ gameId: 'probe' })
    expect(parseUnifiedToolArgs('runBuild', { gameId: 'probe' })).toEqual({ gameId: 'probe' })
    expect(parseUnifiedToolArgs('runBuild', {})).toEqual({})
    expect(() => parseUnifiedToolArgs('openProject', { gameId: 'NOT A SLUG' })).toThrow()
    expect(() => parseUnifiedToolArgs('definitely-not-a-tool', {})).toThrow(/unknown/i)
    // project read tool passes through to project schemas
    expect(parseUnifiedToolArgs('getHierarchy', {})).toEqual({})
  })

  it('strips clientStepId from write-tool args before project validation', () => {
    const args = { sceneId: 's', entity: { id: 'e', name: 'E', enabled: true, components: [] }, clientStepId: 'c-1' }
    expect(splitClientStepId(args)).toEqual({ clientStepId: 'c-1', rest: { sceneId: args.sceneId, entity: args.entity } })
    // must not throw on the extra key
    expect(() => parseUnifiedToolArgs('addEntity', args)).not.toThrow()
  })

  it('build-game prompt steers to openProject instead of --project reconnect', () => {
    const text = getWorkspacePrompt('build-game', { description: 'a racing game', name: 'race' })
      .messages[0].content.text
    expect(text).toContain('openProject')
    expect(text).not.toContain('--project')
  })
})
```

Note: if `addEntity`'s command schema requires a different entity shape, adjust the `entity` literal to satisfy it — the assertion under test is only that `clientStepId` does not cause a parse failure.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project contracts -t 'session tools'`
Expected: FAIL — `../src/sessionTools` does not exist.

- [x] **Step 3: Implement**

In `packages/contracts/src/tools.ts`, add below the `TOOL_NAMES` constant:

```ts
/** The mutating project tools; session hosts journal these and support clientStepId dedupe. */
export const writeToolNames: readonly ToolName[] = [
  'addEntity', 'removeEntities', 'reparentEntity', 'addComponent', 'removeComponent',
  'addResource', 'removeResource', 'setProperty', 'insertArrayItem', 'removeArrayItem', 'moveArrayItem'
]
```

```ts
// packages/contracts/src/sessionTools.ts
import { z } from 'zod'
import { parseToolArgs, writeToolNames, type ToolDef, type ToolName } from './tools'
import { gameSlugSchema, parseWorkspaceToolArgs, workspaceToolArgSchemas } from './workspaceTools'

/**
 * Session/check tool contracts for the single-mode workspace MCP server.
 * Checks operate on the currently open project; the vocabulary is closed —
 * there is deliberately no arbitrary-command tool.
 */

export type SessionToolName =
  | 'openProject' | 'getSession' | 'setResumePoint'
  | 'runBuild' | 'runTests' | 'runBrowserEval' | 'changedFiles'

export const sessionToolArgSchemas = {
  openProject: z.object({ gameId: gameSlugSchema }),
  getSession: z.object({}),
  setResumePoint: z.object({ nextAction: z.string().min(1) }),
  runBuild: z.object({ gameId: gameSlugSchema.optional() }),
  runTests: z.object({ gameId: gameSlugSchema.optional(), scope: z.string().min(1).optional() }),
  runBrowserEval: z.object({ gameId: gameSlugSchema.optional() }),
  changedFiles: z.object({})
} as const satisfies Record<SessionToolName, z.ZodType>

const SESSION_TOOL_DESCRIPTIONS: Record<SessionToolName, string> = {
  openProject:
    'Open (or reopen) a game project and create-or-resume its durable build session. Returns the resume ' +
    'position, outstanding findings, and completed steps so work is never blindly replayed. Opening a ' +
    'different game swaps to it; prior work is already durable.',
  getSession: 'Read the open project\'s build-session summary: resume position, findings, steps, budgets.',
  setResumePoint: 'Record the intended next action in the durable session before a context reset.',
  runBuild:
    'Install (if needed) and build a game (defaults to the open project; pass gameId to build a freshly ' +
    'scaffolded game before its first openProject). Results land as typed findings, hash-guarded.',
  runTests: 'Run a game\'s vitest suite (defaults to the open project; optional scope filter); typed findings, hash-guarded.',
  runBrowserEval: 'Run a game\'s Playwright browser evaluation (defaults to the open project); typed findings, hash-guarded.',
  changedFiles: 'List project/source files added, removed, or changed since the session baseline.'
}

const SESSION_TOOL_NAMES = Object.keys(sessionToolArgSchemas) as SessionToolName[]

export function sessionToolDefs(): ToolDef[] {
  return SESSION_TOOL_NAMES.map((name) => ({
    name,
    description: SESSION_TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(sessionToolArgSchemas[name])
  }))
}

export function parseSessionToolArgs(name: string, args: unknown): unknown {
  const schema: z.ZodType | undefined = (sessionToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown session tool "${name}"`)
  return schema.parse(args)
}

/** Pull the session-layer clientStepId out of write-tool args before project validation. */
export function splitClientStepId(args: unknown): { clientStepId?: string; rest: unknown } {
  if (typeof args !== 'object' || args === null || !('clientStepId' in args)) return { rest: args }
  const { clientStepId, ...rest } = args as Record<string, unknown>
  return typeof clientStepId === 'string' ? { clientStepId, rest } : { rest }
}

/** One parser for the single-mode server: workspace, then session, then project tools. */
export function parseUnifiedToolArgs(name: string, args: unknown): unknown {
  if (name in workspaceToolArgSchemas) return parseWorkspaceToolArgs(name, args)
  if (name in sessionToolArgSchemas) return parseSessionToolArgs(name, args)
  if ((writeToolNames as readonly string[]).includes(name)) {
    return parseToolArgs(name as ToolName, splitClientStepId(args).rest)
  }
  return parseToolArgs(name as ToolName, args)
}
```

Add `export * from './sessionTools'` to `packages/contracts/src/index.ts`.

In `packages/contracts/src/prompts.ts`, replace workflow steps 2 and 4 in `buildGameText` with:

```text
2. Call the runBuild tool with gameId "${name}" — it runs npm install for the new workspace package when needed — and confirm it reports passed.
```

```text
4. Call the openProject tool with gameId "${name}". The authoring tools (addEntity, addComponent, addResource, setProperty, ...) then carry each component/resource type's JSON schema in their descriptions — author to those schemas. Your edits persist to disk as you make them, and the build session records progress so you can resume after any reset (check getSession).
```

(Exact surrounding lines stay as they are; only the two numbered steps change. Keep step numbering 1–8.)

- [x] **Step 4: Run tests**

Run: `npx vitest run --project contracts`
Expected: PASS after updating `packages/contracts/tests/prompts.test.ts`, which currently asserts the old copy: change `expect(text).toContain('npm install')` to `expect(text).toContain('runBuild')` and `expect(text).toContain('--project games/')` to `expect(text).toContain('openProject')` (keep the `createGame`/`evaluate`/`npm run ci` assertions).

- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): session/check tool defs, unified parser, openProject prompt copy"
```

---

### Task 3: Engine — seeded RNG

**Files:**
- Create: `packages/engine/src/math/random.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './math/random'` after the `./math/quat` line)
- Test: `packages/engine/tests/math/random.test.ts` (engine tests live in `tests/` mirroring `src/` subdirectories; the vitest project name is `engine`)

**Interfaces:**
- Produces (used by Tasks 6, 12; later by game-kit runtime work): `SeededRng { next(): number; nextInt(maxExclusive: number): number }`, `createSeededRng(seed: number): SeededRng`, `hashStringToSeed(text: string): number`.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { createSeededRng, hashStringToSeed } from '../../src/math/random'

describe('seeded rng', () => {
  it('is deterministic for equal seeds and diverges for different seeds', () => {
    const a = createSeededRng(42)
    const b = createSeededRng(42)
    const c = createSeededRng(43)
    const seqA = [a.next(), a.next(), a.next()]
    const seqB = [b.next(), b.next(), b.next()]
    const seqC = [c.next(), c.next(), c.next()]
    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
  })

  it('produces values in [0,1) and bounded ints', () => {
    const rng = createSeededRng(7)
    for (let index = 0; index < 1000; index += 1) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      const int = rng.nextInt(10)
      expect(int).toBeGreaterThanOrEqual(0)
      expect(int).toBeLessThan(10)
      expect(Number.isInteger(int)).toBe(true)
    }
  })

  it('hashes strings to stable 32-bit seeds', () => {
    expect(hashStringToSeed('probe')).toBe(hashStringToSeed('probe'))
    expect(hashStringToSeed('probe')).not.toBe(hashStringToSeed('probe2'))
    expect(hashStringToSeed('probe')).toBeGreaterThanOrEqual(0)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project engine -t 'seeded rng'`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// packages/engine/src/math/random.ts

/** Deterministic RNG contract used by the seeded-generation/replay harness. */
export interface SeededRng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number
}

/** FNV-1a 32-bit — stable string→seed for labeled generation steps. */
export function hashStringToSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 — small, fast, deterministic across platforms. */
export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    nextInt(maxExclusive: number): number {
      return Math.floor(next() * maxExclusive)
    }
  }
}
```

- [x] **Step 4: Run engine tests + coverage-sensitive check**

Run: `npx vitest run --project engine`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): seeded RNG (mulberry32 + fnv1a seed hash) for the replay harness"
```

---

### Task 4: build-session package bootstrap — hashing and file snapshots

**Files:**
- Create: `packages/build-session/package.json`, `packages/build-session/tsconfig.json` (copy `packages/contracts/tsconfig.json` verbatim), `packages/build-session/vitest.config.ts`
- Create: `packages/build-session/src/hash.ts`, `packages/build-session/src/files.ts`, `packages/build-session/src/index.ts`
- Test: `packages/build-session/tests/hash.test.ts`, `packages/build-session/tests/files.test.ts`

**Interfaces:**
- Produces (used by Tasks 5–10): `stableStringify(value): string`, `hashText(text): string`, `hashJson(value): string`; `snapshotFiles(entries: ReadonlyArray<{ label: string; dir: string }>): Promise<Record<string, string>>` (keys `label/relativePath`, POSIX separators, sorted walk, skips `node_modules`/`dist`, missing dirs contribute nothing); `diffFiles(before, after): { added: string[]; removed: string[]; changed: string[] }`.

- [x] **Step 1: Create the package**

```json
// packages/build-session/package.json
{
  "name": "@automata/build-session",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/engine": "*"
  }
}
```

```ts
// packages/build-session/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'build-session', environment: 'node', include: ['tests/**/*.test.ts'] }
})
```

Copy `packages/contracts/tsconfig.json` to `packages/build-session/tsconfig.json`. Run `npm install` at the repo root so the workspace link exists.

- [x] **Step 2: Write the failing tests**

```ts
// packages/build-session/tests/hash.test.ts
import { describe, expect, it } from 'vitest'
import { hashJson, hashText, stableStringify } from '../src/hash'

describe('hashing', () => {
  it('stableStringify is key-order independent and drops undefined members', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
    expect(stableStringify({ a: 1, gone: undefined })).toBe(stableStringify({ a: 1 }))
    expect(stableStringify([1, 'x', null])).toBe('[1,"x",null]')
  })

  it('hashJson equal for equivalent values, different otherwise', () => {
    expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }))
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }))
    expect(hashText('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

```ts
// packages/build-session/tests/files.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diffFiles, snapshotFiles } from '../src/files'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bs-files-'))
  roots.push(root)
  await mkdir(join(root, 'src/nested'), { recursive: true })
  await mkdir(join(root, 'src/node_modules'), { recursive: true })
  await writeFile(join(root, 'src/a.ts'), 'a')
  await writeFile(join(root, 'src/nested/b.ts'), 'b')
  await writeFile(join(root, 'src/node_modules/skip.js'), 'skip')
  return root
}

describe('file snapshots', () => {
  it('hashes files under labeled dirs, skipping node_modules, tolerating missing dirs', async () => {
    const root = await makeTree()
    const snap = await snapshotFiles([
      { label: 'src', dir: join(root, 'src') },
      { label: 'project', dir: join(root, 'no-such-dir') }
    ])
    expect(Object.keys(snap).sort()).toEqual(['src/a.ts', 'src/nested/b.ts'])
  })

  it('diffs added/removed/changed', async () => {
    const root = await makeTree()
    const before = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
    await writeFile(join(root, 'src/a.ts'), 'changed')
    await writeFile(join(root, 'src/c.ts'), 'new')
    await rm(join(root, 'src/nested/b.ts'))
    const after = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
    expect(diffFiles(before, after)).toEqual({
      added: ['src/c.ts'], removed: ['src/nested/b.ts'], changed: ['src/a.ts']
    })
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project build-session`
Expected: FAIL — modules not found.

- [x] **Step 4: Implement**

```ts
// packages/build-session/src/hash.ts
import { createHash } from 'node:crypto'

/** Canonical JSON: sorted object keys, undefined members dropped. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${stableStringify(member)}`).join(',')}}`
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function hashJson(value: unknown): string {
  return hashText(stableStringify(value))
}
```

```ts
// packages/build-session/src/files.ts
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { hashText } from './hash'

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage'])

/** label/relativePath → sha256 for every file under each labeled dir. */
export async function snapshotFiles(
  entries: ReadonlyArray<{ label: string; dir: string }>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const entry of entries) {
    await walk(entry.dir, entry.label, entry.dir)
  }
  return out

  async function walk(dir: string, label: string, base: string): Promise<void> {
    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name)
      if (item.isDirectory()) {
        if (!SKIPPED_DIRS.has(item.name)) await walk(path, label, base)
      } else if (item.isFile()) {
        const key = `${label}/${relative(base, path).split(sep).join('/')}`
        out[key] = hashText(await readFile(path, 'utf8'))
      }
    }
  }
}

export interface FileDiff {
  added: string[]
  removed: string[]
  changed: string[]
}

export function diffFiles(before: Record<string, string>, after: Record<string, string>): FileDiff {
  const added = Object.keys(after).filter((key) => !(key in before)).sort()
  const removed = Object.keys(before).filter((key) => !(key in after)).sort()
  const changed = Object.keys(after)
    .filter((key) => key in before && before[key] !== after[key])
    .sort()
  return { added, removed, changed }
}
```

```ts
// packages/build-session/src/index.ts
export * from './hash'
export * from './files'
```

- [x] **Step 5: Run tests, then commit**

Run: `npx vitest run --project build-session` — Expected: PASS.

```bash
git add packages/build-session package-lock.json
git commit -m "feat(build-session): new leaf package with canonical hashing and file snapshots"
```

---

### Task 5: build-session — atomic store, quarantine, lockfile

**Files:**
- Create: `packages/build-session/src/store.ts`
- Modify: `packages/build-session/src/index.ts` (add `export * from './store'`)
- Test: `packages/build-session/tests/store.test.ts`

**Interfaces:**
- Consumes: `buildSessionSchema`, `createBuildSession` (Task 1); `node:fs/promises`.
- Produces (used by Task 6): `sessionDir(sessionsRoot, gameId): string`; `loadOrCreateSession(opts: { sessionsRoot; gameId; projectDir; engineVersion; now?: () => string }): Promise<{ session: BuildSession; created: boolean; quarantinedTo?: string }>`; `saveSession(dir: string, session: BuildSession): Promise<void>` (atomic tmp+rename); `acquireSessionLock(dir: string, pid?: number): Promise<void>` (throws `LockHeldError`); `releaseSessionLock(dir: string): Promise<void>`; `class LockHeldError extends Error`.

- [x] **Step 1: Write the failing test**

```ts
// packages/build-session/tests/store.test.ts
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LockHeldError, acquireSessionLock, loadOrCreateSession, releaseSessionLock, saveSession, sessionDir
} from '../src/store'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bs-store-'))
  roots.push(root)
  return root
}

const OPTS = { gameId: 'probe', projectDir: 'games/probe/public/project', engineVersion: '0.1.0' }

describe('session store', () => {
  it('creates a fresh session with dirs, then reloads the same document', async () => {
    const sessionsRoot = await makeRoot()
    const first = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(first.created).toBe(true)
    first.session.resume = { nextAction: 'author content' }
    await saveSession(sessionDir(sessionsRoot, 'probe'), first.session)

    const second = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(second.created).toBe(false)
    expect(second.session.resume.nextAction).toBe('author content')
    // atomic save leaves no tmp files behind
    const names = await readdir(sessionDir(sessionsRoot, 'probe'))
    expect(names.filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('quarantines corrupt and unknown-version session files instead of discarding them', async () => {
    const sessionsRoot = await makeRoot()
    const dir = sessionDir(sessionsRoot, 'probe')
    await loadOrCreateSession({ sessionsRoot, ...OPTS })
    await writeFile(join(dir, 'session.json'), '{ not json')

    const recovered = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(recovered.created).toBe(true)
    expect(recovered.quarantinedTo).toMatch(/session\.quarantined-\d+\.json$/)
    await expect(readFile(join(dir, recovered.quarantinedTo!), 'utf8')).resolves.toContain('not json')

    await writeFile(join(dir, 'session.json'), JSON.stringify({ ...recovered.session, version: 99 }))
    const again = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(again.quarantinedTo).toBeDefined()
  })

  it('locks a session against a live pid and reclaims stale locks', async () => {
    const sessionsRoot = await makeRoot()
    const dir = sessionDir(sessionsRoot, 'probe')
    await loadOrCreateSession({ sessionsRoot, ...OPTS })

    await acquireSessionLock(dir)                       // own pid — ok
    await acquireSessionLock(dir)                       // re-entrant for same pid — ok
    await releaseSessionLock(dir)

    await writeFile(join(dir, 'lock'), JSON.stringify({ pid: 999999999, startedAt: 'x' }))
    await acquireSessionLock(dir)                       // dead pid — reclaimed

    // a foreign live pid: the test runner's parent is always alive during the test
    await writeFile(join(dir, 'lock'), JSON.stringify({ pid: process.ppid, startedAt: 'x' }))
    await expect(acquireSessionLock(dir)).rejects.toBeInstanceOf(LockHeldError)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project build-session -t 'session store'`
Expected: FAIL — `../src/store` does not exist.

- [x] **Step 3: Implement**

```ts
// packages/build-session/src/store.ts
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildSessionSchema, createBuildSession, type BuildSession } from '@automata/contracts'

export const SESSION_FILE = 'session.json'
export const ARTIFACTS_DIR = 'artifacts'
const LOCK_FILE = 'lock'

export class LockHeldError extends Error {}

export function sessionDir(sessionsRoot: string, gameId: string): string {
  return join(sessionsRoot, gameId)
}

export interface LoadedSession {
  session: BuildSession
  created: boolean
  /** Basename of the quarantined file when the on-disk session was unreadable. */
  quarantinedTo?: string
}

export async function loadOrCreateSession(opts: {
  sessionsRoot: string
  gameId: string
  projectDir: string
  engineVersion: string
  now?: () => string
}): Promise<LoadedSession> {
  const now = opts.now ?? (() => new Date().toISOString())
  const dir = sessionDir(opts.sessionsRoot, opts.gameId)
  await mkdir(join(dir, ARTIFACTS_DIR), { recursive: true })

  let text: string | undefined
  try {
    text = await readFile(join(dir, SESSION_FILE), 'utf8')
  } catch {
    text = undefined
  }

  let quarantinedTo: string | undefined
  if (text !== undefined) {
    try {
      const parsed = buildSessionSchema.parse(JSON.parse(text))
      return { session: parsed, created: false }
    } catch {
      quarantinedTo = `session.quarantined-${Date.now()}.json`
      await rename(join(dir, SESSION_FILE), join(dir, quarantinedTo))
    }
  }

  const session = createBuildSession({
    gameId: opts.gameId,
    projectDir: opts.projectDir,
    engineVersion: opts.engineVersion,
    now: now()
  })
  await saveSession(dir, session)
  return { session, created: true, quarantinedTo }
}

/** Atomic write: tmp file in the same dir, then rename over session.json. */
export async function saveSession(dir: string, session: BuildSession): Promise<void> {
  const tmp = join(dir, `${SESSION_FILE}.tmp-${process.pid}`)
  await writeFile(tmp, `${JSON.stringify(session, null, 2)}\n`)
  await rename(tmp, join(dir, SESSION_FILE))
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function acquireSessionLock(dir: string, pid = process.pid): Promise<void> {
  const path = join(dir, LOCK_FILE)
  try {
    const holder = JSON.parse(await readFile(path, 'utf8')) as { pid?: number }
    if (typeof holder.pid === 'number' && holder.pid !== pid && pidIsAlive(holder.pid)) {
      throw new LockHeldError(`Session locked by live pid ${holder.pid} (${path})`)
    }
  } catch (error) {
    if (error instanceof LockHeldError) throw error
    // missing or unreadable lock — claimable
  }
  await writeFile(path, JSON.stringify({ pid, startedAt: new Date().toISOString() }))
}

export async function releaseSessionLock(dir: string): Promise<void> {
  await rm(join(dir, LOCK_FILE), { force: true })
}
```

- [x] **Step 4: Run tests, verify pass**

Run: `npx vitest run --project build-session`
Expected: PASS. Note: the live-pid case uses `process.ppid` (the test runner's parent — always alive during the test).

- [x] **Step 5: Commit**

```bash
git add packages/build-session
git commit -m "feat(build-session): atomic session store with quarantine and pid lockfile"
```

---

### Task 6: build-session — session engine (ledger, guards, seeded steps, findings, budgets)

**Files:**
- Create: `packages/build-session/src/engine.ts`
- Modify: `packages/build-session/src/index.ts` (add `export * from './engine'`)
- Test: `packages/build-session/tests/engine.test.ts`

**Interfaces:**
- Consumes: Task 1 types; Task 5 store; `createSeededRng`, `SeededRng` from `@automata/engine`; `hashJson` (Task 4).
- Produces (used by Tasks 7, 9, 10, 12):

```ts
export interface GuardedOutcome { ok: boolean; output: unknown; artifacts?: ReadonlyArray<{ name: string; text: string }> }
export interface GuardedRun { cached: boolean; step: StepRecord; output: unknown }
export interface SessionEngine {
  readonly session: BuildSession
  readonly dir: string
  save(): Promise<void>
  summary(): SessionSummary
  findCompleted(kind: string, inputHash: string): StepRecord | undefined
  journalStep(kind: string, entry: { inputHash: string; result?: unknown; clientStepId?: string }): Promise<StepRecord>
  findByClientStepId(kind: string, clientStepId: string): StepRecord | undefined
  runGuarded(kind: string, input: unknown, run: () => Promise<GuardedOutcome>): Promise<GuardedRun>
  runSeededStep(kind: string, input: unknown, run: (rng: SeededRng, seed: number) => Promise<unknown>): Promise<GuardedRun>
  replayStep(stepId: string, run: (rng: SeededRng, seed: number) => Promise<unknown>): Promise<{ ok: boolean; expected?: string; actual: string }>
  addFinding(finding: Omit<Finding, 'id' | 'createdAt'>): Promise<Finding>
  autoResolve(source: FindingSource): Promise<number>
  spendBudget(kind: CheckKind): { ok: boolean; remaining: number }
  setResumePoint(nextAction: string): Promise<void>
  noteContentHash(hash: string): Promise<void>
  detectOutOfBand(currentHash: string): Promise<boolean>
  dispose(): Promise<void>
}
export interface SessionEngineOptions {
  sessionsRoot: string; gameId: string; projectDir: string; engineVersion: string
  now?: () => string; seedSource?: () => number; lock?: boolean  // lock defaults true
}
export async function createSessionEngine(options: SessionEngineOptions):
  Promise<{ engine: SessionEngine; created: boolean; quarantinedTo?: string }>
```

Semantics locked here: step ids are `step-0001`-style sequential; cache hits require same `kind` + `inputHash` + status `completed` (stale/failed never hit); artifacts are written to `<dir>/artifacts/<stepId>-<name>` and stored as relative paths; every mutation bumps `updatedAt` and saves atomically; a quarantine on load records a `session`-source `warning` finding with code `session-quarantined`; `detectOutOfBand` marks completed `check:*` steps stale, adds a `session`/`warning`/`out-of-band-changes` finding, updates `lastKnownContentHash`, and returns `true` only on mismatch; `dispose` saves then releases the lock.

- [x] **Step 1: Write the failing test**

```ts
// packages/build-session/tests/engine.test.ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine } from '../src/engine'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeEngine(seedSource?: () => number) {
  const sessionsRoot = await mkdtemp(join(tmpdir(), 'bs-engine-'))
  roots.push(sessionsRoot)
  const options = {
    sessionsRoot, gameId: 'probe', projectDir: 'p', engineVersion: 'e',
    now: () => '2026-07-12T00:00:00.000Z', seedSource, lock: false
  }
  return { options, ...(await createSessionEngine(options)) }
}

describe('session engine', () => {
  it('hash-guards expensive steps: second identical run returns the recorded result', async () => {
    const { engine } = await makeEngine()
    let runs = 0
    const run = async () => {
      runs += 1
      return { ok: true, output: { passed: true }, artifacts: [{ name: 'log', text: 'hello' }] }
    }
    const first = await engine.runGuarded('check:build', { contentHash: 'h1' }, run)
    const second = await engine.runGuarded('check:build', { contentHash: 'h1' }, run)
    const third = await engine.runGuarded('check:build', { contentHash: 'h2' }, run)
    expect(runs).toBe(2)
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.output).toEqual({ passed: true })
    expect(second.step.id).toBe(first.step.id)
    expect(third.cached).toBe(false)
    expect(first.step.artifacts[0]).toMatch(/^artifacts\/step-0001-log$/)
  })

  it('survives a process reset: a fresh engine over the same dir sees steps, findings, resume', async () => {
    const { engine, options } = await makeEngine()
    await engine.runGuarded('check:build', { contentHash: 'h1' }, async () => ({ ok: true, output: 1 }))
    await engine.addFinding({ source: 'build', severity: 'error', code: 'build-failed', message: 'm', inputHash: 'h1' })
    await engine.setResumePoint('re-run build after fix')
    await engine.dispose()

    const reopened = (await createSessionEngine(options)).engine
    expect(reopened.summary().completedSteps).toBe(1)
    expect(reopened.summary().openFindings.map((finding) => finding.code)).toEqual(['build-failed'])
    expect(reopened.summary().resume.nextAction).toBe('re-run build after fix')
    const cached = await reopened.runGuarded('check:build', { contentHash: 'h1' }, async () => {
      throw new Error('must not re-run')
    })
    expect(cached.cached).toBe(true)
  })

  it('seeded steps replay deterministically; leaked randomness fails replay', async () => {
    let nextSeed = 1234
    const { engine } = await makeEngine(() => nextSeed)
    const seeded = await engine.runSeededStep('generate:demo', { n: 3 }, async (rng) => ({
      values: [rng.nextInt(100), rng.nextInt(100), rng.nextInt(100)]
    }))
    expect(seeded.step.seed).toBe(1234)

    const replay = await engine.replayStep(seeded.step.id, async (rng) => ({
      values: [rng.nextInt(100), rng.nextInt(100), rng.nextInt(100)]
    }))
    expect(replay.ok).toBe(true)

    const leaked = await engine.replayStep(seeded.step.id, async () => ({ values: [Math.random()] }))
    expect(leaked.ok).toBe(false)
  })

  it('auto-resolves findings by source, enforces budgets, and dedupes clientStepId', async () => {
    const { engine } = await makeEngine()
    await engine.addFinding({ source: 'test', severity: 'error', code: 'test-failed', message: 'm', inputHash: 'x' })
    expect(await engine.autoResolve('test')).toBe(1)
    expect(engine.summary().openFindings).toEqual([])

    engine.session.budgets.test = { limit: 2, spent: 1 }
    expect(engine.spendBudget('test')).toEqual({ ok: true, remaining: 0 })
    expect(engine.spendBudget('test')).toEqual({ ok: false, remaining: 0 })
    expect(engine.spendBudget('build').ok).toBe(true) // default budget materialized on first spend

    const stepA = await engine.journalStep('author:addEntity', { inputHash: 'i1', clientStepId: 'c-1' })
    expect(engine.findByClientStepId('author:addEntity', 'c-1')?.id).toBe(stepA.id)
    expect(engine.findByClientStepId('author:addEntity', 'c-2')).toBeUndefined()
  })

  it('flags out-of-band changes: marks check steps stale and records a session finding', async () => {
    const { engine } = await makeEngine()
    await engine.runGuarded('check:build', { contentHash: 'h1' }, async () => ({ ok: true, output: 1 }))
    await engine.journalStep('author:setProperty', { inputHash: 'i1' })
    await engine.noteContentHash('hash-A')
    expect(await engine.detectOutOfBand('hash-A')).toBe(false)
    expect(await engine.detectOutOfBand('hash-B')).toBe(true)
    const kinds = engine.session.steps.map((step) => [step.kind, step.status])
    expect(kinds).toContainEqual(['check:build', 'stale'])
    expect(kinds).toContainEqual(['author:setProperty', 'completed'])
    expect(engine.summary().openFindings.map((finding) => finding.code)).toEqual(['out-of-band-changes'])
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project build-session -t 'session engine'`
Expected: FAIL — `../src/engine` does not exist.

- [x] **Step 3: Implement**

```ts
// packages/build-session/src/engine.ts
import { randomInt } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSeededRng, type SeededRng } from '@automata/engine'
import {
  DEFAULT_CHECK_BUDGET_LIMIT, summarizeSession,
  type BuildSession, type CheckKind, type Finding, type FindingSource,
  type SessionSummary, type StepRecord
} from '@automata/contracts'
import { hashJson } from './hash'
import {
  ARTIFACTS_DIR, acquireSessionLock, loadOrCreateSession, releaseSessionLock, saveSession, sessionDir
} from './store'

export interface GuardedOutcome {
  ok: boolean
  output: unknown
  artifacts?: ReadonlyArray<{ name: string; text: string }>
}

export interface GuardedRun {
  cached: boolean
  step: StepRecord
  output: unknown
}

export interface SessionEngineOptions {
  sessionsRoot: string
  gameId: string
  projectDir: string
  engineVersion: string
  now?: () => string
  seedSource?: () => number
  /** Default true; tests may run lock-free. */
  lock?: boolean
}

export interface SessionEngine {
  readonly session: BuildSession
  readonly dir: string
  save(): Promise<void>
  summary(): SessionSummary
  findCompleted(kind: string, inputHash: string): StepRecord | undefined
  journalStep(kind: string, entry: { inputHash: string; result?: unknown; clientStepId?: string }): Promise<StepRecord>
  findByClientStepId(kind: string, clientStepId: string): StepRecord | undefined
  runGuarded(kind: string, input: unknown, run: () => Promise<GuardedOutcome>): Promise<GuardedRun>
  runSeededStep(kind: string, input: unknown, run: (rng: SeededRng, seed: number) => Promise<unknown>): Promise<GuardedRun>
  replayStep(stepId: string, run: (rng: SeededRng, seed: number) => Promise<unknown>): Promise<{ ok: boolean; expected?: string; actual: string }>
  addFinding(finding: Omit<Finding, 'id' | 'createdAt'>): Promise<Finding>
  autoResolve(source: FindingSource): Promise<number>
  spendBudget(kind: CheckKind): { ok: boolean; remaining: number }
  setResumePoint(nextAction: string): Promise<void>
  noteContentHash(hash: string): Promise<void>
  detectOutOfBand(currentHash: string): Promise<boolean>
  dispose(): Promise<void>
}

export async function createSessionEngine(
  options: SessionEngineOptions
): Promise<{ engine: SessionEngine; created: boolean; quarantinedTo?: string }> {
  const now = options.now ?? (() => new Date().toISOString())
  const seedSource = options.seedSource ?? (() => randomInt(0, 0xffffffff))
  const dir = sessionDir(options.sessionsRoot, options.gameId)
  const loaded = await loadOrCreateSession({ ...options, now })
  const { session } = loaded
  if (options.lock !== false) await acquireSessionLock(dir)

  const save = async (): Promise<void> => {
    session.updatedAt = now()
    await saveSession(dir, session)
  }

  const nextStepId = (): string => `step-${String(session.steps.length + 1).padStart(4, '0')}`

  const addFinding = async (finding: Omit<Finding, 'id' | 'createdAt'>): Promise<Finding> => {
    const full: Finding = {
      ...finding,
      id: `finding-${String(session.findings.length + 1).padStart(4, '0')}`,
      createdAt: now()
    }
    session.findings.push(full)
    await save()
    return full
  }

  if (loaded.quarantinedTo) {
    await addFinding({
      source: 'session', severity: 'warning', code: 'session-quarantined',
      message: `Previous session file was unreadable; kept as ${loaded.quarantinedTo}`, inputHash: ''
    })
  }

  const recordStep = async (step: Omit<StepRecord, 'id' | 'completedAt'>): Promise<StepRecord> => {
    const full: StepRecord = { ...step, id: nextStepId(), completedAt: now() }
    session.steps.push(full)
    session.resume.lastStepId = full.id
    await save()
    return full
  }

  const writeArtifacts = async (
    stepId: string,
    artifacts: ReadonlyArray<{ name: string; text: string }>
  ): Promise<string[]> => {
    const paths: string[] = []
    for (const artifact of artifacts) {
      const rel = `${ARTIFACTS_DIR}/${stepId}-${artifact.name}`
      await writeFile(join(dir, rel), artifact.text)
      paths.push(rel)
    }
    return paths
  }

  const findCompleted = (kind: string, inputHash: string): StepRecord | undefined =>
    session.steps.find(
      (step) => step.kind === kind && step.inputHash === inputHash && step.status === 'completed'
    )

  const engine: SessionEngine = {
    get session() { return session },
    dir,
    save,
    summary: () => summarizeSession(session),
    findCompleted,

    async journalStep(kind, entry) {
      return recordStep({
        kind, inputHash: entry.inputHash, status: 'completed', artifacts: [],
        ...(entry.result !== undefined ? { result: entry.result, resultHash: hashJson(entry.result) } : {}),
        ...(entry.clientStepId !== undefined ? { clientStepId: entry.clientStepId } : {})
      })
    },

    findByClientStepId(kind, clientStepId) {
      return session.steps.find(
        (step) => step.kind === kind && step.clientStepId === clientStepId && step.status === 'completed'
      )
    },

    async runGuarded(kind, input, run) {
      const inputHash = hashJson(input)
      const hit = findCompleted(kind, inputHash)
      if (hit) return { cached: true, step: hit, output: hit.result }
      const outcome = await run()
      const stepId = nextStepId()
      const artifacts = outcome.artifacts ? await writeArtifacts(stepId, outcome.artifacts) : []
      const step: StepRecord = {
        id: stepId, kind, inputHash, status: outcome.ok ? 'completed' : 'failed',
        resultHash: hashJson(outcome.output), result: outcome.output, artifacts, completedAt: now()
      }
      session.steps.push(step)
      session.resume.lastStepId = step.id
      await save()
      return { cached: false, step, output: outcome.output }
    },

    async runSeededStep(kind, input, run) {
      const inputHash = hashJson(input)
      const hit = findCompleted(kind, inputHash)
      if (hit) return { cached: true, step: hit, output: hit.result }
      const seed = seedSource()
      const output = await run(createSeededRng(seed), seed)
      const step = await recordStep({
        kind, inputHash, status: 'completed', seed,
        result: output, resultHash: hashJson(output), artifacts: []
      })
      return { cached: false, step, output }
    },

    async replayStep(stepId, run) {
      const step = session.steps.find((candidate) => candidate.id === stepId)
      if (!step || step.seed === undefined) throw new Error(`Step "${stepId}" is not a recorded seeded step`)
      const output = await run(createSeededRng(step.seed), step.seed)
      const actual = hashJson(output)
      return { ok: actual === step.resultHash, expected: step.resultHash, actual }
    },

    addFinding,

    async autoResolve(source) {
      let resolved = 0
      for (const finding of session.findings) {
        if (finding.source === source && finding.resolvedAt === undefined) {
          finding.resolvedAt = now()
          resolved += 1
        }
      }
      if (resolved > 0) await save()
      return resolved
    },

    spendBudget(kind) {
      const state = (session.budgets[kind] ??= { limit: DEFAULT_CHECK_BUDGET_LIMIT, spent: 0 })
      if (state.spent >= state.limit) return { ok: false, remaining: 0 }
      state.spent += 1
      return { ok: true, remaining: state.limit - state.spent }
    },

    async setResumePoint(nextAction) {
      session.resume.nextAction = nextAction
      await save()
    },

    async noteContentHash(hash) {
      session.lastKnownContentHash = hash
      await save()
    },

    async detectOutOfBand(currentHash) {
      if (session.lastKnownContentHash === null || session.lastKnownContentHash === currentHash) {
        session.lastKnownContentHash = currentHash
        await save()
        return false
      }
      for (const step of session.steps) {
        if (step.kind.startsWith('check:') && step.status === 'completed') step.status = 'stale'
      }
      session.lastKnownContentHash = currentHash
      await addFinding({
        source: 'session', severity: 'warning', code: 'out-of-band-changes',
        message: 'Files changed outside the session; cached check results were marked stale.',
        inputHash: currentHash
      })
      return true
    },

    async dispose() {
      await save()
      if (options.lock !== false) await releaseSessionLock(dir)
    }
  }

  return { engine, created: loaded.created, quarantinedTo: loaded.quarantinedTo }
}
```

Note the budget-spend nuance: `spendBudget` mutates in memory only; the next `save()` (every check records a step or finding immediately after) persists it. That keeps `spendBudget` synchronous for callers.

- [x] **Step 4: Run tests, verify pass**

Run: `npx vitest run --project build-session`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/build-session
git commit -m "feat(build-session): session engine with hash guards, seeded replay, findings, budgets"
```

---

### Task 7: build-session — check runners

**Files:**
- Create: `packages/build-session/src/checks.ts`
- Modify: `packages/build-session/src/index.ts` (add `export * from './checks'`)
- Test: `packages/build-session/tests/checks.test.ts`

**Interfaces:**
- Consumes: `SessionEngine`, `GuardedOutcome` (Task 6); Task 1 types.
- Produces (used by Tasks 9–10):

```ts
export interface SpawnResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }
export interface CommandSpawner {
  run(cmd: string, args: readonly string[], opts: { cwd: string; env?: Record<string, string>; timeoutMs: number }): Promise<SpawnResult>
}
export const nodeSpawner: CommandSpawner
export interface CheckCommand { cmd: string; args: string[]; env?: Record<string, string>; timeoutMs: number }
export function checkCommands(kind: CheckKind, gameId: string, opts?: { needsInstall?: boolean; scope?: string }): CheckCommand[]
export interface CheckReport {
  kind: CheckKind; passed: boolean; cached: boolean; exitCode: number | null
  findingIds: string[]; artifacts: string[]
}
export type CheckOutcome = CheckReport | { refused: 'budget-exhausted'; kind: CheckKind }
export async function runCheck(
  engine: SessionEngine, spawner: CommandSpawner, repoRoot: string,
  kind: CheckKind, gameId: string, contentHash: string,
  opts?: { needsInstall?: boolean; scope?: string }
): Promise<CheckOutcome>
```

Semantics: cache lookup first (`check:<kind>` + hash of `{ kind, gameId, scope, contentHash }` — cache hits spend **no** budget); then budget spend (exhausted → `session`-source `error` finding `budget-exhausted` + refusal); commands run sequentially, stop at first failure; pass ⇒ `autoResolve(sourceFor(kind))`; fail ⇒ one `error` finding (`<kind>-failed` or `<kind>-timeout`) whose message is the last 4000 characters of combined output; every spawned command's full output is an artifact (`<n>.log`). `evaluate` has no spawned commands (in-process; wired in Task 10) — `checkCommands('evaluate', …)` returns `[]` and `runCheck` must never be called with it (throw).

- [x] **Step 1: Write the failing test**

```ts
// packages/build-session/tests/checks.test.ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine } from '../src/engine'
import { checkCommands, nodeSpawner, runCheck, type CommandSpawner, type SpawnResult } from '../src/checks'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeEngine() {
  const sessionsRoot = await mkdtemp(join(tmpdir(), 'bs-checks-'))
  roots.push(sessionsRoot)
  const { engine } = await createSessionEngine({
    sessionsRoot, gameId: 'probe', projectDir: 'p', engineVersion: 'e', lock: false,
    now: () => '2026-07-12T00:00:00.000Z'
  })
  return engine
}

function scriptedSpawner(results: SpawnResult[]): CommandSpawner & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async run(cmd, args) {
      calls.push([cmd, ...args])
      const next = results.shift()
      if (!next) throw new Error('unexpected spawn')
      return next
    }
  }
}

const OK: SpawnResult = { code: 0, stdout: 'fine', stderr: '', timedOut: false }
const FAIL: SpawnResult = { code: 1, stdout: 'x'.repeat(5000), stderr: 'boom', timedOut: false }

describe('check commands', () => {
  it('builds the closed command vocabulary', () => {
    expect(checkCommands('build', 'probe', { needsInstall: true }).map((c) => [c.cmd, ...c.args])).toEqual([
      ['npm', 'install', '--no-audit', '--no-fund'],
      ['npm', 'run', 'build', '-w', 'probe']
    ])
    expect(checkCommands('test', 'probe', { scope: 'sim' })[0].args).toEqual(['vitest', 'run', '--project', 'probe', '-t', 'sim'])
    const browser = checkCommands('browser', 'probe')[0]
    expect(browser.args).toEqual(['playwright', 'test', 'games/probe/e2e'])
    expect(browser.env).toEqual({ PLAYWRIGHT_ONLY: 'probe' })
    expect(checkCommands('evaluate', 'probe')).toEqual([])
  })
})

describe('runCheck', () => {
  it('passing check: artifact written, prior findings of that source auto-resolved, cached on repeat', async () => {
    const engine = await makeEngine()
    await engine.addFinding({ source: 'build', severity: 'error', code: 'build-failed', message: 'old', inputHash: 'h0' })
    const spawner = scriptedSpawner([OK])
    const report = await runCheck(engine, spawner, '/repo', 'build', 'probe', 'hash-A')
    if ('refused' in report) throw new Error('unexpected refusal')
    expect(report.passed).toBe(true)
    expect(engine.summary().openFindings).toEqual([])
    await expect(readFile(join(engine.dir, report.artifacts[0]), 'utf8')).resolves.toContain('fine')

    const again = await runCheck(engine, scriptedSpawner([]), '/repo', 'build', 'probe', 'hash-A')
    if ('refused' in again) throw new Error('unexpected refusal')
    expect(again.cached).toBe(true)
    expect(engine.session.budgets.build.spent).toBe(1) // cache hit spends nothing
  })

  it('failing check: typed finding with tail of output; failure is a result, not a throw', async () => {
    const engine = await makeEngine()
    const report = await runCheck(engine, scriptedSpawner([FAIL]), '/repo', 'test', 'probe', 'hash-A')
    if ('refused' in report) throw new Error('unexpected refusal')
    expect(report.passed).toBe(false)
    const finding = engine.summary().openFindings[0]
    expect(finding.code).toBe('test-failed')
    expect(finding.source).toBe('test')
    expect(finding.message.length).toBeLessThanOrEqual(4000)
    expect(finding.message).toContain('boom')
  })

  it('timeout maps to <kind>-timeout', async () => {
    const engine = await makeEngine()
    const timedOut: SpawnResult = { code: null, stdout: '', stderr: '', timedOut: true }
    const report = await runCheck(engine, scriptedSpawner([timedOut]), '/repo', 'browser', 'probe', 'h')
    if ('refused' in report) throw new Error('unexpected refusal')
    expect(engine.summary().openFindings[0].code).toBe('browser-timeout')
  })

  it('refuses when the budget is exhausted, with a budget-exhausted finding', async () => {
    const engine = await makeEngine()
    engine.session.budgets.build = { limit: 1, spent: 1 }
    const outcome = await runCheck(engine, scriptedSpawner([]), '/repo', 'build', 'probe', 'h')
    expect(outcome).toEqual({ refused: 'budget-exhausted', kind: 'build' })
    expect(engine.summary().openFindings[0].code).toBe('budget-exhausted')
  })

  it('rejects the evaluate kind (in-process, not spawned)', async () => {
    const engine = await makeEngine()
    await expect(runCheck(engine, scriptedSpawner([]), '/repo', 'evaluate', 'probe', 'h')).rejects.toThrow(/in-process/i)
  })

  it('nodeSpawner runs a real command and captures output and exit code', async () => {
    const result = await nodeSpawner.run(
      'node',
      ['-e', 'console.log("out"); console.error("err"); process.exit(3)'],
      { cwd: process.cwd(), timeoutMs: 30_000 }
    )
    expect(result).toMatchObject({ code: 3, timedOut: false })
    expect(result.stdout).toContain('out')
    expect(result.stderr).toContain('err')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project build-session -t 'runCheck'`
Expected: FAIL — `../src/checks` does not exist.

- [x] **Step 3: Implement**

```ts
// packages/build-session/src/checks.ts
import { spawn } from 'node:child_process'
import type { CheckKind, FindingSource } from '@automata/contracts'
import { hashJson } from './hash'
import type { SessionEngine } from './engine'

export interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface CommandSpawner {
  run(
    cmd: string,
    args: readonly string[],
    opts: { cwd: string; env?: Record<string, string>; timeoutMs: number }
  ): Promise<SpawnResult>
}

export const nodeSpawner: CommandSpawner = {
  run(cmd, args, opts) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, opts.timeoutMs)
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
      child.on('error', (error) => { clearTimeout(timer); reject(error) })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolvePromise({ code, stdout, stderr, timedOut })
      })
    })
  }
}

export interface CheckCommand {
  cmd: string
  args: string[]
  env?: Record<string, string>
  timeoutMs: number
}

/** The closed check vocabulary. `evaluate` is in-process and spawns nothing. */
export function checkCommands(
  kind: CheckKind,
  gameId: string,
  opts: { needsInstall?: boolean; scope?: string } = {}
): CheckCommand[] {
  switch (kind) {
    case 'build':
      return [
        ...(opts.needsInstall
          ? [{ cmd: 'npm', args: ['install', '--no-audit', '--no-fund'], timeoutMs: 600_000 }]
          : []),
        { cmd: 'npm', args: ['run', 'build', '-w', gameId], timeoutMs: 600_000 }
      ]
    case 'test':
      return [{
        cmd: 'npx',
        args: ['vitest', 'run', '--project', gameId, ...(opts.scope ? ['-t', opts.scope] : [])],
        timeoutMs: 600_000
      }]
    case 'browser':
      return [{
        cmd: 'npx',
        args: ['playwright', 'test', `games/${gameId}/e2e`],
        env: { PLAYWRIGHT_ONLY: gameId },
        timeoutMs: 900_000
      }]
    case 'evaluate':
      return []
  }
}

const FINDING_SOURCE: Record<CheckKind, FindingSource> = {
  build: 'build', test: 'test', browser: 'browser', evaluate: 'eval'
}

export interface CheckReport {
  kind: CheckKind
  passed: boolean
  cached: boolean
  exitCode: number | null
  findingIds: string[]
  artifacts: string[]
}

export type CheckOutcome = CheckReport | { refused: 'budget-exhausted'; kind: CheckKind }

function tail(text: string, max = 4000): string {
  return text.length <= max ? text : text.slice(text.length - max)
}

export async function runCheck(
  engine: SessionEngine,
  spawner: CommandSpawner,
  repoRoot: string,
  kind: CheckKind,
  gameId: string,
  contentHash: string,
  opts: { needsInstall?: boolean; scope?: string } = {}
): Promise<CheckOutcome> {
  if (kind === 'evaluate') throw new Error('evaluate is in-process; it is not a spawned check')
  const stepKind = `check:${kind}`
  const input = { kind, gameId, scope: opts.scope ?? null, contentHash }

  const cached = engine.findCompleted(stepKind, hashJson(input))
  if (!cached) {
    const budget = engine.spendBudget(kind)
    if (!budget.ok) {
      const finding = await engine.addFinding({
        source: 'session', severity: 'error', code: 'budget-exhausted',
        message: `Attempt budget for ${kind} is exhausted (${engine.session.budgets[kind]?.limit ?? 0}).`,
        inputHash: contentHash
      })
      void finding
      return { refused: 'budget-exhausted', kind }
    }
  }

  const guarded = await engine.runGuarded(stepKind, input, async () => {
    const commands = checkCommands(kind, gameId, opts)
    const artifacts: Array<{ name: string; text: string }> = []
    let exitCode: number | null = 0
    let timedOut = false
    let combined = ''
    for (const [index, command] of commands.entries()) {
      const result = await spawner.run(command.cmd, command.args, {
        cwd: repoRoot, env: command.env, timeoutMs: command.timeoutMs
      })
      combined += `${result.stdout}\n${result.stderr}`
      artifacts.push({
        name: `${index}.log`,
        text: `$ ${command.cmd} ${command.args.join(' ')}\n${result.stdout}\n${result.stderr}`
      })
      if (result.timedOut || result.code !== 0) {
        exitCode = result.code
        timedOut = result.timedOut
        break
      }
    }
    return {
      ok: true, // "ran to completion" — pass/fail lives in the output
      output: { passed: !timedOut && exitCode === 0, exitCode, timedOut, tail: tail(combined) },
      artifacts
    }
  })

  const output = guarded.output as { passed: boolean; exitCode: number | null; timedOut: boolean; tail: string }
  const findingIds: string[] = []
  if (!guarded.cached) {
    if (output.passed) {
      await engine.autoResolve(FINDING_SOURCE[kind])
    } else {
      const finding = await engine.addFinding({
        source: FINDING_SOURCE[kind], severity: 'error',
        code: output.timedOut ? `${kind}-timeout` : `${kind}-failed`,
        message: tail(output.tail), inputHash: contentHash
      })
      findingIds.push(finding.id)
    }
  }

  return {
    kind, passed: output.passed, cached: guarded.cached,
    exitCode: output.exitCode, findingIds, artifacts: guarded.step.artifacts
  }
}
```

The cache pre-check hashes the same `input` object with the same `hashJson` that `runGuarded` uses internally, so the pre-check and the guard can never disagree.

- [x] **Step 4: Run tests, verify pass**

Run: `npx vitest run --project build-session`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/build-session
git commit -m "feat(build-session): server-executed check runners with typed findings and budgets"
```

---

### Task 8: game-kit — pack-composition seam

**Files:**
- Create: `packages/game-kit/src/packs.ts`
- Modify: `packages/game-kit/src/index.ts` (add `export * from './packs'`)
- Modify: `tools/scaffold/src/templates/srcFiles.ts` (template `main.ts` boots through the seam)
- Test: `packages/game-kit/tests/packs.test.ts`

**Interfaces:**
- Consumes: `GameHost` type from `./host` (structurally: `cleanup.defer(fn)`).
- Produces (consumed by Phase 3+; Phase 1 ships the empty seam):

```ts
export interface GamePack<TConfig = unknown> {
  id: string
  version: string
  configSchema?: { parse(input: unknown): TConfig }
  register(host: GameHost, config: TConfig): void | (() => void)
}
export interface ComposedPacks { packIds: readonly string[]; boot(host: GameHost): void }
export function composePacks(packs: readonly GamePack[], configs?: Record<string, unknown>): ComposedPacks
```

- [x] **Step 1: Write the failing test**

```ts
// packages/game-kit/tests/packs.test.ts
import { describe, expect, it } from 'vitest'
import { composePacks, type GamePack } from '../src/packs'
import type { GameHost } from '../src/host'

function fakeHost(): { host: GameHost; cleanups: Array<() => void> } {
  const cleanups: Array<() => void> = []
  const host = { cleanup: { defer: (fn: () => void) => cleanups.push(fn) } } as unknown as GameHost
  return { host, cleanups }
}

describe('pack composition seam', () => {
  it('zero packs is the status quo: boot is a no-op', () => {
    const { host, cleanups } = fakeHost()
    const composed = composePacks([])
    expect(composed.packIds).toEqual([])
    composed.boot(host)
    expect(cleanups).toEqual([])
  })

  it('registers packs in declaration order, plumbs config through the schema slot, defers cleanup', () => {
    const { host, cleanups } = fakeHost()
    const order: string[] = []
    const packA: GamePack<{ speed: number }> = {
      id: 'a', version: '1.0.0',
      configSchema: { parse: (input) => {
        const candidate = input as { speed?: unknown }
        if (typeof candidate?.speed !== 'number') throw new Error('speed required')
        return { speed: candidate.speed }
      } },
      register: (_host, config) => { order.push(`a:${config.speed}`); return () => order.push('a:disposed') }
    }
    const packB: GamePack = {
      id: 'b', version: '1.0.0',
      register: () => { order.push('b') }
    }
    composePacks([packA, packB], { a: { speed: 5 } }).boot(host)
    expect(order).toEqual(['a:5', 'b'])
    expect(cleanups).toHaveLength(1)
    cleanups[0]()
    expect(order).toEqual(['a:5', 'b', 'a:disposed'])
  })

  it('rejects duplicate pack ids at composition time and bad config at boot time', () => {
    const pack: GamePack = { id: 'dup', version: '1.0.0', register: () => {} }
    expect(() => composePacks([pack, { ...pack }])).toThrow(/duplicate pack id "dup"/i)

    const strict: GamePack<{ n: number }> = {
      id: 's', version: '1.0.0',
      configSchema: { parse: () => { throw new Error('bad config') } },
      register: () => {}
    }
    const { host } = fakeHost()
    expect(() => composePacks([strict]).boot(host)).toThrow(/bad config/)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project game-kit -t 'pack composition'` (confirm the project name in `packages/game-kit/vitest.config.ts`)
Expected: FAIL — `../src/packs` does not exist.

- [x] **Step 3: Implement**

```ts
// packages/game-kit/src/packs.ts
import type { GameHost } from './host'

/**
 * The pack-composition runtime seam (factory Phase 1). Phase 1 ships the seam
 * empty: composing zero packs is the status quo. Phase 3 composes the first
 * real capability pack through this exact interface; Phase 4 widens to seven.
 */
export interface GamePack<TConfig = unknown> {
  id: string
  version: string
  /** Structural schema slot (zod-compatible); validated at boot when present. */
  configSchema?: { parse(input: unknown): TConfig }
  /** Contribute systems/resources at boot; a returned function joins the host cleanup stack. */
  register(host: GameHost, config: TConfig): void | (() => void)
}

export interface ComposedPacks {
  packIds: readonly string[]
  boot(host: GameHost): void
}

export function composePacks(
  packs: readonly GamePack[],
  configs: Record<string, unknown> = {}
): ComposedPacks {
  const seen = new Set<string>()
  for (const pack of packs) {
    if (seen.has(pack.id)) throw new Error(`Duplicate pack id "${pack.id}"`)
    seen.add(pack.id)
  }
  return {
    packIds: packs.map((pack) => pack.id),
    boot(host) {
      for (const pack of packs) {
        const config = pack.configSchema ? pack.configSchema.parse(configs[pack.id]) : configs[pack.id]
        const dispose = pack.register(host, config)
        if (dispose) host.cleanup.defer(dispose)
      }
    }
  }
}
```

If `GameHost.cleanup`'s member is named something other than `defer`, match the real name from `packages/game-kit/src/host.ts` in both seam and test (usage elsewhere: `host.cleanup.defer(() => ...)` in `games/pulsebreak/src/main.ts`).

Then route the scaffold template through the seam in `tools/scaffold/src/templates/srcFiles.ts`: the generated `main.ts` template imports at line ~136 — change `import { createGameHost, createProjectReader, startGameLoop } from '@automata/game-kit'` to include `composePacks` — and insert immediately after the `const host = createGameHost(app)` line (~164):

```ts
  // Pack-composition seam (empty until capability packs exist); packs will contribute systems here.
  composePacks([]).boot(host)
```

- [x] **Step 4: Run tests, verify pass**

Run: `npx vitest run --project game-kit && npx vitest run --project scaffold`
Expected: PASS (scaffold's template snapshot/expectation tests may need the two added lines reflected — update them in this task).

- [x] **Step 5: Commit**

```bash
git add packages/game-kit tools/scaffold
git commit -m "feat(game-kit): GamePack/composePacks empty seam; scaffold template boots through it"
```

---

### Task 9: editor-mcp-server — sessionHost (catalog, lifecycle, durable authoring)

**Files:**
- Create: `tools/editor-mcp-server/src/projectWriter.ts`
- Create: `tools/editor-mcp-server/src/sessionHost.ts`
- Modify: `tools/editor-mcp-server/package.json` (add `"@automata/build-session": "*"` and `"@automata/engine": "*"` to dependencies, then `npm install`)
- Test: `tools/editor-mcp-server/tests/sessionHost.test.ts`

**Interfaces:**
- Consumes: Task 2 tool defs/parser; Task 6 engine; Task 4 `snapshotFiles`/`hashJson`; `createNewGameWriter`/`nodeScaffoldFs` (`@automata/scaffold`); `discoverGames` (`./projectCatalog`); `createHeadlessHost`/`HeadlessHost` (`./headlessHost`); `projectFileDocuments` (`@automata/project`); `ENGINE_VERSION` (`@automata/engine`).
- Produces (used by Tasks 10–12):

```ts
export interface SessionHostOptions {
  repoRoot: string
  fs?: ScaffoldFs
  spawner?: CommandSpawner            // used by Task 10
  sessionsRoot?: string               // default join(repoRoot, '.automata', 'sessions')
  projectDirFor?: (gameId: string) => string   // default join(repoRoot, 'games', id, 'public', 'project')
  openHeadless?: (projectDir: string) => Promise<HeadlessHost>  // default createHeadlessHost({ projectDir, repoRoot })
  now?: () => string
  seedSource?: () => number
  lock?: boolean
}
export interface SessionMcpHost extends McpToolHost { dispose(): Promise<void> }
export function createSessionHost(options: SessionHostOptions): SessionMcpHost
```

```ts
// projectWriter.ts
export async function writeProjectFiles(projectDir: string, snapshot: ProjectSnapshot): Promise<void>
```

Behavior locked here:
- `listTools()` = workspace defs + session defs + (project tools only when a project is open).
- `createGame` — idempotent: if the game already exists, return `{ gameDir, alreadyExisted: true, session }` (no error). Otherwise: create the game's session engine first, run the scaffold as seeded step `scaffold` (input `{ name, port: port ?? null }`, output `{ gameDir, devPort }`), and return output + `alreadyExisted: false` + updated `nextSteps` copy (runBuild-with-gameId, then openProject — no `--project`, no bare `npm install` step).
- `openProject` — unknown game → error result; otherwise `ensureEngine(gameId)` (cached per host; lock acquired once per engine), `openHeadless(projectDir)`, snapshot files (`src` = `games/<id>/src`, `project` = projectDir), compute `contentHash = hashJson(files)`; first open sets `baseline`, `formatVersion` (from the loaded manifest — confirm the exact field name in `@automata/project`'s manifest model; P3 made the manifest the version authority), and `lastKnownContentHash`; reopen calls `detectOutOfBand(contentHash)`. Opening another game swaps: previous headless host is dropped (its state is already on disk), engines stay cached.
- Write tools — `splitClientStepId`; dedupe on `findByClientStepId('author:<name>', id)` → return recorded result with `deduped: true`; else delegate to the project host; on `changed: true` → `writeProjectFiles`, journal `author:<name>` step, `noteContentHash(newHash)`; response content gains `stepId`.
- `validate` — delegate; error-severity issues → one `validate`-source `error` finding (code `validation-errors`, message = JSON of the error issues, truncated to 4000 chars); zero errors → `autoResolve('validate')`.
- `getSession` / `setResumePoint` — thin wrappers over the open engine (error result when nothing open).
- Project tools with no project open → error result `no project open — call openProject first`.
- `readResource` — delegate to the open project host; throw when closed.
- `dispose()` — dispose every cached engine (saves + releases locks).

- [ ] **Step 1: Write the failing test**

```ts
// tools/editor-mcp-server/tests/sessionHost.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResult } from '@automata/contracts'
import { createSessionHost } from '../src/sessionHost'
import type { HeadlessHost } from '../src/headlessHost'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'session-host-'))
  roots.push(root)
  await mkdir(join(root, 'games'), { recursive: true })
  return root
}

/** Registers `probe` in the catalog without a real npm workspace. */
async function addCatalogGame(root: string): Promise<void> {
  await mkdir(join(root, 'games/probe/src'), { recursive: true })
  await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await writeFile(
    join(root, 'games/probe/package.json'),
    JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } })
  )
  await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 1')
}

/** Minimal file-backed project host standing in for the real editor tool host. */
function stubHeadless(projectDir: string): HeadlessHost {
  const snapshot = {
    manifest: {
      id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2,
      scenes: [{ id: 'main', path: 'scenes/main.json' }], resources: []
    },
    scenes: { main: { id: 'main', name: 'Main', entities: [{ id: 'e1', name: 'Player', enabled: true, components: [] }] } },
    resources: {}
  }
  const host = {
    get snapshot() { return snapshot },
    get commands() { return [] },
    listTools: () => [{ name: 'setProperty', description: 'stub', schema: {} }],
    async executeTool(name: string, args: unknown): Promise<ToolResult> {
      if (name === 'setProperty') {
        snapshot.scenes.main.entities[0].name = (args as { value: string }).value
        return { ok: true, content: { applied: name, changed: true } }
      }
      if (name === 'validate') return { ok: true, content: [] }
      return { ok: false, isError: true, content: `stub has no ${name}` }
    },
    async readResource() { return snapshot }
  }
  void projectDir
  return { host, registration: {}, snapshot } as unknown as HeadlessHost
}

function makeHost(root: string) {
  return createSessionHost({
    repoRoot: root,
    sessionsRoot: join(root, '.automata/sessions'),
    openHeadless: async (projectDir) => stubHeadless(projectDir),
    now: () => '2026-07-12T00:00:00.000Z',
    seedSource: () => 42,
    lock: false
  })
}

describe('sessionHost', () => {
  it('advertises workspace + session tools closed, project tools only once open', async () => {
    const root = await makeRepo()
    await addCatalogGame(root)
    const host = makeHost(root)
    const closedNames = host.listTools().map((def) => def.name)
    expect(closedNames).toContain('createGame')
    expect(closedNames).toContain('openProject')
    expect(closedNames).not.toContain('setProperty')

    await host.executeTool('openProject', { gameId: 'probe' })
    expect(host.listTools().map((def) => def.name)).toContain('setProperty')
    await host.dispose()
  })

  it('createGame scaffolds as a recorded seeded step and is idempotent on rerun', async () => {
    const root = await makeRepo()
    const host = makeHost(root)
    const created = await host.executeTool('createGame', { name: 'beacon-run' })
    expect(created.ok).toBe(true)
    expect(created.content).toMatchObject({ gameDir: 'games/beacon-run', alreadyExisted: false })
    expect((created.content as { nextSteps: string[] }).nextSteps.join(' ')).toContain('openProject')
    expect((created.content as { nextSteps: string[] }).nextSteps.join(' ')).not.toContain('--project')

    const again = await host.executeTool('createGame', { name: 'beacon-run' })
    expect(again.ok).toBe(true)
    expect(again.content).toMatchObject({ alreadyExisted: true })

    const sessionText = await readFile(join(root, '.automata/sessions/beacon-run/session.json'), 'utf8')
    const session = JSON.parse(sessionText) as { steps: Array<{ kind: string; seed?: number }> }
    expect(session.steps.some((step) => step.kind === 'scaffold' && step.seed === 42)).toBe(true)
    await host.dispose()
  })

  it('openProject resumes: reports resume position and prior steps after a "reset"', async () => {
    const root = await makeRepo()
    await addCatalogGame(root)
    const first = makeHost(root)
    await first.executeTool('openProject', { gameId: 'probe' })
    await first.executeTool('setProperty', { value: 'Hero' })
    await first.executeTool('setResumePoint', { nextAction: 'tune speed next' })
    await first.dispose()

    const second = makeHost(root)
    const reopened = await second.executeTool('openProject', { gameId: 'probe' })
    expect(reopened.ok).toBe(true)
    const content = reopened.content as { session: { resume: { nextAction: string }; completedSteps: number } }
    expect(content.session.resume.nextAction).toBe('tune speed next')
    expect(content.session.completedSteps).toBeGreaterThanOrEqual(1)
    await second.dispose()
  })

  it('write tools write through to disk, journal a step, and dedupe on clientStepId', async () => {
    const root = await makeRepo()
    await addCatalogGame(root)
    const host = makeHost(root)
    await host.executeTool('openProject', { gameId: 'probe' })

    const write = await host.executeTool('setProperty', { value: 'Hero', clientStepId: 'c-1' })
    expect(write.ok).toBe(true)
    expect((write.content as { stepId: string }).stepId).toMatch(/^step-/)
    const manifest = await readFile(join(root, 'games/probe/public/project/automata.project.json'), 'utf8')
    expect(JSON.parse(manifest)).toMatchObject({ id: 'probe' })
    const scene = await readFile(join(root, 'games/probe/public/project/scenes/main.json'), 'utf8')
    expect(scene).toContain('Hero')

    const dupe = await host.executeTool('setProperty', { value: 'Hero', clientStepId: 'c-1' })
    expect((dupe.content as { deduped?: boolean }).deduped).toBe(true)
    await host.dispose()
  })

  it('project tools without an open project return a contract-violation error result', async () => {
    const root = await makeRepo()
    const host = makeHost(root)
    const result = await host.executeTool('getSession', {})
    expect(result.ok).toBe(false)
    expect(String(result.content)).toMatch(/no project open/i)
    await host.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project editor-mcp-server -t 'sessionHost'`
Expected: FAIL — `../src/sessionHost` does not exist.

- [ ] **Step 3: Implement `projectWriter.ts`**

```ts
// tools/editor-mcp-server/src/projectWriter.ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { projectFileDocuments, type ProjectSnapshot } from '@automata/project'

/**
 * Write-through persistence: serialize the current snapshot into the project
 * directory. Removed scenes/resources may leave orphan files behind; loads are
 * manifest-driven, so orphans are inert.
 */
export async function writeProjectFiles(projectDir: string, snapshot: ProjectSnapshot): Promise<void> {
  for (const doc of projectFileDocuments(snapshot)) {
    const path = join(projectDir, doc.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, doc.text)
  }
}
```

- [ ] **Step 4: Implement `sessionHost.ts`**

```ts
// tools/editor-mcp-server/src/sessionHost.ts
import { join } from 'node:path'
import { ENGINE_VERSION } from '@automata/engine'
import {
  sessionToolDefs, splitClientStepId, workspaceToolDefs, writeToolNames,
  type McpToolHost, type ToolResult
} from '@automata/contracts'
import {
  createSessionEngine, hashJson, snapshotFiles,
  type CommandSpawner, type SessionEngine
} from '@automata/build-session'
import { createNewGameWriter, nodeScaffoldFs, type ScaffoldFs } from '@automata/scaffold'
import { discoverGames } from './projectCatalog'
import { createHeadlessHost, type HeadlessHost } from './headlessHost'
import { writeProjectFiles } from './projectWriter'

export interface SessionHostOptions {
  repoRoot: string
  fs?: ScaffoldFs
  spawner?: CommandSpawner
  sessionsRoot?: string
  projectDirFor?: (gameId: string) => string
  openHeadless?: (projectDir: string) => Promise<HeadlessHost>
  now?: () => string
  seedSource?: () => number
  lock?: boolean
}

export interface SessionMcpHost extends McpToolHost {
  dispose(): Promise<void>
}

interface OpenState {
  gameId: string
  projectDir: string
  headless: HeadlessHost
  engine: SessionEngine
}

const WRITE_TOOLS = new Set<string>(writeToolNames)

const ok = (content: unknown): ToolResult => ({ ok: true, content })
const fail = (message: string): ToolResult => ({ ok: false, isError: true, content: message })

export function createSessionHost(options: SessionHostOptions): SessionMcpHost {
  const repoRoot = options.repoRoot
  const sessionsRoot = options.sessionsRoot ?? join(repoRoot, '.automata', 'sessions')
  const projectDirFor =
    options.projectDirFor ?? ((gameId: string) => join(repoRoot, 'games', gameId, 'public', 'project'))
  const openHeadless =
    options.openHeadless ?? ((projectDir: string) => createHeadlessHost({ projectDir, repoRoot }))
  const writeGame = createNewGameWriter(options.fs ?? nodeScaffoldFs)

  const engines = new Map<string, SessionEngine>()
  let open: OpenState | null = null

  async function ensureEngine(gameId: string): Promise<SessionEngine> {
    const cached = engines.get(gameId)
    if (cached) return cached
    const { engine } = await createSessionEngine({
      sessionsRoot, gameId, projectDir: projectDirFor(gameId), engineVersion: ENGINE_VERSION,
      now: options.now, seedSource: options.seedSource, lock: options.lock
    })
    engines.set(gameId, engine)
    return engine
  }

  async function contentSnapshot(gameId: string, projectDir: string): Promise<{ files: Record<string, string>; hash: string }> {
    const files = await snapshotFiles([
      { label: 'src', dir: join(repoRoot, 'games', gameId, 'src') },
      { label: 'project', dir: projectDir }
    ])
    return { files, hash: hashJson(files) }
  }

  function requireOpen(): OpenState | null {
    return open
  }

  async function handleCreateGame(args: { name: string; port?: number }): Promise<ToolResult> {
    const existing = await discoverGames(repoRoot)
    const engine = await ensureEngine(args.name)
    if (existing.includes(args.name)) {
      return ok({ gameDir: `games/${args.name}`, alreadyExisted: true, session: engine.summary() })
    }
    const seeded = await engine.runSeededStep('scaffold', { name: args.name, port: args.port ?? null }, async () => {
      const plan = await writeGame(repoRoot, args.name, args.port)
      return { gameDir: `games/${plan.name}`, devPort: plan.port }
    })
    return ok({
      ...(seeded.output as { gameDir: string; devPort: number }),
      alreadyExisted: false,
      cached: seeded.cached,
      session: engine.summary(),
      nextSteps: [
        `Call runBuild with gameId "${args.name}" — it runs npm install for the new workspace package when needed`,
        `Call openProject with gameId "${args.name}" to author content; the authoring tools carry per-type JSON schemas in their descriptions`,
        `The scaffold is a generic beacon-runner skeleton: rewrite games/${args.name}/src/sim/sim.ts and src/game/gameplay.ts to implement the intended mechanics, keeping the game's tests green`,
        'Author entities and resources, keep the validate tool clean, then run evaluate and iterate on tuning until the metrics match the intent',
        'Use runTests and runBrowserEval to gate the result; finish with npm run ci at the repo root'
      ]
    })
  }

  async function handleOpenProject(gameId: string): Promise<ToolResult> {
    const available = await discoverGames(repoRoot)
    if (!available.includes(gameId)) {
      return fail(`Unknown game "${gameId}". Available: ${available.join(', ')}`)
    }
    const projectDir = projectDirFor(gameId)
    const engine = await ensureEngine(gameId)
    const headless = await openHeadless(projectDir)
    open = { gameId, projectDir, headless, engine }

    const { files, hash } = await contentSnapshot(gameId, projectDir)
    let outOfBandChanges = false
    if (engine.session.baseline === null) {
      engine.session.baseline = { contentHash: hash, files }
      engine.session.formatVersion = headless.snapshot.manifest.formatVersion
      await engine.noteContentHash(hash)
    } else {
      outOfBandChanges = await engine.detectOutOfBand(hash)
    }
    return ok({ opened: gameId, outOfBandChanges, session: engine.summary() })
  }

  async function handleWriteTool(state: OpenState, name: string, rawArgs: unknown): Promise<ToolResult> {
    const { clientStepId, rest } = splitClientStepId(rawArgs)
    const stepKind = `author:${name}`
    if (clientStepId) {
      const dup = state.engine.findByClientStepId(stepKind, clientStepId)
      if (dup) return ok({ ...(dup.result as object), stepId: dup.id, deduped: true })
    }
    const result = await state.headless.host.executeTool(name as never, rest)
    if (!result.ok) return result
    const content = result.content as { applied: string; changed: boolean }
    if (!content.changed) return result

    await writeProjectFiles(state.projectDir, state.headless.host.snapshot)
    const { hash } = await contentSnapshot(state.gameId, state.projectDir)
    const step = await state.engine.journalStep(stepKind, {
      inputHash: hashJson({ name, args: rest }), result: content,
      ...(clientStepId !== undefined ? { clientStepId } : {})
    })
    await state.engine.noteContentHash(hash)
    return ok({ ...content, stepId: step.id })
  }

  async function handleValidate(state: OpenState): Promise<ToolResult> {
    const result = await state.headless.host.executeTool('validate', {})
    if (!result.ok) return result
    const issues = result.content as Array<{ severity: string }>
    const errors = issues.filter((issue) => issue.severity === 'error')
    if (errors.length === 0) {
      await state.engine.autoResolve('validate')
    } else {
      await state.engine.addFinding({
        source: 'validate', severity: 'error', code: 'validation-errors',
        message: JSON.stringify(errors).slice(0, 4000),
        inputHash: state.engine.session.lastKnownContentHash ?? ''
      })
    }
    return result
  }

  return {
    listTools() {
      return [
        ...workspaceToolDefs(),
        ...sessionToolDefs(),
        ...(open ? open.headless.host.listTools() : [])
      ]
    },

    async executeTool(name, args) {
      try {
        if (name === 'listGames') return ok({ games: await discoverGames(repoRoot) })
        if (name === 'createGame') return await handleCreateGame(args as { name: string; port?: number })
        if (name === 'openProject') return await handleOpenProject((args as { gameId: string }).gameId)

        if (name === 'getSession') {
          const state = requireOpen()
          return state ? ok(state.engine.summary()) : fail('no project open — call openProject first')
        }
        if (name === 'setResumePoint') {
          const state = requireOpen()
          if (!state) return fail('no project open — call openProject first')
          await state.engine.setResumePoint((args as { nextAction: string }).nextAction)
          return ok({ recorded: true })
        }
        if (name === 'runBuild' || name === 'runTests' || name === 'runBrowserEval' || name === 'changedFiles') {
          return await this.executeCheckTool(name, args) // added in Task 10
        }

        const state = requireOpen()
        if (!state) return fail('no project open — call openProject first')
        if (WRITE_TOOLS.has(name)) return await handleWriteTool(state, name, args)
        if (name === 'validate') return await handleValidate(state)
        return await state.headless.host.executeTool(name as never, args)
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      }
    },

    async readResource(uri) {
      const state = requireOpen()
      if (!state) throw new Error(`No project open (requested ${uri})`)
      return state.headless.host.readResource(uri as never)
    },

    async dispose() {
      for (const engine of engines.values()) await engine.dispose()
      engines.clear()
      open = null
    }
  } as SessionMcpHost
}
```

Until Task 10 lands, stub `executeCheckTool` on the returned object as `async executeCheckTool() { return fail('checks land in the next task') }` so this task compiles and its tests pass; Task 10 replaces the stub. (Type the returned object as `SessionMcpHost & { executeCheckTool(name: string, args: unknown): Promise<ToolResult> }` internally.) The `formatVersion` read must match the real manifest field name from `@automata/project` — verify it while implementing and adjust if the model calls it something else.

- [ ] **Step 5: Run tests, verify pass; commit**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS (existing workspaceHost tests untouched for now — removal happens in Task 11).

```bash
git add tools/editor-mcp-server package-lock.json
git commit -m "feat(editor-mcp-server): sessionHost — durable open/reopen, write-through authoring, idempotent seeded createGame"
```

---

### Task 10: editor-mcp-server — check tools, changedFiles, guarded evaluate

**Files:**
- Modify: `tools/editor-mcp-server/src/sessionHost.ts` (replace the Task 9 `executeCheckTool` stub; intercept `evaluate`)
- Test: `tools/editor-mcp-server/tests/sessionChecks.test.ts`

**Interfaces:**
- Consumes: `runCheck`, `nodeSpawner`, `checkCommands`, `diffFiles` (`@automata/build-session`); Task 9 internals (`ensureEngine`, `contentSnapshot`, `requireOpen`).
- Produces: tool behavior only — `runBuild`/`runTests`/`runBrowserEval` (optional `gameId`, default open project), `changedFiles` (open project only), and `evaluate` becomes hash-guarded + budgeted + finding-mapped.

Behavior locked here:
- Check target resolution: explicit `args.gameId` if present, else the open project's gameId, else error result `no project open and no gameId given`.
- `needsInstall` for `runBuild`: `true` iff `node_modules/<gameId>` is missing at the repo root (`access` check on the workspace symlink).
- Each check computes a fresh `contentSnapshot` of the target game, passes `hash` as `contentHash` to `runCheck`, then `noteContentHash(hash)` — a later out-of-band edit is caught by the next open/check.
- `changedFiles`: requires open project and a baseline; returns `diffFiles(baseline.files, current.files)`.
- `evaluate` (intercepted before generic project-tool delegation): requires open project; cache-first via `findCompleted('check:evaluate', hashJson({ args, contentHash }))`; on miss spend `evaluate` budget (exhausted → `budget-exhausted` refusal result, `isError: true`); run through the project host inside `runGuarded`; result outcome `passed` → `autoResolve('eval')`, otherwise add `eval`-source `error` finding `evaluation-failed` (message: JSON of metrics/outcome, truncated to 4000); response content gains `{ cached }`.

- [ ] **Step 1: Write the failing test**

```ts
// tools/editor-mcp-server/tests/sessionChecks.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResult } from '@automata/contracts'
import type { CommandSpawner, SpawnResult } from '@automata/build-session'
import { createSessionHost } from '../src/sessionHost'
import type { HeadlessHost } from '../src/headlessHost'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'session-checks-'))
  roots.push(root)
  await mkdir(join(root, 'games/probe/src'), { recursive: true })
  await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await writeFile(
    join(root, 'games/probe/package.json'),
    JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } })
  )
  await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 1')
  return root
}

function scriptedSpawner(results: SpawnResult[]): CommandSpawner & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async run(cmd, args) {
      calls.push([cmd, ...args])
      const next = results.shift()
      if (!next) throw new Error('unexpected spawn')
      return next
    }
  }
}

const OK: SpawnResult = { code: 0, stdout: 'fine', stderr: '', timedOut: false }
const FAIL: SpawnResult = { code: 1, stdout: '', stderr: 'assertion boom', timedOut: false }

function stubHeadless(evaluateOutcome: 'passed' | 'failed'): HeadlessHost {
  const snapshot = {
    manifest: { id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2, scenes: [{ id: 'main', path: 'scenes/main.json' }], resources: [] },
    scenes: { main: { id: 'main', name: 'Main', entities: [] } },
    resources: {}
  }
  const host = {
    get snapshot() { return snapshot },
    get commands() { return [] },
    listTools: () => [],
    async executeTool(name: string): Promise<ToolResult> {
      if (name === 'evaluate') {
        return { ok: true, content: { outcome: evaluateOutcome, score: 0.5, metrics: {}, steps: 10 } }
      }
      return { ok: false, isError: true, content: `stub has no ${name}` }
    },
    async readResource() { return snapshot }
  }
  return { host, registration: {}, snapshot } as unknown as HeadlessHost
}

function makeHost(root: string, spawner: CommandSpawner, evaluateOutcome: 'passed' | 'failed' = 'passed') {
  return createSessionHost({
    repoRoot: root,
    sessionsRoot: join(root, '.automata/sessions'),
    spawner,
    openHeadless: async () => stubHeadless(evaluateOutcome),
    now: () => '2026-07-12T00:00:00.000Z',
    lock: false
  })
}

describe('session check tools', () => {
  it('runBuild with explicit gameId works without an open project (fresh-scaffold bootstrap)', async () => {
    const root = await makeRepo()
    const spawner = scriptedSpawner([OK, OK]) // npm install (no node_modules/probe) + npm run build
    const host = makeHost(root, spawner)
    const result = await host.executeTool('runBuild', { gameId: 'probe' })
    expect(result.ok).toBe(true)
    expect(result.content).toMatchObject({ kind: 'build', passed: true, cached: false })
    expect(spawner.calls[0]).toEqual(['npm', 'install', '--no-audit', '--no-fund'])
    expect(spawner.calls[1]).toEqual(['npm', 'run', 'build', '-w', 'probe'])
    await host.dispose()
  })

  it('failing runTests produces a typed finding visible in getSession; identical rerun is cached', async () => {
    const root = await makeRepo()
    const host = makeHost(root, scriptedSpawner([FAIL]))
    await host.executeTool('openProject', { gameId: 'probe' })
    const failed = await host.executeTool('runTests', {})
    expect(failed.ok).toBe(true) // failure is a result, not a tool error
    expect(failed.content).toMatchObject({ kind: 'test', passed: false })

    const session = await host.executeTool('getSession', {})
    const findings = (session.content as { openFindings: Array<{ code: string; message: string }> }).openFindings
    expect(findings.map((finding) => finding.code)).toContain('test-failed')
    expect(findings.find((finding) => finding.code === 'test-failed')?.message).toContain('assertion boom')

    const rerun = await host.executeTool('runTests', {})
    expect(rerun.content).toMatchObject({ cached: true })
    await host.dispose()
  })

  it('a fix (file change) invalidates the cache; a passing rerun auto-resolves the finding', async () => {
    const root = await makeRepo()
    const host = makeHost(root, scriptedSpawner([FAIL, OK]))
    await host.executeTool('openProject', { gameId: 'probe' })
    await host.executeTool('runTests', {})
    await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 2 // fixed')
    const rerun = await host.executeTool('runTests', {})
    expect(rerun.content).toMatchObject({ passed: true, cached: false })
    const session = await host.executeTool('getSession', {})
    expect((session.content as { openFindings: unknown[] }).openFindings).toEqual([])
    await host.dispose()
  })

  it('changedFiles diffs against the session baseline', async () => {
    const root = await makeRepo()
    const host = makeHost(root, scriptedSpawner([]))
    await host.executeTool('openProject', { gameId: 'probe' })
    await writeFile(join(root, 'games/probe/src/extra.ts'), 'export const extra = true')
    await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 3')
    const diff = await host.executeTool('changedFiles', {})
    expect(diff.content).toEqual({ added: ['src/extra.ts'], removed: [], changed: ['src/sim.ts'] })
    await host.dispose()
  })

  it('evaluate is hash-guarded and maps a failed outcome to an eval finding', async () => {
    const root = await makeRepo()
    const host = makeHost(root, scriptedSpawner([]), 'failed')
    await host.executeTool('openProject', { gameId: 'probe' })
    const first = await host.executeTool('evaluate', { maxSteps: 100 })
    expect(first.ok).toBe(true)
    expect((first.content as { cached: boolean }).cached).toBe(false)
    const second = await host.executeTool('evaluate', { maxSteps: 100 })
    expect((second.content as { cached: boolean }).cached).toBe(true)
    const session = await host.executeTool('getSession', {})
    const codes = (session.content as { openFindings: Array<{ code: string }> }).openFindings.map((finding) => finding.code)
    expect(codes).toContain('evaluation-failed')
    await host.dispose()
  })

  it('exhausted budget refuses with a typed error result', async () => {
    const root = await makeRepo()
    // Pre-exhaust the test budget directly in the durable session file, then
    // open with a FRESH host so the exhausted state is what gets loaded.
    const preHost = makeHost(root, scriptedSpawner([]))
    await preHost.executeTool('openProject', { gameId: 'probe' })
    await preHost.dispose()
    const sessionPath = join(root, '.automata/sessions/probe/session.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf8')) as { budgets: Record<string, unknown> }
    session.budgets = { test: { limit: 1, spent: 1 } }
    await writeFile(sessionPath, JSON.stringify(session, null, 2))

    const host = makeHost(root, scriptedSpawner([]))
    await host.executeTool('openProject', { gameId: 'probe' })
    await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 999')
    const refused = await host.executeTool('runTests', {})
    expect(refused.ok).toBe(false)
    expect(JSON.stringify(refused.content)).toContain('budget-exhausted')
    const after = await host.executeTool('getSession', {})
    const codes = (after.content as { openFindings: Array<{ code: string }> }).openFindings.map((finding) => finding.code)
    expect(codes).toContain('budget-exhausted')
    await host.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project editor-mcp-server -t 'session check tools'`
Expected: FAIL — checks stubbed (`checks land in the next task`).

- [ ] **Step 3: Implement**

In `sessionHost.ts`, add imports:

```ts
import { access } from 'node:fs/promises'
import { diffFiles, nodeSpawner, runCheck } from '@automata/build-session'
```

Replace the Task 9 `executeCheckTool` stub with:

```ts
  const spawner = options.spawner ?? nodeSpawner

  async function needsInstall(gameId: string): Promise<boolean> {
    try {
      await access(join(repoRoot, 'node_modules', gameId))
      return false
    } catch {
      return true
    }
  }

  async function executeCheckTool(name: string, args: unknown): Promise<ToolResult> {
    if (name === 'changedFiles') {
      const state = requireOpen()
      if (!state) return fail('no project open — call openProject first')
      if (state.engine.session.baseline === null) return fail('session has no baseline yet')
      const current = await contentSnapshot(state.gameId, state.projectDir)
      return ok(diffFiles(state.engine.session.baseline.files, current.files))
    }

    const argGameId = (args as { gameId?: string }).gameId
    const gameId = argGameId ?? requireOpen()?.gameId
    if (!gameId) return fail('no project open and no gameId given')
    const projectDir = requireOpen()?.gameId === gameId ? requireOpen()!.projectDir : projectDirFor(gameId)
    const engine = await ensureEngine(gameId)

    const kind = name === 'runBuild' ? 'build' : name === 'runTests' ? 'test' : 'browser'
    const { hash } = await contentSnapshot(gameId, projectDir)
    const outcome = await runCheck(engine, spawner, repoRoot, kind, gameId, hash, {
      ...(kind === 'build' ? { needsInstall: await needsInstall(gameId) } : {}),
      ...(kind === 'test' ? { scope: (args as { scope?: string }).scope } : {})
    })
    await engine.noteContentHash(hash)
    if ('refused' in outcome) {
      return { ok: false, isError: true, content: { code: 'budget-exhausted', kind: outcome.kind } }
    }
    return ok(outcome)
  }
```

Intercept `evaluate` in `executeTool` (before the generic project-tool delegation, alongside the `validate` branch):

```ts
        if (name === 'evaluate') return await handleEvaluate(state, args)
```

```ts
  async function handleEvaluate(state: OpenState, args: unknown): Promise<ToolResult> {
    const { hash } = await contentSnapshot(state.gameId, state.projectDir)
    const input = { args, contentHash: hash }
    const hit = state.engine.findCompleted('check:evaluate', hashJson(input))
    if (!hit) {
      const budget = state.engine.spendBudget('evaluate')
      if (!budget.ok) {
        await state.engine.addFinding({
          source: 'session', severity: 'error', code: 'budget-exhausted',
          message: 'Attempt budget for evaluate is exhausted.', inputHash: hash
        })
        return { ok: false, isError: true, content: { code: 'budget-exhausted', kind: 'evaluate' } }
      }
    }
    const guarded = await state.engine.runGuarded('check:evaluate', input, async () => {
      const result = await state.headless.host.executeTool('evaluate', args as never)
      return { ok: result.ok, output: result.content }
    })
    const output = guarded.output as { outcome?: string }
    if (!guarded.cached) {
      if (output?.outcome === 'passed') {
        await state.engine.autoResolve('eval')
      } else {
        await state.engine.addFinding({
          source: 'eval', severity: 'error', code: 'evaluation-failed',
          message: JSON.stringify(output).slice(0, 4000), inputHash: hash
        })
      }
    }
    return ok({ ...(typeof output === 'object' && output !== null ? output : { value: output }), cached: guarded.cached })
  }
```

Wire `executeCheckTool` into the `runBuild|runTests|runBrowserEval|changedFiles` branch from Task 9 (drop the `this.` indirection — call the closure directly).

- [ ] **Step 4: Run tests, verify pass; commit**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS.

```bash
git add tools/editor-mcp-server
git commit -m "feat(editor-mcp-server): server-executed check tools, changedFiles, guarded evaluate"
```

---

### Task 11: Single workspace mode — retire --project/--bundle, migrate callers

**Files:**
- Modify: `tools/editor-mcp-server/src/main.ts` (workspace-only CLI)
- Delete: `tools/editor-mcp-server/src/workspaceHost.ts`, `tools/editor-mcp-server/tests/workspaceHost.test.ts`
- No change needed: `tests/server.test.ts` (it drives `createMcpServer` with a fake host and `createHeadlessHost` directly — both keep their signatures), `tests/mcpAdapter.test.ts`, `tests/smoke.test.ts`, `tests/headlessHost.test.ts` (the internal open path remains). Verify they still pass, but do not rewrite them.
- Modify: `tools/scaffold/scripts/verify-new-game.ts` (drive workspace mode + `openProject` over stdio)
- Modify: `tools/scaffold/src/templates/configFiles.ts` (README copy: `--workspace .` + `openProject`, drop `--project`)
- Modify: `.gitignore` (add `.automata/`)

**Interfaces:**
- Consumes: `createSessionHost` (Task 9), `parseUnifiedToolArgs` (Task 2), `createMcpServer` (existing), `RESOURCE_URIS`, workspace prompts (existing).
- Produces: the one blessed invocation `automata-editor-mcp --workspace <repoRoot>`.

- [ ] **Step 1: Rewrite `main.ts`**

```ts
// tools/editor-mcp-server/src/main.ts
import { resolve } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  RESOURCE_URIS, getWorkspacePrompt, parseUnifiedToolArgs, workspacePromptDefs
} from '@automata/contracts'
import { createMcpServer } from './server'
import { createSessionHost } from './sessionHost'

const USAGE = `Usage: automata-editor-mcp --workspace <repoRoot>

The single-mode workspace server: list and scaffold games, open projects,
author content with write-through persistence, and run hash-guarded checks
against a durable build session under .automata/sessions/<gameId>/.

Options:
  --workspace <repoRoot>  Monorepo root to serve
  --help                  Show this help
`

function parseArgs(args: readonly string[]): { help: boolean; workspaceDir?: string } {
  const options: { help: boolean; workspaceDir?: string } = { help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    if (arg === '--workspace') {
      const value = args[++index]
      if (!value) throw new Error('--workspace requires a value')
      options.workspaceDir = value
      continue
    }
    if (arg === '--project' || arg === '--bundle') {
      throw new Error(`${arg} was removed; use --workspace and the openProject tool`)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args)
  if (options.help || options.workspaceDir === undefined) {
    process.stderr.write(USAGE)
    return
  }

  // Stdout is exclusively the MCP channel; status is deliberately stderr-only.
  const repoRoot = resolve(options.workspaceDir)
  const host = createSessionHost({ repoRoot })
  const server = createMcpServer(host, {
    parseArgs: parseUnifiedToolArgs,
    resourceUris: Object.values(RESOURCE_URIS),
    prompts: { list: workspacePromptDefs, get: getWorkspacePrompt }
  })
  await server.connect(new StdioServerTransport())
  process.stderr.write(`automata-editor MCP ready: workspace mode (${repoRoot})\n`)
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
```

- [ ] **Step 2: Delete `workspaceHost.ts` + its test**

`workspaceHost.test.ts` assertions worth carrying into `sessionHost.test.ts` (if not already present from Task 9): tool advertisement (createGame/listGames present), and readResource throwing when no project is open. The other existing test files (`server.test.ts`, `mcpAdapter.test.ts`, `smoke.test.ts`, `headlessHost.test.ts`) need no rewrite — run them to confirm.

- [ ] **Step 3: Update the scaffold README template**

In `tools/scaffold/src/templates/configFiles.ts`, replace the MCP line (~127):

```text
`node_modules/.bin/automata-editor-mcp --workspace .` then call the openProject tool with gameId "${name}"
```

- [ ] **Step 4: Rewrite `assertMcpServerLoads` in `verify-new-game.ts`**

Replace the function with a workspace-mode probe that speaks minimal MCP over stdio (newline-delimited JSON-RPC) and proves `openProject` works against the scaffolded game:

```ts
function assertMcpServerOpensProject(cwd: string): Promise<void> {
  process.stderr.write(`\n>> MCP workspace server: openProject ${GAME}\n`)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'npx',
      ['tsx', 'tools/editor-mcp-server/src/main.ts', '--workspace', '.'],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const timer = setTimeout(() => { child.kill(); reject(new Error('MCP openProject timed out')) }, 120_000)
    const send = (message: object): void => { child.stdin.write(`${JSON.stringify(message)}\n`) }
    let buffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (!line.trim()) continue
        const message = JSON.parse(line) as { id?: number; error?: unknown; result?: { isError?: boolean; content?: Array<{ text?: string }> } }
        if (message.id === 1) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'openProject', arguments: { gameId: GAME } } })
        }
        if (message.id === 2) {
          clearTimeout(timer)
          child.kill()
          if (message.error || message.result?.isError) {
            reject(new Error(`openProject failed: ${JSON.stringify(message)}`))
          } else if (!message.result?.content?.[0]?.text?.includes(`"opened":"${GAME}"`)) {
            reject(new Error(`unexpected openProject result: ${JSON.stringify(message.result)}`))
          } else {
            resolvePromise()
          }
        }
      }
    })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    send({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify-new-game', version: '0' } }
    })
  })
}
```

Swap the call site (`await assertMcpServerLoads(clone)` → `await assertMcpServerOpensProject(clone)`). If the SDK's stdio transport rejects the `initialize` params shape, adjust to the protocol version the installed `@modelcontextprotocol/sdk` expects — the assertion under test is only that `openProject` succeeds against a clean clone.

- [ ] **Step 5: Add `.automata/` to `.gitignore`**

```text
# MCP build sessions (durable, machine-local)
.automata/
```

- [ ] **Step 6: Run gates, commit**

Run: `npx vitest run --project editor-mcp-server && npm run lint && npm run typecheck`
Expected: PASS — no references to `createWorkspaceHost`, `--project`, or `--bundle` remain in `tools/editor-mcp-server/src` (grep to confirm: `grep -rn -- "--project\|--bundle\|createWorkspaceHost" tools/editor-mcp-server/src` → only the removal error message in `main.ts`).

```bash
git add -A tools/editor-mcp-server tools/scaffold .gitignore
git commit -m "feat(editor-mcp-server)!: single workspace mode; retire --project/--bundle; migrate verify-new-game"
```

---

### Task 12: Acceptance — the exit criterion as a scripted test

**Files:**
- Test: `tools/editor-mcp-server/tests/acceptance.test.ts` (new; no production code expected — any failure here is a bug in Tasks 1–11)

**Interfaces:**
- Consumes: `createSessionHost` (Tasks 9–10), `createSessionEngine` (Task 6), the stub-headless pattern from Task 9's test.

This test walks the roadmap exit criterion literally, with process resets modeled as full host disposal + reconstruction (all state must round-trip through disk — that is what makes a real process kill equivalent). The project host stub here is **file-backed**: it loads its snapshot from the files write-through produced, so reopen genuinely proves durability of authored content, not just of session metadata.

- [ ] **Step 1: Write the acceptance test**

```ts
// tools/editor-mcp-server/tests/acceptance.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResult } from '@automata/contracts'
import { createSessionEngine, type CommandSpawner, type SpawnResult } from '@automata/build-session'
import { createSessionHost, type SessionHostOptions } from '../src/sessionHost'
import type { HeadlessHost } from '../src/headlessHost'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const MANIFEST = {
  id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2,
  scenes: [{ id: 'main', path: 'scenes/main.json' }], resources: []
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'acceptance-'))
  roots.push(root)
  const projectDir = join(root, 'games/probe/public/project')
  await mkdir(join(root, 'games/probe/src'), { recursive: true })
  await mkdir(join(projectDir, 'scenes'), { recursive: true })
  await writeFile(
    join(root, 'games/probe/package.json'),
    JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } })
  )
  await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 1')
  await writeFile(join(projectDir, 'automata.project.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`)
  await writeFile(
    join(projectDir, 'scenes/main.json'),
    `${JSON.stringify({ id: 'main', name: 'Main', entities: [{ id: 'e1', name: 'Player', enabled: true, components: [] }] }, null, 2)}\n`
  )
  return root
}

/** File-backed stub: reopen reads whatever write-through last persisted. */
async function loadStubHeadless(projectDir: string): Promise<HeadlessHost> {
  const manifest = JSON.parse(await readFile(join(projectDir, 'automata.project.json'), 'utf8'))
  const main = JSON.parse(await readFile(join(projectDir, 'scenes/main.json'), 'utf8'))
  const snapshot = { manifest, scenes: { main }, resources: {} }
  const host = {
    get snapshot() { return snapshot },
    get commands() { return [] },
    listTools: () => [{ name: 'setProperty', description: 'stub', schema: {} }],
    async executeTool(name: string, args: unknown): Promise<ToolResult> {
      if (name === 'setProperty') {
        snapshot.scenes.main.entities[0].name = (args as { value: string }).value
        return { ok: true, content: { applied: name, changed: true } }
      }
      if (name === 'validate') return { ok: true, content: [] }
      return { ok: false, isError: true, content: `stub has no ${name}` }
    },
    async readResource() { return snapshot }
  }
  return { host, registration: {}, snapshot } as unknown as HeadlessHost
}

function scriptedSpawner(script: SpawnResult[]): CommandSpawner {
  return {
    async run() {
      const next = script.shift()
      if (!next) throw new Error('unexpected spawn')
      return next
    }
  }
}

const PASS: SpawnResult = { code: 0, stdout: 'ok', stderr: '', timedOut: false }
const FAIL: SpawnResult = { code: 1, stdout: '', stderr: 'expected 2, got 1', timedOut: false }

function hostOptions(root: string, spawner: CommandSpawner): SessionHostOptions {
  return {
    repoRoot: root,
    sessionsRoot: join(root, '.automata/sessions'),
    spawner,
    openHeadless: loadStubHeadless,
    lock: false
  }
}

describe('Phase 1 exit criterion (scripted, no LLM)', () => {
  it('create→open→author→check→KILL→resume cached→defect→repair→re-check→resolved', async () => {
    const root = await makeRepo()

    // Session A: open, author, run a passing test check, declare intent, "die".
    const hostA = createSessionHost(hostOptions(root, scriptedSpawner([PASS])))
    await hostA.executeTool('openProject', { gameId: 'probe' })
    await hostA.executeTool('setProperty', { value: 'Hero', clientStepId: 'rename-1' })
    const checkA = await hostA.executeTool('runTests', {})
    expect(checkA.content).toMatchObject({ passed: true, cached: false })
    await hostA.executeTool('setResumePoint', { nextAction: 'harden the sim tests' })
    await hostA.dispose() // process reset: everything below reads only from disk

    // Session B: reopen — authored content and session state survived; work is not replayed.
    const hostB = createSessionHost(hostOptions(root, scriptedSpawner([FAIL, PASS])))
    const reopened = await hostB.executeTool('openProject', { gameId: 'probe' })
    const summary = (reopened.content as { session: { resume: { nextAction: string } } }).session
    expect(summary.resume.nextAction).toBe('harden the sim tests')
    const scene = await readFile(join(root, 'games/probe/public/project/scenes/main.json'), 'utf8')
    expect(scene).toContain('Hero') // write-through survived the reset

    const cached = await hostB.executeTool('runTests', {})
    expect(cached.content).toMatchObject({ cached: true, passed: true }) // no blind replay

    // Retrying the same authored step is deduped, not double-applied.
    const dedup = await hostB.executeTool('setProperty', { value: 'Hero', clientStepId: 'rename-1' })
    expect((dedup.content as { deduped?: boolean }).deduped).toBe(true)

    // Inject a defect (out-of-band file change), detect it via the failing check.
    await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = -1 // broken')
    const failed = await hostB.executeTool('runTests', {})
    expect(failed.content).toMatchObject({ passed: false, cached: false })
    let session = await hostB.executeTool('getSession', {})
    let codes = (session.content as { openFindings: Array<{ code: string }> }).openFindings.map((f) => f.code)
    expect(codes).toContain('test-failed')

    // Repair and re-check: the finding auto-resolves.
    await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 2 // repaired')
    const repaired = await hostB.executeTool('runTests', {})
    expect(repaired.content).toMatchObject({ passed: true, cached: false })
    session = await hostB.executeTool('getSession', {})
    codes = (session.content as { openFindings: Array<{ code: string }> }).openFindings.map((f) => f.code)
    expect(codes).not.toContain('test-failed')
    await hostB.dispose()
  })

  it('generation steps replay deterministically from the recorded seed across a reset', async () => {
    const root = await makeRepo()
    const optionsA = {
      sessionsRoot: join(root, '.automata/sessions'), gameId: 'probe', projectDir: 'p',
      engineVersion: 'e', lock: false as const, seedSource: () => 777
    }
    const generator = async (rng: { nextInt(max: number): number }) => ({
      layout: [rng.nextInt(1000), rng.nextInt(1000), rng.nextInt(1000)]
    })

    const engineA = (await createSessionEngine(optionsA)).engine
    const recorded = await engineA.runSeededStep('generate:layout', { rooms: 3 }, generator)
    await engineA.dispose()

    // Reset: a fresh engine over the same session dir replays from the recorded seed.
    const engineB = (await createSessionEngine({ ...optionsA, seedSource: () => 999999 })).engine
    const replay = await engineB.replayStep(recorded.step.id, generator)
    expect(replay.ok).toBe(true)
    expect(replay.actual).toBe(recorded.step.resultHash)
    await engineB.dispose()
  })
})
```

- [ ] **Step 2: Run the acceptance test**

Run: `npx vitest run --project editor-mcp-server -t 'exit criterion'`
Expected: PASS with **no production-code changes**. If it fails, the defect is in an earlier task — fix it there (with a unit test in that task's suite), never by special-casing here.

- [ ] **Step 3: Commit**

```bash
git add tools/editor-mcp-server/tests/acceptance.test.ts
git commit -m "test: Phase 1 exit criterion — resets, cached resume, repair loop, seeded replay"
```

---

### Task 13: Docs, roadmap, and full verification gates

**Files:**
- Modify: `AGENTS.md` (document the single-mode MCP server and session home)
- Modify: `docs/ROADMAP.md` (flip Phase 1 task statuses; link spec + this plan)
- No new tests — this task is documentation plus running every gate.

- [ ] **Step 1: AGENTS.md**

Add under the Registry Convention section (after the existing MCP-related text):

```markdown
### MCP build sessions

The editor MCP server has one mode: `automata-editor-mcp --workspace <repoRoot>`.
Agents scaffold with `createGame`, open a game with `openProject`, author over
the project tools (edits write through to `games/<name>/public/project`), and
run server-executed checks (`runBuild`, `runTests`, `runBrowserEval`,
`evaluate`) that persist typed findings. Durable session state lives under
`.automata/sessions/<gameId>/` (gitignored): step ledger with artifact-hash
idempotency, findings, attempt budgets, and the resume position. Expensive
operations are hash-guarded — repeating one with unchanged inputs returns the
recorded result (`cached: true`) instead of re-running.
```

- [ ] **Step 2: ROADMAP.md**

In §3 Phase 1, mark each task line `Shipped` with the merge commit once merged, update the §2 numbering-key row for P5, and add the spec/plan links in the phase header, following the exact format Phase 0 uses. Promote Phase 2 to `Next`. Add the shipped entry at the top of §1 (newest first) once the branch merges — final wording depends on the merge commit hash.

- [ ] **Step 3: Run every gate**

```bash
npm run ci                 # lint + typecheck + all vitest projects
npm run coverage           # engine touched (math/random) — thresholds 90/90
npm run verify:new-game    # clean-clone: scaffold → install → ci → build → workspace MCP openProject → playwright
```

Expected: all green. `verify:new-game` is the proof that the mode consolidation didn't break the paved road — it now exercises `openProject` against a fresh clone.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/ROADMAP.md
git commit -m "docs: single-mode MCP + build sessions in AGENTS.md; roadmap Phase 1 statuses"
```

---

## Verification (whole plan)

The plan is done when, in order:

1. `npm run ci` is green (every project, lint, typecheck).
2. `npm run coverage` holds 90/90.
3. `npm run verify:new-game` passes on a clean clone (scaffold → workspace MCP `openProject` → browser smoke).
4. The Task 12 acceptance suite passes — the roadmap exit criterion, mechanically: reopen after a kill resumes with cached results and the authored content intact; findings appear on defects and auto-resolve on repair; seeded steps replay identically across resets.

Deviation from spec §9 noted for the record: the "restart scenario" lives in the Node-level acceptance suite (Task 12), not the Playwright e2e suite — restart semantics are entirely server-side (everything must round-trip through disk), so a browser adds nothing but flake. The browser e2e surface is exercised unchanged via `verify:new-game`.

Out of scope (deliberately, per spec §1): `GameSpec`, real capability packs, content/asset generation, automated repair jobs, any arbitrary-command execution tool.
