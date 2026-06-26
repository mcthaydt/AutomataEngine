# Editor MCP Server (M16d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the shared tool registry to external MCP clients (Claude Desktop / Claude Code) via a Node MCP server that binds a **headless in-memory monkey-ball document** as the same `@automata/contracts` `ToolHost` the browser editor uses — reusing `SceneModel.apply`, `validateDoc`, and `runHeadlessPlay` with zero new editing logic.

**Architecture:** A new `tools/editor-mcp-server` package. The authoritative document lives in memory and is driven by `createEditorToolHost` (the generic sandbox host from `@automata/editor` — here the sandbox *is* the server's document). Boot data (archetype library + physics tuning) loads from monkey-ball's shipped data via Node `fs` + `parseData`, then `createMonkeyBallDefinition` builds the definition. A small pure `mcpAdapter` maps `ToolHost` → MCP `tools/resources` request/response shapes (the tested core). A thin `server.ts` wires those mappers to `@modelcontextprotocol/sdk` request handlers, and `main.ts` starts a stdio transport. Additive — a separate process, not required for the browser flow.

**Tech Stack:** TypeScript (ES2022, ESM, strict), `@modelcontextprotocol/sdk`, `@automata/contracts`, `@automata/editor`, `@automata/engine`, `monkey-ball`, `tsx` (run the `.ts` entry under Node), Vitest ^4.1.8.

Builds on M16a-1 ([contracts](2026-06-21-m16a-shared-contracts.md)), M16a-3 ([editor host](2026-06-21-m16a-3-editor-host-chat-shell.md) — `createEditorToolHost`), and M16b ([tuning](2026-06-21-m16b-tuning-loop.md) — the widened headless seam that makes `testPlay` deterministic). Full design: [`docs/superpowers/specs/2026-06-21-editor-mcp-tuning-design.md`](../specs/2026-06-21-editor-mcp-tuning-design.md).

## Global Constraints

- The MCP server reuses the existing seams — **no new editing logic**. The host is `createEditorToolHost({ definition, initialDoc })`; the server only maps that host to MCP.
- `tools/**` may use third-party libs only through `@automata/engine`, except libs not in the lint block — `@modelcontextprotocol/sdk` is allowed (it is not in the blocked group `three/@dimforge/miniplex/smol-toml/yaml/zod`). Do not import `zod` directly here; tool-arg validation goes through `parseToolArgs` inside the reused host.
- `tools/**` is **not** in the coverage `include`, so the 90% gate does not measure this package — but the tested core (`headlessHost`, `mcpAdapter`) must have passing unit tests. `server.ts` / `main.ts` are thin SDK/stdio glue and are not unit-tested.
- Boot data is read from monkey-ball's shipped files (`games/monkey-ball/public/data/{archetypes/standard.yaml,config/physics.toml}`) with Node `fs`; the server keeps keys server-side by construction (there are none — the MCP *client* is the brain).
- Tests live in `tools/editor-mcp-server/tests/**`; Vitest project name `editor-mcp-server`, `environment: 'node'`.

---

### Task 1: Scaffold the `editor-mcp-server` package

**Files:**
- Create: `tools/editor-mcp-server/package.json`
- Create: `tools/editor-mcp-server/tsconfig.json`
- Create: `tools/editor-mcp-server/vitest.config.ts`
- Create: `tools/editor-mcp-server/tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing yet.
- Produces: an installable workspace package with a Vitest project named `editor-mcp-server`.

- [x] **Step 1: Create the package manifest**

`tools/editor-mcp-server/package.json`:

```json
{
  "name": "editor-mcp-server",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "bin": { "automata-editor-mcp": "./src/main.ts" },
  "scripts": {
    "start": "tsx src/main.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/editor": "*",
    "@automata/engine": "*",
    "monkey-ball": "*",
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "tsx": "^4.20.0"
  }
}
```

> The MCP SDK's subpath entry points used here (`/server/index.js`, `/server/stdio.js`, `/types.js`) are stable across the `1.x` line. If `npm install` resolves a different major, confirm those paths still exist before Task 4.

- [x] **Step 2: Create the TS + Vitest config**

`tools/editor-mcp-server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`tools/editor-mcp-server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'editor-mcp-server', environment: 'node', include: ['tests/**/*.test.ts'] }
})
```

- [x] **Step 3: Create a smoke test**

`tools/editor-mcp-server/tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('editor-mcp-server package', () => {
  it('has a working test project', () => {
    expect(true).toBe(true)
  })
})
```

- [x] **Step 4: Install + run the smoke test**

Run: `npm install`
Expected: completes; `node_modules/@modelcontextprotocol/sdk` and `node_modules/tsx` exist.

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS (1 test).

- [x] **Step 5: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add tools/editor-mcp-server package-lock.json
git commit -m "feat(mcp): scaffold editor-mcp-server package"
```

---

### Task 2: Headless host (boot data + monkey-ball definition + editor ToolHost)

**Files:**
- Create: `tools/editor-mcp-server/src/headlessHost.ts`
- Create: `tools/editor-mcp-server/tests/headlessHost.test.ts`

**Interfaces:**
- Consumes: `parseData` from `@automata/engine`; `createEditorToolHost`, type `EditorToolHost`, type `GameDefinition` from `@automata/editor`; `archetypeLibraryKind`, `createMonkeyBallDefinition`, `physicsTuningKind`, `toPhysicsTuning`, type `Level` from `monkey-ball`.
- Produces: types `HeadlessHostOptions`, `HeadlessHost`; value `createHeadlessHost(opts?): Promise<HeadlessHost>`.

- [x] **Step 1: Write the failing test**

`tools/editor-mcp-server/tests/headlessHost.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createHeadlessHost } from '../src/headlessHost'

