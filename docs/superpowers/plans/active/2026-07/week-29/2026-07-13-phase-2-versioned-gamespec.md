# Phase 2 — Versioned `GameSpec` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A prompt compiles into a valid, bounded, reviewable `GameSpec` plus a design checkpoint — the `GameSpec` schemas in `@automata/contracts`, a deterministic engine in new `@automata/game-spec`, and four MCP tools + a `build-game-spec` prompt in the workspace server.

**Architecture:** The MCP-calling agent authors the spec draft; the server deterministically validates, bounds, versions, and persists it as hash-guarded seeded steps on the P5 session ledger. Spec file lives at `games/<id>/gamespec.json`; the design-checkpoint decision lives in the durable session. Dependency direction: `editor-mcp-server → {build-session, game-spec} → contracts`.

**Tech Stack:** TypeScript, zod v4, vitest, MCP SDK (existing patterns only).

**Spec:** `docs/superpowers/specs/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec-design.md`

**Overall progress:** 100% (Tasks 1-12 complete; CI and coverage verified)

> **Completion update (2026-07-13):** All twelve tasks are complete. Final
> verification: `npm run ci`, full Vitest (231 files / 1057 tests), and
> `npm run coverage` completed successfully.

## Global Constraints

- Schemas are zod v4 `z.strictObject`; `.min()/.max()` only (no `.gt/.lt/.positive/.negative`); unknown keys rejected.
- `games/*`, `tools/*`, and editor code must not import `zod` directly (lint enforces). `packages/contracts` and `packages/game-spec` may (contracts already does).
- TDD: failing test first, then minimal implementation. Coverage thresholds are 90% lines/branches.
- Run `npm run ci` before claiming done; commit at every documented checkpoint.
- **Determinism amendment (binding):** `GameSpec` carries **no wall-clock timestamps** — provenance is `{ prompt, translations, history: [{version, reason}] }`. Time lives in the session ledger (`completedAt`) and git. This is what makes `spec:compile` cacheable and replayable; Task 1 amends the spec doc to match.
- Step kinds introduced: `spec:compile` (seeded), `spec:brief` (seeded), `checkpoint:design` (journal). Finding source introduced: `spec`.

---

## Milestone A — contracts (schema sub-cycle)

### Task 1: `GameSpec` schemas + envelope in `@automata/contracts`

**Files:**
- Create: `packages/contracts/src/gameSpec.ts`
- Create: `packages/contracts/src/gameSpecFixtures.ts` (shared minimal-draft fixture — used by contracts, game-spec, and editor-mcp-server tests; exporting it from `src` avoids fragile cross-package test-file imports)
- Modify: `packages/contracts/src/index.ts` (add `export * from './gameSpec'` and `export * from './gameSpecFixtures'`)
- Modify: `packages/contracts/src/session.ts:9` (add `'spec'` to `findingSourceSchema`)
- Modify: `docs/superpowers/specs/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec-design.md` (provenance: drop timestamps, note ledger owns time)
- Test: `packages/contracts/tests/gameSpec.test.ts`

**Interfaces:**
- Produces: `gameSpecSchema`, `gameSpecDraftSchema` (spec minus `specVersion`/`provenance`), types `GameSpec`, `GameSpecDraft`, `SpecTranslation`; `capabilityIdSchema`, `CapabilityId`, `CapabilityRule`, `DEFAULT_CAPABILITY_COMPATIBILITY`; `specTranslationSchema`; `minimalGameSpecDraft(gameId?: string): Record<string, unknown>` (valid draft fixture, default gameId `'probe'`). Finding source `'spec'` valid in `findingSchema`.

- [x] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/gameSpec.test.ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAPABILITY_COMPATIBILITY, capabilityIdSchema, findingSourceSchema,
  gameSpecDraftSchema, gameSpecSchema, minimalGameSpecDraft
} from '../src'

