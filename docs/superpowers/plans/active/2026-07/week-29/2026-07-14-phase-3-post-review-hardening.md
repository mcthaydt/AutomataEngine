# Phase 3 Post-Review Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three reproduced Phase 3 review defects so content identity hashes exact bytes, compose writes cannot traverse symlinks, and incomplete rollback never destroys the last recoverable original.

**Architecture:** Preserve the current snapshot, session, and compose interfaces. Harden the two filesystem seams in place: add a raw-byte hashing primitive beneath `snapshotFiles`, then extend the composed-writer filesystem port with symlink inspection and explicit rollback-error aggregation.

**Tech Stack:** TypeScript, Node filesystem and crypto APIs, Vitest, existing `@automata/build-session` and editor MCP server packages.

**Spec:** `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-3-post-review-hardening-design.md`

**Overall progress:** 0% (Tasks 1–3 pending)

## Global Constraints

- Keep snapshot keys and the persisted `Record<string, string>` shape unchanged.
- Hash exact file bytes without extension-based behavior.
- Reject symbolic links in any existing component from the game root through an output target.
- Validate the complete output set before staging any temporary file.
- Never delete a backup whose restoration failed.
- Keep composition, asset manifest, session, and compose output formats unchanged.
- Use TDD and commit each verified task.

---

### Task 1: Hash exact snapshot bytes

**Files:**
- Modify: `packages/build-session/src/hash.ts`
- Modify: `packages/build-session/src/files.ts`
- Test: `packages/build-session/tests/files.test.ts`
- Modify: this plan file as steps complete.

**Interfaces:**
- Produces: `hashBytes(bytes: Uint8Array): string`.
- Preserves: `hashText(text: string): string`, implemented through `hashBytes`.
- Changes: `snapshotFiles` reads `Buffer` values and hashes them through `hashBytes`.

- [x] **Step 1: Write failing binary snapshot regressions**

Add two tests to `packages/build-session/tests/files.test.ts`:

```ts
it('hashes distinct invalid UTF-8 byte sequences differently', async () => {
  const root = await makeTree()
  await writeFile(join(root, 'src/first.bin'), Buffer.from([0xff]))
  await writeFile(join(root, 'src/second.bin'), Buffer.from([0xfe]))
  const snapshot = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
  expect(snapshot['src/first.bin']).not.toBe(snapshot['src/second.bin'])
})

it('reports a binary-only byte mutation as changed', async () => {
  const root = await makeTree()
  const asset = join(root, 'src/asset.bin')
  await writeFile(asset, Buffer.from([0xff]))
  const before = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
  await writeFile(asset, Buffer.from([0xfe]))
  const after = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
  expect(diffFiles(before, after).changed).toContain('src/asset.bin')
})
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```bash
npx vitest run --project build-session -t 'invalid UTF-8|binary-only byte mutation'
```

Expected: both tests fail because `readFile(path, 'utf8')` converts both byte sequences to the replacement character before hashing.

- [x] **Step 3: Implement byte-oriented hashing**

In `packages/build-session/src/hash.ts`, add:

```ts
export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function hashText(text: string): string {
  return hashBytes(Buffer.from(text))
}
```

In `packages/build-session/src/files.ts`, import `hashBytes` and replace the text read with:

```ts
out[key] = hashBytes(await readFile(path))
```

- [x] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run --project build-session
```

Expected: the complete build-session project passes.

- [x] **Step 5: Commit**

Mark Task 1 complete in this plan, then run:

```bash
git add packages/build-session docs/superpowers/plans/active/2026-07/week-29/2026-07-14-phase-3-post-review-hardening.md
git commit -m "fix(build-session): hash snapshot file bytes"
```

---

### Task 2: Reject symlink traversal before compose staging

**Files:**
- Modify: `tools/editor-mcp-server/src/composedWriter.ts`
- Test: `tools/editor-mcp-server/tests/composedWriter.test.ts`
- Modify: this plan file as steps complete.

