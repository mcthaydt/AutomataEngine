# Engine Architecture Guide Design

Status: approved. Date: 2026-07-04.

## Purpose

Create a human-first architecture guide for beginner and intermediate game
developers arriving from Godot, Unity, or Unreal Engine 5. The guide must give
readers a useful mental model before asking them to understand package names or
implementation details.

The deliverable will live at `docs/engine-architecture.md`. It documents the
implemented architecture and ends with a short, explicitly labeled roadmap
section for planned work. It does not change runtime behavior or public APIs.

## Audience and outcomes

The primary reader understands scenes, entities or game objects, components,
editor inspectors, prefabs, resources/assets, and play mode, but may not know
ECS, ports and adapters, headless evaluation, or MCP.

After reading the guide, that reader should be able to:

1. map familiar Godot, Unity, and UE5 concepts to AutomataEngine;
2. explain the boundary between `@automata/engine`, `@automata/project`, and
   `@automata/editor`;
3. trace authored project data into validation, compilation, runtime play, and
   headless evaluation;
4. understand how the editor and MCP server discover games through the same
   registration convention;
5. find the correct package and entry point for a typical change; and
6. distinguish current behavior from roadmap work.

## Document structure

The guide uses progressive disclosure:

1. **Mental model** — a cross-engine concept map and the core distinction
   between runtime state, authored project data, and tooling.
2. **Whole-system map** — games, engine, project model, editor, MCP server,
   contracts, agent layer, and scaffold.
3. **Runtime layer** — game loop, ECS world, systems, state store, and the
   rendering, physics, input, audio, and storage ports/adapters.
4. **Authoring layer** — project files, zod schemas, editor descriptors,
   validation, compilation, and evaluation.
5. **Editor layer** — project registrations, generic generated UI, viewport,
   storage, history, preview, and game-owned adapters.
6. **AI and MCP layer** — contracts, tool hosts, workspace/project modes,
   provider adapters, and the boundary between AI orchestration and mutation.
7. **Build-a-game flow** — scaffold or MCP creation through authoring,
   compilation, evaluation, browser runtime, and release checks.
8. **Repository map** — concrete starting points for common tasks.
9. **Boundaries and roadmap** — dependency rules, deliberate limitations, and
   planned P3+ work.

The games are examples and validation consumers. They are not presented as
reusable engine internals.

## Diagram design

Use several focused Mermaid diagrams instead of a single large graph. Each
diagram should stay near or below fifteen nodes and use conservative syntax
that renders on GitHub.

- `flowchart` for package relationships and data flow;
- `sequenceDiagram` for editor play mode and MCP command execution;
- one small dependency graph for allowed package direction;
- solid arrows for implemented behavior;
- dashed arrows only for explicitly labeled roadmap behavior.

Every diagram is followed by:

1. **What this means** — a plain-language explanation;
2. **Familiar analogy** — the closest Godot, Unity, and UE5 concepts, including
   where the analogy breaks down;
3. **Code entry points** — links to the relevant packages and files; and
4. **Boundary warning** — the most likely misconception or forbidden
   dependency.

Terminology is introduced before package names. ECS and ports/adapters receive
short definitions rather than being assumed knowledge.

## Accuracy rules

The guide describes the live `main` checkout, not historical plan intent.

- Package arrows must match current workspace dependencies and lint-enforced
  boundaries.
- Public entry points must match current package exports and source barrels.
- The browser editor and Node MCP discovery paths must be shown separately,
  with their shared catalog and registration contract made explicit.
- Project schemas are zod-authored through `@automata/project`; the deleted
  custom schema DSL must not appear as current architecture.
- Last Lightkeeper must not appear as a current game.
- P3 project-file migrations and later MCP session work must be labeled as
  planned, not implemented.
- Browser-only composition shims and headless entry points must remain visibly
  distinct.

## Verification

Before delivery:

1. compare every package relationship with workspace manifests, exports, and
   representative imports;
2. verify every linked repository path exists;
3. check Mermaid fences, diagram identifiers, and edge syntax mechanically;
4. scan for stale terms, placeholders, contradictory current/planned claims,
   and unexplained acronyms;
5. run `git diff --check`; and
6. render the Mermaid diagrams when a compatible renderer is available,
   otherwise keep syntax within GitHub's conservative Mermaid subset and state
   that only structural verification was possible.

## Maintenance

Update this guide when any of these contracts change:

- workspace package boundaries or public entry points;
- project document structure or migration behavior;
- game registration/discovery conventions;
- editor storage, preview, or command flow;
- MCP modes, tools, or agent ownership; or
- the paved-road scaffold and release gates.

The guide should remain an orientation document, not grow into an exhaustive
API reference. Detailed API material belongs beside the owning package.