const minimalDraft = minimalGameSpecDraft
```

The fixture itself (implemented in Step 3):

```ts
// packages/contracts/src/gameSpecFixtures.ts
/** Minimal valid GameSpec draft for tests across packages; mutate copies to probe bounds. */
export function minimalGameSpecDraft(gameId = 'probe'): Record<string, unknown> {
  return {
    identity: {
      id: gameId, title: 'Probe', logline: 'A tiny hub adventure.',
      themes: ['exploration'], contentRating: 'everyone'
    },
    direction: {
      visualStyle: 'stylized low-poly', audioStyle: 'ambient synth',
      dialogueTone: 'warm', camera: 'third-person-follow'
    },
    budgets: {
      targetMinutes: 60, districtCount: 1, interiorCount: 2, characterCount: 4,
      mainQuestCount: 2, sideQuestCount: 1, enemyTypeCount: 0, assetBudget: 10,
      buildTimeMinutes: 60
    },
    capabilities: [{ id: 'interaction-inventory', config: {}, requirements: [] }],
    world: {
      locations: [
        { id: 'hub', name: 'Hub', kind: 'district', description: 'The district.' },
        { id: 'shop', name: 'Shop', kind: 'interior', description: 'A shop.' }
      ]
    },
    cast: [{ id: 'player', name: 'Player', role: 'player', description: 'You.' }],
    story: {
      premise: 'Find the beacon.',
      beats: [
        { id: 'b1', kind: 'beginning', summary: 'Arrive.' },
        { id: 'b2', kind: 'ending', summary: 'Light the beacon.' }
      ]
    },
    progression: { milestones: [{ id: 'm1', summary: 'Reach the shop.' }] },
    assets: [{ id: 'beacon-model', kind: 'model', description: 'The beacon.' }],
    acceptance: [{
      id: 'a1', description: 'Player can reach the ending beat.',
      kind: 'structural', target: 'story.beats:ending-reachable'
    }]
  }
}
```

Back in `packages/contracts/tests/gameSpec.test.ts`, the suite:

```ts
describe('gameSpec schemas', () => {
  it('accepts a minimal valid draft and full spec', () => {
    expect(gameSpecDraftSchema.safeParse(minimalDraft()).success).toBe(true)
    const full = {
      specVersion: 1,
      provenance: {
        prompt: 'make a tiny hub game', translations: [],
        history: [{ version: 1, reason: 'initial compile' }]
      },
      ...minimalDraft()
    }
    expect(gameSpecSchema.safeParse(full).success).toBe(true)
  })

  it('rejects unknown keys and out-of-envelope budgets', () => {
    expect(gameSpecDraftSchema.safeParse({ ...minimalDraft(), extra: 1 }).success).toBe(false)
    const over = minimalDraft()
    ;(over.budgets as Record<string, unknown>).targetMinutes = 300
    expect(gameSpecDraftSchema.safeParse(over).success).toBe(false)
    const twoDistricts = minimalDraft()
    ;(twoDistricts.budgets as Record<string, unknown>).districtCount = 2
    expect(gameSpecDraftSchema.safeParse(twoDistricts).success).toBe(false)
  })

  it('bounds capability ids to the seven planned packs', () => {
    expect(capabilityIdSchema.options).toHaveLength(7)
    expect(capabilityIdSchema.safeParse('save-load').success).toBe(true)
    expect(capabilityIdSchema.safeParse('multiplayer').success).toBe(false)
    for (const rule of Object.values(DEFAULT_CAPABILITY_COMPATIBILITY)) {
      for (const req of rule.requires) expect(capabilityIdSchema.safeParse(req).success).toBe(true)
    }
  })

  it('admits the spec finding source', () => {
    expect(findingSourceSchema.safeParse('spec').success).toBe(true)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/contracts/tests/gameSpec.test.ts`
Expected: FAIL — `gameSpecSchema` etc. not exported from `../src`.

- [x] **Step 3: Write the implementation**

```ts
// packages/contracts/src/gameSpec.ts
import { z } from 'zod'
import { gameSlugSchema } from './workspaceTools'

/**
 * Phase 2 contract: the versioned GameSpec — the machine-readable creative and
 * production contract compiled from a prompt and frozen at Design approval.
 * Every envelope limit is a zod bound: validation IS envelope enforcement.
 * No wall-clock timestamps live here; time belongs to the session ledger.
 */

export const capabilityIdSchema = z.enum([
  'interaction-inventory', 'dialogue-quests', 'schedules-relationships',
  'combat-ai', 'economy-progression', 'hub-navigation-vehicle', 'save-load'
])
export type CapabilityId = z.infer<typeof capabilityIdSchema>

export interface CapabilityRule {
  requires: CapabilityId[]
  incompatibleWith: CapabilityId[]
}

/** Phase-2 placeholder table; Phase 4 packs take ownership of their real declarations. */
export const DEFAULT_CAPABILITY_COMPATIBILITY: Record<CapabilityId, CapabilityRule> = {
  'interaction-inventory': { requires: [], incompatibleWith: [] },
  'dialogue-quests': { requires: ['interaction-inventory'], incompatibleWith: [] },
  'schedules-relationships': { requires: ['dialogue-quests'], incompatibleWith: [] },
  'combat-ai': { requires: [], incompatibleWith: [] },
  'economy-progression': { requires: ['interaction-inventory'], incompatibleWith: [] },
  'hub-navigation-vehicle': { requires: [], incompatibleWith: [] },
  'save-load': { requires: [], incompatibleWith: [] }
}

export const specTranslationSchema = z.strictObject({
  requested: z.string().min(1).max(400),
  translatedTo: z.string().min(1).max(400),
  reason: z.string().min(1).max(400)
})
export type SpecTranslation = z.infer<typeof specTranslationSchema>

const specProvenanceSchema = z.strictObject({
  prompt: z.string().min(1).max(4000),
  translations: z.array(specTranslationSchema).max(20),
  history: z.array(z.strictObject({
    version: z.number().int().positive(),
    reason: z.string().min(1).max(400)
  })).min(1).max(50)
})

const specIdentitySchema = z.strictObject({
  id: gameSlugSchema,
  title: z.string().min(1).max(80),
  logline: z.string().min(1).max(240),
  themes: z.array(z.string().min(1).max(60)).min(1).max(8),
  contentRating: z.enum(['everyone', 'teen', 'mature'])
})

const specDirectionSchema = z.strictObject({
  visualStyle: z.string().min(1).max(240),
  audioStyle: z.string().min(1).max(240),
  dialogueTone: z.string().min(1).max(240),
  camera: z.enum(['third-person-follow', 'fixed', 'top-down'])
})

const specBudgetsSchema = z.strictObject({
  targetMinutes: z.number().int().min(30).max(120),
  districtCount: z.literal(1),
  interiorCount: z.number().int().min(0).max(8),
  characterCount: z.number().int().min(1).max(12),
  mainQuestCount: z.number().int().min(1).max(8),
  sideQuestCount: z.number().int().min(0).max(10),
  enemyTypeCount: z.number().int().min(0).max(6),
  assetBudget: z.number().int().min(1).max(80),
  buildTimeMinutes: z.number().int().min(5).max(240)
})

const capabilitySelectionSchema = z.strictObject({
  id: capabilityIdSchema,
  /** Empty until Phase 4 packs own their config schemas. */
  config: z.strictObject({}),
  requirements: z.array(z.string().min(1).max(240)).max(10)
})

const specLocationSchema = z.strictObject({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  kind: z.enum(['district', 'interior']),
  description: z.string().min(1).max(400)
})

const specCharacterSchema = z.strictObject({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  role: z.enum(['player', 'ally', 'vendor', 'quest-giver', 'antagonist', 'ambient']),
  description: z.string().min(1).max(400)
})

const specStoryBeatSchema = z.strictObject({
  id: z.string().min(1).max(40),
  kind: z.enum(['beginning', 'middle', 'ending']),
  summary: z.string().min(1).max(400)
})

export const acceptanceCriterionSchema = z.strictObject({
  id: z.string().min(1).max(60),
  description: z.string().min(1).max(400),
  kind: z.enum(['structural', 'simulation', 'browser', 'manual']),
  target: z.string().min(1).max(240)
})
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>

export const assetRequirementSchema = z.strictObject({
  id: z.string().min(1).max(60),
  kind: z.enum(['model', 'texture', 'audio', 'music', 'ui']),
  description: z.string().min(1).max(400)
})

export const gameSpecSchema = z.strictObject({
  specVersion: z.number().int().positive(),
  provenance: specProvenanceSchema,
  identity: specIdentitySchema,
  direction: specDirectionSchema,
  budgets: specBudgetsSchema,
  capabilities: z.array(capabilitySelectionSchema).min(1).max(7),
  world: z.strictObject({ locations: z.array(specLocationSchema).min(1).max(9) }),
  cast: z.array(specCharacterSchema).min(1).max(12),
  story: z.strictObject({
    premise: z.string().min(1).max(600),
    beats: z.array(specStoryBeatSchema).min(2).max(20)
  }),
  progression: z.strictObject({
    milestones: z.array(z.strictObject({
      id: z.string().min(1).max(40),
      summary: z.string().min(1).max(240)
    })).min(1).max(12)
  }),
  assets: z.array(assetRequirementSchema).max(80),
  acceptance: z.array(acceptanceCriterionSchema).min(1).max(30)
})
export type GameSpec = z.infer<typeof gameSpecSchema>

export const gameSpecDraftSchema = gameSpecSchema.omit({ specVersion: true, provenance: true })
export type GameSpecDraft = z.infer<typeof gameSpecDraftSchema>
```

In `packages/contracts/src/session.ts` change line 9 to:

```ts
export const findingSourceSchema = z.enum(['build', 'test', 'browser', 'eval', 'validate', 'session', 'spec'])
```

Create `packages/contracts/src/gameSpecFixtures.ts` with the `minimalGameSpecDraft` function shown in Step 1. In `packages/contracts/src/index.ts` add:

```ts
export * from './gameSpec'
export * from './gameSpecFixtures'
```

In the spec doc's §4 `provenance` bullet, replace "created/updated timestamps, and the embedded version history (`{version, reason, date}[]`)" with "and the embedded version history (`{version, reason}[]`). No wall-clock timestamps live in the spec — time belongs to the session ledger and git; this keeps `spec:compile` cacheable and replayable." Remove `date` from §5's version-history mention if present.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/contracts` — Expected: PASS (all contracts tests, including existing ones).

- [x] **Step 5: Commit**

```bash
git add packages/contracts docs/superpowers/specs/active/2026-07/week-29/2026-07-13-phase-2-versioned-gamespec-design.md
git commit -m "feat(contracts): GameSpec schemas with envelope bounds; spec finding source"
```

### Task 2: Spec tool contracts + unified arg parsing

**Files:**
- Create: `packages/contracts/src/specTools.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from './specTools'`)
- Modify: `packages/contracts/src/sessionTools.ts:63-70` (`parseUnifiedToolArgs` handles spec tools)
- Test: `packages/contracts/tests/specTools.test.ts`

**Interfaces:**
- Consumes: `gameSpecDraftSchema`, `specTranslationSchema` (Task 1); `gameSlugSchema`, `ToolDef`.
- Produces: `SpecToolName`, `specToolArgSchemas`, `specToolDefs(): ToolDef[]`, `parseSpecToolArgs(name, args)`. `parseUnifiedToolArgs` accepts the four tool names.

- [x] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/specTools.test.ts
import { describe, expect, it } from 'vitest'
import { parseSpecToolArgs, parseUnifiedToolArgs, specToolDefs } from '../src'

describe('spec tool contracts', () => {
  it('serves four tool defs; compileGameSpec carries the draft JSON schema', () => {
    const defs = specToolDefs()
    expect(defs.map((def) => def.name)).toEqual([
      'compileGameSpec', 'getGameSpec', 'renderDesignBrief', 'recordDesignDecision'
    ])
    const compile = defs.find((def) => def.name === 'compileGameSpec')!
    expect(compile.description).toContain('"identity"')
    expect(compile.description).toContain('"budgets"')
  })

  it('parses and defaults compileGameSpec args', () => {
    const parsed = parseSpecToolArgs('compileGameSpec', {
      gameId: 'probe', draft: { any: 'shape' }, prompt: 'make a game'
    }) as { translations: unknown[] }
    expect(parsed.translations).toEqual([])
    expect(() => parseSpecToolArgs('compileGameSpec', { gameId: 'probe' })).toThrow()
    expect(() => parseSpecToolArgs('recordDesignDecision', {
      gameId: 'probe', decision: 'maybe', reason: 'because'
    })).toThrow()
  })

  it('routes spec tools through the unified parser', () => {
    expect(parseUnifiedToolArgs('getGameSpec', { gameId: 'probe' })).toEqual({ gameId: 'probe' })
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/contracts/tests/specTools.test.ts`
Expected: FAIL — `specToolDefs` not exported.

- [x] **Step 3: Write the implementation**

```ts
// packages/contracts/src/specTools.ts
import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'
import { gameSpecDraftSchema, specTranslationSchema } from './gameSpec'

/** GameSpec tool contracts: compile/read the spec, render the design brief, record the checkpoint. */

export type SpecToolName = 'compileGameSpec' | 'getGameSpec' | 'renderDesignBrief' | 'recordDesignDecision'

export const specToolArgSchemas = {
  compileGameSpec: z.object({
    gameId: gameSlugSchema,
    draft: z.record(z.string(), z.unknown()),
    prompt: z.string().min(1).max(4000),
    translations: z.array(specTranslationSchema).max(20).default([]),
    changeReason: z.string().min(1).max(400).optional()
  }),
  getGameSpec: z.object({ gameId: gameSlugSchema }),
  renderDesignBrief: z.object({ gameId: gameSlugSchema }),
  recordDesignDecision: z.object({
    gameId: gameSlugSchema,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().min(1).max(400)
  })
} as const satisfies Record<SpecToolName, z.ZodType>

const SPEC_TOOL_DESCRIPTIONS: Record<SpecToolName, string> = {
  compileGameSpec:
    'Validate an agent-authored GameSpec draft against the supported envelope, then version and persist ' +
    'it to games/<gameId>/gamespec.json as a hash-guarded seeded step. Failures return typed findings and ' +
    'write nothing. Recompiling an approved spec requires changeReason and bumps specVersion, re-opening ' +
    'the design checkpoint. Draft JSON schema: ' + JSON.stringify(z.toJSONSchema(gameSpecDraftSchema)),
  getGameSpec: 'Read a game\'s current GameSpec, its specVersion, and the design-checkpoint status.',
  renderDesignBrief:
    'Render the current GameSpec into a human-readable markdown design brief (persisted as a session ' +
    'artifact). Required before recordDesignDecision so the decision always covers the reviewed spec.',
  recordDesignDecision:
    'Record the human design-checkpoint decision (approve/reject + reason) in the durable session ledger. ' +
    'Approve freezes the current specVersion; it fails if the spec changed since its brief was rendered.'
}

const SPEC_TOOL_NAMES = Object.keys(specToolArgSchemas) as SpecToolName[]

export function specToolDefs(): ToolDef[] {
  return SPEC_TOOL_NAMES.map((name) => ({
    name,
    description: SPEC_TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(specToolArgSchemas[name])
  }))
}

export function parseSpecToolArgs(name: string, args: unknown): unknown {
  const schema: z.ZodType | undefined = (specToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown spec tool "${name}"`)
  return schema.parse(args)
}
```

In `packages/contracts/src/sessionTools.ts`, import and route (top of file add `import { parseSpecToolArgs, specToolArgSchemas } from './specTools'`; inside `parseUnifiedToolArgs`, after the session-tools line):

```ts
  if (name in specToolArgSchemas) return parseSpecToolArgs(name, args)
```

Add `export * from './specTools'` to `packages/contracts/src/index.ts`.

- [x] **Step 4: Run tests, verify pass**

Run: `npx vitest run packages/contracts` — Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): GameSpec MCP tool defs and unified arg parsing"
```

### Task 3: `build-game-spec` workspace prompt

**Files:**
- Modify: `packages/contracts/src/prompts.ts`
- Test: `packages/contracts/tests/prompts.test.ts` (extend)

**Interfaces:**
- Produces: `workspacePromptDefs()` lists `build-game-spec`; `getWorkspacePrompt('build-game-spec', { description, name? })` returns the workflow text.

- [x] **Step 1: Write the failing test** — append to `packages/contracts/tests/prompts.test.ts`:

```ts
describe('build-game-spec prompt', () => {
  it('is listed and renders the spec workflow', () => {
    expect(workspacePromptDefs().map((def) => def.name)).toContain('build-game-spec')
    const result = getWorkspacePrompt('build-game-spec', { description: 'a night-market trading game', name: 'night-market' })
    const text = result.messages[0]!.content.text
    for (const expected of ['compileGameSpec', 'renderDesignBrief', 'recordDesignDecision', 'translations', 'night-market']) {
      expect(text).toContain(expected)
    }
    expect(() => getWorkspacePrompt('build-game-spec', {})).toThrow()
  })
})
```

(Import `getWorkspacePrompt`, `workspacePromptDefs` if the existing file doesn't already.)

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/contracts/tests/prompts.test.ts` — Expected: FAIL — prompt not listed.

- [x] **Step 3: Implement** — in `packages/contracts/src/prompts.ts` add:

```ts
const buildGameSpecArgsSchema = z.object({
  description: z.string().min(1),
  name: gameSlugSchema.optional()
})

const BUILD_GAME_SPEC: PromptDef = {
  name: 'build-game-spec',
  description:
    'Compile a plain-language game description into a versioned GameSpec and drive the design checkpoint: scaffold, draft, compile, brief, human decision.',
  arguments: [
    { name: 'description', description: 'What the game should be, in plain language.', required: true },
    { name: 'name', description: 'Optional lowercase-slug package name for the new game.', required: false }
  ]
}

function buildGameSpecText(description: string, slug?: string): string {
  const name = slug ?? '<name>'
  return `Compile the following game description into a versioned GameSpec in this AutomataEngine workspace, then drive it to the design checkpoint. You are the intent compiler's brain; the server is its bound.

Game description:
${description}

Workflow:
1. ${slug ? `Call the createGame tool with name "${slug}".` : 'Pick a lowercase-slug name that fits the description and call the createGame tool with it.'}
2. Draft a GameSpec for "${name}" following the draft JSON schema embedded in the compileGameSpec tool description. Stay inside the supported envelope (one compact district, bounded counts). Where the description asks for something unsupported, translate it to the nearest supported design and record it in translations ({requested, translatedTo, reason}) — never silently approximate. Preserve the user's fantasy, tone, and differentiators. Set identity.id to "${name}".
3. Call compileGameSpec with the draft, the original description as prompt, and your translations. If it returns findings, repair the draft and recompile — findings carry JSON paths.
4. Call renderDesignBrief and present the brief to the human verbatim for the design checkpoint.
5. After the human answers, call recordDesignDecision with approve or reject and their reason. Approval freezes this specVersion; any later change needs changeReason and re-approval.

Do not generate game code, content, or assets from the spec — that is later phases' work.`
}
```

Extend `workspacePromptDefs` to return `[BUILD_GAME, BUILD_GAME_SPEC]`, and extend `getWorkspacePrompt`:

```ts
export function getWorkspacePrompt(name: string, args: unknown): PromptResult {
  if (name === BUILD_GAME.name) {
    const { description, name: slug } = buildGameArgsSchema.parse(args ?? {})
    return { description: BUILD_GAME.description, messages: [{ role: 'user', content: { type: 'text', text: buildGameText(description, slug) } }] }
  }
  if (name === BUILD_GAME_SPEC.name) {
    const { description, name: slug } = buildGameSpecArgsSchema.parse(args ?? {})
    return { description: BUILD_GAME_SPEC.description, messages: [{ role: 'user', content: { type: 'text', text: buildGameSpecText(description, slug) } }] }
  }
  throw new Error(`Unknown prompt "${name}"`)
}
```

- [x] **Step 4: Run tests** — `npx vitest run packages/contracts` — Expected: PASS.
- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): build-game-spec workspace prompt"
```

---

## Milestone B — `@automata/game-spec` (intent-compiler + evaluator sub-cycles, deterministic half)

### Task 4: Scaffold `packages/game-spec` + `validateGameSpec`

**Files:**
- Create: `packages/game-spec/package.json`, `packages/game-spec/tsconfig.json`, `packages/game-spec/vitest.config.ts`
- Create: `packages/game-spec/src/index.ts`, `packages/game-spec/src/validate.ts`
- Test: `packages/game-spec/tests/validate.test.ts`

**Interfaces:**
- Consumes: `gameSpecDraftSchema`, `DEFAULT_CAPABILITY_COMPATIBILITY`, `CapabilityId`, `CapabilityRule`, `GameSpecDraft` (Task 1).
- Produces: `interface SpecIssue { severity: 'error' | 'warning'; code: string; message: string; path: string }`; `validateGameSpec(draft: unknown, options: { gameId: string; compatibility?: Record<CapabilityId, CapabilityRule> }): { ok: true; draft: GameSpecDraft; issues: SpecIssue[] } | { ok: false; issues: SpecIssue[] }`.

- [x] **Step 1: Create the package skeleton**

```jsonc
// packages/game-spec/package.json
{
  "name": "@automata/game-spec",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "@automata/contracts": "*" }
}
```

```jsonc
// packages/game-spec/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests", "vitest.config.ts"]
}
```

```ts
// packages/game-spec/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'game-spec', environment: 'node', include: ['tests/**/*.test.ts'] }
})
```

```ts
// packages/game-spec/src/index.ts
export * from './validate'
```

Run: `npm install` (links the new workspace package).

- [x] **Step 2: Write the failing test**

```ts
// packages/game-spec/tests/validate.test.ts
import { describe, expect, it } from 'vitest'
import { minimalGameSpecDraft as minimalDraft } from '@automata/contracts'
import { validateGameSpec } from '../src'

function draft(mutate: (d: ReturnType<typeof minimalDraft>) => void = () => {}) {
  const value = minimalDraft()
  mutate(value)
  return value
}
const codes = (result: { issues: Array<{ code: string }> }) => result.issues.map((issue) => issue.code)

describe('validateGameSpec', () => {
  it('passes a valid draft', () => {
    const result = validateGameSpec(draft(), { gameId: 'probe' })
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('maps schema violations to spec-schema issues with paths', () => {
    const result = validateGameSpec(draft((d) => { (d.budgets as Record<string, unknown>).targetMinutes = 999 }), { gameId: 'probe' })
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatchObject({ code: 'spec-schema', path: expect.stringContaining('budgets.targetMinutes') })
  })

  it('flags identity/gameId mismatch', () => {
    expect(codes(validateGameSpec(draft(), { gameId: 'other' }))).toContain('spec-id-mismatch')
  })

  it('cross-checks budgets against world, cast, and assets', () => {
    const overCast = draft((d) => { (d.budgets as Record<string, unknown>).characterCount = 1; (d.cast as unknown[]).push({ id: 'npc', name: 'NPC', role: 'ambient', description: 'Extra.' }, { id: 'npc2', name: 'NPC2', role: 'ambient', description: 'Extra.' }) })
    expect(codes(validateGameSpec(overCast, { gameId: 'probe' }))).toContain('spec-budget-cast')
    const overInteriors = draft((d) => { (d.budgets as Record<string, unknown>).interiorCount = 0 })
    expect(codes(validateGameSpec(overInteriors, { gameId: 'probe' }))).toContain('spec-budget-interiors')
    const noDistrict = draft((d) => { (d.world as { locations: Array<{ kind: string }> }).locations[0]!.kind = 'interior' })
    expect(codes(validateGameSpec(noDistrict, { gameId: 'probe' }))).toContain('spec-budget-districts')
    const overAssets = draft((d) => { (d.budgets as Record<string, unknown>).assetBudget = 1; (d.assets as unknown[]).push({ id: 'x2', kind: 'ui', description: 'Extra.' }, { id: 'x3', kind: 'ui', description: 'Extra.' }) })
    expect(codes(validateGameSpec(overAssets, { gameId: 'probe' }))).toContain('spec-budget-assets')
  })

  it('requires a beginning and an ending beat and unique ids', () => {
    const noEnding = draft((d) => { (d.story as { beats: Array<{ kind: string }> }).beats[1]!.kind = 'middle' })
    expect(codes(validateGameSpec(noEnding, { gameId: 'probe' }))).toContain('spec-story-arc')
    const dupIds = draft((d) => { (d.cast as Array<{ id: string }>).push({ ...(d.cast as Array<{ id: string; name: string }>)[0]! }) })
    expect(codes(validateGameSpec(dupIds, { gameId: 'probe' }))).toContain('spec-duplicate-id')
  })

  it('enforces capability requires and incompatibilities', () => {
    const missingReq = draft((d) => { d.capabilities = [{ id: 'economy-progression', config: {}, requirements: [] }] })
    expect(codes(validateGameSpec(missingReq, { gameId: 'probe' }))).toContain('spec-capability-requires')
    const conflict = draft((d) => {
      d.capabilities = [
        { id: 'combat-ai', config: {}, requirements: [] },
        { id: 'save-load', config: {}, requirements: [] }
      ]
    })
    const result = validateGameSpec(conflict, {
      gameId: 'probe',
      compatibility: {
        'interaction-inventory': { requires: [], incompatibleWith: [] },
        'dialogue-quests': { requires: [], incompatibleWith: [] },
        'schedules-relationships': { requires: [], incompatibleWith: [] },
        'combat-ai': { requires: [], incompatibleWith: ['save-load'] },
        'economy-progression': { requires: [], incompatibleWith: [] },
        'hub-navigation-vehicle': { requires: [], incompatibleWith: [] },
        'save-load': { requires: [], incompatibleWith: [] }
      }
    })
    expect(codes(result)).toContain('spec-capability-conflict')
  })
})
```

Note for the implementer: `minimalGameSpecDraft` is a real export of `@automata/contracts` (Task 1's `gameSpecFixtures.ts`) — never import another package's test files. The conflict case injects a custom compatibility table because the default table has no incompatible pairs yet; the injected-table path is the contract Phase 4 will use.

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/game-spec` — Expected: FAIL — `validateGameSpec` not defined.

- [x] **Step 4: Write the implementation**

```ts
// packages/game-spec/src/validate.ts
import {
  DEFAULT_CAPABILITY_COMPATIBILITY, gameSpecDraftSchema,
  type CapabilityId, type CapabilityRule, type GameSpecDraft
} from '@automata/contracts'

export interface SpecIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path: string
}

export interface ValidateOptions {
  gameId: string
  compatibility?: Record<CapabilityId, CapabilityRule>
}

export type ValidateResult =
  | { ok: true; draft: GameSpecDraft; issues: SpecIssue[] }
  | { ok: false; issues: SpecIssue[] }

const error = (code: string, message: string, path: string): SpecIssue => ({ severity: 'error', code, message, path })

function duplicateIds(items: ReadonlyArray<{ id: string }>, path: string): SpecIssue[] {
  const seen = new Set<string>()
  const issues: SpecIssue[] = []
  items.forEach((item, index) => {
    if (seen.has(item.id)) issues.push(error('spec-duplicate-id', `Duplicate id "${item.id}"`, `${path}[${index}].id`))
    seen.add(item.id)
  })
  return issues
}

/** Layer 1: schema/envelope. Layer 2: cross-field budgets + story arc + id uniqueness. Layer 3: capability compatibility. */
export function validateGameSpec(draft: unknown, options: ValidateOptions): ValidateResult {
  const parsed = gameSpecDraftSchema.safeParse(draft)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) =>
        error('spec-schema', issue.message, issue.path.map(String).join('.') || '(root)'))
    }
  }
  const spec = parsed.data
  const issues: SpecIssue[] = []

  if (spec.identity.id !== options.gameId) {
    issues.push(error('spec-id-mismatch', `identity.id "${spec.identity.id}" must equal gameId "${options.gameId}"`, 'identity.id'))
  }
  if (spec.cast.length > spec.budgets.characterCount) {
    issues.push(error('spec-budget-cast', `${spec.cast.length} characters exceed characterCount ${spec.budgets.characterCount}`, 'cast'))
  }
  const interiors = spec.world.locations.filter((location) => location.kind === 'interior').length
  const districts = spec.world.locations.filter((location) => location.kind === 'district').length
  if (interiors > spec.budgets.interiorCount) {
    issues.push(error('spec-budget-interiors', `${interiors} interiors exceed interiorCount ${spec.budgets.interiorCount}`, 'world.locations'))
  }
  if (districts !== spec.budgets.districtCount) {
    issues.push(error('spec-budget-districts', `world has ${districts} districts; budget requires exactly ${spec.budgets.districtCount}`, 'world.locations'))
  }
  if (spec.assets.length > spec.budgets.assetBudget) {
    issues.push(error('spec-budget-assets', `${spec.assets.length} asset requirements exceed assetBudget ${spec.budgets.assetBudget}`, 'assets'))
  }
  const beatKinds = new Set(spec.story.beats.map((beat) => beat.kind))
  if (!beatKinds.has('beginning') || !beatKinds.has('ending')) {
    issues.push(error('spec-story-arc', 'story.beats must include at least one beginning and one ending beat', 'story.beats'))
  }
  issues.push(
    ...duplicateIds(spec.world.locations, 'world.locations'),
    ...duplicateIds(spec.cast, 'cast'),
    ...duplicateIds(spec.story.beats, 'story.beats'),
    ...duplicateIds(spec.progression.milestones, 'progression.milestones'),
    ...duplicateIds(spec.assets, 'assets'),
    ...duplicateIds(spec.acceptance, 'acceptance'),
    ...duplicateIds(spec.capabilities, 'capabilities')
  )

  const table = options.compatibility ?? DEFAULT_CAPABILITY_COMPATIBILITY
  const selected = new Set(spec.capabilities.map((capability) => capability.id))
  spec.capabilities.forEach((capability, index) => {
    const rule = table[capability.id]
    for (const required of rule.requires) {
      if (!selected.has(required)) {
        issues.push(error('spec-capability-requires', `"${capability.id}" requires "${required}"`, `capabilities[${index}]`))
      }
    }
    for (const incompatible of rule.incompatibleWith) {
      if (selected.has(incompatible)) {
        issues.push(error('spec-capability-conflict', `"${capability.id}" is incompatible with "${incompatible}"`, `capabilities[${index}]`))
      }
    }
  })

  return issues.some((issue) => issue.severity === 'error')
    ? { ok: false, issues }
    : { ok: true, draft: spec, issues }
}
```

- [x] **Step 5: Run tests** — `npx vitest run packages/game-spec` — Expected: PASS.
- [x] **Step 6: Commit**

```bash
git add packages/game-spec package-lock.json
git commit -m "feat(game-spec): package scaffold and structural spec validation evaluator"
```

### Task 5: `normalizeGameSpec`

**Files:**
- Create: `packages/game-spec/src/normalize.ts`
- Modify: `packages/game-spec/src/index.ts` (add `export * from './normalize'`)
- Test: `packages/game-spec/tests/normalize.test.ts`

**Interfaces:**
- Produces: `normalizeGameSpec<T>(value: T): T` — deep-sorts object keys (arrays keep order: beats/milestones are ordered content). Idempotent; makes `hashJson` stable regardless of agent key order.

- [x] **Step 1: Write the failing test**

```ts
// packages/game-spec/tests/normalize.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeGameSpec } from '../src'

describe('normalizeGameSpec', () => {
  it('canonicalizes key order deeply and preserves array order', () => {
    const messy = { b: 1, a: { z: [ { y: 2, x: 1 } ], w: 3 } }
    const normalized = normalizeGameSpec(messy)
    expect(JSON.stringify(normalized)).toBe('{"a":{"w":3,"z":[{"x":1,"y":2}]},"b":1}')
    expect(normalizeGameSpec([3, 1, 2])).toEqual([3, 1, 2])
  })

  it('is idempotent', () => {
    const value = { b: [1, { d: 4, c: 3 }], a: 2 }
    const once = normalizeGameSpec(value)
    expect(normalizeGameSpec(once)).toEqual(once)
    expect(JSON.stringify(normalizeGameSpec(once))).toBe(JSON.stringify(once))
  })
})
```

- [x] **Step 2: Run to verify FAIL** — `npx vitest run packages/game-spec/tests/normalize.test.ts` — `normalizeGameSpec` not exported.

- [x] **Step 3: Implement**

```ts
// packages/game-spec/src/normalize.ts
/**
 * Canonical JSON shape for stable hashing: object keys sorted deeply, array
 * order preserved (beats, milestones, and locations are ordered content).
 * Idempotent — normalize(normalize(x)) === normalize(x).
 */
export function normalizeGameSpec<T>(value: T): T {
  return sortKeysDeep(value) as T
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortKeysDeep(record[key])]))
  }
  return value
}
```

- [x] **Step 4: Run tests** — `npx vitest run packages/game-spec` — Expected: PASS.
- [x] **Step 5: Commit** — `git add packages/game-spec && git commit -m "feat(game-spec): canonical spec normalization for stable hashing"`

### Task 6: `nextSpecVersion` — immutability + versioning

**Files:**
- Create: `packages/game-spec/src/version.ts`
- Modify: `packages/game-spec/src/index.ts` (add `export * from './version'`)
- Test: `packages/game-spec/tests/version.test.ts`

**Interfaces:**
- Consumes: `GameSpec`, `GameSpecDraft`, `SpecTranslation` (contracts); `SpecIssue` (Task 4).
- Produces: `nextSpecVersion(args: { current: GameSpec | null; currentApproved: boolean; draft: GameSpecDraft; prompt: string; translations: SpecTranslation[]; changeReason?: string }): { ok: true; spec: GameSpec } | { ok: false; issue: SpecIssue }`.

- [x] **Step 1: Write the failing test**

```ts
// packages/game-spec/tests/version.test.ts
import { describe, expect, it } from 'vitest'
import { minimalGameSpecDraft as minimalDraft, type GameSpec, type GameSpecDraft } from '@automata/contracts'
import { nextSpecVersion, validateGameSpec } from '../src'

