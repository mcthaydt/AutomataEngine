# Phase 4 Cycle 2 — Branching Dialogue & Quests Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@automata/pack-dialogue-quests` — proximity-triggered branching dialogue plus a talk/fetch quest log — as the second standard pack, proving contract v2's cross-pack seam (slice read + event consumption) end-to-end through the composition matrix.

**Architecture:** One package, two pure cores (`questCore`, `dialogueCore`) under a strict cross-referenced config schema; a browser `GamePack` adapter with a dialogue overlay and quest HUD; a seeded `composeSection` fed by the composed inventory section (ordered composition in `game-compose`); a headless eval hook riding an additive `PackEvalHook` slice extension, threaded through both the matrix harness and the production `evaluateProject` walker. Spec: [`2026-07-16-phase-4-cycle-2-dialogue-quests-design.md`](../../../specs/active/2026-07/week-29/2026-07-16-phase-4-cycle-2-dialogue-quests-design.md).

**Tech Stack:** TypeScript ESM workspaces, zod via `@automata/project` re-export, vitest (+ happy-dom for the adapter), existing `@automata/game-kit` contract v2 seams.

**Implementation progress:** 69% (45/65 steps complete; Task 9 complete; Task 10 next).

## Global Constraints

- Packs import zod ONLY as `import { z } from '@automata/project'` (eslint enforces; no direct `zod` import).
- Direct pack→pack imports are forbidden. The dialogue pack references the inventory slice by the string `'inventory'` and the `itemAcquired` event by string — never by importing `@automata/pack-interaction-inventory`. Only `pack-registry` and `game-compose` may import multiple packs.
- Spec-side capability schemas: all fields optional, NO zod defaults (`config: {}` must parse to `{}` — stored Phase-2 spec hashes must not change). Defaults live in `composeSection` only.
- `games/first-light` is frozen: inventory-only compose output must stay bit-identical. In `composeGame`, all dialogue-related RNG draws happen AFTER the existing draw order (goal → icon hues → item placements).
- Slice sole-writer rule: this pack writes only `questLog`; it reads `inventory` and never mutates it (fetch = hold-and-show, no consumption).
- Every eval-seam change is additive/optional; the existing inventory hook and any third-party hook must compile untouched.
- Gates for cycle completion: `npm run ci`, `npm run verify:new-game`, composition matrix green, first-light recompose bit-identical.
- Commit after every task with the repo's conventional style (`feat(pack-dialogue-quests): …`, `test(…): …`, etc.).
- Cross-plan coordination: Phase 5 cycle 2 lands in parallel and also edits `packages/contracts/src/gameSpec.ts` (type exports next to `assetRequirementSchema`), `package-lock.json`, and `docs/ROADMAP.md`. Rebase conflicts in exactly those three files are expected; overlap anywhere else means a territory violation.

---

### Task 1: GameSpec capability config for dialogue-quests

**Files:**
- Modify: `packages/contracts/src/gameSpec.ts:88` (the `'dialogue-quests': z.strictObject({})` stub)
- Test: `packages/contracts/tests/gameSpec.test.ts`

**Interfaces:**
- Consumes: existing `capabilityConfigSchemas` table.
- Produces: `capabilityConfigSchemas['dialogue-quests']` accepting `{ talkRadius?: number }` (0.5–5), rejecting unknown keys; `{}` still parses to `{}`.

- [x] **Step 1: Write the failing tests**

