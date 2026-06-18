# AutomataEngine

Web-first game engine (`packages/engine`) with its first game, a Monkey Ball
clone (`games/monkey-ball`), and a level editor (`tools/level-editor`).

- Spec: `docs/superpowers/specs/2026-06-09-automata-engine-monkey-ball-design.md`
- Dev: `npm install`, then `npm run ci` (lint + typecheck + tests)

## Workspace

| Path | Package | What |
|---|---|---|
| `packages/engine` | `@automata/engine` | The engine: ECS, store, data, loop, input, physics (Rapier), render (Three) |
| `games/monkey-ball` | `monkey-ball` | The game app (Vite) |
| `tools/level-editor` | `level-editor` | Level editor app (Vite) |

## Commands

- `npm run ci` - lint + typecheck + all tests (run before every commit claim)
- `npm run coverage` - tests with the 90% engine coverage gate
- `npm run dev -w monkey-ball` - run the game locally

## Game (monkey-ball)

`games/monkey-ball` is the first game on the engine. Run it with
`npm run dev -w monkey-ball`. Flow: menu -> level select -> play (tilt with
WASD/arrows or the on-screen joystick) -> goal or game-over. Progress and
settings persist to localStorage.

Data lives under `games/monkey-ball/public/data/` (served at `/data/...`):
`config/physics.toml` (tuning), `archetypes/standard.yaml` (entity bundles),
`levels/*.json` + `levels/worlds.json` (levels and the world manifest).

### Untested browser shims (excluded from the coverage gate)

`packages/engine/src/loop/browser.ts`, `packages/engine/src/render/browser.ts`,
`packages/engine/src/audio/browser.ts`, and `games/monkey-ball/src/main.ts`.
Everything else is unit-tested; these are covered by the M15 Playwright smoke.
