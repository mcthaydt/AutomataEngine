# Editor ToolHost + Chat Overlay Shell (M16a-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the shared tool registry to the live editor and add an in-editor chat overlay shell: a `ToolHost` over a **sandbox copy** of the document (never mutating the live store), local-storage provider/key/model settings, and a chat panel that drives the agent and reports proposed changes — with apply/confirm deferred to M16c.

**Architecture:** Three new editor modules plus chrome/theme wiring. `editorToolHost.ts` implements the `@automata/contracts` `ToolHost` against a sandbox `Doc`: write tools `apply` `SceneCommand`s to the sandbox via `SceneModel.apply`, read tools and resources read the sandbox, `testPlay` calls the generic `definition.play.runHeadlessPlay`. `settings.ts` persists provider/key/model in `localStorage` and builds a `ProviderAdapter` from `@automata/agent-core`. `chatOverlay.ts` is a `PanelHandle<Doc>` mounted in `renderEditorChrome`; it runs the agent loop against a fresh sandbox host and shows the assistant reply plus the count of proposed (not-yet-applied) commands. All wiring is injectable so tests never hit the network.

**Tech Stack:** TypeScript (ES2022, ESM, strict), `@automata/contracts`, `@automata/agent-core`, vanilla DOM (happy-dom in tests), Vitest ^4.1.8.

This is the third slice of M16a, building on M16a-1 ([contracts](2026-06-21-m16a-shared-contracts.md)) and M16a-2 ([agent-core](2026-06-21-m16a-2-agent-core.md)). Follow-on: M16c preview/confirm ([`2026-06-21-m16c-preview-confirm.md`](2026-06-21-m16c-preview-confirm.md)) adds the batch-diff + apply to this overlay; M16b adds the tuning loop. Full design: [`docs/superpowers/specs/2026-06-21-editor-mcp-tuning-design.md`](../specs/2026-06-21-editor-mcp-tuning-design.md).

## Global Constraints

- The generic editor core stays game-agnostic: new code is generic over `Doc` and reaches gameplay only through `GameDefinition` (`scene.apply`, `scene.listItems`, `play?.runHeadlessPlay`). No `monkey-ball` import (enforced by the existing editor eslint rule).
- The editor may use third-party libs only through `@automata/engine`; the provider SDKs are reached only through `@automata/agent-core` (a first-party workspace package), never imported directly in `packages/editor`.
- `executeTool` **must not** mutate the live `EditorStore` — it operates on a sandbox copy. This is the spec's "never auto-mutates without confirmation" floor; apply-to-live is M16c.
- Tests live in `packages/editor/tests/**`; project `editor`, `environment: 'happy-dom'`. No network: the chat overlay and provider factory are injectable.
- The 90% line/branch coverage gate over `packages/editor/src/**` must stay green. `src/index.ts` and `**/browser.ts` are excluded by the existing coverage config; the new modules are not, so they need tests.
- `localStorage` is the only key store; keys are never logged. Settings key: `automata-agent-settings`.

---

### Task 1: Editor ToolHost over a sandbox doc

**Files:**
- Create: `packages/editor/src/agent/editorToolHost.ts`
- Create: `packages/editor/tests/agent/editorToolHost.test.ts`
- Modify: `packages/editor/package.json` (depend on `@automata/agent-core`)
- Modify: `packages/editor/src/index.ts` (export the host)

**Interfaces:**
- Consumes: `toolDefs`, `parseToolArgs`, `RESOURCE_URIS`, types `ToolHost`, `ToolName`, `ToolResult`, `ResourceUri`, `SceneCommand` from `@automata/contracts`; `GameDefinition` from `../model/gameDefinition`; `validateDoc` from `../io/validation`.
- Produces:
  - Types: `EditorToolHostOptions<Doc>`, `EditorToolHost<Doc>`.
  - Value: `createEditorToolHost<Doc>(opts): EditorToolHost<Doc>`.

- [x] **Step 1: Add the agent-core dependency**

`packages/editor/package.json` `dependencies` becomes:

```json
  "dependencies": {
    "@automata/engine": "*",
    "@automata/contracts": "*",
    "@automata/agent-core": "*"
  }
```

