# Editor / Content / Polish (M11–M15) Implementation Plan

> **STATUS: STUB.** The full task-by-task plan is **not yet written** (board item:
> "Write Plan 3 for editor, content, and polish milestones M11–M15"). This file
> currently exists only to capture the **AI-readiness constraints** below so they
> are honored while M11–M13 are designed and built. Flesh out the milestone
> sections before executing.

**Goal:** Build the level editor (`tools/level-editor`), author the shipping
content, and complete release polish — milestones M11–M15.

**Spec:** `docs/superpowers/specs/2026-06-09-automata-engine-monkey-ball-design.md`.
This plan covers M11–M15; M7–M10 are in
`docs/superpowers/plans/2026-06-12-game-m7-m10.md`.

**Scope (from the AGENTS.md task board):**
- **M11** — Editor app shell, document and selection reducers, undo/redo,
  viewport, orbit camera, and grid.
- **M12** — Editor palette, place/move/delete tools, inspector, and validation
  panel.
- **M13** — Editor test-play, import/export, and autosave.
- **M14** — Author 2 worlds × 3 levels in the editor and complete a tuning pass.
- **M15** — Mobile polish, visibility-pause, pixel-ratio cap, Playwright smokes,
  and release build.

---

## AI-Readiness Constraints (read before designing M11–M13)

These are **forward-looking architectural guardrails**, not a commitment to build
any AI feature now. The deliberate decision is: **do not put agents/LLMs in the
engine runtime** (it would trade away the deterministic fixed-timestep loop that
makes replays, tests, and the coverage gate possible). Instead, the eventual
"AI-first pass" is a thin MCP/adapter surface over the **authoring and tuning**
layer — consistent with the existing ports/adapters philosophy (see AGENTS.md
"Keep the engine boundary intact").

The three constraints below cost ~nothing extra during M11–M13, are good
architecture regardless of AI, and turn the later AI pass from a rearchitecture
into a 1–2 milestone bolt-on. Each names the milestone that owns it.

1. **Editor ops = serializable commands (owner: M11–M12).** Every editor
   mutation must be expressible as a plain data command routed through the
   document/selection reducers — never as logic reachable only from a UI gesture.
   *Why:* an MCP tool (or any programmatic author) just emits the same commands
   the UI emits. If the only way to place an entity is a mouse event, there is no
   agent surface and no clean automation seam.

2. **Levels stay schema-validated data (owner: M13).** Levels remain
   TOML/JSON validated by the existing `@automata/engine` `data/` zod schemas;
   import/export must round-trip through that validator. *Why:* the schema **is**
   the contract and the guardrail — bad programmatic output bounces off the same
   validator a human's does. Do not let level state leak into imperative code that
   bypasses the schema.

3. **Headless runs emit structured metrics (owner: M13; relies on M8).** A
   headless `NullRenderer` test-play run must produce a **typed result**
   (e.g. `completed`, `timeMs`, `fallCount`, bananas collected) as a first-class
   output, not just visual/UI feedback. *Why:* you want this for the editor's own
   automated playtests anyway, and it doubles for free as the eval harness a
   tuning agent would optimize against.

### When the AI-first pass happens

**M14 is the AI-first pass.** The editor MCP server (over the M11–M13 command
model + validate + test-play) and the tuning agent loop (over the M13 headless
metrics) are both thin adapters that only become possible once M13 stabilizes.
M14's "tuning pass" is currently specced as a manual human pass — that is exactly
the slow, iterative work an agent accelerates.

Recommended sequencing: **do M14's tuning by hand once** to establish a baseline
and confirm the metric signals are trustworthy, *then* introduce the agent loop
(call it M13.5 / inside M14) with a concrete target and a number to beat. Do not
wrap any editor API in MCP before M13 — those APIs churn through M11–M13 and you
would build the wrapper twice.

---

## Milestone M11 — Editor app shell

_TODO: write task-by-task steps. Must satisfy AI-readiness constraint #1._

## Milestone M12 — Tools, inspector, validation

_TODO: write task-by-task steps. Must satisfy AI-readiness constraint #1._

## Milestone M13 — Test-play, import/export, autosave

_TODO: write task-by-task steps. Must satisfy AI-readiness constraints #2 and #3._

## Milestone M14 — Author content + tuning pass

_TODO: write task-by-task steps. See "When the AI-first pass happens" above._

## Milestone M15 — Mobile polish + release

_TODO: write task-by-task steps._
