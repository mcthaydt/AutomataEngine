# Chat Overlay Preview / Confirm (M16c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat-driven authoring usable end-to-end: after the agent edits a sandbox doc, show the proposed changes as a **batch diff** and only mutate the live document when the human clicks **Apply** — applying the whole batch as a single, undoable command.

**Architecture:** Adds one new editor action `commandBatch` that the document reducer applies **atomically** (all-or-nothing) and records as **one** undo entry, so an approved diff is a single undo step on the normal `store.dispatch` path. A pure `diffDocs` helper compares the live doc against the sandbox doc by `SceneModel.listItems` and classifies items as added/removed/modified. The chat overlay's `renderProposal` seam (left in place by M16a-3) is replaced to render that diff plus an Apply button that dispatches `commandBatch`.

**Tech Stack:** TypeScript (ES2022, ESM, strict), `@automata/contracts`, vanilla DOM (happy-dom in tests), Vitest ^4.1.8.

Builds on M16a-1 ([contracts](2026-06-18-editor-mcp-tuning-m16.md)), M16a-2 ([agent-core](2026-06-21-m16a-2-agent-core.md)), and M16a-3 ([editor host + chat shell](2026-06-21-m16a-3-editor-host-chat-shell.md)). Follow-on: M16b ([tuning loop](2026-06-21-m16b-tuning-loop.md)) reuses `commandBatch` + `diffDocs` to present its net tuning diff with a score delta. Full design: [`2026-06-21-editor-mcp-tuning-design.md`](../../../../specs/archive/2026-06/week-25/2026-06-21-editor-mcp-tuning-design.md).

## Global Constraints

- Apply must go through the **normal undoable command path** (`store.dispatch`) and be a **single undo step** — not `loadDoc` (which clears undo history) and not N separate `command` dispatches (which create N undo steps).
- Apply is **atomic**: if any command in the batch fails to apply (`CommandError`) against the current live doc, the whole batch is rejected and the live doc is unchanged.
- The live store is mutated **only** on Apply. The diff preview reads the sandbox doc produced by the agent run (`EditorToolHost.doc`) versus the current live doc; it never mutates either.
- `diffDocs` stays generic over `Doc` and game-agnostic (reaches items only through `GameDefinition.scene.listItems`).
- The 90% line/branch coverage gate over `packages/editor/src/**` must stay green.

---

### Task 1: `commandBatch` action — atomic, single-undo-step apply

**Files:**
- Modify: `packages/editor/src/state/actions.ts` (add the action)
- Modify: `packages/editor/src/state/document.ts` (handle it)
- Create/Modify: `packages/editor/tests/state/document.test.ts` (add `commandBatch` cases)

**Interfaces:**
- Consumes: `SceneCommand` (already imported in `actions.ts`); `CommandError`, `UNDO_LIMIT`, `dirtyOf` semantics from `document.ts`.
- Produces: `EditorAction` variant `{ type: 'commandBatch'; commands: SceneCommand[] }`, handled by `createDocumentReducer`.

- [x] **Step 1: Write the failing test**

Append to `packages/editor/tests/state/document.test.ts` (keep existing tests; add the imports it needs if absent):

```ts
import { createDocumentReducer, initialDocument } from '../../src/state/document'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('document reducer — commandBatch', () => {
  const reducer = createDocumentReducer<FakeDoc>(fakeDefinition.scene)
  const start = () => initialDocument(fakeDefinition.scene)

  it('applies every command as a single undo step', () => {
    const next = reducer(start(), {
      type: 'commandBatch',
      commands: [
        { type: 'addItem', item: boxItem('a') },
        { type: 'addItem', item: boxItem('b') }
      ]
    })
    expect(next.doc.items).toHaveLength(2)
    expect(next.past).toHaveLength(1)
  })

  it('aborts the whole batch when any command fails (no partial apply)', () => {
    const before = start()
    const next = reducer(before, {
      type: 'commandBatch',
      commands: [
        { type: 'addItem', item: boxItem('a') },
        // fakeScene throws CommandError for setItemField — the batch must roll back entirely.
        { type: 'setItemField', id: 'a', path: 'pos.x', value: 1 }
      ]
    })
    expect(next).toBe(before)
  })

  it('is a no-op for an empty batch', () => {
    const before = start()
    expect(reducer(before, { type: 'commandBatch', commands: [] })).toBe(before)
  })

  it('undo reverts the entire batch in one step', () => {
    const applied = reducer(start(), {
      type: 'commandBatch',
      commands: [{ type: 'addItem', item: boxItem('a') }, { type: 'addItem', item: boxItem('b') }]
    })
    expect(reducer(applied, { type: 'undo' }).doc.items).toHaveLength(0)
  })
})
```

