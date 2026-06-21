# Editor MCP + Tuning Agent + Chat Overlay (M16) — Design

> **Status: Designed (approved 2026-06-21).** Supersedes the stub at
> `docs/superpowers/plans/2026-06-18-editor-mcp-tuning-m16.md`. First implementation slice:
> `docs/superpowers/plans/2026-06-21-m16a-shared-contracts.md`; follow-on plans remain unwritten.

## Context

M11–M15 shipped a generic, command-driven level editor: every mutation flows through a
`SceneCommand`, levels round-trip through `SceneModel.parse` / `validateDoc`, and
`runHeadlessPlay → TestPlayResult` gives a deterministic headless evaluation harness. M16 adds the
AI-first authoring pass on top of those seams — **without ever placing an agent in the
deterministic runtime loop**.

The original stub assumed the **Anthropic Agent SDK + MCP** as the foundation. Three requirements
reshape that:

1. **APIs are local to the user** — bring-your-own-key, stored locally, no hosted backend.
2. **Multiple providers** — ChatGPT (OpenAI), Claude (Anthropic), DeepSeek — extendable to more.
3. **In-browser is the default host; an MCP server is a supported second host.**

The key consequence: OpenAI and DeepSeek are not MCP hosts, so the *brain* of the loop cannot be
MCP-native — it must be a **provider-agnostic tool/function-calling loop**. MCP therefore demotes
from "the foundation" to "an optional second host" wrapping the same tool registry. This keeps the
project's pure-client, static-Vite design (vanilla DOM, Redux-style store, strict `editor→engine`
dep rule, 90% coverage gate) intact, and makes MCP genuinely additive rather than a fork.

## Decisions (from brainstorming)

- **Runtime architecture:** in-browser host as default; MCP server as a supported second host.
- **Tuning objective:** difficulty-banded solvability (the most powerful option) — an autonomous
  keep/revert optimizer with an objective fitness function and a target-to-beat. The narrower
  "physics-feel only" and "human-stated target" options are implemented as *modes* of this one loop,
  not separate code.
- **Approval model:** batch diff on completion — the agent works in a sandbox; the human approves
  one net diff; the live store only mutates on approval (as a normal undoable command).
- **Providers:** Claude via the official `@anthropic-ai/sdk` (default model `claude-opus-4-8`,
  adaptive thinking), OpenAI and DeepSeek via the `openai` SDK (DeepSeek is OpenAI-compatible). All
  user-overridable; keys in `localStorage`.

## Architecture

A new **`packages/contracts`** package is the single source of truth for every contract that
crosses the MCP / Editor / Engine boundary (the command surface, the eval surface, and the tool
registry interface). It is a dependency-free leaf (TS types + zod only); everything else depends on
it, so the three sides cannot drift. On top of it, one **shared, host-agnostic tool registry**
(tools = `SceneCommand`s + `validateDoc` + `runHeadlessPlay`) is driven by two thin hosts:

```
        ┌──────────────────────────────────────────────────────────────────┐
        │ packages/contracts  (@automata/contracts)  — leaf, zod + types     │
        │  • command contract  (SceneCommand union + zod → JSON Schema)       │
        │  • eval contract     (TestPlayResult, HeadlessOpts, PlayObservation)│
        │  • tool contract     (ToolDef, ToolHost, ToolResult, resource URIs) │
        └───────┬───────────────────┬───────────────────────┬───────────────┘
                │                   │                        │
        ┌───────▼────────┐  ┌───────▼─────────────────────┐ │
        │ packages/engine│  │ packages/agent-core         │ │
        │ + game headless│  │  • ProviderAdapter (A/O/DS) │ │ ← browser host only
        │  implement the │  │  • agent loop               │ │ ← browser host only
        │  eval contract │  │  • tuning loop + fitness    │ │ ← browser host only
        └───────┬────────┘  │  • seek-goal player         │ │
                │           └───────┬─────────────────────┘ │
   ┌────────────┘                   │                        └──────────────┐
   ▼  Browser host (DEFAULT)        ▼                          ▼  MCP host (SUPPORTED)
 packages/editor: chat overlay panel                  tools/editor-mcp-server (Node):
  • binds live EditorStore as a ToolHost                • binds a headless doc as a ToolHost
  • preview/confirm: batch diff before apply            • exposes the registry over MCP
  • runs agent loop + providers, keys local             • driven by Claude Desktop / Claude Code
```

**Shared vs. host-specific.** The shared *contracts* live in `packages/contracts`. The shared
*behavior* is the **ToolHost** (list tools, execute by name+args, read resources). The agent *loop*
and provider adapters are **browser-host-only** — in the MCP world the connected MCP *client* is the
brain, so the server only needs to expose a ToolHost. This boundary is what makes both hosts cheap.