function validDraft(): GameSpecDraft {
  const result = validateGameSpec(minimalDraft(), { gameId: 'probe' })
  if (!result.ok) throw new Error('fixture must be valid')
  return result.draft
}
const base = { prompt: 'make a tiny hub game', translations: [] }

describe('nextSpecVersion', () => {
  it('stamps version 1 with initial history when no spec exists', () => {
    const result = nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base })
    expect(result).toMatchObject({ ok: true, spec: { specVersion: 1 } })
    expect((result as { spec: GameSpec }).spec.provenance.history).toEqual([{ version: 1, reason: 'initial compile' }])
  })

  it('replaces in place while unapproved', () => {
    const v1 = (nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base }) as { spec: GameSpec }).spec
    const result = nextSpecVersion({ current: v1, currentApproved: false, draft: validDraft(), ...base })
    expect(result).toMatchObject({ ok: true, spec: { specVersion: 1 } })
  })

  it('refuses to mutate an approved version without changeReason', () => {
    const v1 = (nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base }) as { spec: GameSpec }).spec
    const refused = nextSpecVersion({ current: v1, currentApproved: true, draft: validDraft(), ...base })
    expect(refused).toMatchObject({ ok: false, issue: { code: 'spec-approved-immutable' } })
  })

  it('bumps with a recorded reason after approval', () => {
    const v1 = (nextSpecVersion({ current: null, currentApproved: false, draft: validDraft(), ...base }) as { spec: GameSpec }).spec
    const bumped = nextSpecVersion({ current: v1, currentApproved: true, draft: validDraft(), ...base, changeReason: 'shrink the cast' })
    expect(bumped).toMatchObject({ ok: true, spec: { specVersion: 2 } })
    expect((bumped as { spec: GameSpec }).spec.provenance.history).toEqual([
      { version: 1, reason: 'initial compile' },
      { version: 2, reason: 'shrink the cast' }
    ])
  })
})
```

- [x] **Step 2: Run to verify FAIL** — `npx vitest run packages/game-spec/tests/version.test.ts`.

- [x] **Step 3: Implement**

```ts
// packages/game-spec/src/version.ts
import type { GameSpec, GameSpecDraft, SpecTranslation } from '@automata/contracts'
import type { SpecIssue } from './validate'