Run: `npm install`
Expected: completes; `node_modules/@automata/agent-core` resolves from the editor.

- [x] **Step 2: Write the failing test**

`packages/editor/tests/agent/editorToolHost.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createEditorToolHost } from '../../src/agent/editorToolHost'
import { boxItem, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const seed = (): FakeDoc => ({ title: 'level', items: [boxItem('a')] })

describe('editorToolHost', () => {
  it('applies a write tool to the sandbox without touching the seed doc', async () => {
    const doc = seed()
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: doc })
    const res = await host.executeTool('addItem', { item: boxItem('b', 2, 2) })
    expect(res.ok).toBe(true)
    expect(doc.items).toHaveLength(1) // seed unchanged
    expect(host.doc.items).toHaveLength(2) // sandbox advanced
    expect(host.commands).toEqual([{ type: 'addItem', item: boxItem('b', 2, 2) }])
  })

  it('returns an error result for invalid args rather than throwing', async () => {
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: seed() })
    const res = await host.executeTool('moveSelected', { ids: 'not-an-array' })
    expect(res.ok).toBe(false)
    expect(res.isError).toBe(true)
  })

  it('reads items, validation, doc, and runs testPlay', async () => {
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: seed() })
    expect((await host.executeTool('listItems', {})).content).toHaveLength(1)
    expect((await host.executeTool('getDoc', {})).content).toEqual(host.doc)
    expect((await host.executeTool('validate', {})).ok).toBe(true)
    const play = await host.executeTool('testPlay', { maxSteps: 30 })
    expect(play.ok).toBe(true)
    expect(play.content).toMatchObject({ outcome: 'incomplete' })
  })

  it('exposes resources by uri, with baseline defaulting to null', async () => {
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: seed() })
    expect(await host.readResource('editor://items')).toHaveLength(1)
    expect(await host.readResource('editor://baseline')).toBeNull()
    expect(host.listTools().map((d) => d.name)).toContain('addItem')
  })
})
```

- [x] **Step 3: Run it to verify it fails**

Run: `npx vitest run --project editor tests/agent/editorToolHost.test.ts`
Expected: FAIL ("Cannot find module '../../src/agent/editorToolHost'").

- [x] **Step 4: Implement the editor ToolHost**

`packages/editor/src/agent/editorToolHost.ts`:

```ts
import {
  RESOURCE_URIS,
  parseToolArgs,
  toolDefs,
  type ResourceUri,
  type SceneCommand,
  type ToolDef,
  type ToolHost,
  type ToolName,
  type ToolResult
} from '@automata/contracts'
import type { GameDefinition } from '../model/gameDefinition'
import { validateDoc } from '../io/validation'

export interface EditorToolHostOptions<Doc> {
  definition: GameDefinition<Doc>
  /** The doc to seed the sandbox from; copied-on-write via SceneModel.apply, never mutated. */
  initialDoc: Doc
  /** Returned by readResource('editor://baseline'); defaults to null. */
  baseline?: unknown
}

export interface EditorToolHost<Doc> extends ToolHost {
  /** Sandbox doc after applied write tools — never the live store. */
  readonly doc: Doc
  /** Write commands applied to the sandbox, in order; the batch a UI host can preview/apply. */
  readonly commands: SceneCommand[]
}

const WRITE_TOOLS = new Set<ToolName>([
  'addItem',
  'moveSelected',
  'setItemField',
  'setSurface',
  'setMetadata',
  'deleteItems'
])

function errorResult(error: unknown): ToolResult {
  return { ok: false, isError: true, content: error instanceof Error ? error.message : String(error) }
}

export function createEditorToolHost<Doc>(opts: EditorToolHostOptions<Doc>): EditorToolHost<Doc> {
  const { definition } = opts
  let doc = opts.initialDoc
  const commands: SceneCommand[] = []

  return {
    get doc() {
      return doc
    },
    get commands() {
      return commands
    },
    listTools(): ToolDef[] {
      return toolDefs()
    },
    async executeTool(name: ToolName, args: unknown): Promise<ToolResult> {
      let parsed: unknown
      try {
        parsed = parseToolArgs(name, args)
      } catch (error) {
        return errorResult(error)
      }

      if (WRITE_TOOLS.has(name)) {
        // Write tool args = the command minus its `type` discriminant; re-add it.
        const command = { type: name, ...(parsed as object) } as SceneCommand
        try {
          doc = definition.scene.apply(doc, command)
        } catch (error) {
          return errorResult(error)
        }
        commands.push(command)
        return { ok: true, content: { applied: name, items: definition.scene.listItems(doc).length } }
      }

      switch (name) {
        case 'getDoc':
          return { ok: true, content: doc }
        case 'listItems':
          return { ok: true, content: definition.scene.listItems(doc) }
        case 'validate':
          return { ok: true, content: validateDoc(definition, doc) }
        case 'testPlay': {
          if (!definition.play) return { ok: false, isError: true, content: 'this game has no test-play support' }
          const { maxSteps } = parsed as { maxSteps: number }
          const result = await definition.play.runHeadlessPlay(doc, { maxSteps })
          return { ok: true, content: result }
        }
        default:
          return { ok: false, isError: true, content: `unknown tool ${name}` }
      }
    },
    async readResource(uri: ResourceUri): Promise<unknown> {
      switch (uri) {
        case RESOURCE_URIS.doc:
          return doc
        case RESOURCE_URIS.items:
          return definition.scene.listItems(doc)
        case RESOURCE_URIS.validation:
          return validateDoc(definition, doc)
        case RESOURCE_URIS.baseline:
          return opts.baseline ?? null
        default:
          return null
      }
    }
  }
}
```

