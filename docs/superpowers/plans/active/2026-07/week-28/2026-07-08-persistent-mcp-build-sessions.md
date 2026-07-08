# Persistent MCP Build Sessions (P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Progress: 11% — 1/9 tasks complete.**

> Execution note (this repo): individual packages have no `test` script and the tool package is named `editor-mcp-server`, so the plan's `npm test -w @automata/…` commands are run instead as `npx vitest run <pattern>` from the repo root, and typecheck as `npm run typecheck -w tools/editor-mcp-server`.

**Goal:** Turn the editor MCP server's `--workspace` mode into a durable build-session host: one long-lived server, one session per repo, that can open/swap a project, persist edits to disk, run and cache build/test/browser/evaluate, and resume across process resets without replaying successful work.

**Architecture:** `public/project` stays the live source of truth (write-through on every edit); a new `.automata/session/` directory holds only metadata (per-step result cache, findings, budgets, audit log). A `SessionHost` composes the existing workspace host (createGame/listGames), an open project host wrapped for write-through, and a `Runner` that owns build/test/browser/evaluate with input-fingerprint caching. Project and run tools appear only while a project is open (`tools/list_changed`); the server rehydrates the active project from disk on restart.

**Tech Stack:** TypeScript (ESM, Node), npm workspaces, zod v4 (in `@automata/contracts`), `@modelcontextprotocol/sdk`, vitest, Playwright (existing), `node:crypto` for hashing.

## Global Constraints

- Engine boundary intact: new logic is a **tool** concern under `tools/editor-mcp-server/`; the only `@automata/project` change is one pure serialization primitive (no `node:*` imports in `@automata/project`).
- `@automata/contracts` authors tool schemas in zod and may import `zod` directly (matches existing `tools.ts` / `workspaceTools.ts`). Games/tools/editor code must not import `zod` directly.
- **Disk-is-truth:** `games/<id>/public/project/` is the live source of truth via write-through; `.automata/session/` holds metadata only; `.automata/` is gitignored.
- Budgets are **recorded, not enforced**.
- `browserSmoke` is a minimal smoke: boot, console errors, frame-time, screenshot — not full acceptance.
- Build/test/browser execution goes through an **injectable exec** and **injectable browser driver**; unit tests never spawn real npm or Chromium.
- Manifest shape (verbatim): `manifest.scenes` entries are `{ id, path }`; `manifest.resources` entries are `{ id, typeId, path }`; snapshot is `{ manifest, scenes: Record<id, SceneDocument>, resources: Record<id, ResourceDocument> }`. Fixed manifest filename: `automata.project.json` (`PROJECT_MANIFEST_PATH`).
- Run `npm run ci` and `npm run coverage` before claiming done; run `npm run verify:new-game` after changing the `createGame` next-steps text. Commit after each task. Sweep iCloud `" 2"` duplicates before each commit.

---

### Task 1: `writeProjectFiles` primitive + Node directory writer

The inverse of `loadProjectFiles`. Pure serialization lives in `@automata/project` beside the existing `projectFileDocuments` (which already produces canonical `{ path, text }` docs); the fs adapter lives in the MCP tool beside the existing directory reader.

**Files:**
- Modify: `packages/project/src/files.ts` (add `ProjectFileWriter` + `writeProjectFiles`)
- Test: `packages/project/tests/files.test.ts` (extend)
- Create: `tools/editor-mcp-server/src/projectWriter.ts`
- Test: `tools/editor-mcp-server/tests/projectWriter.test.ts`

**Interfaces:**
- Consumes: `projectFileDocuments(snapshot)`, `loadProjectFiles(reader)`, `ProjectSnapshot`, `PROJECT_MANIFEST_PATH` (existing).
- Produces:
  - `interface ProjectFileWriter { writeText(path: string, text: string): Promise<void> }`
  - `async function writeProjectFiles(writer: ProjectFileWriter, snapshot: ProjectSnapshot): Promise<void>`
  - `function createProjectDirectoryWriter(projectDir: string): ProjectFileWriter`

- [x] **Step 1: Write the failing test (pure primitive round-trip)**

Add to `packages/project/tests/files.test.ts`:

```ts
import { writeProjectFiles } from '../src'

it('write-then-load round-trips a snapshot through an injected writer', async () => {
  const snapshot = sampleSnapshot()
  const map = new Map<string, string>()
  await writeProjectFiles({ writeText: async (path, text) => { map.set(path, text) } }, snapshot)
  const loaded = await loadProjectFiles({ readText: async (path) => map.get(path)! })
  expect(loaded.snapshot).toEqual(snapshot)
})

it('writes canonical documents (manifest-first, trailing newline)', async () => {
  const map = new Map<string, string>()
  await writeProjectFiles({ writeText: async (path, text) => { map.set(path, text) } }, sampleSnapshot())
  expect([...map.keys()]).toEqual([
    'automata.project.json',
    'scenes/main.scene.json',
    'resources/tuning.resource.json'
  ])
  expect(map.get('automata.project.json')!.endsWith('\n')).toBe(true)
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -w @automata/project -- files`
Expected: FAIL — `writeProjectFiles` is not exported.

- [x] **Step 3: Implement the primitive**

Append to `packages/project/src/files.ts`:

```ts
/** Minimal text writer so callers can back it with fs or a fake. Mirrors ProjectFileReader. */
export interface ProjectFileWriter {
  writeText(path: string, text: string): Promise<void>
}

/** Serialize a snapshot to canonical documents and write each through the injected writer. */
export async function writeProjectFiles(writer: ProjectFileWriter, snapshot: ProjectSnapshot): Promise<void> {
  for (const doc of projectFileDocuments(snapshot)) {
    await writer.writeText(doc.path, doc.text)
  }
}
```

- [x] **Step 4: Run the pure test to verify it passes**

Run: `npm test -w @automata/project -- files`
Expected: PASS.

- [x] **Step 5: Write the failing test for the Node fs adapter**

Create `tools/editor-mcp-server/tests/projectWriter.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROJECT_FORMAT_VERSION, loadProjectFiles, writeProjectFiles, type ProjectSnapshot } from '@automata/project'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectDirectoryReader } from '../src/projectReader'
import { createProjectDirectoryWriter } from '../src/projectWriter'

// Built inline so the tool test owns no cross-package test fixture.
function minimalSnapshot(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: PROJECT_FORMAT_VERSION,
      id: 'p', name: 'p', gameId: 'p', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: []
    },
    scenes: { main: { id: 'main', name: 'main', entities: [] } },
    resources: {}
  }
}

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

describe('createProjectDirectoryWriter', () => {
  it('writes a snapshot to disk that loads back identically', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'automata-writer-'))
    dirs.push(dir)
    const snapshot = minimalSnapshot()
    await writeProjectFiles(createProjectDirectoryWriter(dir), snapshot)
    const loaded = await loadProjectFiles(createProjectDirectoryReader(dir))
    expect(loaded.snapshot).toEqual(snapshot)
  })

  it('rejects a path that escapes the project root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'automata-writer-'))
    dirs.push(dir)
    await expect(createProjectDirectoryWriter(dir).writeText('../escape.json', 'x')).rejects.toThrow(/outside project root/i)
  })
})
```

- [x] **Step 6: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- projectWriter`
Expected: FAIL — `createProjectDirectoryWriter` not found.

- [x] **Step 7: Implement the Node writer**

Create `tools/editor-mcp-server/src/projectWriter.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ProjectFileWriter } from '@automata/project'