**Interfaces:**
- Changes: `ComposedWriterFs` adds `lstat(path): Promise<{ isSymbolicLink(): boolean }>`.
- Produces: an internal validation helper that rejects symbolic links from the game root through every output target.

- [ ] **Step 1: Write failing symlink containment regressions**

Add separate tests to `tools/editor-mcp-server/tests/composedWriter.test.ts`:

```ts
it('rejects a symlinked target parent before writing outside the game root', async () => {
  const base = await root()
  const gameRoot = join(base, 'game')
  const outside = join(base, 'outside')
  await fs.mkdir(gameRoot)
  await fs.mkdir(outside)
  await fs.symlink(outside, join(gameRoot, 'public'))
  await expect(writeComposedFiles(gameRoot, [
    { path: 'public/escaped.txt', text: 'escaped' }
  ])).rejects.toThrow(/symbolic link/i)
  expect(await exists(join(outside, 'escaped.txt'))).toBe(false)
})

it('rejects an existing target symlink before staging', async () => {
  const base = await root()
  const gameRoot = join(base, 'game')
  await fs.mkdir(join(gameRoot, 'public'), { recursive: true })
  const outside = join(base, 'outside.txt')
  await writeFile(outside, 'outside-original')
  await fs.symlink(outside, join(gameRoot, 'public/item.txt'))
  await expect(writeComposedFiles(gameRoot, [
    { path: 'public/item.txt', text: 'replacement' }
  ])).rejects.toThrow(/symbolic link/i)
  await expect(readFile(outside, 'utf8')).resolves.toBe('outside-original')
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx vitest run --project editor-mcp-server -t 'symlinked target parent|target symlink'
```

Expected: the parent-symlink test writes outside the game root, and the target-symlink test does not reject before staging.

- [ ] **Step 3: Implement symlink validation**

Import `lstat` from `node:fs/promises`, then extend the port and default implementation:

```ts
export interface ComposedWriterFs {
  access(path: string): Promise<void>
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
  rename(from: string, to: string): Promise<void>
  rm(path: string, options: { force: true }): Promise<void>
  writeFile(path: string, text: string): Promise<void>
}

const nodeFs: ComposedWriterFs = { access, lstat, mkdir, rename, rm, writeFile }
```

Add the validator:

```ts
async function assertNoSymbolicLinks(fs: ComposedWriterFs, gameRoot: string, target: string): Promise<void> {
  const paths = [gameRoot]
  let current = gameRoot
  for (const segment of relative(gameRoot, target).split(sep)) {
    current = join(current, segment)
    paths.push(current)
  }
  for (const path of paths) {
    try {
      if ((await fs.lstat(path)).isSymbolicLink()) throw new Error(`Composed file path contains a symbolic link: ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}
