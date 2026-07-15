# Phase 3 Vertical-Slice Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase 3 slice reports and decisions provably current, contain all compose writes beneath the target game, and record compose completion only after durable persistence.

**Architecture:** Preserve the existing composition and session formats. Harden the seams in place: safe contract IDs plus writer containment, complete game-directory snapshots, check results stamped with content identity, lineage-aware evidence assembly, and a staged rollback-capable composed-file writer invoked inside new seeded steps.

**Tech Stack:** TypeScript, zod v4, Vitest, Node filesystem APIs, existing `@automata/build-session` and editor MCP abstractions.

**Spec:** `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-3-vertical-slice-hardening-design.md`

**Overall progress:** 0% (Tasks 1–5 pending)

## Global Constraints

- Use strict zod object roots and reject unknown keys.
- Keep composition and asset manifest `formatVersion: 1`; checked-in `first-light` bytes must not change.
- Old session documents remain readable; old check results lacking current-hash metadata are stale for checkpoint purposes.
- No composed path may resolve outside `games/<gameId>`.
- A failed new compose write records no completed `compose:game` step and persists a typed `compose-failed` finding.
- Follow red-green-refactor for every behavior change and commit after each task.
- Final gates: `npm run ci`, `npm run coverage`, `npm run verify:new-game`, `npx playwright test`.

---

### Task 1: Strict contracts and path-safe asset IDs

**Files:**
- Modify: `packages/contracts/src/gameSpec.ts`
- Modify: `packages/contracts/src/composeTools.ts`
- Test: `packages/contracts/tests/gameSpec.test.ts`
- Test: `packages/contracts/tests/composition.test.ts`

**Interfaces:**
- Produces: `assetRequirementIdSchema`, a lowercase path-safe identifier matching `/^[a-z][a-z0-9-]*$/` with maximum length 60.
- Changes: every `composeToolArgSchemas` root becomes `z.strictObject`.

- [x] **Step 1: Write failing contract regressions**

Add to `packages/contracts/tests/gameSpec.test.ts`:

```ts
it('rejects asset ids that can become unsafe output paths', () => {
  const draft = firstLightGameSpecDraft()
  ;(draft.assets as Array<{ id: string }>)[0]!.id = '../../../other-game/icon'
  expect(gameSpecDraftSchema.safeParse(draft).success).toBe(false)
})
```

Add to `packages/contracts/tests/composition.test.ts`:

```ts
it('rejects unknown compose tool arguments', () => {
  expect(() => parseComposeToolArgs('composeGame', { gameId: 'probe', extra: true })).toThrow()
  expect(() => parseComposeToolArgs('renderSliceReport', { gameId: 'probe', extra: true })).toThrow()
  expect(() => parseComposeToolArgs('recordSliceDecision', {
    gameId: 'probe', decision: 'approve', reason: 'green', extra: true
  })).toThrow()
})
```

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run --project contracts -t 'unsafe output paths|unknown compose tool arguments'`

Expected: both regressions fail because traversal IDs parse and zod strips unknown keys.

- [x] **Step 3: Implement the minimal contract hardening**

In `gameSpec.ts`:

```ts
export const assetRequirementIdSchema = z.string().min(1).max(60).regex(/^[a-z][a-z0-9-]*$/)

export const assetRequirementSchema = z.strictObject({
  id: assetRequirementIdSchema,
  kind: z.enum(['model', 'texture', 'audio', 'music', 'ui']),
  description: z.string().min(1).max(400)
})
```

In `composeTools.ts`, replace each `z.object({...})` root with `z.strictObject({...})`.

- [x] **Step 4: Verify GREEN**

Run: `npx vitest run --project contracts --project game-spec --project editor-mcp-server`

Expected: all affected projects pass.

- [x] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "fix(contracts): contain compose ids and reject unknown args"
```

---

### Task 2: Stale checks whenever known content changes

**Files:**
- Modify: `packages/build-session/src/engine.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts`
- Test: `packages/build-session/tests/engine.test.ts`
- Test: `tools/editor-mcp-server/tests/sessionChecks.test.ts`

**Interfaces:**
- Changes: `SessionEngine.noteContentHash(hash)` marks completed `check:*` steps stale when the prior non-null known hash differs.
- Ordering contract: check hosts call `noteContentHash(currentHash)` before recording a new check at that hash.

- [x] **Step 1: Write the failing invalidation test**

Add to `packages/build-session/tests/engine.test.ts`:

```ts
it('marks completed checks stale when an in-session content hash changes', async () => {
  const { engine } = await makeEngine()
  await engine.noteContentHash('h1')
  await engine.runGuarded('check:build', { contentHash: 'h1' }, async () => ({
    ok: true, output: { passed: true }
  }))
  await engine.noteContentHash('h2')
  expect(engine.session.steps.find((step) => step.kind === 'check:build')?.status).toBe('stale')
})
```