- [x] **Step 5: Export from the editor barrel**

In `packages/editor/src/index.ts`, add after the `export * from './grid'` line:

```ts
export * from './agent/editorToolHost'
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/agent/editorToolHost.test.ts`
Expected: PASS (4 tests).

- [x] **Step 7: Commit**

```bash
git add packages/editor/src/agent/editorToolHost.ts packages/editor/tests/agent/editorToolHost.test.ts \
  packages/editor/src/index.ts packages/editor/package.json package-lock.json
git commit -m "feat(editor): ToolHost over a sandbox doc (never mutates the live store)"
```

---

### Task 2: Agent settings (provider/key/model in localStorage) + provider factory

**Files:**
- Create: `packages/editor/src/agent/settings.ts`
- Create: `packages/editor/tests/agent/settings.test.ts`
- Modify: `packages/editor/src/index.ts` (export settings)

**Interfaces:**
- Consumes: `createAnthropicAdapter`, `createOpenAiAdapter`, `createDeepSeekAdapter`, `DEFAULT_ANTHROPIC_MODEL`, `DEFAULT_OPENAI_MODEL`, `DEFAULT_DEEPSEEK_MODEL`, types `ProviderAdapter`, `ProviderId` from `@automata/agent-core`.
- Produces:
  - Type: `AgentSettings`.
  - Values: `defaultAgentSettings()`, `loadAgentSettings(storage?)`, `saveAgentSettings(s, storage?)`, `createProvider(settings)`.

- [x] **Step 1: Write the failing test**

`packages/editor/tests/agent/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createProvider,
  defaultAgentSettings,
  loadAgentSettings,
  saveAgentSettings
} from '../../src/agent/settings'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    }
  } as Storage
}

describe('agent settings', () => {
  it('returns defaults when nothing is stored', () => {
    const s = loadAgentSettings(memoryStorage())
    expect(s).toEqual(defaultAgentSettings())
    expect(s.provider).toBe('anthropic')
    expect(s.models.anthropic).toBe('claude-opus-4-8')
  })

  it('round-trips through storage and merges partial saved state over defaults', () => {
    const store = memoryStorage()
    saveAgentSettings({ ...defaultAgentSettings(), provider: 'openai' }, store)
    expect(loadAgentSettings(store).provider).toBe('openai')
  })

  it('falls back to defaults on corrupt JSON', () => {
    const store = memoryStorage()
    store.setItem('automata-agent-settings', '{not json')
    expect(loadAgentSettings(store)).toEqual(defaultAgentSettings())
  })

  it('builds a provider adapter for each provider without making a network call', () => {
    for (const provider of ['anthropic', 'openai', 'deepseek'] as const) {
      const settings = { ...defaultAgentSettings(), provider, apiKeys: { anthropic: 'k', openai: 'k', deepseek: 'k' } }
      const adapter = createProvider(settings)
      expect(adapter.id).toBe(provider)
    }
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/agent/settings.test.ts`
Expected: FAIL ("Cannot find module '../../src/agent/settings'").