export interface NextSpecVersionArgs {
  current: GameSpec | null
  currentApproved: boolean
  draft: GameSpecDraft
  prompt: string
  translations: SpecTranslation[]
  changeReason?: string
}

export type NextSpecVersionResult = { ok: true; spec: GameSpec } | { ok: false; issue: SpecIssue }

/** Immutability rule: an approved version never mutates; changes bump with a recorded reason. */
export function nextSpecVersion(args: NextSpecVersionArgs): NextSpecVersionResult {
  const { current, currentApproved, draft, prompt, translations, changeReason } = args
  if (current === null) {
    return { ok: true, spec: { specVersion: 1, provenance: { prompt, translations, history: [{ version: 1, reason: 'initial compile' }] }, ...draft } }
  }
  if (!currentApproved) {
    return { ok: true, spec: { specVersion: current.specVersion, provenance: { prompt, translations, history: current.provenance.history }, ...draft } }
  }
  if (!changeReason) {
    return {
      ok: false,
      issue: {
        severity: 'error', code: 'spec-approved-immutable', path: 'changeReason',
        message: `specVersion ${current.specVersion} is approved and immutable; pass changeReason to create version ${current.specVersion + 1}`
      }
    }
  }
  const version = current.specVersion + 1
  return {
    ok: true,
    spec: {
      specVersion: version,
      provenance: { prompt, translations, history: [...current.provenance.history, { version, reason: changeReason }] },
      ...draft
    }
  }
}
```

- [x] **Step 4: Run tests** — `npx vitest run packages/game-spec` — Expected: PASS.
- [x] **Step 5: Commit** — `git add packages/game-spec && git commit -m "feat(game-spec): spec immutability and versioning rules"`

### Task 7: `renderDesignBrief`

**Files:**
- Create: `packages/game-spec/src/brief.ts`
- Modify: `packages/game-spec/src/index.ts` (add `export * from './brief'`)
- Test: `packages/game-spec/tests/brief.test.ts`

**Interfaces:**
- Produces: `renderDesignBrief(spec: GameSpec): string` — deterministic markdown, pure function of the spec.

- [x] **Step 1: Write the failing test**

```ts
// packages/game-spec/tests/brief.test.ts
import { describe, expect, it } from 'vitest'
import { minimalGameSpecDraft as minimalDraft, type GameSpec } from '@automata/contracts'
import { nextSpecVersion, renderDesignBrief, validateGameSpec } from '../src'

