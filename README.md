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