```

Run validation for the complete set after lexical containment and duplicate checks, but before the first `mkdir` or temporary `writeFile` call:

```ts
for (const entry of staged) await assertNoSymbolicLinks(fs, gameRoot, entry.target)
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run --project editor-mcp-server
```

Expected: the complete editor MCP server project passes.

- [ ] **Step 5: Commit**

Mark Task 2 complete in this plan, then run:

```bash
git add tools/editor-mcp-server docs/superpowers/plans/active/2026-07/week-29/2026-07-14-phase-3-post-review-hardening.md
git commit -m "fix(editor-mcp): reject symlinked compose paths"
```

---

### Task 3: Preserve unrestored backups and close verification

**Files:**
- Modify: `tools/editor-mcp-server/src/composedWriter.ts`
- Test: `tools/editor-mcp-server/tests/composedWriter.test.ts`
- Modify: this plan file as steps complete.

**Interfaces:**
- Changes: failed rollback throws `AggregateError` when any cleanup or restoration operation also fails.
- Guarantee: a backup is removed only by successful rename restoration or successful post-commit cleanup.

- [ ] **Step 1: Write the failing rollback-preservation regression**

Add to `tools/editor-mcp-server/tests/composedWriter.test.ts`:

```ts
it('preserves a backup and aggregates errors when restoration fails', async () => {
  const gameRoot = await root()
  await fs.mkdir(join(gameRoot, 'public'))
  const first = join(gameRoot, 'public/first.txt')
  const second = join(gameRoot, 'public/second.txt')
  await writeFile(first, 'first-original')
  await writeFile(second, 'second-original')
  let renames = 0
  const injected: ComposedWriterFs = {
    ...fs,
    async rename(from, to) {
      renames += 1
      if (renames === 4) throw new Error('commit failed')
      if (renames === 5) throw new Error('restore failed')
      await fs.rename(from, to)
    }
  }
  const error = await writeComposedFiles(gameRoot, [
    { path: 'public/first.txt', text: 'first-new' },
    { path: 'public/second.txt', text: 'second-new' }
  ], injected).catch((reason: unknown) => reason)
  expect(error).toBeInstanceOf(AggregateError)
  expect((error as AggregateError).errors.map((value) => String(value))).toEqual(expect.arrayContaining([
    expect.stringContaining('commit failed'),
    expect.stringContaining('restore failed')
  ]))
  await expect(readFile(first, 'utf8')).resolves.toBe('first-original')
  const debris = (await fs.readdir(join(gameRoot, 'public'))).filter((name) => name.includes('.tmp-') || name.includes('.bak-'))
  expect(debris).toHaveLength(1)
  await expect(readFile(join(gameRoot, 'public', debris[0]!), 'utf8')).resolves.toBe('second-original')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run --project editor-mcp-server -t 'preserves a backup and aggregates errors'
```

Expected: the writer throws only the commit error and deletes the second original backup.

- [ ] **Step 3: Implement safe rollback aggregation**

Replace the commit catch body with:

```ts
} catch (commitError) {
  const rollbackErrors: unknown[] = []
  const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
    try { await operation() } catch (error) { rollbackErrors.push(error) }
  }
  for (const entry of [...staged].reverse()) {
    if (entry.installed) await attempt(() => fs.rm(entry.target, { force: true }))
    if (entry.backupCreated) {
      try {
        await fs.rename(entry.backup, entry.target)
        entry.backupCreated = false
      } catch (error) {
        rollbackErrors.push(error)
      }
    }
    await attempt(() => fs.rm(entry.temporary, { force: true }))
  }
  if (rollbackErrors.length > 0) {
    throw new AggregateError([commitError, ...rollbackErrors], 'Compose commit failed and rollback was incomplete')
  }
  throw commitError
}
```

Keep the successful rollback and successful commit cleanup paths unchanged.

- [ ] **Step 4: Verify GREEN and focused integration**

Run:

```bash
npx vitest run --project build-session --project editor-mcp-server
```

Expected: both projects pass, including the existing successful rollback test.

- [ ] **Step 5: Run full repository verification**

Run in order:

```bash
npm run ci
npm run coverage
npm run verify:new-game
git diff --check
```

Expected: all commands exit 0; coverage remains at least 90% for lines and branches.

- [ ] **Step 6: Close the tracker and commit**

Set `Overall progress` to `100% (Tasks 1–3 complete; all release gates verified)`, mark every checkbox complete, then run:

```bash
git add tools/editor-mcp-server docs/superpowers/plans/active/2026-07/week-29/2026-07-14-phase-3-post-review-hardening.md
git commit -m "fix(editor-mcp): preserve backups on rollback failure"
```

---

## Exit criteria mapping

| Design requirement | Plan task |
|---|---|
| Raw-byte content hashing | Task 1 |
| Binary asset mutation detection | Task 1 |
| Symlinked parent and target rejection | Task 2 |
| Validate before staging | Task 2 |
| Preserve unrestored backups | Task 3 |
| Aggregate commit and rollback failures | Task 3 |
| Full repository verification | Task 3 |
