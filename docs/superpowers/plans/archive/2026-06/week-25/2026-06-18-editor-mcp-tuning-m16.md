# Editor MCP + Tuning Agent + Chat Overlay (M16) - Plan 4 (STUB)

> **STATUS: Planned (2026-06-21).** Superseded by the design spec
> [`2026-06-21-editor-mcp-tuning-design.md`](../../../../specs/archive/2026-06/week-25/2026-06-21-editor-mcp-tuning-design.md).
> The work is now broken into six executable plans, to be implemented in order:
>
> 1. **M16a-1 — shared contracts** ✅ *implemented* —
>    `2026-06-21-m16a-shared-contracts.md` (`@automata/contracts`).
> 2. **M16a-2 — agent-core** (provider adapters + agent loop) —
>    [`2026-06-21-m16a-2-agent-core.md`](2026-06-21-m16a-2-agent-core.md).
> 3. **M16a-3 — editor ToolHost + chat overlay shell + settings** —
>    [`2026-06-21-m16a-3-editor-host-chat-shell.md`](2026-06-21-m16a-3-editor-host-chat-shell.md).
> 4. **M16c — chat overlay preview/confirm** ✅ *implemented* (batch diff + undoable apply) —
>    [`2026-06-21-m16c-preview-confirm.md`](2026-06-21-m16c-preview-confirm.md).
> 5. **M16b — tuning loop** (+ headless input-seam widening) —
>    [`2026-06-21-m16b-tuning-loop.md`](2026-06-21-m16b-tuning-loop.md).
> 6. **M16d — MCP server host** (optional) —
>    [`2026-06-21-m16d-mcp-server.md`](2026-06-21-m16d-mcp-server.md).
>
> The notes below are the original framing, kept for context; the spec is authoritative.

**Goal:** Add the AI-first authoring pass on top of the generic editor (M11-M15):
an **editor MCP server**, a **tuning-agent loop**, and an in-editor **chat
overlay** - without ever placing an agent in the deterministic runtime loop.

**Builds on the seams M11-M13 already shipped:**
- **MCP tools = `SceneCommand`s.** The server exposes one tool per editor command
  (`addItem`, `moveSelected`, `setItemField`, `setSurface`, `setMetadata`,
  `deleteItems`); an agent emits the same commands the UI does.
- **MCP resources = validated documents.** Levels round-trip through
  `SceneModel.parse` / `validateDoc`; bad agent output bounces off the same
  validator a human's does.
- **MCP test-play tool = `runHeadlessPlay -> TestPlayResult`.** The `input`
  policy parameter is the agent's action seam; `TestPlayResult` (plus the
  M14 baseline) is the eval signal the tuning loop optimizes.

**Scope (to be detailed in the spec):**
- M16a - Editor MCP server over the command model + `validateDoc` + headless test-play.
- M16b - Tuning-agent loop: propose tuning/layout edits, score via headless metrics, keep/revert against a target-to-beat.
- M16c - In-editor **chat overlay**: a panel that drives the agent and
  **previews proposed commands as a diff before applying** (never auto-mutates
  without confirmation), keeping the human in the loop.

**Open design questions for the spec/brainstorm:**
- Chat applies commands via the MCP server vs. the Agent SDK directly.
- Preview-and-confirm vs. auto-apply granularity.
- Model selection, stop/eval criteria, and how the agent stays strictly in the
  authoring layer (never the runtime loop).

**Note:** this is an LLM application - design against the current Anthropic MCP /
Agent SDK and the latest Claude models when the spec is written.