/** Adapt one filesystem directory to the project writer, mirroring createProjectDirectoryReader's guard. */
export function createProjectDirectoryWriter(projectDir: string): ProjectFileWriter {
  const root = resolve(projectDir)
  return {
    async writeText(path, text): Promise<void> {
      const file = resolve(root, path)
      const fromRoot = relative(root, file)
      if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        throw new Error(`Project path "${path}" resolves outside project root "${root}"`)
      }
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, text, 'utf8')
    }
  }
}
```

- [x] **Step 8: Run both suites to verify pass**

Run: `npm test -w @automata/project -- files && npm test -w @automata/editor-mcp-server -- projectWriter`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add packages/project/src/files.ts packages/project/tests/files.test.ts \
  tools/editor-mcp-server/src/projectWriter.ts tools/editor-mcp-server/tests/projectWriter.test.ts
git commit -m "feat(project): add writeProjectFiles + Node directory writer"
```

---

### Task 2: Session + run tool contracts

New tool schemas in `@automata/contracts`, matching the pattern in `tools.ts` / `workspaceTools.ts`.

**Files:**
- Create: `packages/contracts/src/sessionTools.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from './sessionTools'`)
- Test: `packages/contracts/tests/sessionTools.test.ts`

**Interfaces:**
- Consumes: `gameSlugSchema` (from `./workspaceTools`), `ToolDef` (from `./tools`).
- Produces:
  - `type SessionToolName = 'openProject' | 'closeProject' | 'sessionStatus' | 'runBuild' | 'runTests' | 'browserSmoke'`
  - `const sessionToolArgSchemas` (record of zod schemas)
  - `function sessionToolDefs(): ToolDef[]`
  - `function parseSessionToolArgs(name: string, args: unknown): unknown`

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/tests/sessionTools.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseSessionToolArgs, sessionToolDefs } from '../src'

