# AutomataEngine

Web-first game engine (`packages/engine`) with two games — a Monkey Ball clone
(`games/monkey-ball`) and PULSEBREAK, a neon arena roguelite
(`games/pulsebreak`) — and a level editor (`tools/level-editor`).

- Spec: `docs/superpowers/specs/2026-06-09-automata-engine-monkey-ball-design.md`
- Dev: `npm install`, then `npm run ci` (lint + typecheck + tests)

## Workspace

| Path | Package | What |
|---|---|---|
| `packages/engine` | `@automata/engine` | The engine: ECS, store, data, loop, input, physics (Rapier), render (Three) |
| `games/monkey-ball` | `monkey-ball` | The game app (Vite) |
| `games/pulsebreak` | `pulsebreak` | Neon fixed-camera arena roguelite (Vite) |
| `tools/level-editor` | `level-editor` | Level editor app (Vite) |

## Commands

- `npm run ci` - lint + typecheck + all tests (run before every commit claim)
- `npm run coverage` - tests with the repo-wide 90% line + branch coverage gate
- `npm run dev -w monkey-ball` - run monkey-ball locally
- `npm run dev:pulsebreak` - run PULSEBREAK locally

## Game (monkey-ball)

`games/monkey-ball` is the first game on the engine. Run it with
`npm run dev -w monkey-ball`. Flow: menu -> level select -> play (tilt with
WASD/arrows or the on-screen joystick) -> goal or game-over. Progress and
settings persist to localStorage.

Data lives under `games/monkey-ball/public/data/` (served at `/data/...`):
`config/physics.toml` (tuning), `archetypes/standard.yaml` (entity bundles),
`levels/*.json` + `levels/worlds.json` (levels and the world manifest).

## Game (pulsebreak)

`games/pulsebreak` is a fixed-camera neon arena roguelite: a hover-drone
auto-fires at the nearest enemy across five escalating waves and a boss, with an
upgrade pick between each wave. Run it with `npm run dev:pulsebreak`. It uses
only `@automata/engine` (kinematic deterministic sim, no Rapier). Tuning lives in
`games/pulsebreak/src/config.ts`. See `games/pulsebreak/README.md` for controls
and architecture.

### Untested browser shims (excluded from the coverage gate)

`packages/engine/src/loop/browser.ts`, `packages/engine/src/render/browser.ts`,
`packages/engine/src/audio/browser.ts`, `games/monkey-ball/src/main.ts`, and
`games/pulsebreak/src/main.ts`. Everything else is unit-tested; these are
covered by the Playwright smokes.