Append to the capability-config describe block in `packages/contracts/tests/gameSpec.test.ts` (match the file's existing style):

```ts
describe('dialogue-quests capability config', () => {
  it('accepts an empty config unchanged (hash rule)', () => {
    expect(capabilityConfigSchemas['dialogue-quests'].parse({})).toEqual({})
  })

  it('accepts talkRadius within bounds', () => {
    expect(capabilityConfigSchemas['dialogue-quests'].parse({ talkRadius: 2.5 }))
      .toEqual({ talkRadius: 2.5 })
  })

  it('rejects talkRadius out of bounds and unknown keys', () => {
    expect(() => capabilityConfigSchemas['dialogue-quests'].parse({ talkRadius: 0.1 })).toThrow()
    expect(() => capabilityConfigSchemas['dialogue-quests'].parse({ talkRadius: 9 })).toThrow()
    expect(() => capabilityConfigSchemas['dialogue-quests'].parse({ npcCount: 3 })).toThrow()
  })
})
```

- [x] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run --project contracts -t 'dialogue-quests capability config'`
Expected: 1 failure (the in-bounds `talkRadius` parse — the empty-config and rejection tests already pass against the stub, since `z.strictObject({})` rejects every unknown key).

- [x] **Step 3: Implement**

In `packages/contracts/src/gameSpec.ts` replace the stub line:

```ts
  'dialogue-quests': z.strictObject({}),
```

with:

```ts
  'dialogue-quests': z.strictObject({
    talkRadius: z.number().min(0.5).max(5).optional()
  }),
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project contracts`
Expected: PASS (all contracts tests, including untouched spec-hash fixtures).

- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): real dialogue-quests capability config (talkRadius)"
```

---

### Task 2: Package scaffold + config schema with cross-ref validation

**Files:**
- Create: `packages/pack-dialogue-quests/package.json`
- Create: `packages/pack-dialogue-quests/tsconfig.json`
- Create: `packages/pack-dialogue-quests/vitest.config.ts`
- Create: `packages/pack-dialogue-quests/src/config.ts`
- Create: `packages/pack-dialogue-quests/src/index.ts`
- Create: `packages/pack-dialogue-quests/tests/fixtures.ts`
- Test: `packages/pack-dialogue-quests/tests/config.test.ts`

**Interfaces:**
- Produces (consumed by every later task):

```ts
export type QuestStatus = 'locked' | 'available' | 'active' | 'complete'
export type QuestObjective = { kind: 'talk' } | { kind: 'fetch'; itemIds: string[] }
export interface QuestDef { id: string; kind: 'main' | 'side'; title: string; giverNpcId: string; objective: QuestObjective }
export type DialogueCondition =
  | { kind: 'questState'; questId: string; status: QuestStatus }
  | { kind: 'hasItems'; itemIds: string[] }
export type DialogueEffect = { kind: 'acceptQuest'; questId: string } | { kind: 'completeQuest'; questId: string }
export interface DialogueChoice { text: string; next: string | null; conditions?: DialogueCondition[]; effects?: DialogueEffect[] }
export interface DialogueNode { id: string; speaker: string; text: string; choices: DialogueChoice[] }
export interface DialogueDef { id: string; start: string; nodes: DialogueNode[] }
export interface NpcDef { id: string; name: string; position: { x: number; z: number }; dialogueId: string }
export interface DialogueQuestsPackConfig { talkRadius: number; npcs: NpcDef[]; dialogues: DialogueDef[]; quests: QuestDef[] }
export const packConfigSchema: z.ZodType<DialogueQuestsPackConfig>  // strict + cross-ref superRefine
export const QUEST_LOG_SLICE_ID = 'questLog'
export const INVENTORY_SLICE_ID = 'inventory'          // read-only contract name, string on purpose
export const ITEM_ACQUIRED_EVENT = 'itemAcquired'      // consumed contract name, string on purpose
export const QUEST_COMPLETED_EVENT = 'questCompleted'
export const DIALOGUE_ENDED_EVENT = 'dialogueEnded'
```

`conditions` is an AND-list: a choice is available only when every entry holds.

- [x] **Step 1: Scaffold the package**

`packages/pack-dialogue-quests/package.json`:

```json
{
  "name": "@automata/pack-dialogue-quests",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/engine": "*",
    "@automata/game-kit": "*",
    "@automata/project": "*"
  }
}
```

`packages/pack-dialogue-quests/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/pack-dialogue-quests/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-dialogue-quests', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

`packages/pack-dialogue-quests/src/index.ts` (grows in later tasks):

```ts
export * from './config'
```

Run: `npm install` (links the workspace).

- [x] **Step 2: Write the failing tests**

`packages/pack-dialogue-quests/tests/fixtures.ts` — the shared fixture lives here, NOT in a test file: importing a `.test.ts` module re-registers its `describe` blocks in every importing file (duplicate runs), and the inventory pack's `tests/fixtures.ts` is the repo convention.

```ts
import type { DialogueQuestsPackConfig } from '../src/config'

/** Minimal internally consistent config; tests mutate copies to break one reference at a time. */
export function validConfig(): DialogueQuestsPackConfig {
  return {
    talkRadius: 2,
    npcs: [{ id: 'npc-1', name: 'Mara', position: { x: 5, z: 5 }, dialogueId: 'dlg-1' }],
    dialogues: [{
      id: 'dlg-1',
      start: 'greet',
      nodes: [
        {
          id: 'greet', speaker: 'Mara', text: 'Need a hand?',
          choices: [
            { text: 'Hand it over.', next: 'done', conditions: [{ kind: 'questState', questId: 'q-1', status: 'active' }, { kind: 'hasItems', itemIds: ['item-1'] }], effects: [{ kind: 'completeQuest', questId: 'q-1' }] },
            { text: 'I will help.', next: 'done', conditions: [{ kind: 'questState', questId: 'q-1', status: 'available' }], effects: [{ kind: 'acceptQuest', questId: 'q-1' }] },
            { text: 'Bye.', next: null }
          ]
        },
        { id: 'done', speaker: 'Mara', text: 'Thanks.', choices: [{ text: 'Bye.', next: null }] }
      ]
    }],
    quests: [{ id: 'q-1', kind: 'main', title: 'Fetch the relic', giverNpcId: 'npc-1', objective: { kind: 'fetch', itemIds: ['item-1'] } }]
  }
}
```

`packages/pack-dialogue-quests/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { packConfigSchema } from '../src/config'
import { validConfig } from './fixtures'

describe('dialogue-quests pack config schema', () => {
  it('parses a valid config unchanged', () => {
    expect(packConfigSchema.parse(validConfig())).toEqual(validConfig())
  })

  it('rejects a choice pointing at a missing node', () => {
    const config = validConfig()
    config.dialogues[0]!.nodes[0]!.choices[2]!.next = 'nowhere'
    expect(() => packConfigSchema.parse(config)).toThrow(/nowhere/)
  })

  it('rejects a missing start node, duplicate node ids, and duplicate dialogue ids', () => {
    const missingStart = validConfig()
    missingStart.dialogues[0]!.start = 'nope'
    expect(() => packConfigSchema.parse(missingStart)).toThrow(/start/)
    const dupNode = validConfig()
    dupNode.dialogues[0]!.nodes.push({ ...dupNode.dialogues[0]!.nodes[1]! })
    expect(() => packConfigSchema.parse(dupNode)).toThrow(/duplicate/i)
    const dupDialogue = validConfig()
    dupDialogue.dialogues.push({ ...dupDialogue.dialogues[0]! })
    expect(() => packConfigSchema.parse(dupDialogue)).toThrow(/duplicate/i)
  })

  it('rejects an npc referencing a missing dialogue and a quest referencing a missing npc', () => {
    const badNpc = validConfig()
    badNpc.npcs[0]!.dialogueId = 'dlg-9'
    expect(() => packConfigSchema.parse(badNpc)).toThrow(/dlg-9/)
    const badQuest = validConfig()
    badQuest.quests[0]!.giverNpcId = 'npc-9'
    expect(() => packConfigSchema.parse(badQuest)).toThrow(/npc-9/)
  })

  it('rejects conditions/effects referencing unknown quests and empty fetch itemIds', () => {
    const badRef = validConfig()
    badRef.dialogues[0]!.nodes[0]!.choices[1]!.effects = [{ kind: 'acceptQuest', questId: 'q-9' }]
    expect(() => packConfigSchema.parse(badRef)).toThrow(/q-9/)
    const emptyFetch = validConfig()
    emptyFetch.quests[0]!.objective = { kind: 'fetch', itemIds: [] }
    expect(() => packConfigSchema.parse(emptyFetch)).toThrow()
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: FAIL — cannot resolve `../src/config`.

- [x] **Step 4: Implement `src/config.ts`**

```ts
import { z } from '@automata/project'

/**
 * Compiled pack config: NPCs, dialogue trees, and quests, cross-validated so
 * dangling references are compose-time errors. Contract names for the slices
 * and events this pack owns/reads/emits/consumes live here; the inventory
 * names are deliberate string copies — pack→pack imports are forbidden.
 */
export const QUEST_LOG_SLICE_ID = 'questLog'
export const INVENTORY_SLICE_ID = 'inventory'
export const ITEM_ACQUIRED_EVENT = 'itemAcquired'
export const QUEST_COMPLETED_EVENT = 'questCompleted'
export const DIALOGUE_ENDED_EVENT = 'dialogueEnded'

const questStatusSchema = z.enum(['locked', 'available', 'active', 'complete'])
export type QuestStatus = z.infer<typeof questStatusSchema>

const idSchema = z.string().min(1).max(60)
const itemIdsSchema = z.array(idSchema).min(1).max(8)

const questObjectiveSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('talk') }),
  z.strictObject({ kind: z.literal('fetch'), itemIds: itemIdsSchema })
])
export type QuestObjective = z.infer<typeof questObjectiveSchema>

const questDefSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['main', 'side']),
  title: z.string().min(1).max(120),
  giverNpcId: idSchema,
  objective: questObjectiveSchema
})
export type QuestDef = z.infer<typeof questDefSchema>

const dialogueConditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('questState'), questId: idSchema, status: questStatusSchema }),
  z.strictObject({ kind: z.literal('hasItems'), itemIds: itemIdsSchema })
])
export type DialogueCondition = z.infer<typeof dialogueConditionSchema>

const dialogueEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('acceptQuest'), questId: idSchema }),
  z.strictObject({ kind: z.literal('completeQuest'), questId: idSchema })
])
export type DialogueEffect = z.infer<typeof dialogueEffectSchema>

const dialogueChoiceSchema = z.strictObject({
  text: z.string().min(1).max(240),
  next: idSchema.nullable(),
  conditions: z.array(dialogueConditionSchema).min(1).max(4).optional(),
  effects: z.array(dialogueEffectSchema).min(1).max(4).optional()
})
export type DialogueChoice = z.infer<typeof dialogueChoiceSchema>

const dialogueNodeSchema = z.strictObject({
  id: idSchema,
  speaker: z.string().min(1).max(80),
  text: z.string().min(1).max(400),
  choices: z.array(dialogueChoiceSchema).min(1).max(9)
})
export type DialogueNode = z.infer<typeof dialogueNodeSchema>

const dialogueDefSchema = z.strictObject({
  id: idSchema,
  start: idSchema,
  nodes: z.array(dialogueNodeSchema).min(1).max(40)
})
export type DialogueDef = z.infer<typeof dialogueDefSchema>

const npcDefSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  position: z.strictObject({ x: z.number(), z: z.number() }),
  dialogueId: idSchema
})
export type NpcDef = z.infer<typeof npcDefSchema>

const baseConfigSchema = z.strictObject({
  talkRadius: z.number().min(0.5).max(5),
  npcs: z.array(npcDefSchema).min(1).max(12),
  dialogues: z.array(dialogueDefSchema).min(1).max(12),
  quests: z.array(questDefSchema).min(1).max(18)
})
export type DialogueQuestsPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

/** Strict schema + referential integrity: every id mentioned must resolve. */
export const packConfigSchema: z.ZodType<DialogueQuestsPackConfig> = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  const questIds = new Set(config.quests.map((quest) => quest.id))
  const npcIds = new Set(config.npcs.map((npc) => npc.id))
  const dialogueIds = new Set(config.dialogues.map((dialogue) => dialogue.id))
  for (const dup of duplicates(config.quests.map((quest) => quest.id))) issue(`duplicate quest id "${dup}"`)
  for (const dup of duplicates(config.npcs.map((npc) => npc.id))) issue(`duplicate npc id "${dup}"`)
  for (const dup of duplicates(config.dialogues.map((dialogue) => dialogue.id))) issue(`duplicate dialogue id "${dup}"`)
  for (const npc of config.npcs) {
    if (!dialogueIds.has(npc.dialogueId)) issue(`npc "${npc.id}" references missing dialogue "${npc.dialogueId}"`)
  }
  for (const quest of config.quests) {
    if (!npcIds.has(quest.giverNpcId)) issue(`quest "${quest.id}" references missing npc "${quest.giverNpcId}"`)
  }
  for (const dialogue of config.dialogues) {
    const nodeIds = new Set(dialogue.nodes.map((node) => node.id))
    for (const dup of duplicates(dialogue.nodes.map((node) => node.id))) {
      issue(`duplicate node id "${dup}" in dialogue "${dialogue.id}"`)
    }
    if (!nodeIds.has(dialogue.start)) issue(`dialogue "${dialogue.id}" start node "${dialogue.start}" missing`)
    for (const node of dialogue.nodes) {
      for (const choice of node.choices) {
        if (choice.next !== null && !nodeIds.has(choice.next)) {
          issue(`choice "${choice.text}" in dialogue "${dialogue.id}" targets missing node "${choice.next}"`)
        }
        for (const condition of choice.conditions ?? []) {
          if (condition.kind === 'questState' && !questIds.has(condition.questId)) {
            issue(`condition references missing quest "${condition.questId}"`)
          }
        }
        for (const effect of choice.effects ?? []) {
          if (!questIds.has(effect.questId)) issue(`effect references missing quest "${effect.questId}"`)
        }
      }
    }
  }
})
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: PASS (5 tests).

- [x] **Step 6: Commit**

```bash
git add packages/pack-dialogue-quests package-lock.json
git commit -m "feat(pack-dialogue-quests): package scaffold + cross-validated config schema"
```

---

### Task 3: questCore — quest log state machine + persistence

**Files:**
- Create: `packages/pack-dialogue-quests/src/questCore.ts`
- Test: `packages/pack-dialogue-quests/tests/questCore.test.ts`
- Modify: `packages/pack-dialogue-quests/src/index.ts` (add `export * from './questCore'`)

**Interfaces:**
- Consumes: `QuestDef`, `QuestStatus` from `./config`.
- Produces:

```ts
export type QuestLog = Readonly<Record<string, QuestStatus>>
export interface InventoryView { collected: readonly string[] }   // shape of the 'inventory' slice
export function createQuestLog(quests: readonly QuestDef[]): QuestLog
export function acceptQuest(log: QuestLog, questId: string): QuestLog            // available→active else same ref
export function objectiveSatisfied(quest: QuestDef, inventory: InventoryView): boolean
export function completeQuest(log: QuestLog, questId: string, quests: readonly QuestDef[], inventory: InventoryView): QuestLog
export function questsComplete(log: QuestLog, quests: readonly QuestDef[]): boolean
export function activeMainQuest(log: QuestLog, quests: readonly QuestDef[]): QuestDef | null
export function serializeQuestLog(log: QuestLog): unknown
export function deserializeQuestLog(raw: unknown, quests: readonly QuestDef[]): QuestLog  // throws on malformed/mismatched keys
```

- [x] **Step 1: Write the failing tests**

`packages/pack-dialogue-quests/tests/questCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { QuestDef } from '../src/config'
import {
  acceptQuest, activeMainQuest, completeQuest, createQuestLog, deserializeQuestLog,
  questsComplete, serializeQuestLog
} from '../src/questCore'

const quests: QuestDef[] = [
  { id: 'm-1', kind: 'main', title: 'Talk to Mara', giverNpcId: 'npc-1', objective: { kind: 'talk' } },
  { id: 'm-2', kind: 'main', title: 'Fetch the relic', giverNpcId: 'npc-1', objective: { kind: 'fetch', itemIds: ['item-1'] } },
  { id: 's-1', kind: 'side', title: 'Small talk', giverNpcId: 'npc-1', objective: { kind: 'talk' } }
]
const none = { collected: [] as string[] }
const held = { collected: ['item-1'] }

describe('questCore', () => {
  it('starts with first main + all sides available, later mains locked', () => {
    expect(createQuestLog(quests)).toEqual({ 'm-1': 'available', 'm-2': 'locked', 's-1': 'available' })
  })

  it('accepts only available quests (no-op otherwise, same reference)', () => {
    const log = createQuestLog(quests)
    expect(acceptQuest(log, 'm-1')['m-1']).toBe('active')
    expect(acceptQuest(log, 'm-2')).toBe(log)
    expect(acceptQuest(log, 'nope')).toBe(log)
  })

  it('completes an active talk quest and unlocks the next main', () => {
    const log = acceptQuest(createQuestLog(quests), 'm-1')
    const done = completeQuest(log, 'm-1', quests, none)
    expect(done['m-1']).toBe('complete')
    expect(done['m-2']).toBe('available')
  })

  it('refuses to complete a fetch quest without the items, allows it with them', () => {
    let log = completeQuest(acceptQuest(createQuestLog(quests), 'm-1'), 'm-1', quests, none)
    log = acceptQuest(log, 'm-2')
    expect(completeQuest(log, 'm-2', quests, none)).toBe(log)
    expect(completeQuest(log, 'm-2', quests, held)['m-2']).toBe('complete')
  })

  it('questsComplete requires all mains, ignores sides; activeMainQuest tracks the chain', () => {
    let log = createQuestLog(quests)
    expect(activeMainQuest(log, quests)?.id).toBe('m-1')
    log = completeQuest(acceptQuest(log, 'm-1'), 'm-1', quests, none)
    log = completeQuest(acceptQuest(log, 'm-2'), 'm-2', quests, held)
    expect(questsComplete(log, quests)).toBe(true)
    expect(activeMainQuest(log, quests)).toBeNull()
  })

  it('round-trips through serialize/deserialize and rejects malformed or mismatched state', () => {
    const log = acceptQuest(createQuestLog(quests), 'm-1')
    expect(deserializeQuestLog(serializeQuestLog(log), quests)).toEqual(log)
    expect(() => deserializeQuestLog({ 'm-1': 'winning' }, quests)).toThrow()
    expect(() => deserializeQuestLog({ 'm-1': 'active' }, quests)).toThrow(/m-2/)
    expect(() => deserializeQuestLog(42, quests)).toThrow()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-dialogue-quests -t questCore`
Expected: FAIL — cannot resolve `../src/questCore`.

- [x] **Step 3: Implement `src/questCore.ts`**

```ts
import { z } from '@automata/project'
import type { QuestDef, QuestStatus } from './config'

/** Pure quest-log state machine: no DOM, clocks, or RNG. */
export type QuestLog = Readonly<Record<string, QuestStatus>>

/** Shape this pack expects of the read-only 'inventory' slice. */
export interface InventoryView { collected: readonly string[] }

const mains = (quests: readonly QuestDef[]): QuestDef[] => quests.filter((quest) => quest.kind === 'main')

/** First main + all sides start available; later mains are chain-locked. */
export function createQuestLog(quests: readonly QuestDef[]): QuestLog {
  const firstMainId = mains(quests)[0]?.id
  return Object.fromEntries(quests.map((quest) => [
    quest.id,
    quest.kind === 'side' || quest.id === firstMainId ? 'available' : 'locked'
  ]))
}

export function acceptQuest(log: QuestLog, questId: string): QuestLog {
  if (log[questId] !== 'available') return log
  return { ...log, [questId]: 'active' }
}

export function objectiveSatisfied(quest: QuestDef, inventory: InventoryView): boolean {
  if (quest.objective.kind === 'talk') return true
  return quest.objective.itemIds.every((itemId) => inventory.collected.includes(itemId))
}

/** Complete an active, satisfied quest; completing main N unlocks main N+1. */
export function completeQuest(log: QuestLog, questId: string, quests: readonly QuestDef[], inventory: InventoryView): QuestLog {
  const quest = quests.find((entry) => entry.id === questId)
  if (!quest || log[questId] !== 'active' || !objectiveSatisfied(quest, inventory)) return log
  const next: Record<string, QuestStatus> = { ...log, [questId]: 'complete' }
  const chain = mains(quests)
  const index = chain.findIndex((entry) => entry.id === questId)
  const follower = index >= 0 ? chain[index + 1] : undefined
  if (follower && next[follower.id] === 'locked') next[follower.id] = 'available'
  return next
}

export function questsComplete(log: QuestLog, quests: readonly QuestDef[]): boolean {
  return mains(quests).every((quest) => log[quest.id] === 'complete')
}

/** Earliest not-yet-complete main quest (the HUD's and evaluator's focus). */
export function activeMainQuest(log: QuestLog, quests: readonly QuestDef[]): QuestDef | null {
  return mains(quests).find((quest) => log[quest.id] !== 'complete') ?? null
}

const questStatusSchema = z.enum(['locked', 'available', 'active', 'complete'])
const savedQuestLogSchema = z.record(z.string().min(1).max(60), questStatusSchema)

export function serializeQuestLog(log: QuestLog): unknown {
  return { ...log }
}

/** Parse-or-throw; the saved keys must exactly match the configured quest set. */
export function deserializeQuestLog(raw: unknown, quests: readonly QuestDef[]): QuestLog {
  const parsed = savedQuestLogSchema.parse(raw)
  const expected = new Set(quests.map((quest) => quest.id))
  for (const id of Object.keys(parsed)) {
    if (!expected.has(id)) throw new Error(`Saved quest log has unknown quest "${id}"`)
  }
  for (const id of expected) {
    if (!(id in parsed)) throw new Error(`Saved quest log missing quest "${id}"`)
  }
  return parsed
}
```

Add to `src/index.ts`:

```ts
export * from './questCore'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-dialogue-quests
git commit -m "feat(pack-dialogue-quests): questCore state machine with chain unlock + persistence"
```

---

### Task 4: dialogueCore — pure tree traversal

**Files:**
- Create: `packages/pack-dialogue-quests/src/dialogueCore.ts`
- Test: `packages/pack-dialogue-quests/tests/dialogueCore.test.ts`
- Modify: `packages/pack-dialogue-quests/src/index.ts` (add `export * from './dialogueCore'`)

**Interfaces:**
- Consumes: `DialogueDef`, `DialogueChoice`, `DialogueCondition`, `DialogueEffect` from `./config`; `QuestLog`, `InventoryView` from `./questCore`.
- Produces:

```ts
export interface DialogueSession { dialogueId: string; nodeId: string }
export function startDialogue(dialogue: DialogueDef): DialogueSession
export function currentNode(dialogue: DialogueDef, session: DialogueSession): DialogueNode
export function conditionsMet(conditions: readonly DialogueCondition[] | undefined, questLog: QuestLog, inventory: InventoryView): boolean
export function availableChoices(dialogue: DialogueDef, session: DialogueSession, questLog: QuestLog, inventory: InventoryView): DialogueChoice[]
export interface ChoiceOutcome { session: DialogueSession | null; effects: readonly DialogueEffect[] }
export function choose(dialogue: DialogueDef, session: DialogueSession, index: number, questLog: QuestLog, inventory: InventoryView): ChoiceOutcome
```

`choose` indexes into `availableChoices` (the filtered list — what the player sees); out-of-range returns `{ session, effects: [] }` unchanged. `session: null` means the dialogue ended.

- [x] **Step 1: Write the failing tests**

`packages/pack-dialogue-quests/tests/dialogueCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validConfig } from './fixtures'
import { createQuestLog, acceptQuest } from '../src/questCore'
import { availableChoices, choose, startDialogue } from '../src/dialogueCore'

const config = validConfig()
const dialogue = config.dialogues[0]!
const quests = config.quests
const none = { collected: [] as string[] }
const held = { collected: ['item-1'] }

describe('dialogueCore', () => {
  it('starts at the start node', () => {
    expect(startDialogue(dialogue)).toEqual({ dialogueId: 'dlg-1', nodeId: 'greet' })
  })

  it('filters choices by quest state and inventory (AND semantics)', () => {
    const fresh = createQuestLog(quests)
    const session = startDialogue(dialogue)
    expect(availableChoices(dialogue, session, fresh, none).map((choice) => choice.text))
      .toEqual(['I will help.', 'Bye.'])
    const active = acceptQuest(fresh, 'q-1')
    expect(availableChoices(dialogue, session, active, none).map((choice) => choice.text))
      .toEqual(['Bye.'])
    expect(availableChoices(dialogue, session, active, held).map((choice) => choice.text))
      .toEqual(['Hand it over.', 'Bye.'])
  })

  it('choose advances the session and returns effects; terminal choice ends it', () => {
    const fresh = createQuestLog(quests)
    const session = startDialogue(dialogue)
    const accepted = choose(dialogue, session, 0, fresh, none)
    expect(accepted.session).toEqual({ dialogueId: 'dlg-1', nodeId: 'done' })
    expect(accepted.effects).toEqual([{ kind: 'acceptQuest', questId: 'q-1' }])
    const ended = choose(dialogue, accepted.session!, 0, fresh, none)
    expect(ended.session).toBeNull()
    expect(ended.effects).toEqual([])
  })

  it('out-of-range choice is a no-op', () => {
    const session = startDialogue(dialogue)
    const outcome = choose(dialogue, session, 7, createQuestLog(quests), none)
    expect(outcome.session).toEqual(session)
    expect(outcome.effects).toEqual([])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-dialogue-quests -t dialogueCore`
Expected: FAIL — cannot resolve `../src/dialogueCore`.

- [x] **Step 3: Implement `src/dialogueCore.ts`**

```ts
import type { DialogueChoice, DialogueCondition, DialogueDef, DialogueEffect, DialogueNode } from './config'
import type { InventoryView, QuestLog } from './questCore'

/** Pure dialogue-tree traversal: no DOM, clocks, or RNG. */
export interface DialogueSession { dialogueId: string; nodeId: string }

export function startDialogue(dialogue: DialogueDef): DialogueSession {
  return { dialogueId: dialogue.id, nodeId: dialogue.start }
}

export function currentNode(dialogue: DialogueDef, session: DialogueSession): DialogueNode {
  const node = dialogue.nodes.find((entry) => entry.id === session.nodeId)
  if (!node) throw new Error(`Dialogue "${dialogue.id}" has no node "${session.nodeId}"`)
  return node
}

/** AND over the list; an absent list is vacuously true. */
export function conditionsMet(conditions: readonly DialogueCondition[] | undefined, questLog: QuestLog, inventory: InventoryView): boolean {
  return (conditions ?? []).every((condition) =>
    condition.kind === 'questState'
      ? questLog[condition.questId] === condition.status
      : condition.itemIds.every((itemId) => inventory.collected.includes(itemId)))
}

/** The choices the player actually sees, in authored order. */
export function availableChoices(dialogue: DialogueDef, session: DialogueSession, questLog: QuestLog, inventory: InventoryView): DialogueChoice[] {
  return currentNode(dialogue, session).choices
    .filter((choice) => conditionsMet(choice.conditions, questLog, inventory))
}

export interface ChoiceOutcome { session: DialogueSession | null; effects: readonly DialogueEffect[] }

/** Pick by index into availableChoices; out-of-range is a no-op. */
export function choose(dialogue: DialogueDef, session: DialogueSession, index: number, questLog: QuestLog, inventory: InventoryView): ChoiceOutcome {
  const choice = availableChoices(dialogue, session, questLog, inventory)[index]
  if (!choice) return { session, effects: [] }
  return {
    session: choice.next === null ? null : { dialogueId: dialogue.id, nodeId: choice.next },
    effects: choice.effects ?? []
  }
}
```

Add to `src/index.ts`:

```ts
export * from './dialogueCore'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-dialogue-quests
git commit -m "feat(pack-dialogue-quests): dialogueCore pure traversal with conditioned choices"
```

---

### Task 5: Additive eval-seam extension in game-kit + inventory publishSlices

**Files:**
- Modify: `packages/game-kit/src/packEval.ts`
- Modify: `packages/pack-interaction-inventory/src/evalHook.ts`
- Test: `packages/pack-interaction-inventory/tests/evalHook.test.ts` (extend existing file; create if the eval hook is currently only covered indirectly)

**Interfaces:**
- Produces (consumed by Tasks 6, 10, and 11):

```ts
export type EvalSliceView = Readonly<Record<string, unknown>>
export interface PackEvalHook {
  packId: string
  createState(): unknown
  nextTarget(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): { x: number; z: number } | null
  step(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): unknown
  complete(state: unknown): boolean
  /** Slices this hook's state exposes to other hooks (headless twin of the slice registry). */
  publishSlices?(state: unknown): Record<string, unknown>
}
```

All changes optional/additive — existing hooks compile unchanged.

- [x] **Step 1: Write the failing test**

In `packages/pack-interaction-inventory/tests/evalHook.test.ts` add:

```ts
import { describe, expect, it } from 'vitest'
import { createInventoryEvalHook } from '../src/evalHook'
import { fixtureConfig } from './fixtures'   // existing deterministic config helper

describe('inventory eval hook slices', () => {
  it('publishes the inventory slice from eval state', () => {
    const hook = createInventoryEvalHook(fixtureConfig())
    let state = hook.createState()
    expect(hook.publishSlices!(state)).toEqual({ inventory: { collected: [] } })
    const item = fixtureConfig().items[0]!
    state = hook.step(state, item.position)
    expect(hook.publishSlices!(state)).toEqual({ inventory: { collected: [item.id] } })
  })
})
```

(If `tests/fixtures.ts` exports a differently named helper, use that exact name — read the file first; it exists from cycle 1.)

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project pack-interaction-inventory -t 'eval hook slices'`
Expected: FAIL — `publishSlices` is not a function.

- [x] **Step 3: Implement**

`packages/game-kit/src/packEval.ts` — replace the interface with:

```ts
/**
 * Headless twin of the pack runtime: a pure hook the scripted evaluator drives
 * to complete a pack's objectives deterministically (no DOM, no engine).
 * The optional slices view mirrors the runtime's slice registry: hooks that
 * publish slices make them readable by every other hook each tick.
 */
export type EvalSliceView = Readonly<Record<string, unknown>>

export interface PackEvalHook {
  packId: string
  createState(): unknown
  /** Next waypoint the scripted evaluator should seek; null when satisfied OR blocked on another pack's progress. */
  nextTarget(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): { x: number; z: number } | null
  step(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): unknown
  complete(state: unknown): boolean
  /** Slices this hook's state exposes to other hooks. */
  publishSlices?(state: unknown): Record<string, unknown>
}
```

`packages/pack-interaction-inventory/src/evalHook.ts` — add inside the returned object:

```ts
    publishSlices: (state) => ({ inventory: { collected: [...(state as InventoryState).collected] } })
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-interaction-inventory --project game-kit`
Expected: PASS (new test + all existing).

- [x] **Step 5: Commit**

```bash
git add packages/game-kit packages/pack-interaction-inventory
git commit -m "feat(game-kit): additive eval-seam slice view; inventory hook publishes its slice"
```

---

### Task 6: Dialogue eval hook — greedy headless twin

**Files:**
- Create: `packages/pack-dialogue-quests/src/evalHook.ts`
- Test: `packages/pack-dialogue-quests/tests/evalHook.test.ts`
- Modify: `packages/pack-dialogue-quests/src/index.ts` (add `export * from './evalHook'`)

**Interfaces:**
- Consumes: cores + config from Tasks 2–4; `PackEvalHook`, `EvalSliceView` from `@automata/game-kit`.
- Produces: `createDialogueQuestsEvalHook(config: DialogueQuestsPackConfig): PackEvalHook`. Behavior contract (Task 10's harness relies on it): `nextTarget` returns the giver NPC of the earliest incomplete quest whose next step is actionable now (accept, talk turn-in, or fetch turn-in with items held per the slices view) and **null when every remaining step is blocked** on missing items; `step` runs a full greedy conversation (always the first available choice) when the player is within `talkRadius` of an NPC.

- [x] **Step 1: Write the failing tests**

`packages/pack-dialogue-quests/tests/evalHook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validConfig } from './fixtures'
import { createDialogueQuestsEvalHook } from '../src/evalHook'

const config = validConfig()   // one fetch main quest 'q-1' needing 'item-1', giver npc-1 at (5,5)
const npcPos = config.npcs[0]!.position
const away = { x: -8, z: -8 }
const noSlices = { inventory: { collected: [] as string[] } }
const heldSlices = { inventory: { collected: ['item-1'] } }

describe('dialogue-quests eval hook', () => {
  it('targets the giver to accept, then yields (null) while the fetch is unsatisfied', () => {
    const hook = createDialogueQuestsEvalHook(config)
    let state = hook.createState()
    expect(hook.nextTarget(state, away, noSlices)).toEqual(npcPos)
    state = hook.step(state, npcPos, noSlices)          // greedy visit: accepts q-1
    expect(hook.complete(state)).toBe(false)
    expect(hook.nextTarget(state, away, noSlices)).toBeNull()   // blocked on item-1
  })

  it('targets the giver again once items are held, completes on the second visit', () => {
    const hook = createDialogueQuestsEvalHook(config)
    let state = hook.createState()
    state = hook.step(state, npcPos, noSlices)
    expect(hook.nextTarget(state, away, heldSlices)).toEqual(npcPos)
    state = hook.step(state, npcPos, heldSlices)
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, away, heldSlices)).toBeNull()
  })

  it('does nothing outside talk radius and publishes the questLog slice', () => {
    const hook = createDialogueQuestsEvalHook(config)
    const state = hook.createState()
    expect(hook.step(state, away, noSlices)).toBe(state)
    expect(hook.publishSlices!(state)).toEqual({ questLog: { 'q-1': 'available' } })
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-dialogue-quests -t 'eval hook'`
Expected: FAIL — cannot resolve `../src/evalHook`.

- [x] **Step 3: Implement `src/evalHook.ts`**

```ts
import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import { INVENTORY_SLICE_ID, type DialogueQuestsPackConfig, type QuestDef } from './config'
import { availableChoices, choose, startDialogue } from './dialogueCore'
import {
  acceptQuest, completeQuest, createQuestLog, objectiveSatisfied, questsComplete,
  type InventoryView, type QuestLog
} from './questCore'

interface EvalState { questLog: QuestLog }

const EMPTY_INVENTORY: InventoryView = { collected: [] }
const CONVERSATION_BUDGET = 32

const inventoryView = (slices?: EvalSliceView): InventoryView =>
  (slices?.[INVENTORY_SLICE_ID] as InventoryView | undefined) ?? EMPTY_INVENTORY

/** Earliest quest with an actionable next step: accept, or turn in a satisfied objective. */
function actionableQuest(config: DialogueQuestsPackConfig, log: QuestLog, inventory: InventoryView): QuestDef | null {
  for (const quest of config.quests) {
    if (log[quest.id] === 'available') return quest
    if (log[quest.id] === 'active' && objectiveSatisfied(quest, inventory)) return quest
  }
  return null
}

/**
 * Headless twin of the browser pack. Conversations are atomic here: one step
 * inside talkRadius greedily drives the whole dialogue (always the first
 * available choice — composeSection orders progressing choices first).
 */
export function createDialogueQuestsEvalHook(config: DialogueQuestsPackConfig): PackEvalHook {
  const applyEffects = (log: QuestLog, effects: readonly { kind: string; questId: string }[], inventory: InventoryView): QuestLog => {
    let next = log
    for (const effect of effects) {
      next = effect.kind === 'acceptQuest'
        ? acceptQuest(next, effect.questId)
        : completeQuest(next, effect.questId, config.quests, inventory)
    }
    return next
  }
  return {
    packId: 'dialogue-quests',
    createState: (): EvalState => ({ questLog: createQuestLog(config.quests) }),
    nextTarget(state, _player, slices) {
      const { questLog } = state as EvalState
      if (questsComplete(questLog, config.quests)) return null
      const quest = actionableQuest(config, questLog, inventoryView(slices))
      if (!quest) return null   // blocked on another pack's progress — yield the walk
      const npc = config.npcs.find((entry) => entry.id === quest.giverNpcId)!
      return { ...npc.position }
    },
    step(state, player, slices) {
      const evalState = state as EvalState
      const inventory = inventoryView(slices)
      const npc = config.npcs.find((entry) =>
        Math.hypot(entry.position.x - player.x, entry.position.z - player.z) <= config.talkRadius)
      if (!npc) return state
      const dialogue = config.dialogues.find((entry) => entry.id === npc.dialogueId)!
      let questLog = evalState.questLog
      let session: ReturnType<typeof startDialogue> | null = startDialogue(dialogue)
      for (let turns = 0; session && turns < CONVERSATION_BUDGET; turns += 1) {
        if (availableChoices(dialogue, session, questLog, inventory).length === 0) break
        const outcome = choose(dialogue, session, 0, questLog, inventory)
        questLog = applyEffects(questLog, outcome.effects, inventory)
        session = outcome.session
      }
      return questLog === evalState.questLog ? state : { questLog }
    },
    complete: (state) => questsComplete((state as EvalState).questLog, config.quests),
    publishSlices: (state) => ({ questLog: { ...(state as EvalState).questLog } })
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-dialogue-quests
git commit -m "feat(pack-dialogue-quests): greedy headless eval hook with slice-blocked yielding"
```

---

### Task 7: Seeded composeSection

**Files:**
- Create: `packages/pack-dialogue-quests/src/composeSection.ts`
- Test: `packages/pack-dialogue-quests/tests/composeSection.test.ts`
- Modify: `packages/pack-dialogue-quests/src/index.ts` (add `export * from './composeSection'`)

**Interfaces:**
- Consumes: `SeededRng` from `@automata/engine`; config types from Task 2; `packConfigSchema` for output validation.
- Produces:

```ts
export const DIALOGUE_DEFAULTS = { talkRadius: 2 } as const
export interface DialogueComposeInput {
  specConfig: { talkRadius?: number }
  quests: ReadonlyArray<{ id: string; kind: 'main' | 'side'; summary: string }>   // spec story.quests
  cast: ReadonlyArray<{ id: string; name: string; role: string }>                  // spec cast
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> }  // composed inventory section
}
export function composeDialogueSection(input: DialogueComposeInput, rng: SeededRng): DialogueQuestsPackConfig
```

Guarantees Tasks 10–12 rely on: output parses under `packConfigSchema`; same input + seed ⇒ deep-equal output; in every generated node the progressing choice (accept / turn-in) precedes non-progressing ones; fetch quests reference only ids from `input.inventory.items`.

- [x] **Step 1: Write the failing tests**

`packages/pack-dialogue-quests/tests/composeSection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { packConfigSchema } from '../src/config'
import { composeDialogueSection, type DialogueComposeInput } from '../src/composeSection'

const input = (): DialogueComposeInput => ({
  specConfig: {},
  quests: [
    { id: 'q-main-1', kind: 'main', summary: 'Meet the keeper' },
    { id: 'q-main-2', kind: 'main', summary: 'Recover the lens' },
    { id: 'q-side-1', kind: 'side', summary: 'Chat with the dockhand' }
  ],
  cast: [
    { id: 'c-player', name: 'You', role: 'player' },
    { id: 'c-keeper', name: 'The Keeper', role: 'quest-giver' },
    { id: 'c-dock', name: 'Dockhand', role: 'ally' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: { items: [{ id: 'item-1', position: { x: -2, z: 3 } }] }
})

describe('composeDialogueSection', () => {
  it('is deterministic and schema-valid', () => {
    const a = composeDialogueSection(input(), createSeededRng(7))
    const b = composeDialogueSection(input(), createSeededRng(7))
    expect(a).toEqual(b)
    expect(() => packConfigSchema.parse(a)).not.toThrow()
    expect(a.talkRadius).toBe(2)   // DIALOGUE_DEFAULTS applied here, not in the spec schema
  })

  it('alternates talk/fetch, capping fetch by available items', () => {
    const config = composeDialogueSection(input(), createSeededRng(7))
    const kinds = config.quests.map((quest) => quest.objective.kind)
    expect(kinds).toEqual(['talk', 'fetch', 'talk'])   // one item available → one fetch
    const fetch = config.quests.find((quest) => quest.objective.kind === 'fetch')!
    expect(fetch.objective).toEqual({ kind: 'fetch', itemIds: ['item-1'] })
  })

  it('places NPCs inside the arena, clear of spawn/goal/items/each other', () => {
    const config = composeDialogueSection(input(), createSeededRng(7))
    const points = [input().arena.spawn, input().arena.goal, ...input().inventory.items.map((item) => item.position)]
    for (const npc of config.npcs) {
      expect(Math.abs(npc.position.x)).toBeLessThanOrEqual(11)
      expect(Math.abs(npc.position.z)).toBeLessThanOrEqual(11)
      for (const point of points) {
        expect(Math.hypot(npc.position.x - point.x, npc.position.z - point.z)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('orders progressing choices first in every node (greedy-eval invariant)', () => {
    const config = composeDialogueSection(input(), createSeededRng(7))
    for (const dialogue of config.dialogues) {
      for (const node of dialogue.nodes) {
        const firstPlain = node.choices.findIndex((choice) => !choice.effects)
        const lastEffect = node.choices.reduce((last, choice, index) => (choice.effects ? index : last), -1)
        if (firstPlain !== -1 && lastEffect !== -1) expect(lastEffect).toBeLessThan(firstPlain)
      }
    }
  })

  it('throws when no cast member can give quests', () => {
    const bad = input()
    ;(bad as { cast: unknown }).cast = [{ id: 'c-player', name: 'You', role: 'player' }]
    expect(() => composeDialogueSection(bad, createSeededRng(7))).toThrow(/quest-giver/i)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-dialogue-quests -t composeDialogueSection`
Expected: FAIL — cannot resolve `../src/composeSection`.

- [x] **Step 3: Implement `src/composeSection.ts`**

```ts
import type { SeededRng } from '@automata/engine'
import {
  packConfigSchema,
  type DialogueChoice, type DialogueDef, type DialogueQuestsPackConfig, type NpcDef, type QuestDef
} from './config'

export const DIALOGUE_DEFAULTS = { talkRadius: 2 } as const

export interface DialogueComposeInput {
  specConfig: { talkRadius?: number }
  quests: ReadonlyArray<{ id: string; kind: 'main' | 'side'; summary: string }>
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> }
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const DRAW_BUDGET = 200
const GIVER_ROLES = ['quest-giver', 'ally', 'vendor']

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Fixed per-quest tree: greet(turn-in → accept → bye) / accepted / done. Progressing choices first. */
function questChoices(quest: QuestDef): { greet: DialogueChoice[]; nodes: DialogueDef['nodes'] } {
  const turnInConditions: DialogueChoice['conditions'] = quest.objective.kind === 'fetch'
    ? [{ kind: 'questState', questId: quest.id, status: 'active' }, { kind: 'hasItems', itemIds: quest.objective.itemIds }]
    : [{ kind: 'questState', questId: quest.id, status: 'active' }]
  const doneId = `${quest.id}-done`
  const acceptedId = `${quest.id}-accepted`
  const greet: DialogueChoice[] = [
    { text: `Here about "${quest.title}" — done.`, next: doneId, conditions: turnInConditions, effects: [{ kind: 'completeQuest', questId: quest.id }] },
    { text: `I'll take on "${quest.title}".`, next: acceptedId, conditions: [{ kind: 'questState', questId: quest.id, status: 'available' }], effects: [{ kind: 'acceptQuest', questId: quest.id }] }
  ]
  const nodes: DialogueDef['nodes'] = [
    {
      id: acceptedId, speaker: '', text: quest.objective.kind === 'fetch' ? 'Bring it back when you have it.' : 'Good. That settles it.',
      choices: [
        { text: 'Done already.', next: doneId, conditions: turnInConditions, effects: [{ kind: 'completeQuest', questId: quest.id }] },
        { text: 'On my way.', next: null }
      ]
    },
    { id: doneId, speaker: '', text: 'Well done.', choices: [{ text: 'Bye.', next: null }] }
  ]
  return { greet, nodes }
}

/** Seeded NPC placement + templated per-quest trees; defaults applied here, never in the spec schema. */
export function composeDialogueSection(input: DialogueComposeInput, rng: SeededRng): DialogueQuestsPackConfig {
  const talkRadius = input.specConfig.talkRadius ?? DIALOGUE_DEFAULTS.talkRadius
  const givers = GIVER_ROLES.flatMap((role) => input.cast.filter((member) => member.role === role))
  if (givers.length === 0) throw new Error('composeDialogueSection: cast has no quest-giver (or ally/vendor fallback)')
  const npcCount = Math.min(givers.length, input.quests.length)

  const extent = input.arena.half - WALL_MARGIN
  const keepouts = [input.arena.spawn, input.arena.goal]
  const placed: Array<{ x: number; z: number }> = []
  for (let index = 0; index < npcCount; index += 1) {
    let position: { x: number; z: number } | null = null
    for (let draw = 0; draw < DRAW_BUDGET && !position; draw += 1) {
      const candidate = { x: round2((rng.next() * 2 - 1) * extent), z: round2((rng.next() * 2 - 1) * extent) }
      if (!keepouts.every((point) => far(candidate, point, KEEPOUT))) continue
      if (!input.inventory.items.every((item) => far(candidate, item.position, SEPARATION))) continue
      if (!placed.every((other) => far(candidate, other, SEPARATION))) continue
      position = candidate
    }
    if (!position) throw new Error(`NPC placement budget exhausted: placed ${placed.length}/${npcCount}`)
    placed.push(position)
  }

  // Quests in spec order (chain = mains in order); alternate talk/fetch, fetch capped by items.
  let fetchIndex = 0
  const quests: QuestDef[] = input.quests.map((quest, index) => {
    const wantFetch = index % 2 === 1 && fetchIndex < input.inventory.items.length
    const objective: QuestDef['objective'] = wantFetch
      ? { kind: 'fetch', itemIds: [input.inventory.items[fetchIndex++]!.id] }
      : { kind: 'talk' }
    return {
      id: quest.id, kind: quest.kind, title: quest.summary,
      giverNpcId: `npc-${(index % npcCount) + 1}`, objective
    }
  })

  const npcs: NpcDef[] = placed.map((position, index) => ({
    id: `npc-${index + 1}`, name: givers[index]!.name, position, dialogueId: `dlg-npc-${index + 1}`
  }))
  const dialogues: DialogueDef[] = npcs.map((npc) => {
    const assigned = quests.filter((quest) => quest.giverNpcId === npc.id)
    const parts = assigned.map((quest) => questChoices(quest))
    const greet: DialogueChoice[] = [
      ...parts.flatMap((part) => part.greet),
      { text: 'Just passing through.', next: null }
    ]
    return {
      id: npc.dialogueId, start: 'greet',
      nodes: [
        { id: 'greet', speaker: npc.name, text: `${npc.name} nods at you.`, choices: greet },
        ...parts.flatMap((part) => part.nodes.map((node) => ({ ...node, speaker: npc.name })))
      ]
    }
  })

  return packConfigSchema.parse({ talkRadius, npcs, dialogues, quests })
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/pack-dialogue-quests
git commit -m "feat(pack-dialogue-quests): seeded composeSection with templated quest dialogues"
```

---

### Task 8: Browser pack adapter

**Files:**
- Create: `packages/pack-dialogue-quests/src/pack.ts`
- Test: `packages/pack-dialogue-quests/tests/pack.test.ts`
- Modify: `packages/pack-dialogue-quests/src/index.ts` (add `export * from './pack'`)

**Interfaces:**
- Consumes: everything from Tasks 2–4; `GamePack`, `PackRuntimeHandle`, `packCompatibility` from `@automata/game-kit`.
- Produces: `dialogueQuestsPack: GamePack<DialogueQuestsPackConfig>` with `id: 'dialogue-quests'`, `version: '1.0.0'`, the spec §2.2 compatibility declaration, `configSchema: packConfigSchema`. DOM contract (tests + later e2e rely on): `.quest-hud` (always present), `.dialogue-overlay` (present only while open) containing `.dialogue-text` and one `<li>` per available choice; keydown `'1'`–`'9'` on `window` selects a choice while open.

Behavior detail: hysteresis — the overlay opens when the player is within `talkRadius` of the nearest non-cooldown NPC; it closes (emitting `dialogueEnded`) when the player moves beyond `1.5 × talkRadius` of the engaged NPC or picks a terminal choice; a terminal close puts that NPC on cooldown until the player leaves the 1.5× radius. Nearest NPC wins; ties break by NPC id order. Effects apply through `questCore`, write the `questLog` slice, and emit `questCompleted` per completed quest. The overlay re-renders only on engage, on a choice, and on `itemAcquired` — never per tick.

- [x] **Step 1: Write the failing tests**

`packages/pack-dialogue-quests/tests/pack.test.ts` (mirror the structure of `packages/pack-interaction-inventory/tests/pack.test.ts` — read that file first and reuse its boot helper pattern):

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { composePacks, createGameHost, type GamePack } from '@automata/game-kit'
import { validConfig } from './fixtures'
import { dialogueQuestsPack } from '../src/pack'
import { QUEST_COMPLETED_EVENT, DIALOGUE_ENDED_EVENT } from '../src/config'

/** Boot the pack alongside a stub inventory-slice owner (packs may not import the real inventory pack). */
function boot(config = validConfig(), collected: string[] = []) {
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  const events: Array<{ name: string; payload: unknown }> = []
  const inventoryStub: GamePack = {
    id: 'inventory-stub', version: '1.0.0',
    compatibility: {
      requires: [], conflictsWith: [], integratesWith: [],
      stateSlices: { owns: ['inventory'], reads: [] }, events: { emits: ['itemAcquired'], consumes: [] }
    },
    register(ctx) { ctx.state.register('inventory', 'inventory-stub', { collected }) }
  }
  const patched: GamePack = {
    ...dialogueQuestsPack as GamePack,
    compatibility: { ...dialogueQuestsPack.compatibility, requires: ['inventory-stub'] }
  }
  const runtime = composePacks([inventoryStub, patched], {
    'dialogue-quests': config as unknown as Record<string, unknown>
  }).boot({ host, render: render.port })
  // Track pack events by re-registering a listener pack is not possible post-boot; instead
  // assert via DOM/state. Events are covered through the slice + HUD assertions below.
  const step = (x: number, z: number): void => runtime.fixedUpdate(1 / 60, { playerPosition: { x, z } })
  const key = (digit: string): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: digit }))
  }
  return { app, host, render, runtime, step, key, events }
}
const NPC = { x: 5, z: 5 }

describe('dialogue-quests pack (browser adapter)', () => {
  it('renders NPC markers and a quest HUD on boot', () => {
    const { app, render, host } = boot()
    expect(render.port.objectCount).toBe(1)
    expect(app.querySelector('.quest-hud')?.textContent).toContain('Fetch the relic')
    expect(app.querySelector('.quest-hud')?.textContent).toContain('0/1')
    host.dispose()
    expect(render.port.objectCount).toBe(0)
    app.remove()
  })

  it('opens the overlay in radius, closes past 1.5x radius', () => {
    const { app, step, host } = boot()
    step(NPC.x - 1, NPC.z)
    expect(app.querySelector('.dialogue-overlay')).not.toBeNull()
    step(NPC.x - 1.4, NPC.z)                       // still inside 1.5×2
    expect(app.querySelector('.dialogue-overlay')).not.toBeNull()
    step(NPC.x - 4, NPC.z)
    expect(app.querySelector('.dialogue-overlay')).toBeNull()
    host.dispose(); app.remove()
  })

  it('accepts a quest via number key, filters choices by inventory, completes on a return visit', () => {
    const withItem = boot(validConfig(), ['item-1'])
    withItem.step(NPC.x - 1, NPC.z)
    const choices = [...withItem.app.querySelectorAll('.dialogue-overlay li')].map((li) => li.textContent)
    expect(choices).toEqual(['I will help.', 'Bye.'])   // turn-in hidden: quest not active yet
    withItem.key('1')                                    // accept → advances to the 'done' node
    expect(withItem.app.querySelector('.dialogue-text')?.textContent).toContain('Thanks.')
    withItem.key('1')                                    // 'Bye.' — terminal close, NPC goes on cooldown
    expect(withItem.app.querySelector('.dialogue-overlay')).toBeNull()
    withItem.step(NPC.x - 4, NPC.z)                      // beyond 1.5× radius: cooldown clears
    withItem.step(NPC.x - 1, NPC.z)                      // return visit reopens at greet
    expect([...withItem.app.querySelectorAll('.dialogue-overlay li')][0]!.textContent).toBe('Hand it over.')
    withItem.key('1')                                    // turn in (quest active + items held)
    expect(withItem.runtime.objectivesComplete()).toBe(true)
    expect(withItem.app.querySelector('.quest-hud')?.textContent).toContain('1/1')
    withItem.host.dispose(); withItem.app.remove()
  })

  it('ignores number keys while the overlay is closed', () => {
    const { app, key, runtime, host } = boot()
    key('1')
    expect(runtime.objectivesComplete()).toBe(false)
    expect(app.querySelector('.dialogue-overlay')).toBeNull()
    host.dispose(); app.remove()
  })

  it('save/load round-trips the quest log and closes any open dialogue', () => {
    const { app, step, key, runtime, host } = boot(validConfig(), ['item-1'])
    const fresh = runtime.saveState()
    step(NPC.x - 1, NPC.z); key('1')                     // accept q-1
    const accepted = runtime.saveState()
    expect(accepted['dialogue-quests']).toEqual({ 'q-1': 'active' })
    runtime.loadState(fresh)
    expect(app.querySelector('.dialogue-overlay')).toBeNull()
    expect(app.querySelector('.quest-hud')?.textContent).toContain('0/1')
    runtime.loadState(accepted)
    expect(() => runtime.loadState({ 'dialogue-quests': { 'q-1': 'winning' } })).toThrow()
    host.dispose(); app.remove()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project pack-dialogue-quests -t 'browser adapter'`
Expected: FAIL — cannot resolve `../src/pack`.

- [x] **Step 3: Implement `src/pack.ts`**

```ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  packConfigSchema, DIALOGUE_ENDED_EVENT, INVENTORY_SLICE_ID, ITEM_ACQUIRED_EVENT,
  QUEST_COMPLETED_EVENT, QUEST_LOG_SLICE_ID,
  type DialogueQuestsPackConfig, type NpcDef
} from './config'
import { availableChoices, choose, currentNode, startDialogue, type DialogueSession } from './dialogueCore'
import {
  acceptQuest, activeMainQuest, completeQuest, createQuestLog, deserializeQuestLog,
  questsComplete, serializeQuestLog, type InventoryView, type QuestLog
} from './questCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const NPC_COLOR = '#7c5cff'
const EXIT_FACTOR = 1.5

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** The second standard pack: proximity dialogue + talk/fetch quest log over contract v2. */
export const dialogueQuestsPack: GamePack<DialogueQuestsPackConfig> = {
  id: 'dialogue-quests',
  version: '1.0.0',
  compatibility: packCompatibility({
    requires: ['interaction-inventory'],
    stateSlices: { owns: [QUEST_LOG_SLICE_ID], reads: [INVENTORY_SLICE_ID] },
    events: { emits: [QUEST_COMPLETED_EVENT, DIALOGUE_ENDED_EVENT], consumes: [ITEM_ACQUIRED_EVENT] }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let questLog: QuestLog = createQuestLog(config.quests)
    ctx.state.register(QUEST_LOG_SLICE_ID, dialogueQuestsPack.id, questLog)
    const inventory = (): InventoryView => ctx.state.get(INVENTORY_SLICE_ID) as InventoryView

    for (const npc of config.npcs) {
      const entity = { id: `dialogue-npc-${npc.id}` }
      ctx.render.add(entity, { primitive: 'sphere', radius: 0.5, color: NPC_COLOR })
      ctx.render.setPose(entity, { x: npc.position.x, y: 0.5, z: npc.position.z }, IDENTITY)
      ctx.host.cleanup.defer(() => ctx.render.remove(entity))
    }

    const hud = document.createElement('div')
    hud.className = 'quest-hud'
    ctx.host.overlays.append(hud)
    const updateHud = (): void => {
      const mainsTotal = config.quests.filter((quest) => quest.kind === 'main').length
      const mainsDone = config.quests.filter((quest) => quest.kind === 'main' && questLog[quest.id] === 'complete').length
      const focus = activeMainQuest(questLog, config.quests)
      hud.textContent = `${focus ? focus.title : 'All quests complete'} ${mainsDone}/${mainsTotal}`
    }
    updateHud()

    let engaged: { npc: NpcDef; session: DialogueSession } | null = null
    let cooldownNpcId: string | null = null
    let overlay: HTMLElement | null = null

    const closeOverlay = (emitEnded: boolean): void => {
      if (!overlay) return
      overlay.remove()
      overlay = null
      if (emitEnded && engaged) ctx.events.emit(DIALOGUE_ENDED_EVENT, { packId: dialogueQuestsPack.id, npcId: engaged.npc.id })
      engaged = null
    }

    const renderOverlay = (): void => {
      if (!engaged) return
      const dialogue = config.dialogues.find((entry) => entry.id === engaged!.npc.dialogueId)!
      overlay?.remove()
      overlay = document.createElement('div')
      overlay.className = 'dialogue-overlay'
      const text = document.createElement('p')
      text.className = 'dialogue-text'
      const node = currentNode(dialogue, engaged.session)
      text.textContent = `${node.speaker}: ${node.text}`
      overlay.append(text)
      const list = document.createElement('ol')
      for (const choice of availableChoices(dialogue, engaged.session, questLog, inventory())) {
        const item = document.createElement('li')
        item.textContent = choice.text
        list.append(item)
      }
      overlay.append(list)
      ctx.host.overlays.append(overlay)
    }

    const setQuestLog = (next: QuestLog): void => {
      questLog = next
      ctx.state.set(QUEST_LOG_SLICE_ID, dialogueQuestsPack.id, questLog)
      updateHud()
    }

    const applyEffects = (effects: readonly { kind: string; questId: string }[]): void => {
      for (const effect of effects) {
        const before = questLog
        setQuestLog(effect.kind === 'acceptQuest'
          ? acceptQuest(questLog, effect.questId)
          : completeQuest(questLog, effect.questId, config.quests, inventory()))
        if (effect.kind === 'completeQuest' && questLog !== before) {
          ctx.events.emit(QUEST_COMPLETED_EVENT, { packId: dialogueQuestsPack.id, questId: effect.questId })
        }
      }
    }

    const onKeydown = (event: KeyboardEvent): void => {
      if (!engaged) return
      const index = Number.parseInt(event.key, 10) - 1
      if (Number.isNaN(index) || index < 0 || index > 8) return
      const dialogue = config.dialogues.find((entry) => entry.id === engaged!.npc.dialogueId)!
      const outcome = choose(dialogue, engaged.session, index, questLog, inventory())
      applyEffects(outcome.effects)
      if (outcome.session === null) {
        cooldownNpcId = engaged.npc.id
        closeOverlay(true)
      } else if (outcome.session !== engaged.session) {
        engaged = { npc: engaged.npc, session: outcome.session }
        renderOverlay()
      }
    }
    window.addEventListener('keydown', onKeydown)
    const offItemAcquired = ctx.events.on(ITEM_ACQUIRED_EVENT, () => { if (engaged) renderOverlay() })

    return {
      fixedUpdate(_dt, world) {
        const player = world.playerPosition
        if (engaged) {
          // No per-tick re-render: the overlay changes only on choice or itemAcquired.
          if (distance(player, engaged.npc.position) > config.talkRadius * EXIT_FACTOR) closeOverlay(true)
          return
        }
        if (cooldownNpcId) {
          const cooldownNpc = config.npcs.find((npc) => npc.id === cooldownNpcId)!
          if (distance(player, cooldownNpc.position) > config.talkRadius * EXIT_FACTOR) cooldownNpcId = null
        }
        const nearest = config.npcs
          .filter((npc) => npc.id !== cooldownNpcId && distance(player, npc.position) <= config.talkRadius)
          .sort((a, b) => distance(player, a.position) - distance(player, b.position) || a.id.localeCompare(b.id))[0]
        if (nearest) {
          const dialogue = config.dialogues.find((entry) => entry.id === nearest.dialogueId)!
          engaged = { npc: nearest, session: startDialogue(dialogue) }
          renderOverlay()
        }
      },
      objectivesComplete: () => questsComplete(questLog, config.quests),
      saveState: () => serializeQuestLog(questLog),
      loadState(raw) {
        const restored = deserializeQuestLog(raw, config.quests)
        closeOverlay(false)
        cooldownNpcId = null
        setQuestLog(restored)
      },
      dispose() {
        window.removeEventListener('keydown', onKeydown)
        offItemAcquired()
        closeOverlay(false)
        hud.remove()
      }
    }
  }
}
```

Add to `src/index.ts`:

```ts
export * from './pack'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: PASS. If the boot-helper details (host/render APIs) drift from the inventory pack's tests, match that file — it is the source of truth for the harness pattern.

- [x] **Step 5: Commit**

```bash
git add packages/pack-dialogue-quests
git commit -m "feat(pack-dialogue-quests): browser adapter - overlay, quest HUD, slices + events"
```

---

### Task 9: Editor contribution

**Files:**
- Create: `packages/pack-dialogue-quests/src/editorContribution.ts`
- Test: `packages/pack-dialogue-quests/tests/editorContribution.test.ts`
- Modify: `packages/pack-dialogue-quests/src/index.ts` (add `export { dialogueQuestsEditorContribution } from './editorContribution'`)

**Interfaces:**
- Consumes: `PackEditorContribution` from `@automata/game-kit`; `packConfigSchema`.
- Produces: `dialogueQuestsEditorContribution: PackEditorContribution` with `packId: 'dialogue-quests'`, `prefabs: []`, `createPreview` drawing one marker per NPC.

- [x] **Step 1: Write the failing test**

`packages/pack-dialogue-quests/tests/editorContribution.test.ts` (mirror `packages/pack-interaction-inventory/tests/editorContribution.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { validConfig } from './fixtures'
import { dialogueQuestsEditorContribution } from '../src/editorContribution'

describe('dialogue-quests editor contribution', () => {
  it('ships no prefabs (NPCs are composition-owned) and previews NPC markers', () => {
    expect(dialogueQuestsEditorContribution.prefabs).toEqual([])
    const render = createNullRenderer()
    const handle = dialogueQuestsEditorContribution.createPreview!(validConfig(), render.port)
    expect(render.port.objectCount).toBe(1)
    handle.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('rejects malformed config', () => {
    const render = createNullRenderer()
    expect(() => dialogueQuestsEditorContribution.createPreview!({ nope: true }, render.port)).toThrow()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project pack-dialogue-quests -t 'editor contribution'`
Expected: FAIL — cannot resolve `../src/editorContribution`.

- [x] **Step 3: Implement `src/editorContribution.ts`**

```ts
import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const NPC_COLOR = '#7c5cff'

/**
 * Thin editor preview: markers for composed NPCs. prefabs is empty on purpose —
 * NPCs are composition-owned, not scene-authored (same reasoning as inventory
 * items; faking scene authorship would be a silent capability gap).
 */
export const dialogueQuestsEditorContribution: PackEditorContribution = {
  packId: 'dialogue-quests',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities = parsed.npcs.map((npc) => ({ id: `preview-dialogue-npc-${npc.id}` }))
    parsed.npcs.forEach((npc, index) => {
      const entity = entities[index]!
      render.add(entity, { primitive: 'sphere', radius: 0.5, color: NPC_COLOR })
      render.setPose(entity, { x: npc.position.x, y: 0.5, z: npc.position.z }, IDENTITY)
    })
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
```

- [x] **Step 4: Run tests, commit**

Run: `npx vitest run --project pack-dialogue-quests`
Expected: PASS.

```bash
git add packages/pack-dialogue-quests
git commit -m "feat(pack-dialogue-quests): thin editor contribution (preview markers, no prefabs)"
```

---

### Task 10: Registry registration + matrix harness slice threading

**Files:**
- Modify: `packages/pack-registry/package.json` (add `"@automata/pack-dialogue-quests": "*"` to dependencies)
- Modify: `packages/pack-registry/src/index.ts`
- Modify: `packages/pack-registry/tests/compositionMatrix.test.ts` (driveToCompletion only)
- Test: `packages/pack-registry/tests/registry.test.ts`

**Interfaces:**
- Consumes: the whole `@automata/pack-dialogue-quests` surface; `EvalSliceView` from Task 5.
- Produces: `STANDARD_PACKS['dialogue-quests']`, `PACK_FIXTURES['dialogue-quests']`, eval-hook + editor-contribution entries. The pair loop in the matrix stops being vacuous and must pass.

- [ ] **Step 1: Write the failing registry tests**

In `packages/pack-registry/tests/registry.test.ts`, update the exact-set assertion and add fixture coverage:

```ts
  it('exposes exactly the packs that exist (two, as of Phase 4 cycle 2)', () => {
    expect(Object.keys(STANDARD_PACKS)).toEqual(['interaction-inventory', 'dialogue-quests'])
  })

  it('dialogue-quests fixture is deterministic, schema-valid, and references the inventory fixture items', () => {
    const first = PACK_FIXTURES['dialogue-quests']!() as { quests: Array<{ objective: { kind: string; itemIds?: string[] } }> }
    expect(PACK_FIXTURES['dialogue-quests']!()).toEqual(first)
    const inventoryItems = (PACK_FIXTURES['interaction-inventory']!() as { items: Array<{ id: string }> }).items.map((item) => item.id)
    for (const quest of first.quests) {
      if (quest.objective.kind === 'fetch') {
        for (const itemId of quest.objective.itemIds!) expect(inventoryItems).toContain(itemId)
      }
    }
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --project pack-registry`
Expected: FAIL — `STANDARD_PACKS` has one key; no dialogue fixture.

- [ ] **Step 3: Register the pack**

In `packages/pack-registry/src/index.ts` add imports and entries:

```ts
import {
  composeDialogueSection, createDialogueQuestsEvalHook, dialogueQuestsEditorContribution,
  dialogueQuestsPack, packConfigSchema as dialogueConfigSchema
} from '@automata/pack-dialogue-quests'
import { createSeededRng } from '@automata/engine'
```

```ts
export const STANDARD_PACKS: Record<string, GamePack> = {
  [interactionInventoryPack.id]: interactionInventoryPack as GamePack,
  [dialogueQuestsPack.id]: dialogueQuestsPack as GamePack
}
```

Fixture — derived from the inventory fixture via the seeded composeSection so item references can never drift:

```ts
  [dialogueQuestsPack.id]: () => composeDialogueSection({
    specConfig: {},
    quests: [
      { id: 'q-main-1', kind: 'main', summary: 'Meet the keeper' },
      { id: 'q-main-2', kind: 'main', summary: 'Recover the relic' }
    ],
    cast: [
      { id: 'c-keeper', name: 'The Keeper', role: 'quest-giver' },
      { id: 'c-dock', name: 'Dockhand', role: 'quest-giver' }
    ],
    arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
    inventory: { items: (PACK_FIXTURES['interaction-inventory']!() as { items: Array<{ id: string; position: { x: number; z: number } }> }).items }
  }, createSeededRng(42))
```

(Declare `PACK_FIXTURES` with the inventory entry first, then `PACK_FIXTURES[dialogueQuestsPack.id] = …` immediately after, so the self-reference resolves.)

Eval hook + editor contribution entries:

```ts
const EVAL_HOOK_BUILDERS: Record<string, (config: unknown) => PackEvalHook> = {
  [interactionInventoryPack.id]: (config) => createInventoryEvalHook(packConfigSchema.parse(config)),
  [dialogueQuestsPack.id]: (config) => createDialogueQuestsEvalHook(dialogueConfigSchema.parse(config))
}

const EDITOR_CONTRIBUTIONS: Record<string, PackEditorContribution> = {
  [inventoryEditorContribution.packId]: inventoryEditorContribution,
  [dialogueQuestsEditorContribution.packId]: dialogueQuestsEditorContribution
}
```

- [ ] **Step 4: Thread slices through the matrix walker**

In `packages/pack-registry/tests/compositionMatrix.test.ts`, replace `driveToCompletion` with:

```ts
/** Scripted walk: seek the first incomplete hook WITH a target (null = blocked, yields), threading published slices. */
function driveToCompletion(hooks: PackEvalHook[], maxSteps = 2000): boolean {
  const states = new Map(hooks.map((hook) => [hook.packId, hook.createState()]))
  const player = { x: -8, z: -8 }
  for (let step = 0; step < maxSteps; step += 1) {
    const slices: Record<string, unknown> = {}
    for (const hook of hooks) Object.assign(slices, hook.publishSlices?.(states.get(hook.packId)) ?? {})
    const incomplete = hooks.filter((hook) => !hook.complete(states.get(hook.packId)))
    if (incomplete.length === 0) return true
    for (const hook of incomplete) {
      const target = hook.nextTarget(states.get(hook.packId), player, slices)
      if (!target) continue
      const dx = target.x - player.x
      const dz = target.z - player.z
      const dist = Math.hypot(dx, dz)
      const stride = Math.min(0.5, dist)
      if (dist > 0) { player.x += (dx / dist) * stride; player.z += (dz / dist) * stride }
      break
    }
    for (const hook of hooks) states.set(hook.packId, hook.step(states.get(hook.packId), player, slices))
  }
  return hooks.every((hook) => hook.complete(states.get(hook.packId)))
}
```

- [ ] **Step 5: Run the full matrix + registry suites**

Run: `npx vitest run --project pack-registry`
Expected: PASS — including “every declared-compatible pair composes, boots, and completes headlessly” now exercising inventory+dialogue for real. If the pair times out at maxSteps, debug with the composeSection greedy-invariant test before touching the walker.

- [ ] **Step 6: Commit**

```bash
git add packages/pack-registry package-lock.json
git commit -m "feat(pack-registry): register dialogue-quests; thread eval slices through the matrix"
```

---

### Task 11: Thread eval slices through the production evaluator

Task 10 fixed only the test twin. The real self-check path is `evaluateProject` — generated from `tools/scaffold/src/templates/projectFiles.ts` and checked in per game at `games/<name>/src/project/evaluation.ts` — which resolves hooks via `resolveEvalHooks(composition)` and today calls `nextTarget`/`step` with no slice view. Left alone, any composed game with a fetch quest drives the dialogue hook against an empty inventory forever and the MCP `evaluate` gate ends `incomplete` — the exact cross-pack seam this cycle exists to prove.

**Files:**
- Modify: `tools/scaffold/src/templates/projectFiles.ts` (the walker loop inside `evaluateProject` in the template string)
- Modify: `games/first-light/src/project/evaluation.ts` (checked-in template copy)
- Modify: `games/monkey-ball/src/project/evaluation.ts` (same)
- Modify: `games/pulsebreak/src/project/evaluation.ts` (same)
- Test: `games/first-light/tests/project/evaluation.test.ts` (create)

**Interfaces:**
- Consumes: `PackEvalHook.publishSlices` (Task 5); `PACK_FIXTURES`, `resolveEvalHooks` from `@automata/pack-registry` (Task 10).
- Produces: `evaluateProject` merges every hook's published slices each tick and passes the view to every `nextTarget`/`step` call. Public signature unchanged; hook-less and single-pack games behave identically.

- [ ] **Step 1: Write the failing test**

`games/first-light/tests/project/evaluation.test.ts` — mirror the snapshot/composition fixture patterns already used in `tests/project/editor.test.ts` and `tests/project/composition.test.ts` (read both first; reuse their helpers rather than inventing new ones):

```ts
import { describe, expect, it } from 'vitest'
import { PACK_FIXTURES } from '@automata/pack-registry'
import { evaluateProject } from '../../src/project/evaluation'
// snapshot + composition helpers: reuse the ones editor.test.ts / composition.test.ts use

describe('evaluateProject cross-pack slices', () => {
  it('completes an inventory + dialogue composition headlessly (fetch unblocks via slices)', async () => {
    const composition = compositionWith([
      { id: 'interaction-inventory', version: '1.0.0', config: PACK_FIXTURES['interaction-inventory']!() },
      { id: 'dialogue-quests', version: '1.0.0', config: PACK_FIXTURES['dialogue-quests']!() }
    ])
    const result = await evaluateProject(loadSnapshot(), { maxSteps: 20000 }, composition)
    expect(result.metrics.objectivesComplete).toBe(true)
  })
})
```

(`compositionWith`/`loadSnapshot` are stand-ins for whatever those files actually export — match them exactly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project first-light -t 'cross-pack slices'`
Expected: FAIL — `objectivesComplete` is `false`: without slices the dialogue hook sees an empty inventory, its fetch quest never satisfies, and `nextTarget` yields null until `maxSteps`.

- [ ] **Step 3: Implement**

In `tools/scaffold/src/templates/projectFiles.ts`, replace the walker loop inside `evaluateProject` with:

```ts
  while (steps < maxSteps && state.status === 'running') {
    const slices: Record<string, unknown> = {}
    for (let index = 0; index < hooks.length; index += 1) {
      Object.assign(slices, hooks[index]!.publishSlices?.(hookStates[index]) ?? {})
    }
    let target: { x: number; z: number } | null = null
    for (let index = 0; index < hooks.length && target === null; index += 1) {
      target = hooks[index]!.nextTarget(hookStates[index], state.position, slices)
    }
    const control = target ? seekPoint(state, target) : seekGoal(state, compiled.tuning)
    let next = step(state, control, dt, compiled.tuning)
    if (next.status === 'succeeded' && !hooksComplete()) next = { ...next, status: 'running' }
    state = next
    for (let index = 0; index < hooks.length; index += 1) {
      hookStates[index] = hooks[index]!.step(hookStates[index], state.position, slices)
    }
    steps += 1
  }
```

Apply the identical change to the three checked-in copies (`games/{first-light,monkey-ball,pulsebreak}/src/project/evaluation.ts`) — they must stay in lockstep with the template; diff each against the template body after editing. (Editing `games/first-light/src/project` is fine: the freeze covers compose output under `public/project`, not scaffold sources.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project first-light && npm run verify:new-game`
Expected: PASS — new test green, existing first-light project tests untouched, and `verify:new-game` green (AGENTS.md requires it after any scaffold-template change).

- [ ] **Step 5: Commit**

```bash
git add tools/scaffold games/first-light games/monkey-ball games/pulsebreak
git commit -m "feat(scaffold): thread eval slices through evaluateProject (template + game copies)"
```

---

### Task 12: Ordered sections in game-compose + first-light freeze proof

**Files:**
- Modify: `packages/game-compose/package.json` (add `"@automata/pack-dialogue-quests": "*"`)
- Modify: `packages/game-compose/src/compose.ts`
- Test: `packages/game-compose/tests/compose.test.ts`

**Interfaces:**
- Consumes: `composeDialogueSection`, `dialogueQuestsPack` from the new package; existing `composeGame` contract.
- Produces: `composeGame` accepts specs selecting `interaction-inventory` alone (unchanged output — bit-identical) or `interaction-inventory` + `dialogue-quests` (composition gains a second pack entry). Other capabilities still fail with `compose-unsupported-capability`. RNG draw order: goal → icon hues → item placements → **NPC placements last**.

- [ ] **Step 1: Write the failing tests**

Add to `packages/game-compose/tests/compose.test.ts` (reuse the file's existing spec fixture helper; extend it with a `dialogue-quests` capability entry — read the file first for the helper's exact name/shape):

```ts
  it('composes inventory + dialogue-quests with ordered sections', () => {
    const spec = specWithCapabilities([
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'dialogue-quests', config: {}, requirements: [] }
    ])
    const result = composeGame({ spec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.composition.packs.map((entry) => entry.id)).toEqual(['interaction-inventory', 'dialogue-quests'])
    const dialogueConfig = result.composition.packs[1]!.config as { quests: Array<{ objective: { kind: string; itemIds?: string[] } }> }
    const itemIds = (result.composition.packs[0]!.config as { items: Array<{ id: string }> }).items.map((item) => item.id)
    for (const quest of dialogueConfig.quests) {
      if (quest.objective.kind === 'fetch') {
        for (const id of quest.objective.itemIds!) expect(itemIds).toContain(id)
      }
    }
  })

  it('inventory-only output is byte-identical to the pre-dialogue compose (first-light freeze)', () => {
    const spec = specWithCapabilities([{ id: 'interaction-inventory', config: {}, requirements: [] }])
    const result = composeGame({ spec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Golden assertion: capture result.files as a snapshot BEFORE modifying compose.ts
    // (run this test against the unmodified composeGame first and inline the snapshot).
    expect(result.files).toMatchSnapshot()
  })

  it('still rejects capabilities without a composed pack', () => {
    const spec = specWithCapabilities([
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'combat-ai', config: {}, requirements: [] }
    ])
    const result = composeGame({ spec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues[0]!.code).toBe('compose-unsupported-capability')
  })
```

**Order of operations matters:** commit the snapshot test FIRST against the unmodified `composeGame` (it records today's byte-exact output), THEN modify `composeGame` — the snapshot then proves the freeze.

- [ ] **Step 2: Run new tests — snapshot passes (recorded), pair test fails**

Run: `npx vitest run --project game-compose`
Expected: pair test FAILS (`compose-unsupported-capability`); snapshot recorded green.

- [ ] **Step 3: Implement ordered sections in `compose.ts`**

Changes to `packages/game-compose/src/compose.ts`:

```ts
import { composeDialogueSection, dialogueQuestsPack } from '@automata/pack-dialogue-quests'
```

Replace the unsupported-capability guard and pack assembly:

```ts
  const SUPPORTED = new Set<string>([interactionInventoryPack.id, dialogueQuestsPack.id])
  const unsupported = spec.capabilities.filter((entry) => !SUPPORTED.has(entry.id))
  if (unsupported.length > 0) {
    return {
      ok: false,
      issues: unsupported.map((entry) => ({
        code: 'compose-unsupported-capability',
        message: `Phase 4 cycle 2 composes only [${[...SUPPORTED].join(', ')}]; spec selects "${entry.id}"`
      }))
    }
  }
  const wantsDialogue = spec.capabilities.some((entry) => entry.id === dialogueQuestsPack.id)
  const selectedPacks = wantsDialogue ? [interactionInventoryPack, dialogueQuestsPack] : [interactionInventoryPack]
  const packIssues = validatePackSet(selectedPacks as GamePack[]).filter((issue) => issue.severity === 'error')
```

(Import `type GamePack` from `@automata/game-kit`.) `validatePackSet` now also enforces `dialogue-quests requires interaction-inventory` mechanically.

After the existing inventory `packConfig` block (all existing RNG draws untouched), append the dialogue section — **only when selected**, so inventory-only draws are unchanged:

```ts
  const inventorySelection = spec.capabilities.find((entry) => entry.id === interactionInventoryPack.id)!
  const packs: CompositionManifest['packs'] = [
    { id: interactionInventoryPack.id, version: interactionInventoryPack.version, config: packConfig as unknown as Record<string, unknown> }
  ]
  if (wantsDialogue) {
    const dialogueSelection = spec.capabilities.find((entry) => entry.id === dialogueQuestsPack.id)!
    const dialogueConfig = composeDialogueSection({
      specConfig: dialogueSelection.config as { talkRadius?: number },
      quests: spec.story.quests,
      cast: spec.cast,
      arena: { half: ARENA.half, spawn: ARENA.spawn, goal },
      inventory: { items: packConfig.items }
    }, rng)
    packs.push({ id: dialogueQuestsPack.id, version: dialogueQuestsPack.version, config: dialogueConfig as unknown as Record<string, unknown> })
  }
```

and use `packs` in the composition literal (`packs,` instead of the inline single-entry array). Note the existing code selects the inventory capability as `spec.capabilities[0]!` — replace that with the explicit `inventorySelection` lookup above so capability order in the spec no longer matters.

- [ ] **Step 4: Run tests to verify all pass (snapshot must NOT change)**

Run: `npx vitest run --project game-compose`
Expected: PASS — pair test green, snapshot green (byte-identical), unsupported test green.

- [ ] **Step 5: Run the checked-in first-light regression**

Run: `npx vitest run --project first-light`
Expected: PASS — the checked-in `games/first-light/public/project/composition.json` still matches its recompose.

- [ ] **Step 6: Commit**

```bash
git add packages/game-compose package-lock.json
git commit -m "feat(game-compose): ordered pack sections - dialogue composes over the inventory section"
```

---

### Task 13: Full gates + roadmap/docs closeout

**Files:**
- Modify: `docs/ROADMAP.md` (Phase 4 cycle list)

- [ ] **Step 1: Run every gate**

```bash
npm run ci                 # lint + typecheck + full vitest
npm run verify:new-game    # clean scaffold acceptance
npx playwright test        # e2e including first-light slice/smoke
```

Expected: all green. Fix forward anything red before proceeding — do not skip a gate.

- [ ] **Step 2: Update the roadmap**

In `docs/ROADMAP.md` under Phase 4 Cycles, change:

```markdown
  - Cycle 2 — branching dialogue & quests pack — `In progress`.
```

to (fill in the actual merge/ship commit once known; if shipping directly on main, use the closeout commit):

```markdown
  - Cycle 2 — branching dialogue & quests pack — `Shipped` (2026-07-16, plan:
    [`2026-07-16-phase-4-cycle-2-dialogue-quests.md`](superpowers/plans/active/2026-07/week-29/2026-07-16-phase-4-cycle-2-dialogue-quests.md)).
  - Cycle 3 — schedules & relationships pack — `Next`.
```

(Cycle 3's line replaces its current `Planned` entry.)

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: Phase 4 cycle 2 shipped - dialogue & quests pack"
```

---

## Self-review notes (already applied)

- **Spec coverage:** §2.1→Task 1; §2.2/§2.3→Tasks 2, 8; §3.1→Task 3; §3.2→Task 4; §3.3→Task 8; §4.1→Tasks 7, 12; §4.2→Tasks 5, 6, 10, 11; §5→Tasks 9, 10; §6→every task's test steps + Task 13 gates; §7 risks→greedy invariant test (Task 7), minimal ordered-section change (Task 12), tie-break/closed-overlay tests (Task 8).
- **Deviation from spec noted:** the config uses `conditions?: DialogueCondition[]` (AND-list) rather than a single condition — fetch turn-ins need `questState AND hasItems`. The spec is amended alongside this plan.
- **Type consistency:** `validConfig()` fixture lives in `tests/fixtures.ts` (never a test file — importing one re-registers its describes) and is reused by Tasks 4, 6, 8, 9; slice/event names come only from `src/config.ts` constants; `EvalSliceView` defined once in Task 5 and consumed in Tasks 6, 10, 11.
- **Known look-before-you-code spots** (flagged in-task): inventory `tests/fixtures.ts` helper name (Task 5), inventory `tests/pack.test.ts` boot-helper pattern (Task 8), first-light `tests/project` snapshot/composition helpers (Task 11), game-compose spec fixture helper (Task 12).
- **Post-review fixes (2026-07-16):** production `evaluateProject` slice threading added as Task 11 — the matrix walker alone left the real `evaluate` gate blind to cross-pack slices; Task 8's completion test rewritten as a two-visit cooldown flow (the single-visit 'Done already.' path exists only in composeSection's generated trees, not in `validConfig`); the overlay now renders on engage/choice/`itemAcquired` instead of every tick.