- [x] **Step 3: Implement settings**

`packages/editor/src/agent/settings.ts`:

```ts
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_OPENAI_MODEL,
  createAnthropicAdapter,
  createDeepSeekAdapter,
  createOpenAiAdapter,
  type ProviderAdapter,
  type ProviderId
} from '@automata/agent-core'

const STORAGE_KEY = 'automata-agent-settings'

export interface AgentSettings {
  provider: ProviderId
  /** Per-provider API keys; live only in localStorage, never logged. */
  apiKeys: Record<ProviderId, string>
  /** Per-provider model id; user-overridable. */
  models: Record<ProviderId, string>
}

export function defaultAgentSettings(): AgentSettings {
  return {
    provider: 'anthropic',
    apiKeys: { anthropic: '', openai: '', deepseek: '' },
    models: {
      anthropic: DEFAULT_ANTHROPIC_MODEL,
      openai: DEFAULT_OPENAI_MODEL,
      deepseek: DEFAULT_DEEPSEEK_MODEL
    }
  }
}

export function loadAgentSettings(storage: Storage = localStorage): AgentSettings {
  const fallback = defaultAgentSettings()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<AgentSettings>
    return {
      provider: parsed.provider ?? fallback.provider,
      apiKeys: { ...fallback.apiKeys, ...parsed.apiKeys },
      models: { ...fallback.models, ...parsed.models }
    }
  } catch {
    return fallback
  }
}

export function saveAgentSettings(settings: AgentSettings, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** Builds a provider adapter from settings. Does no network I/O; keys are used on send(). */
export function createProvider(settings: AgentSettings): ProviderAdapter {
  const apiKey = settings.apiKeys[settings.provider]
  const model = settings.models[settings.provider]
  switch (settings.provider) {
    case 'anthropic':
      return createAnthropicAdapter({ apiKey, model })
    case 'openai':
      return createOpenAiAdapter({ apiKey, model })
    case 'deepseek':
      return createDeepSeekAdapter({ apiKey, model })
  }
}
```

- [x] **Step 4: Export from the editor barrel**

In `packages/editor/src/index.ts`, add after the `editorToolHost` export:

```ts
export * from './agent/settings'
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/agent/settings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/agent/settings.ts packages/editor/tests/agent/settings.test.ts \
  packages/editor/src/index.ts
git commit -m "feat(editor): agent settings (provider/key/model in localStorage) + provider factory"
```

---

### Task 3: Chat overlay panel shell

**Files:**
- Create: `packages/editor/src/ui/chatOverlay.ts`
- Create: `packages/editor/tests/ui/chatOverlay.test.ts`
- Modify: `packages/editor/src/index.ts` (export the overlay)

**Interfaces:**
- Consumes: `EditorCore` from `../host`; `EditorState` from `../state/store`; `PanelHandle` from `./panel`; `createEditorToolHost`, `EditorToolHost` from `../agent/editorToolHost`; `createProvider`, `loadAgentSettings`, `saveAgentSettings`, `AgentSettings` from `../agent/settings`; `runAgent`, `AgentRunResult`, `ProviderAdapter`, `ProviderId` from `@automata/agent-core`.
- Produces:
  - Types: `ChatRunOutput<Doc>`, `ChatOverlayDeps<Doc>`, `DefaultChatDepsOptions`.
  - Values: `CHAT_SYSTEM_PROMPT`, `defaultChatDeps<Doc>(opts?)`, `mountChatOverlay<Doc>(core, parent, deps?)`.

- [ ] **Step 1: Write the failing test**