function spec(): GameSpec {
  const validated = validateGameSpec(minimalDraft(), { gameId: 'probe' })
  if (!validated.ok) throw new Error('fixture must be valid')
  const stamped = nextSpecVersion({
    current: null, currentApproved: false, draft: validated.draft,
    prompt: 'make a tiny hub game',
    translations: [{ requested: 'open world', translatedTo: 'one compact district', reason: 'envelope: single district' }]
  })
  if (!stamped.ok) throw new Error('fixture must stamp')
  return stamped.spec
}

describe('renderDesignBrief', () => {
  it('renders every checkpoint-relevant section deterministically', () => {
    const markdown = renderDesignBrief(spec())
    for (const expected of [
      '# Probe — Design Brief', 'specVersion 1', 'A tiny hub adventure.',
      '## Direction', '## Supported translations', 'open world', 'one compact district',
      '## World', '## Cast', '## Story outline', '## Capabilities', 'interaction-inventory',
      '## Budgets', 'targetMinutes: 60', '## Acceptance criteria', '## Version history'
    ]) expect(markdown).toContain(expected)
    expect(renderDesignBrief(spec())).toBe(markdown)
  })

  it('says so when nothing was translated', () => {
    const untranslated = { ...spec(), provenance: { ...spec().provenance, translations: [] } }
    expect(renderDesignBrief(untranslated)).toContain('No unsupported requests were translated.')
  })
})
```

- [x] **Step 2: Run to verify FAIL** — `npx vitest run packages/game-spec/tests/brief.test.ts`.

- [x] **Step 3: Implement**

```ts
// packages/game-spec/src/brief.ts
import type { GameSpec } from '@automata/contracts'

/** Deterministic spec → markdown design brief: the human-readable half of the design checkpoint. */
export function renderDesignBrief(spec: GameSpec): string {
  const lines: string[] = []
  const push = (line = ''): void => { lines.push(line) }

  push(`# ${spec.identity.title} — Design Brief`)
  push()
  push(`> ${spec.identity.logline}`)
  push()
  push(`- **Game:** \`${spec.identity.id}\` · specVersion ${spec.specVersion} · rated ${spec.identity.contentRating}`)
  push(`- **Themes:** ${spec.identity.themes.join(', ')}`)
  push(`- **Prompt:** ${spec.provenance.prompt}`)
  push()
  push('## Direction')
  push()
  push(`- **Visual:** ${spec.direction.visualStyle}`)
  push(`- **Audio:** ${spec.direction.audioStyle}`)
  push(`- **Dialogue tone:** ${spec.direction.dialogueTone}`)
  push(`- **Camera:** ${spec.direction.camera}`)
  push()
  push('## Supported translations')
  push()
  if (spec.provenance.translations.length === 0) push('No unsupported requests were translated.')
  else for (const translation of spec.provenance.translations) {
    push(`- Requested **${translation.requested}** → **${translation.translatedTo}** (${translation.reason})`)
  }
  push()
  push('## World')
  push()
  for (const location of spec.world.locations) push(`- **${location.name}** (${location.kind}): ${location.description}`)
  push()
  push('## Cast')
  push()
  for (const character of spec.cast) push(`- **${character.name}** (${character.role}): ${character.description}`)
  push()
  push('## Story outline')
  push()
  push(spec.story.premise)
  push()
  for (const beat of spec.story.beats) push(`1. *${beat.kind}* — ${beat.summary}`)
  push()
  push('## Capabilities')
  push()
  for (const capability of spec.capabilities) push(`- \`${capability.id}\`${capability.requirements.length ? ` — needs: ${capability.requirements.join('; ')}` : ''}`)
  push()
  push('## Budgets')
  push()
  for (const [key, value] of Object.entries(spec.budgets)) push(`- ${key}: ${value}`)
  push()
  push('## Progression')
  push()
  for (const milestone of spec.progression.milestones) push(`1. ${milestone.summary}`)
  push()
  push('## Asset requirements')
  push()
  for (const asset of spec.assets) push(`- \`${asset.id}\` (${asset.kind}): ${asset.description}`)
  push()
  push('## Acceptance criteria')
  push()
  for (const criterion of spec.acceptance) push(`- [${criterion.kind}] ${criterion.description} → \`${criterion.target}\``)
  push()
  push('## Version history')
  push()
  for (const entry of spec.provenance.history) push(`- v${entry.version}: ${entry.reason}`)
  push()
  return lines.join('\n')
}
```

- [x] **Step 4: Run tests** — `npx vitest run packages/game-spec` — Expected: PASS.
- [x] **Step 5: Commit** — `git add packages/game-spec && git commit -m "feat(game-spec): deterministic design-brief rendering"`

---

## Milestone C — MCP wiring + checkpoint (server sub-cycle)

### Task 8: `specStore` — atomic `gamespec.json` persistence

**Files:**
- Create: `tools/editor-mcp-server/src/specStore.ts`
- Test: `tools/editor-mcp-server/tests/specStore.test.ts`

**Interfaces:**
- Consumes: `gameSpecSchema`, `GameSpec` (contracts).
- Produces: `gameSpecPath(repoRoot: string, gameId: string): string` (= `<repoRoot>/games/<gameId>/gamespec.json`); `readGameSpec(repoRoot, gameId): Promise<GameSpec | null>` (null when missing, throws on invalid content); `writeGameSpec(repoRoot, gameId, spec: GameSpec): Promise<void>` (tmp + rename, trailing newline).

- [x] **Step 1: Write the failing test**

```ts
// tools/editor-mcp-server/tests/specStore.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSpec } from '@automata/contracts'
import { gameSpecPath, readGameSpec, writeGameSpec } from '../src/specStore'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function fixtureSpec(): GameSpec {
  return {
    specVersion: 1,
    provenance: { prompt: 'p', translations: [], history: [{ version: 1, reason: 'initial compile' }] },
    identity: { id: 'probe', title: 'Probe', logline: 'L', themes: ['t'], contentRating: 'everyone' },
    direction: { visualStyle: 'v', audioStyle: 'a', dialogueTone: 'd', camera: 'fixed' },
    budgets: { targetMinutes: 60, districtCount: 1, interiorCount: 1, characterCount: 2, mainQuestCount: 1, sideQuestCount: 0, enemyTypeCount: 0, assetBudget: 2, buildTimeMinutes: 30 },
    capabilities: [{ id: 'interaction-inventory', config: {}, requirements: [] }],
    world: { locations: [{ id: 'hub', name: 'Hub', kind: 'district', description: 'D' }] },
    cast: [{ id: 'player', name: 'P', role: 'player', description: 'D' }],
    story: { premise: 'P', beats: [{ id: 'b1', kind: 'beginning', summary: 'S' }, { id: 'b2', kind: 'ending', summary: 'E' }] },
    progression: { milestones: [{ id: 'm1', summary: 'S' }] },
    assets: [],
    acceptance: [{ id: 'a1', description: 'D', kind: 'structural', target: 'T' }]
  }
}