Extend `sessionChecks.test.ts` so an authored project change followed by a new build leaves the new build completed, not immediately stale.

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run --project build-session --project editor-mcp-server -t 'in-session content hash changes|new build remains current'`

Expected: the engine test reports `completed`; after the engine fix alone, the host ordering test exposes a newly recorded check being staled.

- [x] **Step 3: Implement invalidation and correct host ordering**

Implement `noteContentHash` as:

```ts
async noteContentHash(hash) {
  if (session.lastKnownContentHash !== null && session.lastKnownContentHash !== hash) {
    for (const step of session.steps) {
      if (step.kind.startsWith('check:') && step.status === 'completed') step.status = 'stale'
    }
  }
  session.lastKnownContentHash = hash
  await save()
}
```

In `executeCheckTool` and `handleEvaluate`, snapshot and call `noteContentHash(hash)` before `runCheck` / `runGuarded`. Remove the redundant post-check call.

- [x] **Step 4: Verify GREEN**

Run: `npx vitest run --project build-session --project editor-mcp-server`

Expected: both projects pass.

- [x] **Step 5: Commit**

```bash
git add packages/build-session tools/editor-mcp-server
git commit -m "fix(build-session): stale checks on known content changes"
```

---

### Task 3: Complete game content identity and check provenance

**Files:**
- Modify: `packages/build-session/src/checks.ts`
- Modify: `tools/editor-mcp-server/src/sessionHost.ts`
- Test: `packages/build-session/tests/checks.test.ts`
- Test: `tools/editor-mcp-server/tests/sessionChecks.test.ts`

**Interfaces:**
- Persisted spawned-check result adds `contentHash: string` and `scope: string | null`.
- Persisted evaluate result adds `contentHash: string`.
- `contentSnapshot(gameId)` snapshots `games/<gameId>` as label `game`, inheriting `snapshotFiles` exclusions.

- [x] **Step 1: Write failing provenance and asset-snapshot tests**

In `checks.test.ts`, assert the stored `check:test` step result contains the input content hash and scope.

In `sessionChecks.test.ts`, after `openProject`, modify only
`games/probe/public/assets/item.svg`, reopen, and expect
`outOfBandChanges: true` plus stale prior checks. Also assert changed-file keys use
`game/public/assets/item.svg`.

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run --project build-session --project editor-mcp-server -t 'records check provenance|asset-only changes'`

Expected: check result lacks metadata and asset-only changes are invisible.

- [x] **Step 3: Implement complete snapshots and provenance**

Change `contentSnapshot` to:

```ts
const contentSnapshot = async (gameId: string) => {
  const files = await snapshotFiles([{ label: 'game', dir: join(repoRoot, 'games', gameId) }])
  return { files, hash: hashJson(files) }
}
```

Update all callers. In `runCheck`, store:

```ts
output: {
  passed: !timedOut && exitCode === 0,
  exitCode, timedOut, tail: tail(combined),
  contentHash,
  scope: opts.scope ?? null
}
```

In `handleEvaluate`, merge `contentHash: hash` into the stored object result while preserving the existing tool response fields.

- [x] **Step 4: Verify GREEN**

Run: `npx vitest run --project build-session --project editor-mcp-server`

Expected: both projects pass with updated changed-file expectations.

- [x] **Step 5: Commit**

```bash
git add packages/build-session tools/editor-mcp-server
git commit -m "fix(editor-mcp): hash complete game content and check provenance"
```

---

### Task 4: Bind slice evidence to current lineage and gates

**Files:**
- Modify: `tools/editor-mcp-server/src/composeTools.ts`
- Test: `tools/editor-mcp-server/tests/composeFlow.test.ts`
- Test: `tools/editor-mcp-server/tests/composeTools.test.ts`

**Interfaces:**
- Changes: `sliceCheckpointStatus(engine, { specHash, compositionHash, contentHash })`.
- `assembleEvidence` snapshots current content before gate classification.
- Matching composition requires completed `compose:game` with `composition.source.specHash === currentSpecHash`.
- Passing gate requires matching stored `contentHash`; test additionally requires `scope === null`.

- [ ] **Step 1: Write failing end-to-end regressions**

Add separate tests that prove:

```ts
// v2 cannot report or approve against v1 composition.
await compileVersion2()
expect(await host.executeTool('renderSliceReport', { gameId: 'probe' })).toMatchObject({ ok: false })

// After v2 design approval and compose, v1 gates are stale until rerun.
await approveVersion2AndCompose()
const report = await host.executeTool('renderSliceReport', { gameId: 'probe' })
expect((report.content as { gates: Array<{ status: string }> }).gates.every(
  (gate) => gate.status === 'stale'
)).toBe(true)

// A focused test step cannot satisfy the release test gate.
await host.executeTool('runTests', { gameId: 'probe', scope: 'one case' })
expect(testGateStatus(await host.executeTool('renderSliceReport', { gameId: 'probe' }))).toBe('stale')
```