`packages/editor/tests/ui/chatOverlay.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { createEditorToolHost } from '../../src/agent/editorToolHost'
import { defaultChatDeps, mountChatOverlay, type ChatOverlayDeps } from '../../src/ui/chatOverlay'
import { boxItem, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'
import type { AgentSettings } from '../../src/agent/settings'

const nullPhysics = (): PhysicsPort =>
  ({
    addBody() {}, removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {}, setKinematicTarget() {},
    get bodyCount() { return 0 }, dispose() {}
  }) as PhysicsPort

function makeEditor() {
  const editor = createEditor<FakeDoc>({
    definition: playableDefinition,
    render: createNullRenderer().port,
    physics: nullPhysics()
  })
  editor.store.dispatch({ type: 'loadDoc', doc: { title: 'lvl', items: [boxItem('a')] } })
  return editor
}

const settings: AgentSettings = {
  provider: 'anthropic',
  apiKeys: { anthropic: 'k', openai: '', deepseek: '' },
  models: { anthropic: 'claude-opus-4-8', openai: 'gpt-5', deepseek: 'deepseek-chat' }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('chat overlay', () => {
  it('sends a prompt and renders the assistant reply + proposed-change count', async () => {
    const editor = makeEditor()
    const parent = document.createElement('div')
    const run = vi.fn(async (doc: FakeDoc, prompt: string) => {
      const host = createEditorToolHost({ definition: playableDefinition, initialDoc: doc })
      await host.executeTool('addItem', { item: boxItem('b') })
      return { result: { finalText: 'added a box', messages: [], executed: [], stoppedBy: 'end' as const }, host }
    })
    const deps: ChatOverlayDeps<FakeDoc> = {
      loadSettings: () => settings,
      saveSettings: () => {},
      run
    }
    const panel = mountChatOverlay(editor, parent, deps)
    panel.update(editor.store.getState())

    const input = parent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!
    input.value = 'add a box near the goal'
    parent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ items: [expect.objectContaining({ id: 'a' })] }),
      'add a box near the goal',
      editor,
      settings
    )
    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('add a box near the goal')
    expect(log).toContain('added a box')
    expect(log).toContain('1 proposed change')
    // The live store must be untouched (no apply yet).
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(1)
    panel.dispose()
  })

  it('persists a provider change through saveSettings', () => {
    const editor = makeEditor()
    const parent = document.createElement('div')
    const saveSettings = vi.fn()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings,
      run: vi.fn()
    })
    const select = parent.querySelector<HTMLSelectElement>('.ed-chat-provider')!
    select.value = 'openai'
    select.dispatchEvent(new Event('change'))
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }))
    panel.dispose()
  })

  it('defaultChatDeps wires a sandbox host + injected provider/runAgent', async () => {
    const editor = makeEditor()
    const fakeProvider = { id: 'anthropic' as const, defaultModel: 'm', send: vi.fn() }
    const runAgentFn = vi.fn(async () => ({ finalText: 'ok', messages: [], executed: [], stoppedBy: 'end' as const }))
    const deps = defaultChatDeps<FakeDoc>({ createProviderFor: () => fakeProvider, runAgentFn })
    const output = await deps.run({ title: 'lvl', items: [boxItem('a')] }, 'go', editor, settings)
    expect(runAgentFn).toHaveBeenCalledOnce()
    expect(output.result.finalText).toBe('ok')
    expect(output.host.doc.items).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/ui/chatOverlay.test.ts`
Expected: FAIL ("Cannot find module '../../src/ui/chatOverlay'").

- [ ] **Step 3: Implement the chat overlay**

`packages/editor/src/ui/chatOverlay.ts`:

```ts
import { runAgent, type AgentRunResult, type ProviderAdapter, type ProviderId } from '@automata/agent-core'
import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import { createEditorToolHost, type EditorToolHost } from '../agent/editorToolHost'
import { createProvider, loadAgentSettings, saveAgentSettings, type AgentSettings } from '../agent/settings'
import type { PanelHandle } from './panel'

export const CHAT_SYSTEM_PROMPT =
  'You are a level-editing assistant. Use the provided tools to edit the level document. ' +
  'Validate and test-play your changes before finishing. Make the smallest edit that satisfies the request.'

/** What a chat run returns: the agent result plus the sandbox host that holds the proposed commands. */
export interface ChatRunOutput<Doc> {
  result: AgentRunResult
  host: EditorToolHost<Doc>
}

export interface ChatOverlayDeps<Doc> {
  loadSettings: () => AgentSettings
  saveSettings: (settings: AgentSettings) => void
  run: (doc: Doc, prompt: string, core: EditorCore<Doc>, settings: AgentSettings) => Promise<ChatRunOutput<Doc>>
}

export interface DefaultChatDepsOptions {
  createProviderFor?: (settings: AgentSettings) => ProviderAdapter
  runAgentFn?: typeof runAgent
}

export function defaultChatDeps<Doc>(opts: DefaultChatDepsOptions = {}): ChatOverlayDeps<Doc> {
  const makeProvider = opts.createProviderFor ?? createProvider
  const run = opts.runAgentFn ?? runAgent
  return {
    loadSettings: () => loadAgentSettings(),
    saveSettings: (settings) => saveAgentSettings(settings),
    run: async (doc, prompt, core, settings) => {
      const host = createEditorToolHost<Doc>({ definition: core.definition, initialDoc: doc })
      const provider = makeProvider(settings)
      const result = await run({ provider, host, system: CHAT_SYSTEM_PROMPT, prompt })
      return { result, host }
    }
  }
}

export function mountChatOverlay<Doc>(
  core: EditorCore<Doc>,
  parent: HTMLElement,
  deps: ChatOverlayDeps<Doc> = defaultChatDeps<Doc>()
): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-chat'
  parent.append(root)

  const head = document.createElement('div')
  head.className = 'ed-panel-head'
  head.textContent = 'Assistant'

  const controls = document.createElement('div')
  controls.className = 'ed-chat-controls'
  const provider = document.createElement('select')
  provider.className = 'ed-chat-provider'
  for (const id of ['anthropic', 'openai', 'deepseek'] as ProviderId[]) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id
    provider.append(opt)
  }
  const key = document.createElement('input')
  key.className = 'ed-chat-key'
  key.type = 'password'
  key.placeholder = 'API key'
  controls.append(provider, key)

  const log = document.createElement('div')
  log.className = 'ed-chat-log'

  const input = document.createElement('textarea')
  input.className = 'ed-chat-input'
  input.placeholder = 'Ask the assistant to edit the level…'
  const send = document.createElement('button')
  send.type = 'button'
  send.className = 'ed-chat-send'
  send.textContent = 'Send'

  root.append(head, controls, log, input, send)

  let currentDoc = core.store.getState().document.doc
  let busy = false

  const appendMessage = (roleClass: string, text: string): void => {
    const row = document.createElement('div')
    row.className = `ed-chat-msg ed-chat-${roleClass}`
    row.dataset.role = roleClass
    row.textContent = text
    log.append(row)
  }

  // renderProposal is the seam M16c replaces with the batch-diff + Apply UI.
  const renderProposal = (output: ChatRunOutput<Doc>): void => {
    const n = output.host.commands.length
    appendMessage('proposal', `${n} proposed change${n === 1 ? '' : 's'} (apply/confirm coming in M16c)`)
  }

  const syncControls = (): void => {
    const settings = deps.loadSettings()
    provider.value = settings.provider
    key.value = settings.apiKeys[settings.provider]
  }

  provider.addEventListener('change', () => {
    const settings = deps.loadSettings()
    settings.provider = provider.value as ProviderId
    deps.saveSettings(settings)
    key.value = settings.apiKeys[settings.provider]
  })
  key.addEventListener('change', () => {
    const settings = deps.loadSettings()
    settings.apiKeys[settings.provider] = key.value
    deps.saveSettings(settings)
  })

  const submit = async (): Promise<void> => {
    const prompt = input.value.trim()
    if (!prompt || busy) return
    busy = true
    send.disabled = true
    appendMessage('user', prompt)
    input.value = ''
    try {
      const output = await deps.run(currentDoc, prompt, core, deps.loadSettings())
      appendMessage('assistant', output.result.finalText || '(no reply)')
      renderProposal(output)
    } catch (error) {
      appendMessage('error', error instanceof Error ? error.message : String(error))
    } finally {
      busy = false
      send.disabled = false
    }
  }
  send.addEventListener('click', () => void submit())

  syncControls()

  return {
    update(state: EditorState<Doc>) {
      currentDoc = state.document.doc
    },
    dispose() {
      root.remove()
    }
  }
}
```