`contracts` imports nothing. `agent-core` depends only on `contracts` (no `editor`/game import — no
cycle). Each host implements the `ToolHost` interface from `contracts`. Dependency direction stays
clean and the lint rule extends naturally: `contracts` is the leaf; `editor → {engine, contracts}`,
`agent-core → contracts`, `editor-mcp-server → {contracts, engine/game-headless}`.

## Components

### 0. `packages/contracts` (`@automata/contracts`) — leaf, zod + TS types only

- `src/command.ts` — **command contract**: the `SceneCommand` discriminated union + a zod schema per
  command, and a derived JSON Schema per command. `SceneCommand` is **lifted here from**
  `packages/editor/src/model/types.ts`; the editor re-exports from `contracts` so existing imports
  keep working. Both the editor ToolHost and the MCP ToolHost validate against this.
- `src/eval.ts` — **eval contract**: `TestPlayResult`, `HeadlessOpts`, and the new `PlayObservation`
  (ball pos/vel + goal). Lifted from `packages/editor/src/model/gameDefinition.ts` so the
  engine/game (which *implements* headless play), the editor, and the MCP server share one
  definition.
- `src/tools.ts` — **tool contract** (host-agnostic):
  ```ts
  interface ToolDef { name: string; description: string; schema: JSONSchema } // JSON Schema
  interface ToolHost {
    listTools(): ToolDef[]
    executeTool(name: string, args: unknown): Promise<ToolResult>   // validated, may preview/confirm
    readResource(uri: string): Promise<unknown>                     // doc, items, validation, baseline
  }
  ```
  Tool set mirrors the command model 1:1 (`addItem`, `moveSelected`, `setItemField`, `setSurface`,
  `setMetadata`, `deleteItems`) plus read tools (`getDoc`, `listItems`, `validate`) and the eval
  tool (`testPlay`). Tool arg schemas derive from the command/eval zod schemas. The same JSON Schema
  feeds Anthropic `input_schema`, OpenAI `function.parameters`, and the MCP server.

### 1. `packages/agent-core` (`@automata/agent-core`) — pure TS, browser-safe

Depends only on `@automata/contracts`. No editor or game import.

- `src/providers/provider.ts` — `ProviderAdapter` interface: common request (system + messages +
  tool defs) → provider wire format → parse tool calls back to a normalized shape, plus default
  model. Adding a provider = one new file (the "extendable" requirement).
- `src/providers/anthropic.ts` — wraps the official `@anthropic-ai/sdk`
  (`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`), default `claude-opus-4-8`,
  `thinking: { type: "adaptive" }`, a **manual tool-use loop** (tools execute locally).
- `src/providers/openai.ts` — official `openai` SDK (`dangerouslyAllowBrowser: true`), Chat
  Completions tool-calling.
- `src/providers/deepseek.ts` — reuses the `openai` SDK with `baseURL: "https://api.deepseek.com"`.
- `src/agent/loop.ts` — provider-agnostic agent loop over `ProviderAdapter` + `ToolHost`; bounded
  iterations; collects emitted commands for the host to preview.
- `src/tuning/seekGoalPlayer.ts` — deterministic closed-loop controller used **only for scoring**:
  each step, tilt toward the goal from the ball's current position.
- `src/tuning/fitness.ts` — scores a `TestPlayResult`: completion within a target step/time **band**
  + zero rest-falls + optional banana pickup. Target-to-beat = current score or a user-supplied band.
- `src/tuning/loop.ts` — autonomous optimizer: in a sandbox copy, propose edits (LLM) → apply →
  score via `runHeadlessPlay` under the seek-goal player → keep if it beats best, revert otherwise;
  stop on convergence/cap. Configurable edit-scope (`tuning-only` vs `tuning+layout`) and target
  source (`beat-current` vs `human-stated`). `validateDoc` is the hard floor for proposals.

### 2. Headless input-seam extension (small, backward-compatible)

`runHeadlessPlay`'s `input(step)` is open-loop today. Extend `HeadlessOpts.input` (now in
`packages/contracts/src/eval.ts`) to `(step, observation: PlayObservation) => { x, y }`; thread the
observation through the `dt = 1/60` loop in `games/monkey-ball/src/level/headlessPlay.ts`. Existing
callers (the no-input baseline) keep working because `input` stays optional.

### 3. `packages/editor` — chat overlay panel + editor ToolHost binding

- `src/ui/chatOverlay.ts` — a new `PanelHandle<Doc>` (same contract as inspector/outliner), mounted
  in `renderEditorChrome` (`src/ui/chrome.ts`), styled via `src/ui/theme.css.ts`. Drives the agent;
  renders the provider/model picker, the conversation, and the **batch diff confirm** UI.