> If `document.test.ts` already imports `describe/it/expect`, do not re-import them; add only the `createDocumentReducer`/`initialDocument`/fixtures imports it lacks.

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/state/document.test.ts`
Expected: FAIL (the reducer ignores `commandBatch`, so `addItem` items are not added and `past` is empty; the type also errors until Step 3).

- [x] **Step 3: Add the action type**

In `packages/editor/src/state/actions.ts`, add the variant to the `EditorAction` union, immediately after the `command` line:

```ts
  | { type: 'command'; command: SceneCommand }
  | { type: 'commandBatch'; commands: SceneCommand[] }
```

- [x] **Step 4: Handle it in the document reducer**

In `packages/editor/src/state/document.ts`, add a `case 'commandBatch'` to the reducer switch, immediately after the existing `case 'command'` block:

```ts
      case 'commandBatch': {
        if (action.commands.length === 0) return state
        let next = state.doc
        try {
          for (const command of action.commands) next = scene.apply(next, command)
        } catch (error) {
          if (error instanceof CommandError) return state // atomic: reject the whole batch
          throw error
        }
        if (next === state.doc) return state
        const past = [...state.past, state.doc].slice(-UNDO_LIMIT)
        return { ...state, doc: next, dirty: dirtyOf(state, next), past, future: [] }
      }
```

> `scene`, `CommandError`, `UNDO_LIMIT`, and the `dirtyOf` helper are already in scope in `document.ts` (used by the existing `command` case). No new imports are needed.

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/state/document.test.ts`
Expected: PASS (existing tests + 4 new `commandBatch` tests).

- [x] **Step 6: Commit**

```bash
git add packages/editor/src/state/actions.ts packages/editor/src/state/document.ts \
  packages/editor/tests/state/document.test.ts
git commit -m "feat(editor): commandBatch action — atomic, single undo step"
```

---

### Task 2: `diffDocs` — item-level before→after diff

**Files:**
- Create: `packages/editor/src/agent/diff.ts`
- Create: `packages/editor/tests/agent/diff.test.ts`
- Modify: `packages/editor/src/index.ts` (export the diff)

**Interfaces:**
- Consumes: `GameDefinition` from `../model/gameDefinition`; `SceneItem` from `../model/types`.
- Produces:
  - Types: `ItemChange`, `DocDiff`.
  - Value: `diffDocs<Doc>(definition, before, after): DocDiff`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/agent/diff.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { diffDocs } from '../../src/agent/diff'