- [ ] **Step 4: Export from the editor barrel**

In `packages/editor/src/index.ts`, add after the `settings` export:

```ts
export { mountChatOverlay, defaultChatDeps, CHAT_SYSTEM_PROMPT } from './ui/chatOverlay'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project editor tests/ui/chatOverlay.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/ui/chatOverlay.ts packages/editor/tests/ui/chatOverlay.test.ts \
  packages/editor/src/index.ts
git commit -m "feat(editor): chat overlay shell (runs the agent against a sandbox host)"
```

---

### Task 4: Mount the chat overlay in the editor chrome + theme

**Files:**
- Modify: `packages/editor/src/ui/chrome.ts` (mount the overlay)
- Modify: `packages/editor/src/ui/theme.css.ts` (chat panel styles)
- Modify: `packages/editor/tests/ui/chrome.test.ts` (assert the overlay mounts) — only if the existing test asserts an exact child set

**Interfaces:**
- Consumes: `mountChatOverlay` from `./chatOverlay`.
- Produces: a `.ed-chat` panel rendered inside the right column of the editor chrome, updated by the shell's single store subscription.

- [ ] **Step 1: Write the failing test**

Add to `packages/editor/tests/ui/chrome.test.ts` a new test inside the existing `describe('editor chrome', ...)` block (keep the existing test). It reuses the file's `makeTestEditor` + `canvases` helpers and asserts the chat overlay mounts:

```ts
it('mounts the chat overlay panel in the chrome', () => {
  const root = document.createElement('div')
  const editor = makeTestEditor()
  const chrome = renderEditorChrome(editor, root, canvases())

  expect(root.querySelector('.ed-chat')).not.toBeNull()
  expect(root.querySelector('.ed-chat-send')).not.toBeNull()

  chrome.dispose()
  editor.dispose()
})
```

> `makeTestEditor` (imported from `../fixtures/editorHarness`), the local `canvases()` helper, and `renderEditorChrome` are all already present at the top of `chrome.test.ts` — no new imports are needed. The chat overlay mounts with default deps (`defaultChatDeps()`), which only reach the network on a Send click, so mounting it in this test makes no API call.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project editor tests/ui/chrome.test.ts`
Expected: FAIL (`.ed-chat` not found — the overlay isn't mounted yet).

- [ ] **Step 3: Mount the overlay in chrome**

In `packages/editor/src/ui/chrome.ts`:

Add the import alongside the other panel imports (after `import { mountToolbar } from './toolbar'`):

```ts
import { mountChatOverlay } from './chatOverlay'
```

Add a chat host region after the `outlinerHost` declaration:

```ts
  const chatHost = region('ed-chat-host')
```

Change the right-column assembly from:

```ts
  rightcol.append(inspectorHost, outlinerHost)
```

to:

```ts
  rightcol.append(inspectorHost, outlinerHost, chatHost)
```

Add the overlay to the `panels` array (so the single store subscription updates it). Change:

```ts
    mountOutliner(core, outlinerHost),
    mountViewportRegion(core, viewportHost, canvases)
```

to:

```ts
    mountOutliner(core, outlinerHost),
    mountChatOverlay(core, chatHost),
    mountViewportRegion(core, viewportHost, canvases)