describe('session tools', () => {
  it('advertises the session and run tools with JSON schemas', () => {
    expect(sessionToolDefs().map((d) => d.name)).toEqual([
      'openProject', 'closeProject', 'sessionStatus', 'runBuild', 'runTests', 'browserSmoke'
    ])
    for (const def of sessionToolDefs()) expect(def.schema).toBeTypeOf('object')
  })

  it('parses openProject gameId and rejects a bad slug', () => {
    expect(parseSessionToolArgs('openProject', { gameId: 'beacon-run' })).toEqual({ gameId: 'beacon-run' })
    expect(() => parseSessionToolArgs('openProject', { gameId: 'Bad Name' })).toThrow()
  })

  it('accepts an optional force flag on run tools and rejects unknown tools', () => {
    expect(parseSessionToolArgs('runBuild', {})).toEqual({})
    expect(parseSessionToolArgs('runBuild', { force: true })).toEqual({ force: true })
    expect(() => parseSessionToolArgs('nope', {})).toThrow(/unknown session tool/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/contracts -- sessionTools`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement the contracts**

Create `packages/contracts/src/sessionTools.ts`:

```ts
import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/**
 * Durable-session tool contracts: open/close a project inside a long-lived
 * workspace server, inspect session state, and run cached build/test/browser
 * steps. Served by `automata-editor-mcp --workspace`.
 */

export type SessionToolName =
  | 'openProject' | 'closeProject' | 'sessionStatus'
  | 'runBuild' | 'runTests' | 'browserSmoke'

const forceArgs = z.object({ force: z.boolean().optional() })

export const sessionToolArgSchemas = {
  openProject: z.object({ gameId: gameSlugSchema }),
  closeProject: z.object({}),
  sessionStatus: z.object({}),
  runBuild: forceArgs,
  runTests: forceArgs,
  browserSmoke: forceArgs
} as const satisfies Record<SessionToolName, z.ZodType>

const SESSION_TOOL_NAMES = Object.keys(sessionToolArgSchemas) as SessionToolName[]

const SESSION_TOOL_DESCRIPTIONS: Record<SessionToolName, string> = {
  openProject: 'Open a discovered game as the session\'s active project (loads from disk, applying migrations). Reveals the project authoring and run tools. Opening a second project swaps: the current one is flushed and closed first.',
  closeProject: 'Close the active project and hide its authoring and run tools.',
  sessionStatus: 'Report the active project, each step\'s freshness (fresh/stale/absent), open findings, and recorded budgets.',
  runBuild: 'Build the active game, caching by an input fingerprint; an unchanged fingerprint returns the cached result unless force is set.',
  runTests: 'Run the active game\'s tests, caching by an input fingerprint; force reruns.',
  browserSmoke: 'Boot the built game in a headless browser and capture boot/console/frame-time plus a screenshot, caching by the build artifact fingerprint; force reruns.'
}

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
```

Add to `packages/contracts/src/index.ts` after the `workspaceTools` export:

```ts
export * from './sessionTools'
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @automata/contracts -- sessionTools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/sessionTools.ts packages/contracts/src/index.ts packages/contracts/tests/sessionTools.test.ts
git commit -m "feat(contracts): add session + run tool schemas"
```

---

### Task 3: Fingerprint helpers

Deterministic hashing used by the runner and session status. Pure Node; lives in the MCP tool.

**Files:**
- Create: `tools/editor-mcp-server/src/session/fingerprint.ts`
- Test: `tools/editor-mcp-server/tests/session/fingerprint.test.ts`

**Interfaces:**
- Produces:
  - `function hashStrings(parts: readonly string[]): string`
  - `async function collectFiles(root: string): Promise<string[]>` — absolute paths, sorted, recursive; a missing root yields `[]`.
  - `async function hashFiles(roots: readonly string[]): Promise<string>` — hash of every file under the roots (relative path + bytes), stable across ordering.

- [ ] **Step 1: Write the failing test**

Create `tools/editor-mcp-server/tests/session/fingerprint.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectFiles, hashFiles, hashStrings } from '../../src/session/fingerprint'

const dirs: string[] = []
async function tmp(): Promise<string> { const d = await mkdtemp(join(tmpdir(), 'automata-fp-')); dirs.push(d); return d }
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

describe('fingerprint', () => {
  it('hashStrings is order-sensitive and stable', () => {
    expect(hashStrings(['a', 'b'])).toBe(hashStrings(['a', 'b']))
    expect(hashStrings(['a', 'b'])).not.toBe(hashStrings(['b', 'a']))
  })

  it('collectFiles returns sorted absolute paths and [] for a missing root', async () => {
    const dir = await tmp()
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub/b.txt'), 'B')
    await writeFile(join(dir, 'a.txt'), 'A')
    expect(await collectFiles(dir)).toEqual([join(dir, 'a.txt'), join(dir, 'sub/b.txt')])
    expect(await collectFiles(join(dir, 'nope'))).toEqual([])
  })

  it('hashFiles changes when content changes and is stable otherwise', async () => {
    const dir = await tmp()
    await writeFile(join(dir, 'a.txt'), 'A')
    const first = await hashFiles([dir])
    expect(await hashFiles([dir])).toBe(first)
    await writeFile(join(dir, 'a.txt'), 'A2')
    expect(await hashFiles([dir])).not.toBe(first)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- fingerprint`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `tools/editor-mcp-server/src/session/fingerprint.ts`:

```ts
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Order-sensitive SHA-256 over string parts, NUL-separated so joins are unambiguous. */
export function hashStrings(parts: readonly string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\0')
  return hash.digest('hex')
}

/** All files under `root`, absolute and sorted; a missing root yields []. */
export async function collectFiles(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(full)))
    else files.push(full)
  }
  return files.sort()
}

/** Fingerprint every file under the given roots by relative path + bytes. */
export async function hashFiles(roots: readonly string[]): Promise<string> {
  const hash = createHash('sha256')
  for (const root of roots) {
    for (const file of await collectFiles(root)) {
      hash.update(relative(root, file)).update('\0')
      hash.update(await readFile(file)).update('\0')
    }
    hash.update('\x01') // root boundary
  }
  return hash.digest('hex')
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @automata/editor-mcp-server -- fingerprint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server/src/session/fingerprint.ts tools/editor-mcp-server/tests/session/fingerprint.test.ts
git commit -m "feat(mcp): add deterministic fingerprint helpers"
```

---

### Task 4: SessionStore (durable metadata + rehydrate + fail-fresh + lock)

Owns `.automata/session/` under the repo root. This is the only new persistent state.

**Files:**
- Create: `tools/editor-mcp-server/src/session/store.ts`
- Test: `tools/editor-mcp-server/tests/session/store.test.ts`

**Interfaces:**
- Produces:
  - `interface StepResult { step: string; ok: boolean; inputHash: string; ts: number; durationMs: number; summary: string; detail: unknown; options?: unknown }` — `options` records the evaluate request so freshness can recompute its hash consistently.
  - `interface Finding { severity: 'error' | 'warn' | 'info'; code: string; message: string; step: string; evidence?: unknown; ts: number }`
  - `interface SessionState { id: string; createdAt: number; activeProjectId: string | null; schemaVersion: number; results: Record<string, StepResult>; findings: Finding[]; budgets: Record<string, { runs: number; totalMs: number }> }`
  - `interface SessionStore { readonly state: SessionState; readonly dir: string; setActiveProject(gameId: string | null): Promise<void>; recordResult(gameId: string, result: StepResult, findings: Finding[]): Promise<void>; getResult(gameId: string, step: string): StepResult | undefined; appendLog(entry: unknown): Promise<void>; release(): Promise<void> }`
  - `function stepKey(gameId: string, step: string): string` → `${gameId}:${step}`
  - `async function openSessionStore(repoRoot: string, opts?: { now?: () => number; stateDir?: string }): Promise<SessionStore>` — `stateDir` overrides where metadata lives (defaults to `<repoRoot>/.automata/session`); lets tests keep session state off the real repo while pointing `repoRoot` at importable games.
- Consumes: nothing from prior tasks.

- [ ] **Step 1: Write the failing test**

Create `tools/editor-mcp-server/tests/session/store.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openSessionStore } from '../../src/session/store'

const roots: string[] = []
async function repo(): Promise<string> { const d = await mkdtemp(join(tmpdir(), 'automata-store-')); roots.push(d); return d }
afterEach(async () => { await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

describe('SessionStore', () => {
  it('persists results and rehydrates them after release', async () => {
    const root = await repo()
    const store = await openSessionStore(root, { now: () => 1000 })
    await store.setActiveProject('beacon-run')
    await store.recordResult('beacon-run',
      { step: 'build', ok: true, inputHash: 'h1', ts: 1000, durationMs: 5, summary: 'ok', detail: {} },
      [])
    await store.release()

    const reopened = await openSessionStore(root)
    expect(reopened.state.activeProjectId).toBe('beacon-run')
    expect(reopened.getResult('beacon-run', 'build')?.inputHash).toBe('h1')
    await reopened.release()
  })

  it('accumulates budgets per step', async () => {
    const root = await repo()
    const store = await openSessionStore(root, { now: () => 0 })
    const r = (ms: number) => ({ step: 'build', ok: true, inputHash: 'h', ts: 0, durationMs: ms, summary: '', detail: {} })
    await store.recordResult('g', r(3), [])
    await store.recordResult('g', r(7), [])
    expect(store.state.budgets.build).toEqual({ runs: 2, totalMs: 10 })
    await store.release()
  })

  it('fails fresh on a corrupt state file, preserving a .bak', async () => {
    const root = await repo()
    const first = await openSessionStore(root)
    await first.release()
    await writeFile(join(first.dir, 'session.json'), '{ not json')
    const store = await openSessionStore(root)
    expect(store.state.activeProjectId).toBeNull()
    await expect(readFile(join(store.dir, 'session.json.bak'), 'utf8')).resolves.toContain('not json')
    await store.release()
  })

  it('refuses a second live store on the same repo', async () => {
    const root = await repo()
    const store = await openSessionStore(root)
    await expect(openSessionStore(root)).rejects.toThrow(/already (holds|open)/i)
    await store.release()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- store`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `tools/editor-mcp-server/src/session/store.ts`:

```ts
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface StepResult {
  step: string; ok: boolean; inputHash: string; ts: number; durationMs: number; summary: string; detail: unknown
  /** Evaluate request options, recorded so freshness recomputes the same hash. */
  options?: unknown
}
export interface Finding {
  severity: 'error' | 'warn' | 'info'; code: string; message: string; step: string; evidence?: unknown; ts: number
}
export interface SessionState {
  id: string; createdAt: number; activeProjectId: string | null; schemaVersion: number
  results: Record<string, StepResult>
  findings: Finding[]
  budgets: Record<string, { runs: number; totalMs: number }>
}
export interface SessionStore {
  readonly state: SessionState
  readonly dir: string
  setActiveProject(gameId: string | null): Promise<void>
  recordResult(gameId: string, result: StepResult, findings: Finding[]): Promise<void>
  getResult(gameId: string, step: string): StepResult | undefined
  appendLog(entry: unknown): Promise<void>
  release(): Promise<void>
}

const SCHEMA_VERSION = 1
export function stepKey(gameId: string, step: string): string { return `${gameId}:${step}` }

function freshState(now: number): SessionState {
  return { id: `s-${now}`, createdAt: now, activeProjectId: null, schemaVersion: SCHEMA_VERSION, results: {}, findings: [], budgets: {} }
}

/** Read state.json, or fail fresh (preserving a .bak) when it is missing or corrupt. */
async function loadState(dir: string, now: number): Promise<SessionState> {
  const path = join(dir, 'session.json')
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return freshState(now)
  }
  try {
    const parsed = JSON.parse(text) as SessionState
    if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error('schema mismatch')
    return parsed
  } catch {
    await rename(path, `${path}.bak`).catch(() => {})
    return freshState(now)
  }
}

/** pid liveness probe: kill(pid, 0) throws ESRCH when the process is gone. */
function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function openSessionStore(
  repoRoot: string,
  opts: { now?: () => number; stateDir?: string } = {}
): Promise<SessionStore> {
  const now = opts.now ?? Date.now
  const dir = opts.stateDir ?? join(repoRoot, '.automata', 'session')
  await mkdir(dir, { recursive: true })

  const lock = join(dir, 'lock')
  const existing = await readFile(lock, 'utf8').catch(() => null)
  if (existing) {
    const pid = Number.parseInt(existing, 10)
    if (Number.isFinite(pid) && isAlive(pid)) {
      throw new Error(`Another server already holds the session for ${repoRoot} (pid ${pid})`)
    }
  }
  await writeFile(lock, String(process.pid), 'utf8')

  const state = await loadState(dir, now())
  const persist = () => writeFile(join(dir, 'session.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await persist()

  return {
    state,
    dir,
    async setActiveProject(gameId) { state.activeProjectId = gameId; await persist() },
    async recordResult(gameId, result, findings) {
      state.results[stepKey(gameId, result.step)] = result
      const budget = state.budgets[result.step] ?? { runs: 0, totalMs: 0 }
      state.budgets[result.step] = { runs: budget.runs + 1, totalMs: budget.totalMs + result.durationMs }
      state.findings = [...state.findings.filter((f) => f.step !== result.step || f.severity === 'info'), ...findings]
      await persist()
    },
    getResult(gameId, step) { return state.results[stepKey(gameId, step)] },
    async appendLog(entry) {
      await writeFile(join(dir, 'log.jsonl'), `${JSON.stringify({ ts: now(), ...(entry as object) })}\n`, { flag: 'a' })
    },
    async release() { await rm(lock, { force: true }) }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @automata/editor-mcp-server -- store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server/src/session/store.ts tools/editor-mcp-server/tests/session/store.test.ts
git commit -m "feat(mcp): add durable SessionStore with rehydrate, fail-fresh, and pid lock"
```

---

### Task 5: Runner (cached build/test/browser/evaluate)

The single owner of step execution, input-fingerprint caching, freshness, and findings. Build/test/browser execute through injected functions; evaluate delegates to an injected project-host call.

**Files:**
- Create: `tools/editor-mcp-server/src/session/runner.ts`
- Test: `tools/editor-mcp-server/tests/session/runner.test.ts`

**Interfaces:**
- Consumes: `hashFiles`, `hashStrings` (Task 3); `SessionStore`, `StepResult`, `Finding` (Task 4); `ToolResult` (`@automata/contracts`); `ProjectSnapshot` (`@automata/project`).
- Produces:
  - `interface ExecResult { code: number; stdout: string; stderr: string }`
  - `type ExecFn = (cmd: string, args: readonly string[], cwd: string) => Promise<ExecResult>`
  - `interface BrowserSmokeResult { booted: boolean; consoleErrors: string[]; frameMs: number[]; screenshotPath: string | null }`
  - `type BrowserSmokeFn = (ctx: { gameDir: string; screenshotPath: string }) => Promise<BrowserSmokeResult>`
  - `type Step = 'build' | 'test' | 'browser' | 'evaluate'`
  - `interface Runner { run(step: Step, force: boolean, evaluateOptions?: unknown): Promise<ToolResult>; freshness(step: Step): Promise<'fresh' | 'stale' | 'absent'> }`
  - `function createRunner(deps: RunnerDeps): Runner` where
    `interface RunnerDeps { repoRoot: string; gameId: string; store: SessionStore; snapshot: () => ProjectSnapshot; exec: ExecFn; browserSmoke: BrowserSmokeFn; evaluate: (options: unknown) => Promise<ToolResult>; now?: () => number }`

- [ ] **Step 1: Write the failing test**

Create `tools/editor-mcp-server/tests/session/runner.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openSessionStore } from '../../src/session/store'
import { createRunner, type ExecFn } from '../../src/session/runner'

const roots: string[] = []
async function gameRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'automata-runner-'))
  roots.push(root)
  await mkdir(join(root, 'games/g/src'), { recursive: true })
  await mkdir(join(root, 'games/g/public/project'), { recursive: true })
  await writeFile(join(root, 'games/g/src/index.ts'), 'export const x = 1')
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

const snapshot = () => ({ manifest: { id: 'g' } }) as never
const okExec: ExecFn = async () => ({ code: 0, stdout: 'built', stderr: '' })
const browser = async () => ({ booted: true, consoleErrors: [], frameMs: [16, 16], screenshotPath: 's.png' })
const evaluate = async () => ({ ok: true, content: { metrics: {} } })

function deps(root: string, exec = okExec) {
  return async () => {
    const store = await openSessionStore(root, { now: () => 1 })
    const runner = createRunner({ repoRoot: root, gameId: 'g', store, snapshot, exec, browserSmoke: browser, evaluate, now: () => 1 })
    return { store, runner }
  }
}

describe('Runner', () => {
  it('runs build once then serves it from cache until inputs change', async () => {
    const root = await gameRepo()
    const exec = vi.fn(okExec)
    const { store, runner } = await deps(root, exec)()
    const first = await runner.run('build', false)
    expect(first.content).toMatchObject({ skipped: false })
    const second = await runner.run('build', false)
    expect(second.content).toMatchObject({ skipped: 'cached' })
    expect(exec).toHaveBeenCalledTimes(1)

    await writeFile(join(root, 'games/g/src/index.ts'), 'export const x = 2')
    expect(await runner.freshness('build')).toBe('stale')
    await runner.run('build', false)
    expect(exec).toHaveBeenCalledTimes(2)
    await store.release()
  })

  it('force reruns even when cached', async () => {
    const root = await gameRepo()
    const exec = vi.fn(okExec)
    const { store, runner } = await deps(root, exec)()
    await runner.run('build', false)
    await runner.run('build', true)
    expect(exec).toHaveBeenCalledTimes(2)
    await store.release()
  })

  it('records a failing build as a result with ok:false and a finding, not a throw', async () => {
    const root = await gameRepo()
    const failing: ExecFn = async () => ({ code: 1, stdout: '', stderr: 'boom' })
    const { store, runner } = await deps(root, failing)()
    const result = await runner.run('build', false)
    expect(result.ok).toBe(false)
    expect(store.state.findings.some((f) => f.step === 'build' && f.severity === 'error')).toBe(true)
    await store.release()
  })

  it('reports absent freshness before a step has run', async () => {
    const root = await gameRepo()
    const { store, runner } = await deps(root)()
    expect(await runner.freshness('test')).toBe('absent')
    await store.release()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- runner`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `tools/editor-mcp-server/src/session/runner.ts`:

```ts
import { join } from 'node:path'
import type { ToolResult } from '@automata/contracts'
import type { ProjectSnapshot } from '@automata/project'
import { hashFiles, hashStrings } from './fingerprint'
import type { Finding, SessionStore, StepResult } from './store'

export interface ExecResult { code: number; stdout: string; stderr: string }
export type ExecFn = (cmd: string, args: readonly string[], cwd: string) => Promise<ExecResult>
export interface BrowserSmokeResult { booted: boolean; consoleErrors: string[]; frameMs: number[]; screenshotPath: string | null }
export type BrowserSmokeFn = (ctx: { gameDir: string; screenshotPath: string }) => Promise<BrowserSmokeResult>

export type Step = 'build' | 'test' | 'browser' | 'evaluate'

export interface RunnerDeps {
  repoRoot: string
  gameId: string
  store: SessionStore
  snapshot: () => ProjectSnapshot
  exec: ExecFn
  browserSmoke: BrowserSmokeFn
  evaluate: (options: unknown) => Promise<ToolResult>
  now?: () => number
}

export interface Runner {
  run(step: Step, force: boolean, evaluateOptions?: unknown): Promise<ToolResult>
  freshness(step: Step): Promise<'fresh' | 'stale' | 'absent'>
}

interface StepOutcome { ok: boolean; summary: string; detail: unknown; findings: Omit<Finding, 'ts' | 'step'>[] }

export function createRunner(deps: RunnerDeps): Runner {
  const now = deps.now ?? Date.now
  const gameDir = join(deps.repoRoot, 'games', deps.gameId)
  const codeRoots = [join(gameDir, 'src'), join(gameDir, 'public', 'project')]

  const inputHash = async (step: Step, evaluateOptions?: unknown): Promise<string> => {
    switch (step) {
      case 'build':
      case 'test':
        return hashFiles(codeRoots)
      case 'browser':
        return hashFiles([join(gameDir, 'dist')])
      case 'evaluate':
        return hashStrings([JSON.stringify(deps.snapshot()), JSON.stringify(evaluateOptions ?? null)])
    }
  }

  const execute = async (step: Step, evaluateOptions?: unknown): Promise<StepOutcome> => {
    if (step === 'evaluate') {
      const result = await deps.evaluate(evaluateOptions)
      return {
        ok: result.ok,
        summary: result.ok ? 'evaluation complete' : 'evaluation failed',
        detail: result.content,
        findings: result.ok ? [] : [{ severity: 'error', code: 'evaluate-failed', message: 'evaluation reported errors', evidence: result.content }]
      }
    }
    if (step === 'browser') {
      const screenshotPath = join(deps.store.dir, 'artifacts', `${deps.gameId}-smoke.png`)
      const smoke = await deps.browserSmoke({ gameDir, screenshotPath })
      const ok = smoke.booted && smoke.consoleErrors.length === 0
      return {
        ok,
        summary: ok ? 'browser smoke passed' : 'browser smoke failed',
        detail: smoke,
        findings: ok ? [] : [{ severity: 'error', code: 'browser-smoke', message: smoke.booted ? 'console errors during boot' : 'game failed to boot', evidence: smoke.consoleErrors }]
      }
    }
    const args = step === 'build' ? ['run', 'build', '-w', deps.gameId] : ['test', '-w', deps.gameId]
    const exec = await deps.exec('npm', args, deps.repoRoot)
    const ok = exec.code === 0
    return {
      ok,
      summary: ok ? `${step} passed` : `${step} failed (exit ${exec.code})`,
      detail: { code: exec.code, log: `${exec.stdout}\n${exec.stderr}`.trim().slice(-4000) },
      findings: ok ? [] : [{ severity: 'error', code: `${step}-failed`, message: `${step} exited ${exec.code}`, evidence: exec.stderr.slice(-2000) }]
    }
  }

  return {
    async run(step, force, evaluateOptions) {
      const hash = await inputHash(step, evaluateOptions)
      const cached = deps.store.getResult(deps.gameId, step)
      if (!force && cached && cached.inputHash === hash && cached.ok) {
        return { ok: true, content: { skipped: 'cached', result: cached } }
      }
      const started = now()
      const outcome = await execute(step, evaluateOptions)
      const result: StepResult = {
        step, ok: outcome.ok, inputHash: hash, ts: started, durationMs: now() - started,
        summary: outcome.summary, detail: outcome.detail,
        ...(step === 'evaluate' ? { options: evaluateOptions } : {})
      }
      const findings: Finding[] = outcome.findings.map((f) => ({ ...f, step, ts: started }))
      await deps.store.recordResult(deps.gameId, result, findings)
      return { ok: outcome.ok, isError: !outcome.ok, content: { skipped: false, result } }
    },
    async freshness(step) {
      const cached = deps.store.getResult(deps.gameId, step)
      if (!cached) return 'absent'
      const current = step === 'evaluate' ? await inputHash(step, cached.options) : await inputHash(step)
      return current === cached.inputHash ? 'fresh' : 'stale'
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @automata/editor-mcp-server -- runner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server/src/session/runner.ts tools/editor-mcp-server/tests/session/runner.test.ts
git commit -m "feat(mcp): add Runner with input-fingerprint caching and findings"
```

---

### Task 6: Write-through project host wrapper

Wrap the existing in-memory project host so every successful edit is flushed to disk in the canonical format.

**Files:**
- Create: `tools/editor-mcp-server/src/session/writeThroughHost.ts`
- Test: `tools/editor-mcp-server/tests/session/writeThroughHost.test.ts`

**Interfaces:**
- Consumes: `EditorProjectToolHost` (`@automata/editor/headless`), `ProjectFileWriter` + `writeProjectFiles` (Task 1).
- Produces: `function createWriteThroughHost(inner: EditorProjectToolHost, writer: ProjectFileWriter): EditorProjectToolHost`

- [ ] **Step 1: Write the failing test**

Create `tools/editor-mcp-server/tests/session/writeThroughHost.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { EditorProjectToolHost } from '@automata/editor/headless'
import type { ProjectFileWriter } from '@automata/project'
import { createWriteThroughHost } from '../../src/session/writeThroughHost'

function fakeInner(overrides: Partial<EditorProjectToolHost> = {}): EditorProjectToolHost {
  return {
    snapshot: { manifest: { id: 'g' } } as never,
    commands: [],
    listTools: () => [{ name: 'addEntity', description: '', schema: {} }],
    executeTool: vi.fn(async () => ({ ok: true, content: { applied: 'addEntity', changed: true } })),
    readResource: vi.fn(async () => null),
    ...overrides
  } as EditorProjectToolHost
}

describe('createWriteThroughHost', () => {
  it('flushes to disk after a changing write', async () => {
    const writer: ProjectFileWriter = { writeText: vi.fn(async () => {}) }
    const host = createWriteThroughHost(fakeInner(), writer)
    await host.executeTool('addEntity', { sceneId: 's', name: 'e' })
    expect(writer.writeText).toHaveBeenCalled()
  })

  it('does not flush when nothing changed', async () => {
    const writer: ProjectFileWriter = { writeText: vi.fn(async () => {}) }
    const inner = fakeInner({ executeTool: vi.fn(async () => ({ ok: true, content: { applied: 'addEntity', changed: false } })) })
    const host = createWriteThroughHost(inner, writer)
    await host.executeTool('addEntity', {})
    expect(writer.writeText).not.toHaveBeenCalled()
  })

  it('does not flush on read tools', async () => {
    const writer: ProjectFileWriter = { writeText: vi.fn(async () => {}) }
    const inner = fakeInner({ executeTool: vi.fn(async () => ({ ok: true, content: { manifest: {} } })) })
    const host = createWriteThroughHost(inner, writer)
    await host.executeTool('getProject', {})
    expect(writer.writeText).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- writeThroughHost`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `tools/editor-mcp-server/src/session/writeThroughHost.ts`:

```ts
import type { EditorProjectToolHost } from '@automata/editor/headless'
import { writeProjectFiles, type ProjectFileWriter } from '@automata/project'

/**
 * Wrap a project tool host so any command that mutates the snapshot
 * (result content `{ changed: true }`) is flushed to disk in canonical form.
 * Reads and no-op writes pass through untouched.
 */
export function createWriteThroughHost(
  inner: EditorProjectToolHost,
  writer: ProjectFileWriter
): EditorProjectToolHost {
  return {
    get snapshot() { return inner.snapshot },
    get commands() { return inner.commands },
    listTools: () => inner.listTools(),
    readResource: (uri) => inner.readResource(uri),
    async executeTool(name, args) {
      const result = await inner.executeTool(name, args)
      const changed = result.ok && (result.content as { changed?: unknown } | null)?.changed === true
      if (changed) await writeProjectFiles(writer, inner.snapshot)
      return result
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @automata/editor-mcp-server -- writeThroughHost`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server/src/session/writeThroughHost.ts tools/editor-mcp-server/tests/session/writeThroughHost.test.ts
git commit -m "feat(mcp): add write-through project host wrapper"
```

---

### Task 7: SessionHost (durable host tying it together)

The durable `McpToolHost`: workspace tools + session-control tools always; project authoring (write-through) + run tools when a project is open; `evaluate` and the run tools routed through the Runner; rehydrates the active project on construction; signals `tools/list_changed`.

**Files:**
- Create: `tools/editor-mcp-server/src/session/sessionHost.ts`
- Test: `tools/editor-mcp-server/tests/session/sessionHost.test.ts`

**Interfaces:**
- Consumes: `createWorkspaceHost` (`../workspaceHost`), `createHeadlessHost` (`../headlessHost`), `createProjectDirectoryWriter` (`../projectWriter`, Task 1), `openSessionStore` (Task 4), `createRunner` + `ExecFn` + `BrowserSmokeFn` + `Step` (Task 5), `createWriteThroughHost` (Task 6), `sessionToolDefs` + `parseSessionToolArgs` (Task 2), `McpToolHost` + `ToolResult` (`@automata/contracts`).
- Produces:
  - `interface SessionHost extends McpToolHost { bindNotifications(notify: () => void): void; close(): Promise<void> }`
  - `interface SessionHostOptions { repoRoot: string; exec: ExecFn; browserSmoke: BrowserSmokeFn; now?: () => number; stateDir?: string }`
  - `async function createSessionHost(options: SessionHostOptions): Promise<SessionHost>`

- [ ] **Step 1: Write the failing test**

Create `tools/editor-mcp-server/tests/session/sessionHost.test.ts`. `openProject` loads a game through `createHeadlessHost`, which dynamically imports the game's `./project` export — that only resolves for an **installed** workspace package, so the test points `repoRoot` at the **real monorepo** (where `monkey-ball` and `pulsebreak` are importable) and keeps session state in a tmp `stateDir`. Build/test/browser are injected fakes, and the test performs no authoring edits, so it never write-throughs to the real game files.

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionHost } from '../../src/session/sessionHost'
import type { ExecFn } from '../../src/session/runner'

// session -> tests -> editor-mcp-server -> tools -> repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const stateDirs: string[] = []
async function stateDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'automata-session-'))
  stateDirs.push(d)
  return d
}
afterEach(async () => { await Promise.all(stateDirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

const exec: ExecFn = async () => ({ code: 0, stdout: 'ok', stderr: '' })
const browserSmoke = async () => ({ booted: true, consoleErrors: [], frameMs: [16], screenshotPath: null })
const opts = (over: Partial<Parameters<typeof createSessionHost>[0]> = {}) =>
  ({ repoRoot: REPO_ROOT, exec, browserSmoke, ...over })

describe('SessionHost (real monorepo, fake exec/browser)', () => {
  it('hides project + run tools until a project is open, then reveals them', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    const before = host.listTools().map((t) => t.name)
    expect(before).toEqual(expect.arrayContaining(['createGame', 'listGames', 'openProject', 'sessionStatus']))
    expect(before).not.toContain('runBuild')
    expect(before).not.toContain('addEntity')

    const changed = vi.fn()
    host.bindNotifications(changed)
    const opened = await host.executeTool('openProject', { gameId: 'monkey-ball' })
    expect(opened.ok).toBe(true)
    expect(changed).toHaveBeenCalled()

    const after = host.listTools().map((t) => t.name)
    expect(after).toEqual(expect.arrayContaining(['addEntity', 'validate', 'runBuild', 'runTests', 'browserSmoke']))
    await host.close()
  })

  it('errors run/authoring tools when no project is open', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    expect(await host.executeTool('runBuild', {})).toMatchObject({ ok: false, isError: true })
    expect(await host.executeTool('addEntity', {})).toMatchObject({ ok: false, isError: true })
    await host.close()
  })

  it('reports step freshness and caches build across a rehydrate', async () => {
    const dir = await stateDir()
    const build = vi.fn(exec)
    const host = await createSessionHost(opts({ stateDir: dir, exec: build }))
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    await host.executeTool('runBuild', {})
    const status = await host.executeTool('sessionStatus', {})
    expect(status.content).toMatchObject({ activeProjectId: 'monkey-ball', steps: { build: 'fresh' } })
    await host.close()

    // A fresh server on the same state dir rehydrates the active project and the cache.
    const resumed = await createSessionHost(opts({ stateDir: dir, exec: build }))
    expect(resumed.listTools().map((t) => t.name)).toContain('runBuild')
    await resumed.executeTool('runBuild', {})
    expect(build).toHaveBeenCalledTimes(1) // cached; not rebuilt
    await resumed.close()
  })

  it('swaps the active project on a second openProject', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    const swap = await host.executeTool('openProject', { gameId: 'pulsebreak' })
    expect(swap.ok).toBe(true)
    expect((await host.executeTool('sessionStatus', {})).content).toMatchObject({ activeProjectId: 'pulsebreak' })
    await host.close()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- sessionHost`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `tools/editor-mcp-server/src/session/sessionHost.ts`:

```ts
import { join } from 'node:path'
import {
  parseSessionToolArgs,
  sessionToolDefs,
  type McpToolHost,
  type ToolDef,
  type ToolResult
} from '@automata/contracts'
import { createHeadlessHost } from '../headlessHost'
import { createProjectDirectoryWriter } from '../projectWriter'
import { createWorkspaceHost } from '../workspaceHost'
import { createRunner, type BrowserSmokeFn, type ExecFn, type Runner, type Step } from './runner'
import { openSessionStore, type SessionStore } from './store'
import { createWriteThroughHost } from './writeThroughHost'

export interface SessionHost extends McpToolHost {
  bindNotifications(notify: () => void): void
  close(): Promise<void>
}
export interface SessionHostOptions {
  repoRoot: string
  exec: ExecFn
  browserSmoke: BrowserSmokeFn
  now?: () => number
  /** Overrides where session metadata lives; defaults to <repoRoot>/.automata/session. */
  stateDir?: string
}

const SESSION_CONTROL = new Set(['openProject', 'closeProject', 'sessionStatus'])
const RUN_STEPS: Record<string, Step> = { runBuild: 'build', runTests: 'test', browserSmoke: 'browser' }
const STEPS: Step[] = ['build', 'test', 'browser', 'evaluate']

interface ActiveProject {
  gameId: string
  host: Awaited<ReturnType<typeof createHeadlessHost>>['host']
  runner: Runner
}

const fail = (error: unknown): ToolResult => ({ ok: false, isError: true, content: error instanceof Error ? error.message : String(error) })

export async function createSessionHost(options: SessionHostOptions): Promise<SessionHost> {
  const { repoRoot } = options
  const workspace = createWorkspaceHost({ repoRoot })
  const storeOpts: { now?: () => number; stateDir?: string } = {}
  if (options.now) storeOpts.now = options.now
  if (options.stateDir) storeOpts.stateDir = options.stateDir
  const store: SessionStore = await openSessionStore(repoRoot, storeOpts)
  let active: ActiveProject | null = null
  let notify: () => void = () => {}

  const openProject = async (gameId: string): Promise<ToolResult> => {
    const projectDir = join(repoRoot, 'games', gameId, 'public', 'project')
    const opened = await createHeadlessHost({ projectDir, repoRoot })
    const writer = createProjectDirectoryWriter(projectDir)
    const host = createWriteThroughHost(opened.host, writer)
    const runner = createRunner({
      repoRoot, gameId, store,
      snapshot: () => host.snapshot,
      exec: options.exec,
      browserSmoke: options.browserSmoke,
      evaluate: (evalOptions) => host.executeTool('evaluate', evalOptions),
      ...(options.now ? { now: options.now } : {})
    })
    active = { gameId, host, runner }
    await store.setActiveProject(gameId)
    return { ok: true, content: { openedProject: gameId } }
  }

  // Rehydrate the last active project from disk, if any; clear the pointer on failure
  // so sessionStatus never reports an active project whose tools are absent.
  if (store.state.activeProjectId) {
    await openProject(store.state.activeProjectId).catch(async () => {
      active = null
      await store.setActiveProject(null)
    })
  }

  const sessionStatus = async (): Promise<ToolResult> => {
    const steps: Record<string, string> = {}
    if (active) for (const step of STEPS) steps[step] = await active.runner.freshness(step)
    return {
      ok: true,
      content: {
        activeProjectId: active?.gameId ?? null,
        steps,
        findings: store.state.findings,
        budgets: store.state.budgets
      }
    }
  }

  const listTools = (): ToolDef[] => {
    const defs = [...workspace.listTools(), ...sessionToolDefs().filter((d) => SESSION_CONTROL.has(d.name))]
    if (!active) return defs
    const runDefs = sessionToolDefs().filter((d) => d.name in RUN_STEPS)
    return [...defs, ...active.host.listTools(), ...runDefs]
  }

  const host: SessionHost = {
    listTools,
    bindNotifications(fn) { notify = fn },
    async close() { await store.release() },
    async readResource(uri) {
      if (active) return active.host.readResource(uri)
      throw new Error(`No project open (requested ${uri})`)
    },
    async executeTool(name, args) {
      try {
        await store.appendLog({ tool: name })
        if (name === 'createGame' || name === 'listGames') return await workspace.executeTool(name, args)
        if (SESSION_CONTROL.has(name)) {
          const input = parseSessionToolArgs(name, args)
          if (name === 'openProject') {
            const result = await openProject((input as { gameId: string }).gameId)
            notify()
            return result
          }
          if (name === 'closeProject') {
            active = null
            await store.setActiveProject(null)
            notify()
            return { ok: true, content: { closed: true } }
          }
          return await sessionStatus()
        }
        if (name in RUN_STEPS) {
          if (!active) return fail(new Error(`Cannot ${name}: no project open. Call openProject first.`))
          const { force } = parseSessionToolArgs(name, args) as { force?: boolean }
          return await active.runner.run(RUN_STEPS[name]!, force === true)
        }
        if (name === 'evaluate') {
          if (!active) return fail(new Error('Cannot evaluate: no project open.'))
          // Honor caller options (e.g. maxSteps); default the required bound if omitted.
          const evalOptions = { maxSteps: 1000, ...((args as Record<string, unknown> | null) ?? {}) }
          return await active.runner.run('evaluate', false, evalOptions)
        }
        if (!active) return fail(new Error(`Cannot ${name}: no project open. Call openProject first.`))
        return await active.host.executeTool(name, args)
      } catch (error) {
        return fail(error)
      }
    }
  }
  return host
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @automata/editor-mcp-server -- sessionHost`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/editor-mcp-server/src/session/sessionHost.ts tools/editor-mcp-server/tests/session/sessionHost.test.ts
git commit -m "feat(mcp): add durable SessionHost (open/swap, rehydrate, cached runs)"
```

---

### Task 8: Server + main wiring, default adapters, gitignore, scaffold next-steps

Make `--workspace` launch the durable host with `tools/list_changed` support and real exec/browser adapters; ignore `.automata/`; update `createGame` next-steps to point at `openProject`.

**Files:**
- Create: `tools/editor-mcp-server/src/session/adapters.ts` (thin Node exec + Playwright browser shims — the process/browser boundary)
- Modify: `tools/editor-mcp-server/package.json` (declare the `@playwright/test` dependency the adapter imports)
- Modify: `tools/editor-mcp-server/src/server.ts` (accept a session host + declare `tools.listChanged`)
- Modify: `tools/editor-mcp-server/src/main.ts` (`--workspace` → `createSessionHost` + bind notifications)
- Modify: `tools/editor-mcp-server/src/workspaceHost.ts` (next-steps text)
- Modify: `.gitignore` (add `.automata/`)
- Test: `tools/editor-mcp-server/tests/workspaceHost.test.ts` (update the next-steps assertion)

**Interfaces:**
- Consumes: `createSessionHost`, `SessionHost` (Task 7); `createMcpServer` (existing); `nodeExec`, `playwrightBrowserSmoke` (this task).
- Produces: `const nodeExec: ExecFn`, `const playwrightBrowserSmoke: BrowserSmokeFn`.

- [ ] **Step 1: Update the workspace next-steps test (failing)**

In `tools/editor-mcp-server/tests/workspaceHost.test.ts`, replace the `--project` assertion with the openProject one:

```ts
      nextSteps: expect.arrayContaining([
        expect.stringContaining('npm install'),
        expect.stringContaining('openProject'),
        expect.stringContaining('evaluate'),
        expect.stringContaining('npm run ci')
      ])
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @automata/editor-mcp-server -- workspaceHost`
Expected: FAIL — next-steps still says `--project`.

- [ ] **Step 3: Update the next-steps text**

In `tools/editor-mcp-server/src/workspaceHost.ts`, change the reconnect line:

```ts
            `Call openProject { gameId: "${plan.name}" } on this session to author content; project authoring and run tools appear once it is open, and the authoring tools carry per-type JSON schemas in their descriptions`,
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @automata/editor-mcp-server -- workspaceHost`
Expected: PASS.

- [ ] **Step 5: Add the default adapters**

Create `tools/editor-mcp-server/src/session/adapters.ts`:

```ts
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BrowserSmokeFn, ExecFn } from './runner'

/** Run a command, capturing stdout/stderr and the exit code. The process boundary. */
export const nodeExec: ExecFn = (cmd, args, cwd) =>
  new Promise((resolve) => {
    const child = spawn(cmd, [...args], { cwd, shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}` }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })

/** Poll an HTTP endpoint until it answers or the deadline passes. */
async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server at ${url} did not become ready`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

/**
 * Boot the built game under Playwright and capture boot/console/frame-time.
 * The browser boundary: it drives a real dev server + Chromium, so it has NO
 * unit coverage and is exercised only by the Task 9 manual smoke. Serves
 * `<gameDir>/dist` via `vite preview` on the game's declared automata.devPort
 * and polls readiness (no stdout scraping).
 */
export const playwrightBrowserSmoke: BrowserSmokeFn = async ({ gameDir, screenshotPath }) => {
  const { chromium } = await import('@playwright/test')
  const manifest = JSON.parse(await readFile(join(gameDir, 'package.json'), 'utf8')) as { automata?: { devPort?: number } }
  const port = manifest.automata?.devPort ?? 4173
  const url = `http://localhost:${port}`
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: gameDir })
  const consoleErrors: string[] = []
  try {
    await waitForServer(url, 15_000)
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    try {
      const page = await browser.newPage()
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
      page.on('pageerror', (err) => consoleErrors.push(err.message))
      await page.goto(url, { waitUntil: 'load', timeout: 15_000 })
      const frameMs = await page.evaluate(() => new Promise<number[]>((resolve) => {
        const times: number[] = []
        let last = performance.now()
        const tick = (t: number) => { times.push(t - last); last = t; if (times.length < 10) requestAnimationFrame(tick); else resolve(times) }
        requestAnimationFrame(tick)
      }))
      await mkdir(dirname(screenshotPath), { recursive: true })
      await page.screenshot({ path: screenshotPath })
      return { booted: true, consoleErrors, frameMs, screenshotPath }
    } finally {
      await browser.close()
    }
  } catch (error) {
    return { booted: false, consoleErrors: [...consoleErrors, error instanceof Error ? error.message : String(error)], frameMs: [], screenshotPath: null }
  } finally {
    preview.kill()
  }
}
```

Then declare the dependency the adapter dynamically imports — it resolves only by workspace hoisting otherwise. In `tools/editor-mcp-server/package.json`, add to `dependencies`:

```json
    "@playwright/test": "^1.0.0"
```

Run: `npm install`
Expected: the lockfile updates and `@automata/editor-mcp-server` gains a direct `@playwright/test` dependency.

- [ ] **Step 6: Wire the server to emit `tools/list_changed`**

In `tools/editor-mcp-server/src/server.ts`, add an option and capability. Extend `McpServerOptions`:

```ts
  /** When true, advertise dynamic tool lists so the client re-fetches on change. */
  toolsListChanged?: boolean
```

Change the capabilities line:

```ts
    { capabilities: { tools: options.toolsListChanged ? { listChanged: true } : {}, resources: {}, ...(options.prompts ? { prompts: {} } : {}) } }
```

- [ ] **Step 7: Wire `--workspace` to the durable host in `main.ts`**

In `tools/editor-mcp-server/src/main.ts`, replace the workspace branch body:

```ts
  if (options.workspaceDir !== undefined) {
    const repoRoot = resolve(options.workspaceDir)
    const { nodeExec, playwrightBrowserSmoke } = await import('./session/adapters')
    const { createSessionHost } = await import('./session/sessionHost')
    const host = await createSessionHost({ repoRoot, exec: nodeExec, browserSmoke: playwrightBrowserSmoke })
    const server = createMcpServer(host, {
      parseArgs: parseSessionAndWorkspaceArgs,
      resourceUris: [],
      prompts: { list: workspacePromptDefs, get: getWorkspacePrompt },
      toolsListChanged: true
    })
    host.bindNotifications(() => { void server.sendToolListChanged() })
    await server.connect(new StdioServerTransport())
    process.stderr.write(`automata-editor MCP ready: durable session (${repoRoot})\n`)
    return
  }
```

Add a protocol-level arg parser near the top of `main.ts` that accepts workspace, session, and project tool names (the durable host serves all three families):

```ts
import { parseToolArgs, parseSessionToolArgs, parseWorkspaceToolArgs, sessionToolDefs } from '@automata/contracts'

const SESSION_TOOL_NAMES = new Set(sessionToolDefs().map((def) => def.name))

function parseSessionAndWorkspaceArgs(name: string, args: unknown): unknown {
  if (name === 'createGame' || name === 'listGames') return parseWorkspaceToolArgs(name, args)
  if (SESSION_TOOL_NAMES.has(name)) return parseSessionToolArgs(name, args)
  return parseToolArgs(name, args) // project authoring tools
}
```

Update the top import to include what the branch already used (`getWorkspacePrompt`, `workspacePromptDefs`) and drop `parseWorkspaceToolArgs`-only usage if now unused elsewhere.

- [ ] **Step 8: Ignore `.automata/`**

Add to `.gitignore`:

```
.automata/
```

- [ ] **Step 9: Run the full server test suite + typecheck**

Run: `npm test -w @automata/editor-mcp-server && npm run typecheck -w @automata/editor-mcp-server`
Expected: PASS. (The `adapters.ts` browser path is not unit-tested; that is intentional — it is the injected boundary.)

- [ ] **Step 10: Commit**

```bash
git add tools/editor-mcp-server/src/session/adapters.ts tools/editor-mcp-server/src/server.ts \
  tools/editor-mcp-server/src/main.ts tools/editor-mcp-server/src/workspaceHost.ts \
  tools/editor-mcp-server/tests/workspaceHost.test.ts tools/editor-mcp-server/package.json \
  package-lock.json .gitignore
git commit -m "feat(mcp): launch durable session on --workspace with list_changed + adapters"
```

---

### Task 9: Full verification + roadmap update

**Files:**
- Modify: `docs/ROADMAP.md` (mark P5 shipped once green)

- [ ] **Step 1: Sweep iCloud duplicates**

Run: `find . -path ./node_modules -prune -o -name "* 2.*" -print -o -name "* 2" -print`
Expected: no output. Delete any matches.

- [ ] **Step 2: Full CI + coverage**

Run: `npm run ci && npm run coverage`
Expected: PASS, coverage thresholds met.

- [ ] **Step 3: Clean-clone scaffold acceptance**

Run: `npm run verify:new-game`
Expected: PASS (validates the changed `createGame` next-steps flow).

- [ ] **Step 4: Manual durable-session smoke (documented, not automated)**

Run the server against the repo and exercise the lifecycle by hand or from an MCP client:

```bash
node --import tsx tools/editor-mcp-server/src/main.ts --workspace .
```

Confirm: `createGame` → `openProject` reveals `addEntity`/`runBuild`; an edit persists to `games/<name>/public/project`; `runBuild` twice returns `skipped:'cached'` the second time; killing and restarting the server rehydrates the active project and `sessionStatus` shows `build: fresh` without rebuilding.

- [ ] **Step 5: Mark P5 shipped in the roadmap**

In `docs/ROADMAP.md`, move Phase 1 / P5 to the Shipped section (newest first) with the merge commit, and flip its status marker to `Shipped`, following the format of the existing P4 entry.

- [ ] **Step 6: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark P5 (persistent MCP build sessions) shipped"
```

---

## Self-Review

**Spec coverage:**
- Open/swap in workspace mode → Task 7 (`openProject`/`closeProject`, swap-on-second-open), Task 8 (wiring).
- Persist state/artifacts/findings/budgets/resume → Task 4 (SessionStore, `.automata/session/`), Task 7 (rehydrate on construct).
- Disk-is-truth write-through → Task 1 (`writeProjectFiles` + Node writer), Task 6 (write-through wrapper).
- Run & capture build/test/browser/evaluate → Task 5 (Runner), Task 8 (adapters).
- Expose changed-file/build/test/browser/eval results → Task 5 (results/findings), Task 7 (`sessionStatus`).
- Idempotent / artifact-hash guarded → Task 3 (fingerprint), Task 5 (per-step cache + `force` + freshness).
- Dynamic tool surface (`tools/list_changed`) → Task 7 (`bindNotifications`, dynamic `listTools`), Task 8 (server capability + `sendToolListChanged`).
- Error handling: build/test failure as data → Task 5 test; no-project-open errors → Task 7 test; corrupt-session fail-fresh + pid lock → Task 4 tests.
- Chosen defaults: gitignore `.automata/` (Task 8); budgets recorded-not-enforced (Task 4 store, no enforcement path); browserSmoke minimal (Task 5/8); `writeProjectFiles` in `@automata/project` (Task 1); corrupt→fail-fresh (Task 4); pid lock (Task 4).
- Non-goals (seed/replay harness, pack-composition seam, budget enforcement, full acceptance, multi-session) → not implemented; single active session enforced by the pid lock.

**Type consistency:** `StepResult`/`Finding`/`SessionStore` defined in Task 4 and consumed unchanged in Tasks 5/7. `Step` union (`build|test|browser|evaluate`) defined in Task 5 and mapped from tool names via `RUN_STEPS` (+ explicit `evaluate` route) in Task 7. `ExecFn`/`BrowserSmokeFn` defined in Task 5, implemented in Task 8 (`nodeExec`/`playwrightBrowserSmoke`), injected in Task 7 tests as fakes. `ProjectFileWriter`/`writeProjectFiles` defined in Task 1, consumed in Task 6. `SessionHost.bindNotifications` defined in Task 7, called in Task 8.

**Placeholder scan:** every code step shows real code; commands have expected outcomes; no "TBD"/"similar to Task N". The one deliberately un-unit-tested unit — `adapters.ts` — is called out as the injected process/browser boundary, exercised only by the Task 9 manual smoke (the browser path has no automated coverage by design).