describe('specStore', () => {
  it('round-trips a spec and returns null when absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spec-store-')); roots.push(root)
    await mkdir(join(root, 'games/probe'), { recursive: true })
    expect(await readGameSpec(root, 'probe')).toBeNull()
    await writeGameSpec(root, 'probe', fixtureSpec())
    expect(gameSpecPath(root, 'probe')).toBe(join(root, 'games/probe/gamespec.json'))
    expect(await readGameSpec(root, 'probe')).toEqual(fixtureSpec())
    expect((await readFile(gameSpecPath(root, 'probe'), 'utf8')).endsWith('\n')).toBe(true)
  })

  it('throws on a corrupt gamespec.json rather than returning garbage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spec-store-')); roots.push(root)
    await mkdir(join(root, 'games/probe'), { recursive: true })
    await writeFile(gameSpecPath(root, 'probe'), '{"not":"a spec"}')
    await expect(readGameSpec(root, 'probe')).rejects.toThrow()
  })
})
```

- [x] **Step 2: Run to verify FAIL** — `npx vitest run tools/editor-mcp-server/tests/specStore.test.ts`.

- [x] **Step 3: Implement**

```ts
// tools/editor-mcp-server/src/specStore.ts
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gameSpecSchema, type GameSpec } from '@automata/contracts'

/** The versioned spec lives with the game it governs, checked into git. */
export function gameSpecPath(repoRoot: string, gameId: string): string {
  return join(repoRoot, 'games', gameId, 'gamespec.json')
}

export async function readGameSpec(repoRoot: string, gameId: string): Promise<GameSpec | null> {
  let text: string
  try {
    text = await readFile(gameSpecPath(repoRoot, gameId), 'utf8')
  } catch {
    return null
  }
  return gameSpecSchema.parse(JSON.parse(text))
}

/** Atomic write: tmp file in the same dir, then rename over gamespec.json. */
export async function writeGameSpec(repoRoot: string, gameId: string, spec: GameSpec): Promise<void> {
  const path = gameSpecPath(repoRoot, gameId)
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, `${JSON.stringify(spec, null, 2)}\n`)
  await rename(tmp, path)
}
```

- [x] **Step 4: Run tests** — `npx vitest run tools/editor-mcp-server/tests/specStore.test.ts` — Expected: PASS.
- [x] **Step 5: Commit** — `git add tools/editor-mcp-server && git commit -m "feat(editor-mcp-server): atomic gamespec.json store"`

### Task 9: `compileGameSpec` + `getGameSpec` tools

**Files:**
- Create: `tools/editor-mcp-server/src/specTools.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts:85` (`listTools` adds `specToolDefs()`), `:93` (route the four spec tools)
- Test: `tools/editor-mcp-server/tests/specTools.test.ts`

**Interfaces:**
- Consumes: `validateGameSpec`, `normalizeGameSpec`, `nextSpecVersion`, `renderDesignBrief` (game-spec); `hashJson`, `SessionEngine` (build-session); `readGameSpec`, `writeGameSpec` (Task 8); `specToolDefs`, `SpecTranslation`, `GameSpec` (contracts); `discoverGames` (`./projectCatalog`).
- Produces: `createSpecToolRunner(deps: { repoRoot: string; ensureEngine(gameId: string): Promise<SessionEngine> }): { execute(name: string, args: unknown): Promise<ToolResult> }` handling all four tools; `designCheckpointStatus(engine: SessionEngine, specHash: string): 'pending' | 'approved' | 'rejected'`. Step kinds `spec:compile`, `spec:brief`, `checkpoint:design`; finding code `spec-invalid`; success payloads: compile → `{ specVersion, cached, checkpoint, stepId }`, get → `{ spec, specVersion, checkpoint }`, brief → `{ markdown, cached, artifact }`, decision → `{ recorded, decision, specVersion, stepId }`.

First `npm install` nothing new — but add `"@automata/game-spec": "*"` to `tools/editor-mcp-server/package.json` dependencies and run `npm install`.

- [x] **Step 1: Write the failing test** (compile/get half)

```ts
// tools/editor-mcp-server/tests/specTools.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { minimalGameSpecDraft as minimalDraft } from '@automata/contracts'
import { createSessionHost } from '../src/sessionHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
async function makeRepo(gameIds: string[] = ['probe']) {
  const root = await mkdtemp(join(tmpdir(), 'spec-tools-')); roots.push(root)
  for (const id of gameIds) {
    await mkdir(join(root, `games/${id}/public/project`), { recursive: true })
    await writeFile(join(root, `games/${id}/package.json`), JSON.stringify({ name: id, exports: { './project': './src/project/index.ts' } }))
  }
  return root
}
function makeHost(root: string) {
  return createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
}
const compileArgs = (over: Record<string, unknown> = {}) => ({
  gameId: 'probe', draft: minimalDraft(), prompt: 'make a tiny hub game', translations: [], ...over
})

describe('compileGameSpec / getGameSpec', () => {
  it('lists the spec tools without an open project', async () => {
    const host = makeHost(await makeRepo())
    const names = host.listTools().map((tool) => tool.name)
    for (const name of ['compileGameSpec', 'getGameSpec', 'renderDesignBrief', 'recordDesignDecision']) expect(names).toContain(name)
    await host.dispose()
  })

  it('rejects an invalid draft with typed issues and writes nothing', async () => {
    const root = await makeRepo(); const host = makeHost(root)
    const bad = minimalDraft(); (bad.budgets as Record<string, unknown>).targetMinutes = 999
    const result = await host.executeTool('compileGameSpec', compileArgs({ draft: bad }))
    expect(result).toMatchObject({ ok: false, isError: true })
    expect(JSON.stringify(result.content)).toContain('spec-schema')
    expect(await host.executeTool('getGameSpec', { gameId: 'probe' })).toMatchObject({ ok: false })
    await host.dispose()
  })

  it('compiles, persists, caches, and reports checkpoint pending', async () => {
    const root = await makeRepo(); const host = makeHost(root)
    const first = await host.executeTool('compileGameSpec', compileArgs())
    expect(first).toMatchObject({ ok: true, content: { specVersion: 1, cached: false, checkpoint: 'pending' } })
    const again = await host.executeTool('compileGameSpec', compileArgs())
    expect(again).toMatchObject({ ok: true, content: { specVersion: 1, cached: true } })
    const got = await host.executeTool('getGameSpec', { gameId: 'probe' })
    expect(got).toMatchObject({ ok: true, content: { specVersion: 1, checkpoint: 'pending' } })
    expect((got.content as { spec: { identity: { id: string } } }).spec.identity.id).toBe('probe')
    await host.dispose()
  })

  it('fails for unknown games', async () => {
    const host = makeHost(await makeRepo())
    expect(await host.executeTool('compileGameSpec', compileArgs({ gameId: 'ghost' }))).toMatchObject({ ok: false })
    await host.dispose()
  })
})
```

- [x] **Step 2: Run to verify FAIL** — `npx vitest run tools/editor-mcp-server/tests/specTools.test.ts` — unknown tool / listTools missing.

- [x] **Step 3: Implement the runner and wire it**

```ts
// tools/editor-mcp-server/src/specTools.ts
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashJson, type SessionEngine } from '@automata/build-session'
import { parseSpecToolArgs, type GameSpec, type SpecTranslation, type ToolResult } from '@automata/contracts'
import { nextSpecVersion, normalizeGameSpec, renderDesignBrief, validateGameSpec } from '@automata/game-spec'
import { discoverGames } from './projectCatalog'
import { readGameSpec, writeGameSpec } from './specStore'

export interface SpecToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
}

const ok = (content: unknown): ToolResult => ({ ok: true, content })
const fail = (content: unknown): ToolResult => ({ ok: false, isError: true, content })

/** Latest checkpoint decision recorded for exactly this spec content hash. */
export function designCheckpointStatus(engine: SessionEngine, specHash: string): 'pending' | 'approved' | 'rejected' {
  for (let index = engine.session.steps.length - 1; index >= 0; index -= 1) {
    const step = engine.session.steps[index]!
    if (step.kind !== 'checkpoint:design') continue
    const result = step.result as { decision?: string; specHash?: string } | undefined
    if (result?.specHash !== specHash) continue
    return result.decision === 'approve' ? 'approved' : 'rejected'
  }
  return 'pending'
}