```

- [ ] **Step 4: Add chat panel styles**

In `packages/editor/src/ui/theme.css.ts`, append the following rules to the end of the `SLATE_PRO_CSS` template literal (immediately before its closing backtick):

```css
.ed-chat-host { display: flex; min-height: 0; }
.ed-chat { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
.ed-chat-controls { display: flex; gap: 6px; }
.ed-chat-provider, .ed-chat-key { flex: 1; min-width: 0; background: var(--panel-2); color: var(--ink);
  border: 1px solid #2f394e; border-radius: 5px; padding: 4px 6px; }
.ed-chat-log { flex: 1; min-height: 80px; overflow: auto; display: flex; flex-direction: column; gap: 4px;
  background: var(--edge); border-radius: 5px; padding: 6px; }
.ed-chat-msg { padding: 4px 6px; border-radius: 4px; background: var(--panel-2); white-space: pre-wrap; }
.ed-chat-user { box-shadow: inset 2px 0 0 var(--accent); }
.ed-chat-assistant { box-shadow: inset 2px 0 0 var(--ok); }
.ed-chat-proposal { color: var(--ink-dim); }
.ed-chat-error { box-shadow: inset 2px 0 0 var(--bad); }
.ed-chat-input { resize: vertical; min-height: 44px; background: var(--panel-2); color: var(--ink);
  border: 1px solid #2f394e; border-radius: 5px; padding: 6px; font: inherit; }
.ed-chat-send { align-self: flex-end; padding: 5px 12px; background: var(--panel-2);
  border: 1px solid #2f394e; border-radius: 5px; box-shadow: inset 0 1px 0 var(--bevel); }
```

- [ ] **Step 5: Verify the chrome test + full editor suite pass**

Run: `npx vitest run --project editor tests/ui/chrome.test.ts`
Expected: PASS (the existing `'mounts every region and reacts to a single dispatch'` test plus the new chat-overlay test).

Run: `npm run test`
Expected: PASS. `chrome.test.ts` asserts on specific selectors (`.ed-menubar`, `[data-brush]`, `[data-vp="main"]`, `[data-valid]`, `.ed-status-coords`) and a single dispatch — none of which the chat panel disturbs — so adding the panel causes no fallout in that suite.

- [ ] **Step 6: Full verification (typecheck, lint, coverage)**

Run: `npm run typecheck && npm run lint && npm run coverage`
Expected: PASS, coverage gate green. (The default `run` body in `defaultChatDeps` that calls the real `createProvider`/`runAgent` is exercised via the injected-fakes test in Task 3; only the live SDK network call is not — that path has no branch logic to cover.)

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/ui/chrome.ts packages/editor/src/ui/theme.css.ts \
  packages/editor/tests/ui/chrome.test.ts
git commit -m "feat(editor): mount chat overlay in editor chrome + theme"
```

---

## Self-Review

- **Spec coverage:** Implements the spec's Component 3 *shell* portion — `editorToolHost.ts` (sandbox `ToolHost`; `executeTool` never mutates the live store; generic `testPlay` via `definition.play.runHeadlessPlay`), `settings.ts` (provider selection + API keys in `localStorage` + per-context model; default `claude-opus-4-8`), and `chatOverlay.ts` (a `PanelHandle<Doc>` mounted in `renderEditorChrome`, styled in `theme.css.ts`, with the provider/model picker and conversation). The **batch-diff-before-apply** and the real `store.dispatch` apply are explicitly deferred to M16c (the `renderProposal` seam is in place). The tuning loop is M16b.
- **Placeholder scan:** No TBD/TODO; every code step is complete. Task 4's chat-overlay chrome test is written against the actual `chrome.test.ts` harness (`makeTestEditor` + the local `canvases()` helper, both already imported there), so there are no "mirror the existing setup" contingencies to resolve.
- **Type consistency:** `createEditorToolHost` / `EditorToolHost<Doc>` (with `.doc`, `.commands`) match what `chatOverlay.ts` and the M16c plan consume. `AgentSettings { provider, apiKeys, models }` and `createProvider` match `settings.test.ts` and chatOverlay usage. `ChatRunOutput<Doc> { result, host }` and `ChatOverlayDeps<Doc> { loadSettings, saveSettings, run }` are the exact shapes M16c extends. `runAgent`, `AgentRunResult`, `ProviderAdapter`, `ProviderId`, `DEFAULT_*_MODEL` come from `@automata/agent-core` (M16a-2) with matching names; `ToolHost`/`ToolName`/`ToolResult`/`ResourceUri`/`SceneCommand`/`toolDefs`/`parseToolArgs`/`RESOURCE_URIS` from `@automata/contracts` (M16a-1).