describe('headless MCP host', () => {
  it('lists the registry tools and reads the seeded doc', async () => {
    const { host } = await createHeadlessHost()
    expect(host.listTools().map((d) => d.name)).toEqual(
      expect.arrayContaining(['addItem', 'getDoc', 'validate', 'testPlay'])
    )
    const doc = (await host.executeTool('getDoc', {})).content as { geometry: unknown[] }
    expect(Array.isArray(doc.geometry)).toBe(true)
  })

  it('applies an addItem to the in-memory doc and keeps it valid', async () => {
    const { host } = await createHeadlessHost()
    const before = ((await host.executeTool('listItems', {})).content as unknown[]).length
    const res = await host.executeTool('addItem', {
      item: {
        id: 'box:42',
        kind: 'box',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
        surface: { kind: 'color', value: '#ffffff' }
      }
    })
    expect(res.ok).toBe(true)
    const after = ((await host.executeTool('listItems', {})).content as unknown[]).length
    expect(after).toBe(before + 1)
    const validation = await host.executeTool('validate', {})
    expect(validation.ok).toBe(true)
    expect(validation.content).toEqual({ issues: [], exportable: true })
  })

  it('runs a deterministic headless test-play through the reused runHeadlessPlay', async () => {
    const { host } = await createHeadlessHost()
    const res = await host.executeTool('testPlay', { maxSteps: 30 })
    expect(res.ok).toBe(true)
    expect(res.content).toMatchObject({ outcome: expect.any(String), steps: expect.any(Number) })
  }, 20000)
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor-mcp-server tests/headlessHost.test.ts`
Expected: FAIL ("Cannot find module '../src/headlessHost'").

- [x] **Step 3: Implement the headless host**

`tools/editor-mcp-server/src/headlessHost.ts`:

```ts
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseData } from '@automata/engine'
import { createEditorToolHost, type EditorToolHost, type GameDefinition } from '@automata/editor'
import {
  archetypeLibraryKind,
  createMonkeyBallDefinition,
  physicsTuningKind,
  toPhysicsTuning,
  type Level
} from 'monkey-ball'

/** src → up three → repo root → monkey-ball's shipped data. */
const DEFAULT_DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../games/monkey-ball/public/data')

export interface HeadlessHostOptions {
  /** Directory containing `archetypes/` and `config/`; defaults to monkey-ball's shipped data. */
  dataDir?: string
  /** Initial level as JSON text; defaults to the empty doc. */
  levelJson?: string
}

export interface HeadlessHost {
  host: EditorToolHost<Level>
  definition: GameDefinition<Level>
}

export async function createHeadlessHost(opts: HeadlessHostOptions = {}): Promise<HeadlessHost> {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR
  const read = (rel: string): string => readFileSync(resolve(dataDir, rel), 'utf8')

  const lib = parseData(archetypeLibraryKind, read('archetypes/standard.yaml'), 'standard.yaml')
  const tuning = toPhysicsTuning(parseData(physicsTuningKind, read('config/physics.toml'), 'physics.toml'))
  const definition = createMonkeyBallDefinition(lib, tuning)

  const initialDoc = opts.levelJson
    ? definition.scene.parse(JSON.parse(opts.levelJson))
    : definition.scene.emptyDoc()

  const host = createEditorToolHost<Level>({ definition, initialDoc })
  return { host, definition }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project editor-mcp-server tests/headlessHost.test.ts`
Expected: PASS (3 tests; the `testPlay` test boots rapier headless and returns a `TestPlayResult`).

- [x] **Step 5: Commit**

```bash
git add tools/editor-mcp-server/src/headlessHost.ts tools/editor-mcp-server/tests/headlessHost.test.ts
git commit -m "feat(mcp): headless host (monkey-ball boot data + reused editor ToolHost)"
```

---

### Task 3: MCP adapter (pure ToolHost → MCP shapes)

**Files:**
- Create: `tools/editor-mcp-server/src/mcpAdapter.ts`
- Create: `tools/editor-mcp-server/tests/mcpAdapter.test.ts`

**Interfaces:**
- Consumes: `RESOURCE_URIS`, types `ToolHost`, `ToolName`, `ResourceUri` from `@automata/contracts`.
- Produces: `listToolsResult(host)`, `callToolResult(host, name, args)`, `listResourcesResult()`, `readResourceResult(host, uri)`.

- [x] **Step 1: Write the failing test**

`tools/editor-mcp-server/tests/mcpAdapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ToolHost } from '@automata/contracts'
import { callToolResult, listResourcesResult, listToolsResult, readResourceResult } from '../src/mcpAdapter'

const fakeHost: ToolHost = {
  listTools: () => [{ name: 'getDoc', description: 'read the doc', schema: { type: 'object' } }],
  executeTool: async (name) => ({ ok: true, content: { tool: name } }),
  readResource: async (uri) => ({ uri })
}

describe('mcp adapter', () => {
  it('maps tool defs to MCP { name, description, inputSchema }', () => {
    expect(listToolsResult(fakeHost)).toEqual({
      tools: [{ name: 'getDoc', description: 'read the doc', inputSchema: { type: 'object' } }]
    })
  })

  it('wraps a tool result as MCP text content with isError', async () => {
    const ok = await callToolResult(fakeHost, 'getDoc', {})
    expect(ok.content[0]).toEqual({ type: 'text', text: JSON.stringify({ tool: 'getDoc' }) })
    expect(ok.isError).toBe(false)
  })

  it('reports isError true when the host result is an error', async () => {
    const erroring: ToolHost = { ...fakeHost, executeTool: async () => ({ ok: false, isError: true, content: 'bad' }) }
    expect((await callToolResult(erroring, 'addItem', {})).isError).toBe(true)
  })

  it('lists the editor resource uris', () => {
    expect(listResourcesResult().resources.map((r) => r.uri)).toContain('editor://doc')
  })

  it('reads a resource as JSON text', async () => {
    const res = await readResourceResult(fakeHost, 'editor://doc')
    expect(JSON.parse(res.contents[0]!.text)).toEqual({ uri: 'editor://doc' })
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor-mcp-server tests/mcpAdapter.test.ts`
Expected: FAIL ("Cannot find module '../src/mcpAdapter'").

- [x] **Step 3: Implement the adapter**

`tools/editor-mcp-server/src/mcpAdapter.ts`:

```ts
import { RESOURCE_URIS, type ResourceUri, type ToolHost, type ToolName } from '@automata/contracts'

export type McpToolsResult = {
  tools: { name: string; description: string; inputSchema: unknown }[]
}
export type McpCallResult = {
  content: { type: 'text'; text: string }[]
  isError: boolean
}
export type McpResourcesResult = {
  resources: { uri: string; name: string; mimeType: string }[]
}
export type McpReadResult = {
  contents: { uri: string; mimeType: string; text: string }[]
}

export function listToolsResult(host: ToolHost): McpToolsResult {
  return {
    tools: host.listTools().map((d) => ({ name: d.name, description: d.description, inputSchema: d.schema }))
  }
}

export async function callToolResult(host: ToolHost, name: string, args: unknown): Promise<McpCallResult> {
  const result = await host.executeTool(name as ToolName, args ?? {})
  return {
    content: [{ type: 'text', text: JSON.stringify(result.content) }],
    isError: result.isError === true
  }
}

export function listResourcesResult(): McpResourcesResult {
  return {
    resources: Object.values(RESOURCE_URIS).map((uri) => ({ uri, name: uri, mimeType: 'application/json' }))
  }
}

export async function readResourceResult(host: ToolHost, uri: string): Promise<McpReadResult> {
  const content = await host.readResource(uri as ResourceUri)
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(content) }] }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project editor-mcp-server tests/mcpAdapter.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add tools/editor-mcp-server/src/mcpAdapter.ts tools/editor-mcp-server/tests/mcpAdapter.test.ts
git commit -m "feat(mcp): pure ToolHost → MCP request/response mapping"
```

---

### Task 4: MCP server wiring + stdio entry point

**Files:**
- Create: `tools/editor-mcp-server/src/server.ts`
- Create: `tools/editor-mcp-server/src/main.ts`
- Create: `tools/editor-mcp-server/README.md` (how to connect Claude Desktop / Code)

**Interfaces:**
- Consumes: `@modelcontextprotocol/sdk` `Server`, `StdioServerTransport`, the request schemas; `ToolHost` from `@automata/contracts`; the `mcpAdapter` functions; `createHeadlessHost`.
- Produces: `createMcpServer(host): Server`; an executable `main.ts` that boots the host and serves over stdio.

- [x] **Step 1: Wire the server**

`tools/editor-mcp-server/src/server.ts`:

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolHost } from '@automata/contracts'
import { callToolResult, listResourcesResult, listToolsResult, readResourceResult } from './mcpAdapter'

/** Binds a contracts ToolHost to an MCP Server exposing the registry as tools + resources. */
export function createMcpServer(host: ToolHost): Server {
  const server = new Server(
    { name: 'automata-editor', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => listToolsResult(host))
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callToolResult(host, req.params.name, req.params.arguments)
  )
  server.setRequestHandler(ListResourcesRequestSchema, async () => listResourcesResult())
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => readResourceResult(host, req.params.uri))

  return server
}
```

> The MCP SDK symbol names above (`Server`, the four `*RequestSchema`, `StdioServerTransport`) are from the official `@modelcontextprotocol/sdk` server API. If `npm run typecheck` flags a renamed export, fetch the exact name from the installed `node_modules/@modelcontextprotocol/sdk` package types — the `mcpAdapter` mapping (Task 3) is unaffected either way.

- [x] **Step 2: Add the entry point**

`tools/editor-mcp-server/src/main.ts`:

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createHeadlessHost } from './headlessHost'
import { createMcpServer } from './server'

async function main(): Promise<void> {
  const levelJson = process.env.AUTOMATA_LEVEL_JSON
  const { host } = await createHeadlessHost({ levelJson })
  const server = createMcpServer(host)
  await server.connect(new StdioServerTransport())
  // stdio transport keeps the process alive; do not write to stdout (it is the MCP channel).
  process.stderr.write('automata-editor MCP server ready\n')
}

void main()
```

- [x] **Step 3: Document how to connect**

`tools/editor-mcp-server/README.md`:

````markdown
# Automata Editor MCP Server

A Node MCP server that exposes the level-editor command/eval registry to MCP clients
(Claude Desktop / Claude Code) over stdio. It binds a headless in-memory monkey-ball
document as the same `@automata/contracts` `ToolHost` the browser editor uses.

## Tools

`addItem`, `moveSelected`, `setItemField`, `setSurface`, `setMetadata`, `deleteItems`,
`getDoc`, `listItems`, `validate`, `testPlay` — plus resources `editor://doc`,
`editor://items`, `editor://validation`, `editor://baseline`.

## Run

```sh
npm run start -w editor-mcp-server
# optional: seed an initial level
AUTOMATA_LEVEL_JSON="$(cat path/to/level.json)" npm run start -w editor-mcp-server
```

## Connect Claude Desktop / Claude Code

Add to the MCP client config (adjust the absolute path):

```json
{
  "mcpServers": {
    "automata-editor": {
      "command": "<repo>/node_modules/.bin/tsx",
      "args": ["<repo>/tools/editor-mcp-server/src/main.ts"]
    }
  }
}
```

The live browser editor syncs via the existing doc load/export round-trip:
export a level from the editor, pass it as `AUTOMATA_LEVEL_JSON`, edit via the agent,
and re-import the result.
````

- [x] **Step 4: Typecheck, lint, and verify the tested core still passes**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (If the SDK export names differ in the installed version, fix the imports in `server.ts`/`main.ts` per the note in Step 1 — no logic change.)

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS (smoke + headlessHost + mcpAdapter tests).

- [x] **Step 5: Manual smoke (optional, not part of CI)**

Run: `npm run start -w editor-mcp-server`
Expected: prints `automata-editor MCP server ready` to stderr and waits on stdio. Connect Claude Desktop/Code per the README and confirm the tool list matches the 10 tools above and that a round-tripped `addItem` then `validate` reports no issues. Stop with Ctrl-C.

- [x] **Step 6: Commit**

```bash
git add tools/editor-mcp-server/src/server.ts tools/editor-mcp-server/src/main.ts tools/editor-mcp-server/README.md
git commit -m "feat(mcp): MCP server wiring + stdio entry point"
```

---

## Self-Review

- **Spec coverage:** Implements the spec's Component 4 (`tools/editor-mcp-server`): a Node MCP server implementing the same `contracts` `ToolHost` against a headless in-memory doc (reusing `SceneModel.apply`/`validateDoc`/`runHeadlessPlay` via `createEditorToolHost` + `createMonkeyBallDefinition`), exposing the registry as MCP tools + resources, reusable by Claude Desktop / Claude Code, and additive (a separate process). The browser↔server sync uses the existing doc load/export round-trip (`AUTOMATA_LEVEL_JSON` seed + re-import), as the spec describes.
- **Placeholder scan:** No TBD/TODO. The two SDK-version notes (Task 1 subpath stability, Task 4 export-name contingency) are real install-time verifications with a concrete fallback (read the installed package types), not deferred work; the tested core does not depend on them.
- **Type consistency:** `createHeadlessHost` returns `EditorToolHost<Level>` (from M16a-3) bound via `createMonkeyBallDefinition` (monkey-ball). The `mcpAdapter` functions consume the `ToolHost`/`ToolName`/`ResourceUri` and `RESOURCE_URIS` from `@automata/contracts` (M16a-1) and produce MCP shapes (`tools[].inputSchema`, `content[].text`, `resources[].uri`, `contents[].text`) that `server.ts` hands to the SDK request handlers unchanged. `testPlay` runs the M16b-widened `runHeadlessPlay` (open-loop here; the seek-goal closed loop is the tuning loop's concern, not the MCP host's).