Add a unit-style assertion that identical spec/composition hashes with a changed content hash return `pending` from `sliceCheckpointStatus`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run --project editor-mcp-server -t 'current composition|current gate provenance|content hash differs'`

Expected: old composition and old/scoped gates are accepted; status ignores content.

- [ ] **Step 3: Implement lineage and gate matching**

Compute `specHash` before composition lookup. Reject unless design is approved.
Search backward for a completed compose step whose composition source matches
`specHash`. Snapshot current content, call `engine.noteContentHash(contentHash)`,
then classify each latest step:

```ts
const result = record.result as {
  passed?: boolean
  outcome?: string
  contentHash?: string
  scope?: string | null
} | undefined
if (result?.contentHash !== contentHash) return { kind, status: 'stale', stepId: record.id }
if (kind === 'test' && result.scope !== null) return { kind, status: 'stale', stepId: record.id }
```

Require `passed === true` for spawned checks and `outcome === 'passed'` for evaluate.
Include `contentHash` in `sliceCheckpointStatus` matching and in its compose response call.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run --project editor-mcp-server`

Expected: all editor MCP tests pass, including both former checkpoint bypasses.

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server
git commit -m "fix(editor-mcp): bind slice approval to current lineage and gates"
```

---

### Task 5: Root-contained staged compose persistence

**Files:**
- Create: `tools/editor-mcp-server/src/composedWriter.ts`
- Modify: `tools/editor-mcp-server/src/composeTools.ts`
- Test: `tools/editor-mcp-server/tests/composedWriter.test.ts`
- Test: `tools/editor-mcp-server/tests/composeTools.test.ts`
- Modify: this plan file as steps complete.

**Interfaces:**
- Produces: `writeComposedFiles(root: string, files: readonly { path: string; text: string }[]): Promise<void>`.
- `ComposeToolDeps` gains optional `writeFiles`, defaulting to `writeComposedFiles`, for deterministic failure injection.

- [ ] **Step 1: Write failing writer and runner regressions**

Writer tests:

```ts
await expect(writeComposedFiles(gameRoot, [
  { path: 'public/assets/../../../other.svg', text: 'bad' }
])).rejects.toThrow(/outside game root/i)
expect(await exists(join(root, 'other.svg'))).toBe(false)
```

Create two existing target files, inject a commit failure after the first
replacement, and assert both original texts remain and no `.tmp-`/`.bak-` files
remain.

Runner test: inject `writeFiles: async () => { throw new Error('disk full') }`,
then assert `composeGame` returns `{ code: 'compose-failed' }`, the session has a
`compose-failed` finding, and no completed `compose:game` step exists.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run --project editor-mcp-server -t 'composed writer|write failure records no compose step'`

Expected: writer module is missing and the runner records the seeded step before failure.

- [ ] **Step 3: Implement the staged writer**

`writeComposedFiles` must:

1. resolve every target and reject when `relative(root, target)` is absolute or
   starts with `..`;
2. reject duplicate normalized targets;
3. create parent directories and write every temporary file before committing;
4. rename existing targets to unique backups, then rename staged files into place;
5. on error, restore backups and remove staged/replaced files in reverse order;
6. on success, remove backups.

Use `randomUUID()` suffixes and Node `access`, `mkdir`, `rename`, `rm`, and
`writeFile`. Export a narrow filesystem dependency only if required by the
rollback test.

- [ ] **Step 4: Record new compose steps only after persistence**

For a cache miss, call `writeFiles` inside the `runSeededStep` callback after
pure compose succeeds and before returning its deterministic output. For a cache
hit, call `writeFiles` with the recorded deterministic output to preserve repair
behavior. Catch `ComposeFailure` and all filesystem errors in one boundary,
persist the first typed issue or `compose-failed`, and return an error result.

- [ ] **Step 5: Verify GREEN and parity**

Run: `npx vitest run --project editor-mcp-server --project game-compose --project first-light`

Expected: all pass; `first-light` compose-parity remains byte-identical.

- [ ] **Step 6: Full release verification**

Run in order:

```bash
npm run ci
npm run coverage
npm run verify:new-game
npx playwright test
git diff --check
```

Expected: all commands exit 0; coverage remains at least 90% lines and branches.

- [ ] **Step 7: Close the tracker and commit**

Set `Overall progress` to `100% (Tasks 1–5 complete; all release gates verified)`
and mark every checkbox complete.

```bash
git add tools/editor-mcp-server docs/superpowers/plans/active/2026-07/week-29/2026-07-14-phase-3-vertical-slice-hardening.md
git commit -m "fix(editor-mcp): make compose persistence contained and durable"
```

---

## Exit criteria mapping

| Design requirement | Plan task |
|---|---|
| Current approved spec and matching composition | Task 4 |
| Gates bound to current content and unscoped test | Tasks 2–4 |
| Complete game content identity | Task 3 |
| Content-aware checkpoint status | Task 4 |
| Safe asset IDs and strict MCP contracts | Task 1 |
| Root-contained staged writes and typed failures | Task 5 |
| Old sessions readable but old gates stale | Tasks 3–4 |
| Full repository verification | Task 5 |