- `src/agent/editorToolHost.ts` — implements the `contracts` `ToolHost` against the **live**
  `EditorStore`, `validateDoc`, and `runHeadlessPlay`, operating on a **sandbox copy** —
  `executeTool` does **not** mutate the live store. On completion the overlay shows one net diff
  (before→after + score delta); on apply it dispatches real `SceneCommand`s through `store.dispatch`
  (the normal undoable path in `host.ts`). Honors "never auto-mutates without confirmation."
- `src/agent/settings.ts` — provider selection, **API keys in `localStorage`**, per-context model
  config. Default `claude-opus-4-8`; user-overridable; a cheaper model (e.g. Claude Haiku 4.5)
  selectable for the high-iteration tuning loop.

### 4. `tools/editor-mcp-server` (Node, MCP host)

A Node MCP server (`@modelcontextprotocol/sdk`) implementing the same `contracts` `ToolHost` against
a **headless in-memory doc** (reusing `SceneModel.apply`, `validateDoc`, `runHeadlessPlay`), exposing
the registry as MCP tools + resources. The live browser editor syncs via the existing doc
load/export round-trip. Reusable by Claude Desktop / Claude Code. Additive — a separate process,
not required for the default flow.

## Key storage / CORS / security

- Keys live in `localStorage` only; never committed; redacted in logs. Acceptable for a local
  single-user dev tool (the chosen in-browser host).
- Anthropic and OpenAI SDKs support direct browser use via `dangerouslyAllowBrowser`. DeepSeek's
  browser CORS posture is uncertain.
- **Optional Vite dev-server proxy** (a plugin in `tools/level-editor/vite.config.ts`) for any
  provider that blocks browser CORS — forwards requests and is the place to keep keys off the page if
  a stricter posture is wanted. Not a backend; just dev-server middleware.
- The MCP host keeps keys server-side by construction.

## Non-goals

- The agent is never in the deterministic runtime/simulation loop — it lives strictly in the
  authoring layer. The runtime only ever runs scripted/headless play for *scoring*.
- No hosted backend; no multi-user/shared-key model.

## Sequencing

- **M16a — Contracts + tool registry + provider layer + agent loop (foundation).** Create
  `packages/contracts`; lift `SceneCommand` + eval types into it (editor re-exports). Then
  `agent-core` providers + agent loop; editor ToolHost binding; chat overlay shell with provider/key
  settings. Input-seam extension (`PlayObservation`) lands here.
- **M16c — Chat overlay preview/confirm.** Batch-diff-before-apply UX via the undoable command path.
  (Chat-driven authoring usable end-to-end after a+c.)
- **M16b — Tuning loop.** seek-goal player + fitness + keep/revert optimizer (edit-scope + target
  source modes).
- **M16d (optional) — MCP server host.** Exposes the registry to external MCP clients.

## Reuse (do not rebuild)

- `SceneCommand` (`packages/editor/src/model/types.ts`) — tool surface; **lifted into `contracts`**,
  editor re-exports it.
- `SceneModel.apply` (`games/monkey-ball/src/editor/sceneModel.ts`) — already pure; unchanged.
- `validateDoc` (`packages/editor/src/io/validation.ts`) — hard floor for agent output.
- `runHeadlessPlay` / `TestPlayResult` / baseline (`games/monkey-ball/src/level/headlessPlay.ts`,
  `tests/fixtures/metric-baselines.json`) — the eval signal.
- `store.dispatch` undoable command path (`packages/editor/src/host.ts`) — how approved diffs apply.
- `PanelHandle` + `renderEditorChrome` (`packages/editor/src/ui/panel.ts`, `chrome.ts`) — panel
  pattern for the chat overlay.

## Testing strategy

- **contracts:** zod schemas round-trip a representative `SceneCommand` of each kind and a
  `TestPlayResult`; derived JSON Schema validates the same payloads. After lifting `SceneCommand`,
  the full existing editor + game suites pass unchanged (re-export keeps imports working).
- **agent-core:** each provider adapter translates a fixed request to the right wire shape and parses
  tool calls back (mock the SDKs/fetch — no live keys in CI); the agent loop drives a fake ToolHost
  to completion; fitness + keep/revert against synthetic `TestPlayResult`s; the seek-goal player
  completes a known-solvable fixture and fails an impossible one. Keep the 90% coverage gate green.
- **Headless seam:** the new `(step, observation)` input drives the ball to the goal on a fixture;
  the existing no-input baseline still passes unchanged.
- **Editor binding:** `editorToolHost.executeTool` never mutates the live store; applying a batch
  diff dispatches the expected `SceneCommand`s and is a single undo step.
- **Manual end-to-end:** run `tools/level-editor` (:5175), set a provider + key, ask the overlay to
  "add a ramp near the goal," confirm the diff, verify update + undo; then run a tuning pass and
  confirm it presents a net diff with a score improvement.
- **MCP host (if built):** connect Claude Desktop/Code to `tools/editor-mcp-server`; confirm the
  same tools list and a round-tripped edit validates via `validateDoc`.