export function createSpecToolRunner(deps: SpecToolDeps) {
  const requireSpec = async (gameId: string): Promise<{ spec: GameSpec; engine: SessionEngine } | ToolResult> => {
    const engine = await deps.ensureEngine(gameId)
    const spec = await readGameSpec(deps.repoRoot, gameId)
    if (!spec) return fail(`no gamespec.json for "${gameId}" — call compileGameSpec first`)
    return { spec, engine }
  }

  const compile = async (rawArgs: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('compileGameSpec', rawArgs) as {
      gameId: string; draft: unknown; prompt: string; translations: SpecTranslation[]; changeReason?: string
    }
    const available = await discoverGames(deps.repoRoot)
    if (!available.includes(args.gameId)) return fail(`Unknown game "${args.gameId}". Available: ${available.join(', ')}`)
    const engine = await deps.ensureEngine(args.gameId)

    const validated = validateGameSpec(args.draft, { gameId: args.gameId })
    if (!validated.ok) {
      await engine.addFinding({
        source: 'spec', severity: 'error', code: 'spec-invalid',
        message: JSON.stringify(validated.issues).slice(0, 4000), inputHash: hashJson(args.draft)
      })
      return fail({ code: 'spec-invalid', issues: validated.issues })
    }

    const current = await readGameSpec(deps.repoRoot, args.gameId)
    const currentApproved = current !== null && designCheckpointStatus(engine, hashJson(current)) === 'approved'
    const stamped = nextSpecVersion({
      current, currentApproved, draft: validated.draft,
      prompt: args.prompt, translations: args.translations, changeReason: args.changeReason
    })
    if (!stamped.ok) {
      await engine.addFinding({
        source: 'spec', severity: 'error', code: stamped.issue.code,
        message: stamped.issue.message, inputHash: hashJson(validated.draft)
      })
      return fail({ code: stamped.issue.code, issues: [stamped.issue] })
    }

    const spec = normalizeGameSpec(stamped.spec)
    const specHash = hashJson(spec)

    // Identical recompile: the stamped result already matches disk, so answer from the
    // ledger instead of journaling a duplicate step. This must happen OUTSIDE the seeded
    // step: its input includes current disk state (below), which differs between the
    // first compile (no file yet) and a byte-identical recompile, so the seeded-step
    // cache alone can never report cached for this case.
    if (current !== null && hashJson(current) === specHash) {
      const prior = [...engine.session.steps].reverse()
        .find((step) => step.kind === 'spec:compile' && step.status === 'completed')
      if (prior) {
        await engine.autoResolve('spec')
        return ok({
          specVersion: spec.specVersion, cached: true,
          checkpoint: designCheckpointStatus(engine, specHash), stepId: prior.id
        })
      }
    }

    // Current disk state stays in the seeded-step input so a recorded step is never a
    // stale hit: recompiling an older draft after a version bump must record a fresh
    // step, not resurrect the pre-bump spec from the cache.
    const input = {
      draft: normalizeGameSpec(validated.draft), prompt: args.prompt, translations: args.translations,
      changeReason: args.changeReason ?? null, currentVersion: current?.specVersion ?? null, currentApproved
    }
    const guarded = await engine.runSeededStep('spec:compile', input, async () => spec)
    await writeGameSpec(deps.repoRoot, args.gameId, guarded.output as GameSpec)
    await engine.autoResolve('spec')
    return ok({
      specVersion: (guarded.output as GameSpec).specVersion, cached: guarded.cached,
      checkpoint: designCheckpointStatus(engine, specHash), stepId: guarded.step.id
    })
  }

  const get = async (rawArgs: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('getGameSpec', rawArgs) as { gameId: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    return ok({ spec: found.spec, specVersion: found.spec.specVersion, checkpoint: designCheckpointStatus(found.engine, hashJson(found.spec)) })
  }

  const brief = async (rawArgs: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('renderDesignBrief', rawArgs) as { gameId: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    const specHash = hashJson(found.spec)
    const guarded = await found.engine.runSeededStep('spec:brief', { specHash }, async () => renderDesignBrief(found.spec))
    const artifact = 'artifacts/design-brief.md'
    await writeFile(join(found.engine.dir, artifact), guarded.output as string)
    return ok({ markdown: guarded.output, cached: guarded.cached, artifact })
  }

  const decide = async (rawArgs: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('recordDesignDecision', rawArgs) as { gameId: string; decision: 'approve' | 'reject'; reason: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    const specHash = hashJson(found.spec)
    if (!found.engine.findCompleted('spec:brief', hashJson({ specHash }))) {
      return fail('the design brief for the current spec has not been rendered — call renderDesignBrief, present it, then decide')
    }
    const step = await found.engine.journalStep('checkpoint:design', {
      inputHash: hashJson({ specHash, decision: args.decision, reason: args.reason }),
      result: { decision: args.decision, reason: args.reason, specVersion: found.spec.specVersion, specHash }
    })
    return ok({ recorded: true, decision: args.decision, specVersion: found.spec.specVersion, stepId: step.id })
  }

  return {
    async execute(name: string, args: unknown): Promise<ToolResult> {
      if (name === 'compileGameSpec') return compile(args)
      if (name === 'getGameSpec') return get(args)
      if (name === 'renderDesignBrief') return brief(args)
      if (name === 'recordDesignDecision') return decide(args)
      return fail(`Unknown spec tool "${name}"`)
    }
  }
}
```

In `tools/editor-mcp-server/src/sessionHost.ts`:
- import: `import { specToolDefs } from '@automata/contracts'` (merge into the existing contracts import) and `import { createSpecToolRunner } from './specTools'`;
- inside `createSessionHost`, after `ensureEngine` is defined: `const specTools = createSpecToolRunner({ repoRoot, ensureEngine })`;
- `listTools`: `[...workspaceToolDefs(), ...sessionToolDefs(), ...specToolDefs(), ...(open ? open.headless.host.listTools() : [])]`;
- in `executeTool`, after the `runBuild/.../changedFiles` line: `if (name === 'compileGameSpec' || name === 'getGameSpec' || name === 'renderDesignBrief' || name === 'recordDesignDecision') return specTools.execute(name, args)`.

- [x] **Step 4: Run tests** — `npx vitest run tools/editor-mcp-server` — Expected: PASS (including existing suites).
- [x] **Step 5: Commit** — `git add tools/editor-mcp-server package-lock.json && git commit -m "feat(editor-mcp-server): compileGameSpec and getGameSpec over the session ledger"`

### Task 10: Checkpoint lifecycle — brief + decision + freeze/bump

**Files:**
- Modify: `tools/editor-mcp-server/tests/specTools.test.ts` (append lifecycle suite; implementation already landed in Task 9)

**Interfaces:**
- Consumes: everything from Task 9. This task proves the lifecycle contract end-to-end; expect test-driven fixes to `specTools.ts` if behavior deviates.

- [x] **Step 1: Write the (possibly failing) lifecycle test** — append:

```ts
describe('design checkpoint lifecycle', () => {
  it('brief → approve → freeze → bump with reason → pending again', async () => {
    const root = await makeRepo(); const host = makeHost(root)
    await host.executeTool('compileGameSpec', compileArgs())

    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'looks right' }))
      .toMatchObject({ ok: false })

    const brief = await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    expect(brief).toMatchObject({ ok: true, content: { cached: false, artifact: 'artifacts/design-brief.md' } })
    expect((brief.content as { markdown: string }).markdown).toContain('Design Brief')

    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'looks right' }))
      .toMatchObject({ ok: true, content: { recorded: true, specVersion: 1 } })
    expect(await host.executeTool('getGameSpec', { gameId: 'probe' })).toMatchObject({ ok: true, content: { checkpoint: 'approved' } })

    const frozen = await host.executeTool('compileGameSpec', compileArgs({ draft: (() => { const d = minimalDraft(); (d.identity as Record<string, unknown>).title = 'Probe II'; return d })() }))
    expect(frozen).toMatchObject({ ok: false })
    expect(JSON.stringify(frozen.content)).toContain('spec-approved-immutable')

    const bumped = await host.executeTool('compileGameSpec', compileArgs({
      draft: (() => { const d = minimalDraft(); (d.identity as Record<string, unknown>).title = 'Probe II'; return d })(),
      changeReason: 'retitle for tone'
    }))
    expect(bumped).toMatchObject({ ok: true, content: { specVersion: 2, checkpoint: 'pending' } })

    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'v2 fine' }))
      .toMatchObject({ ok: false })
    await host.dispose()
  })

  it('reject records why and leaves the spec editable in place', async () => {
    const root = await makeRepo(); const host = makeHost(root)
    await host.executeTool('compileGameSpec', compileArgs())
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'reject', reason: 'wrong tone' }))
      .toMatchObject({ ok: true, content: { decision: 'reject' } })
    expect(await host.executeTool('getGameSpec', { gameId: 'probe' })).toMatchObject({ ok: true, content: { checkpoint: 'rejected' } })
    const recompiled = await host.executeTool('compileGameSpec', compileArgs({
      draft: (() => { const d = minimalDraft(); (d.direction as Record<string, unknown>).dialogueTone = 'noir'; return d })()
    }))
    expect(recompiled).toMatchObject({ ok: true, content: { specVersion: 1 } })
    await host.dispose()
  })
})
```

- [x] **Step 2: Run** — `npx vitest run tools/editor-mcp-server/tests/specTools.test.ts`
Expected: PASS if Task 9's implementation is faithful; fix `specTools.ts` on any failure (the test is the contract).

- [x] **Step 3: Commit** — `git add tools/editor-mcp-server && git commit -m "test(editor-mcp-server): design-checkpoint lifecycle — freeze, bump, re-open"`

### Task 11: Exit criterion — ten prompts + replay determinism

**Files:**
- Create: `tools/editor-mcp-server/tests/fixtures/gameSpecPrompts.ts`
- Test: `tools/editor-mcp-server/tests/gameSpecAcceptance.test.ts`

**Interfaces:**
- Consumes: `createSessionHost`, `createSessionEngine` (build-session), `hashJson`, game-spec functions, `minimalDraft`.
- Produces: `GAME_SPEC_PROMPTS: ReadonlyArray<{ gameId: string; prompt: string; draft: GameSpecDraft-shaped object }>` (exactly 10 entries).

- [x] **Step 1: Write the fixtures** — ten differently worded prompts, each with a recorded draft built by varying the minimal draft:

```ts
// tools/editor-mcp-server/tests/fixtures/gameSpecPrompts.ts
import { minimalGameSpecDraft } from '@automata/contracts'