import { boxItem, fakeDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('diffDocs', () => {
  it('classifies added, removed, and modified items', () => {
    const before: FakeDoc = { title: 't', items: [boxItem('keep'), boxItem('gone'), boxItem('move', 0, 0)] }
    const after: FakeDoc = { title: 't', items: [boxItem('keep'), boxItem('move', 5, 5), boxItem('new')] }
    const diff = diffDocs(fakeDefinition, before, after)
    expect(diff.addedCount).toBe(1)
    expect(diff.removedCount).toBe(1)
    expect(diff.modifiedCount).toBe(1)
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        { id: 'new', kind: 'added', label: 'box' },
        { id: 'gone', kind: 'removed', label: 'box' },
        { id: 'move', kind: 'modified', label: 'box' }
      ])
    )
  })

  it('reports no changes for identical docs', () => {
    const doc: FakeDoc = { title: 't', items: [boxItem('a')] }
    expect(diffDocs(fakeDefinition, doc, { title: 't', items: [boxItem('a')] }).changes).toHaveLength(0)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/agent/diff.test.ts`
Expected: FAIL ("Cannot find module '../../src/agent/diff'").

- [x] **Step 3: Implement the diff**

`packages/editor/src/agent/diff.ts`:

```ts
import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'

export interface ItemChange {
  id: string
  kind: 'added' | 'removed' | 'modified'
  /** The item's kind, for a human-readable label. */
  label: string
}

export interface DocDiff {
  changes: ItemChange[]
  addedCount: number
  removedCount: number
  modifiedCount: number
}

function itemsEqual(a: SceneItem, b: SceneItem): boolean {
  // listItems builds items deterministically, so structural JSON equality is exact here.
  return JSON.stringify(a) === JSON.stringify(b)
}

export function diffDocs<Doc>(definition: GameDefinition<Doc>, before: Doc, after: Doc): DocDiff {
  const beforeItems = new Map(definition.scene.listItems(before).map((item) => [item.id, item]))
  const afterItems = new Map(definition.scene.listItems(after).map((item) => [item.id, item]))
  const changes: ItemChange[] = []

  for (const [id, item] of afterItems) {
    const prev = beforeItems.get(id)
    if (!prev) changes.push({ id, kind: 'added', label: item.kind })
    else if (!itemsEqual(prev, item)) changes.push({ id, kind: 'modified', label: item.kind })
  }
  for (const [id, item] of beforeItems) {
    if (!afterItems.has(id)) changes.push({ id, kind: 'removed', label: item.kind })
  }

  return {
    changes,
    addedCount: changes.filter((c) => c.kind === 'added').length,
    removedCount: changes.filter((c) => c.kind === 'removed').length,
    modifiedCount: changes.filter((c) => c.kind === 'modified').length
  }
}
```

- [x] **Step 4: Export from the editor barrel**

In `packages/editor/src/index.ts`, add after the `editorToolHost` export:

```ts
export * from './agent/diff'
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/agent/diff.test.ts`
Expected: PASS (2 tests).

- [x] **Step 6: Commit**

```bash
git add packages/editor/src/agent/diff.ts packages/editor/tests/agent/diff.test.ts packages/editor/src/index.ts
git commit -m "feat(editor): diffDocs — item-level before/after diff"
```

---

### Task 3: Wire preview/confirm into the chat overlay

**Files:**
- Modify: `packages/editor/src/ui/chatOverlay.ts` (replace `renderProposal`)
- Modify: `packages/editor/src/ui/theme.css.ts` (diff + apply styles)
- Modify: `packages/editor/tests/ui/chatOverlay.test.ts` (assert diff + Apply behavior)

**Interfaces:**
- Consumes: `diffDocs` from `../agent/diff`; `core.store.dispatch({ type: 'commandBatch', commands })`.
- Produces: the chat overlay renders a `.ed-chat-diff` block with per-item rows and an `.ed-chat-apply` button that applies the batch on the undoable path.

- [x] **Step 1: Update the test to expect the diff + Apply**

In `packages/editor/tests/ui/chatOverlay.test.ts`, replace the tail of the first test (`'sends a prompt and renders the assistant reply + proposed-change count'`). Replace this block:

```ts
    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('add a box near the goal')
    expect(log).toContain('added a box')
    expect(log).toContain('1 proposed change')
    // The live store must be untouched (no apply yet).
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(1)
    panel.dispose()
```

with:

```ts
    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('add a box near the goal')
    expect(log).toContain('added a box')
    // A batch diff is shown; the live store is untouched until Apply.
    expect(parent.querySelector('.ed-chat-diff')).not.toBeNull()
    expect(log).toContain('added box (b)')
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(1)

    const pastBefore = editor.store.getState().document.past.length
    parent.querySelector<HTMLButtonElement>('.ed-chat-apply')!.click()
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(2)
    expect(editor.store.getState().document.past.length).toBe(pastBefore + 1) // single undo step
    editor.store.dispatch({ type: 'undo' })
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(1)
    panel.dispose()
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/ui/chatOverlay.test.ts`
Expected: FAIL (`.ed-chat-diff` / `.ed-chat-apply` not found — the old `renderProposal` only prints a count).

- [x] **Step 3: Replace `renderProposal` in the overlay**

In `packages/editor/src/ui/chatOverlay.ts`, add the diff import after the existing `../agent/settings` import:

```ts
import { diffDocs } from '../agent/diff'
```

Replace the existing `renderProposal` definition:

```ts
  // renderProposal is the seam M16c replaces with the batch-diff + Apply UI.
  const renderProposal = (output: ChatRunOutput<Doc>): void => {
    const n = output.host.commands.length
    appendMessage('proposal', `${n} proposed change${n === 1 ? '' : 's'} (apply/confirm coming in M16c)`)
  }
```

with:

```ts
  // Render the agent's sandbox edits as a batch diff; the live store mutates only on Apply.
  const renderProposal = (output: ChatRunOutput<Doc>): void => {
    const commands = output.host.commands
    const diff = diffDocs(core.definition, currentDoc, output.host.doc)

    const block = document.createElement('div')
    block.className = 'ed-chat-msg ed-chat-diff'
    block.dataset.role = 'diff'

    const summary = document.createElement('div')
    summary.className = 'ed-chat-diff-summary'
    summary.textContent =
      commands.length === 0
        ? 'No changes proposed.'
        : `${commands.length} command${commands.length === 1 ? '' : 's'}: +${diff.addedCount} ~${diff.modifiedCount} -${diff.removedCount}`
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
```

- [x] **Step 4: Add diff + apply styles**

In `packages/editor/src/ui/theme.css.ts`, append the following rules to the end of the `SLATE_PRO_CSS` template literal (immediately before its closing backtick):

```css
.ed-chat-diff { display: flex; flex-direction: column; gap: 3px; }
.ed-chat-diff-summary { color: var(--ink-dim); font-size: 11px; }
.ed-chat-diff-row { font-family: ui-monospace, monospace; font-size: 11px; padding-left: 6px; }
.ed-chat-diff-added { color: var(--ok); }
.ed-chat-diff-removed { color: var(--bad); }
.ed-chat-diff-modified { color: var(--accent); }
.ed-chat-apply { align-self: flex-start; margin-top: 4px; padding: 4px 12px; background: var(--panel-2);
  border: 1px solid #2f394e; border-radius: 5px; box-shadow: inset 0 1px 0 var(--bevel); }
.ed-chat-apply:disabled { color: var(--ink-dim); cursor: default; }
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/ui/chatOverlay.test.ts`
Expected: PASS (3 tests; the second and third overlay tests are unchanged and still pass).

- [x] **Step 6: Full verification (typecheck, lint, coverage)**

Run: `npm run typecheck && npm run lint && npm run coverage`
Expected: PASS, coverage gate green.

- [x] **Step 7: Commit**

```bash
git add packages/editor/src/ui/chatOverlay.ts packages/editor/src/ui/theme.css.ts \
  packages/editor/tests/ui/chatOverlay.test.ts
git commit -m "feat(editor): chat overlay preview/confirm — batch diff + apply (single undo)"
```

---

## Self-Review

- **Spec coverage:** Implements the spec's M16c: the chat overlay "previews proposed commands as a diff before applying (never auto-mutates without confirmation)." Apply dispatches a single `commandBatch` through `store.dispatch` (the normal undoable path in `host.ts`) and is one undo step (Task 1). The diff is `before→after` item-level (Task 2, Task 3). The **score-delta** half of "before→after + score delta" is deferred to M16b: the tuning loop computes fitness via `runHeadlessPlay` and reuses this same `diffDocs` + `commandBatch` machinery to present its net diff with a score improvement — the chat-authoring path does not auto-run headless play on every proposal (it would spin up the physics engine on each turn).
- **Placeholder scan:** No TBD/TODO; the two "if already imported, don't re-import" notes are real conditions tied to the existing `document.test.ts`, not placeholders. Every code step is complete.
- **Type consistency:** `commandBatch` carries `commands: SceneCommand[]`, matching `EditorToolHost.commands` (M16a-3) and what the overlay passes. `diffDocs(definition, before, after) → DocDiff { changes: ItemChange[], addedCount, removedCount, modifiedCount }` matches its test and the overlay's usage. `ChatRunOutput<Doc> { result, host }` and the `renderProposal(output)` seam are exactly as M16a-3 defined them. `CommandError`/`UNDO_LIMIT`/`dirtyOf` reuse the existing `document.ts` symbols.
