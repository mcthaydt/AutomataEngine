# LAST LIGHTKEEPER

LAST LIGHTKEEPER is a deterministic 12–15 minute side-view action-management game. You are the final keeper on a storm-bound lighthouse: keep the machinery alive, answer distress calls, identify bearings, and guide at least three ships through the rocks before dawn.

## Controls

- `A` / `D` or left / right arrows: move.
- `W` / `S` or up / down arrows: climb ladders; while operating the beacon, adjust its bearing.
- `E` or `Space`: interact, operate, acknowledge, repair, or hold a station. At the breaker, each press cycles circuit priority and requests all four circuits; generator capacity determines which remain powered.
- `Q`: take, carry, or drop one item.
- `Escape` or `P`: pause or resume.

## Six-step rescue loop

1. Hear the incoming distress call.
2. Reach the powered radio and acknowledge it.
3. Hold the radio controls until the ship's bearing is identified.
4. Route generator power so the beacon remains powered.
5. Reach the lantern room and aim the beacon at the revealed bearing.
6. Hold the light on target through the rescue window.

You win by reaching dawn with at least three rescued ships and a functioning lighthouse. Flooding, structural integrity loss, prolonged darkness, or reaching dawn below the rescue target ends the watch in defeat.

The score awards 1,000 points per rescue, up to 1,000 points for remaining integrity, and up to 250 points for generator efficiency. Power outages cost four points per second. Victory and defeat views show every line item.

## Architecture

Gameplay is a pure fixed-step simulation under `src/sim`; it does not read the DOM, clocks, or browser events. `src/game/gameplay.ts` composes that simulation with injected input, audio, state, feedback, and the engine-owned sprite port. The browser composition under `src/main` owns local asset decoding, the Three.js orthographic renderer, scenes, HUD, audio, loop, visibility pause, and teardown.

The game imports engine behavior only through `@automata/engine` and browser adapters through `@automata/engine/browser`. Three.js remains behind the engine sprite renderer. The DOM views use `@automata/game-kit` helpers and contain no simulation rules.

## PixelLab art

All production sprites were generated through the PixelLab MCP pipeline. `assets/manifest.json` is the runtime source of truth for dimensions, frame geometry, required state tags, local file paths, PixelLab resource IDs, and job IDs. `assets/prompts.json` records accepted prompts and rejected generations; `assets/style-guide.md` records the shared palette and visual constraints. Runtime PNGs are tracked under `public/assets` and validated against the bundled manifest before the game starts.

## Commands

From the repository root:

```bash
npm run dev:last-lightkeeper
npm run headless -w last-lightkeeper -- victory
npm run headless -w last-lightkeeper -- failure
npx vitest run --project last-lightkeeper
npm run typecheck -w last-lightkeeper
npm run build -w last-lightkeeper
npm run e2e:last-lightkeeper
```

For a production preview:

```bash
npm run build -w last-lightkeeper
npm run preview:last-lightkeeper
```

Open <http://127.0.0.1:4177/>. The browser-only deterministic hooks used by Playwright require both a Vite development build and `?e2e=1`; they are removed from production builds.