type Draft = ReturnType<typeof minimalGameSpecDraft>
function draftFor(gameId: string, title: string, logline: string, mutate: (draft: Draft) => void = () => {}): Draft {
  const draft = minimalGameSpecDraft(gameId)
  const identity = draft.identity as Record<string, unknown>
  identity.title = title; identity.logline = logline
  mutate(draft)
  return draft
}

export const GAME_SPEC_PROMPTS: ReadonlyArray<{ gameId: string; prompt: string; draft: Draft }> = [
  { gameId: 'gs-heist', prompt: 'A cozy heist game where you case a tiny seaside town.', draft: draftFor('gs-heist', 'Small Takes', 'Case a seaside town, pull one gentle heist.', (d) => { (d.identity as Record<string, unknown>).themes = ['heist', 'cozy'] }) },
  { gameId: 'gs-noir', prompt: 'Make me something noir: rain, a missing cat, one stubborn detective.', draft: draftFor('gs-noir', 'Alley Rain', 'A detective hunts a missing cat through one rainy district.', (d) => { (d.direction as Record<string, unknown>).dialogueTone = 'noir deadpan'; (d.capabilities as unknown[]).push({ id: 'dialogue-quests', config: {}, requirements: [] }) }) },
  { gameId: 'gs-market', prompt: 'I want to run a night market stall and haggle with regulars.', draft: draftFor('gs-market', 'Night Stall', 'Run a market stall; haggle with regulars until dawn.', (d) => { (d.capabilities as unknown[]).push({ id: 'economy-progression', config: {}, requirements: [] }) }) },
  { gameId: 'gs-courier', prompt: 'Bicycle courier in a compact hillside district, deliveries against the clock.', draft: draftFor('gs-courier', 'Hill Runner', 'Race deliveries down one hillside district.', (d) => { (d.capabilities as unknown[]).push({ id: 'hub-navigation-vehicle', config: {}, requirements: [] }); (d.budgets as Record<string, unknown>).targetMinutes = 45 }) },
  { gameId: 'gs-keeper', prompt: 'You inherit a lighthouse and the townsfolk each want something from you.', draft: draftFor('gs-keeper', 'Last Light', 'Keep the lighthouse; keep the town happier.', (d) => { (d.budgets as Record<string, unknown>).characterCount = 6; (d.cast as unknown[]).push({ id: 'mayor', name: 'Mayor', role: 'quest-giver', description: 'Wants the light green.' }) }) },
  { gameId: 'gs-garden', prompt: 'A gentle game about restoring a walled garden, no combat at all please.', draft: draftFor('gs-garden', 'Walled Green', 'Restore a walled garden bed by bed.', (d) => { (d.budgets as Record<string, unknown>).enemyTypeCount = 0 }) },
  { gameId: 'gs-wraith', prompt: 'Spooky but kid-friendly: befriend the ghosts haunting one old street.', draft: draftFor('gs-wraith', 'Friendly Haunt', 'Befriend the ghosts of one old street.', (d) => { (d.identity as Record<string, unknown>).contentRating = 'everyone'; (d.identity as Record<string, unknown>).themes = ['ghosts', 'friendship'] }) },
  { gameId: 'gs-diner', prompt: 'Short-order cook sim with regulars who gossip; I want to learn their stories.', draft: draftFor('gs-diner', 'Blue Plate', 'Cook for regulars; collect their stories.', (d) => { (d.capabilities as unknown[]).push({ id: 'dialogue-quests', config: {}, requirements: [] }); (d.story as Record<string, unknown>).premise = 'Every regular has one story worth the special.' }) },
  { gameId: 'gs-relic', prompt: 'An archaeology dig in a desert outpost — brushes, ledgers, and one big find.', draft: draftFor('gs-relic', 'Dig Ledger', 'Catalogue a desert dig to its one big find.', (d) => { (d.assets as unknown[]).push({ id: 'relic-model', kind: 'model', description: 'The big find.' }) }) },
  { gameId: 'gs-signal', prompt: 'Late-night radio host taking calls that slowly connect into one mystery.', draft: draftFor('gs-signal', 'Open Line', 'Take calls until the mystery connects.', (d) => { (d.direction as Record<string, unknown>).audioStyle = 'lo-fi radio hum'; (d.budgets as Record<string, unknown>).sideQuestCount = 3 }) }
]
```

- [x] **Step 2: Write the acceptance test**

```ts
// tools/editor-mcp-server/tests/gameSpecAcceptance.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine, hashJson } from '@automata/build-session'
import { nextSpecVersion, normalizeGameSpec, validateGameSpec } from '@automata/game-spec'
import { createSessionHost } from '../src/sessionHost'
import { GAME_SPEC_PROMPTS } from './fixtures/gameSpecPrompts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('Phase 2 exit criterion', () => {
  it('ten differently worded prompts produce valid, bounded, reviewable specs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gs-exit-')); roots.push(root)
    expect(GAME_SPEC_PROMPTS).toHaveLength(10)
    for (const fixture of GAME_SPEC_PROMPTS) {
      await mkdir(join(root, `games/${fixture.gameId}/public/project`), { recursive: true })
      await writeFile(join(root, `games/${fixture.gameId}/package.json`), JSON.stringify({ name: fixture.gameId, exports: { './project': './src/project/index.ts' } }))
    }
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
    for (const fixture of GAME_SPEC_PROMPTS) {
      const compiled = await host.executeTool('compileGameSpec', { gameId: fixture.gameId, draft: fixture.draft, prompt: fixture.prompt, translations: [] })
      expect(compiled, fixture.gameId).toMatchObject({ ok: true, content: { specVersion: 1, checkpoint: 'pending' } })
      const brief = await host.executeTool('renderDesignBrief', { gameId: fixture.gameId })
      expect(brief, fixture.gameId).toMatchObject({ ok: true })
      expect((brief.content as { markdown: string }).markdown).toContain('Design Brief')
      expect(await host.executeTool('recordDesignDecision', { gameId: fixture.gameId, decision: 'approve', reason: 'exit-criterion pass' }))
        .toMatchObject({ ok: true, content: { recorded: true } })
    }
    await host.dispose()
  })

  it('spec:compile replays deterministically from recorded inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gs-replay-')); roots.push(root)
    const fixture = GAME_SPEC_PROMPTS[0]!
    await mkdir(join(root, `games/${fixture.gameId}/public/project`), { recursive: true })
    await writeFile(join(root, `games/${fixture.gameId}/package.json`), JSON.stringify({ name: fixture.gameId, exports: { './project': './src/project/index.ts' } }))
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
    await host.executeTool('compileGameSpec', { gameId: fixture.gameId, draft: fixture.draft, prompt: fixture.prompt, translations: [] })
    await host.dispose()

    const { engine } = await createSessionEngine({
      sessionsRoot: join(root, '.automata/sessions'), gameId: fixture.gameId,
      projectDir: join(root, `games/${fixture.gameId}/public/project`), engineVersion: 'test', lock: false
    })
    const compileStep = engine.session.steps.find((step) => step.kind === 'spec:compile')!
    const validated = validateGameSpec(fixture.draft, { gameId: fixture.gameId })
    if (!validated.ok) throw new Error('fixture must be valid')
    const stamped = nextSpecVersion({ current: null, currentApproved: false, draft: validated.draft, prompt: fixture.prompt, translations: [] })
    if (!stamped.ok) throw new Error('fixture must stamp')
    const spec = normalizeGameSpec(stamped.spec)
    const replay = await engine.replayStep(compileStep.id, async () => spec)
    expect(replay.ok).toBe(true)
    expect(replay.actual).toBe(hashJson(spec))
    await engine.dispose()
  })
})
```

- [x] **Step 3: Run** — `npx vitest run tools/editor-mcp-server/tests/gameSpecAcceptance.test.ts`
Expected: PASS. Any failure is a real defect in Tasks 4–10 — fix there, not in the test.

- [x] **Step 4: Commit** — `git add tools/editor-mcp-server && git commit -m "test: Phase 2 exit criterion — ten prompts compile to valid specs; seeded replay"`

### Task 12: Docs, roadmap, and full verification

**Files:**
- Modify: `docs/ROADMAP.md` (§1 add shipped entry; §3 Phase 2 → `Shipped` with task breakdown collapsed, promote Phase 3 to `Next`)
- Modify: `AGENTS.md` (MCP build sessions section: one sentence on the spec tools + gamespec.json)
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md` (Phase 2 header: completed date + spec/plan links, matching the Phase 0/1 pattern)

- [x] **Step 1: AGENTS.md** — in "MCP build sessions", after the sentence about server-executed checks, add:

> Phase 2 adds the GameSpec surface: agents draft a spec from the prompt and call
> `compileGameSpec` (validated against the supported envelope, versioned, persisted
> to `games/<name>/gamespec.json`), then `renderDesignBrief` and
> `recordDesignDecision` drive the design checkpoint; approval freezes the spec
> version and later changes require a recorded `changeReason`.

- [x] **Step 2: ROADMAP.md** — set Phase 2 status to `Shipped` with today's date and the merge commit placeholder filled at merge time; move a summary entry to §1 linking this spec and plan; promote **Phase 3 — Vertical slice** to `Next`. Update the decomposition doc's Phase 2 section header with the completion note and links (same pattern as its Phase 1 section).

- [x] **Step 3: Full verification**

Run: `npm run ci` — Expected: lint, typecheck, and all workspaces' tests green.
Run: `npm run coverage` — Expected: thresholds hold (≥90% lines/branches).

- [x] **Step 4: Commit**

```bash
git add docs/ROADMAP.md AGENTS.md docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md
git commit -m "docs: Phase 2 versioned GameSpec shipped; roadmap and agent guide updated"
```
