# AutomataEngine

Web-first game engine with two shipped games and one generic project editor.
Games register authored component/resource schemas, compilation, preview, and
evaluation adapters; shared editor packages contain no game-specific code.

## Workspace

| Path | Package | Purpose |
|---|---|---|
| `packages/engine` | `@automata/engine` | ECS, store, data, loop, input, physics, rendering, audio |
| `packages/project` | `@automata/project` | Persisted project schemas, commands, validation, and bundles |
| `packages/contracts` | `@automata/contracts` | Agent/MCP project and workspace tool contracts |
| `packages/editor` | `@automata/editor` | Generic project session, registry catalog, storage, viewport, generated UI |
| `packages/editor-agent` | `@automata/editor-agent` | Sandboxed assistant and tuning workflow |
| `packages/game-kit` | `@automata/game-kit` | Shared browser game-shell helpers |
| `games/monkey-ball` | `monkey-ball` | Physics platform game and project registration |
| `games/pulsebreak` | `pulsebreak` | Deterministic neon arena roguelite and project registration |
| `tools/level-editor` | `level-editor` | Multi-game project editor app |
| `tools/editor-mcp-server` | `editor-mcp-server` | Project + workspace MCP server |
| `tools/scaffold` | `@automata/scaffold` | `new-game` generator for registered games |

## Commands

- `npm run dev:editor` — open the project chooser at `http://127.0.0.1:5175`
- `npm run dev:monkey-ball` — run Monkey Ball at `http://127.0.0.1:5174`
- `npm run dev:pulsebreak` — run PULSEBREAK at `http://127.0.0.1:5176`
- `npm run new-game <name> [port]` — scaffold a registered game under `games/<name>`
- `npm run ci` — lint, typecheck, and all unit tests
- `npm run coverage` — repository-wide 90% line and branch gate
- `npm run build` — production builds for every workspace with a build script
- `npm run e2e` — Playwright browser/release smokes (`PLAYWRIGHT_ONLY=<workspace>` narrows servers)
- `npm run verify:new-game` — clean-clone proof that a scaffolded game passes the whole gate

## Creating a game

`npm run new-game <name>` emits a complete registered game: a deterministic
sim, engine render wiring, a project definition (schemas, template,
validation, compilation, evaluation), passing tests at the coverage gate, an
e2e smoke, and the authored `public/project` files. No root files are edited —
dev/build/Playwright wiring derives from the game's own `package.json`
(`automata.devPort`), and both the editor chooser and the MCP server discover
games by convention:

- `src/project/editor.ts` exports `loadEditorRegistration` (browser; prefabs
  and preview), and the package exposes it as `./editor`.
- `src/project/index.ts` exports `loadHeadlessRegistration` (Node-safe), and
  the package exposes it as `./project`.
- Package name, directory name, and `gameId` are identical.

After scaffolding, run `npm install` once so Node can resolve the new
workspace package. Run `npm run verify:new-game` whenever the scaffold
templates or the APIs they target change.

## Project format

Each project directory contains:

```text
automata.project.json             project identity, gameId, entry scene, file index
scenes/<id>.scene.json            entity hierarchy and typed component instances
resources/<id>.resource.json      typed tuning/content resources
```

Portable bundle JSON contains the same manifest, scenes, and resources in one
canonical file. Shipped projects are:

- `games/monkey-ball/public/project`
- `games/pulsebreak/public/project`

The editor chooser can create either game, open a folder through File System
Access, fall back to bundle import/export, and reopen recent folder handles.
Use `?game=monkey-ball` or `?game=pulsebreak` to preselect a game, and
`?project=<recent-project-id>` to deep-link a recent project. Component and
resource inspectors, tables, references, and validation UI are generated from
each game's registered schemas.

## MCP

Run the project MCP server against any registered game's project directory:

```bash
node_modules/.bin/automata-editor-mcp --project games/monkey-ball/public/project
node_modules/.bin/automata-editor-mcp --project games/pulsebreak/public/project
```

It also accepts `--bundle <file>`, and `--workspace <repoRoot>` serves the
workspace tools (`createGame`, `listGames`) so agents can scaffold games over
MCP. See `tools/editor-mcp-server/README.md` for tool/resource lists and
client configs.

## Game data

Both games boot from compiled project data. Monkey Ball retains only its
archetype registry at `games/monkey-ball/public/data/archetypes/standard.yaml`;
pre-project level/config documents are quarantined under test fixtures for the
deterministic importer. PULSEBREAK tuning, enemies, waves, upgrades, arena, and
spawn zones live in project resources/scenes rather than TypeScript constants.

## Coverage exclusions

Only thin browser composition shims are excluded:
`packages/engine/src/loop/browser.ts`,
`packages/engine/src/render/browser.ts`, and application `main.ts` files.
Browser behavior is covered by Playwright release smokes.
