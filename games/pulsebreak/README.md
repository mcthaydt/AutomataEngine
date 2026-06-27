# PULSEBREAK

A compact fixed-camera 3D arena roguelite built on `@automata/engine`. You
pilot a neon hover-drone, auto-firing at the nearest enemy while surviving five
escalating waves and a final boss. Pick an upgrade between each wave.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / arrow keys | on-screen virtual joystick (bottom-left) |
| Fire | automatic (targets nearest enemy) | automatic |
| Pause / resume | `Esc` | pause via the overlay buttons |

Controls are world-fixed: up always moves the drone away from the camera. The
game auto-pauses when the tab is hidden.

## Run loop

1. **Title** — start a run (your best score persists locally).
2. **Waves 1–4** — clear every enemy, then choose 1 of 3 upgrades drawn from
   damage, fire rate, move speed, and max health.
3. **Wave 5** — break the boss (high health, radial-burst attacks).
4. **Victory / Defeat** — retry or return to the title.

Enemies: **rammers** chase and deal contact damage; **shooters** kite to a
preferred range and fire ranged shots. Taking a hit grants brief
invulnerability.

## How to run

```bash
npm run dev:pulsebreak   # dev server at http://127.0.0.1:5176
npm run build -w pulsebreak
npm test -- --project pulsebreak   # focused unit tests
npm run coverage          # repo-wide coverage gate (includes this game)
npm run e2e               # Playwright smokes (boot, run, HUD, pause/resume)
```

The production build is emitted to `games/pulsebreak/dist`.

## Architecture

PULSEBREAK uses only public `@automata/engine` APIs (ECS, fixed-step loop,
input, rendering, scenes, persistence, audio, particles, math) and imports no
other game's code — it reuses architectural patterns, not implementation.

- **Deterministic kinematic sim.** Movement and combat are pure XZ-plane
  kinematics with circle-overlap collision, integrated under the engine's
  fixed-step loop. A rigid-body solver is unnecessary for a top-down arena, so
  Rapier is intentionally not used; everything is reproducible from a seed via
  `sim/rng.ts`.
- **ECS systems** (`src/systems`) run in a fixed order each step:
  `invuln → playerControl → enemyAI → projectiles → playerWeapon →
  enemyWeapon → collision → director → particles`, then a render stage. Each
  gameplay system stays inert when the scene is not `playing`, so a mid-step
  scene flip never produces a stray mutation.
- **The director** (`systems/director.ts`) owns the wave lifecycle: it spawns
  each wave from the run's seeded RNG and, on a clear, either offers upgrades or
  wins the run.
- **Store + scenes** (`src/state`). A reducer store holds the scene, the
  run (stats, health, score, wave, offered upgrades), and persisted best score.
  Cross-slice rules turn zero integrity into defeat and record the best score
  when a run ends. `createSceneManager` mounts the title/pause/upgrade/
  victory/defeat overlays.
- **Feedback** (`systems/feedback.ts`) is the single cosmetic drain: gameplay
  facts become synthesized sounds (`AudioPort`) and particle bursts.
- **Browser shell.** All browser-only wiring lives in `src/main.ts` (renderer,
  audio, input sources, loop driver). `sim/headlessRun.ts` composes the same
  gameplay against recording doubles so full title→victory and
  title→defeat→retry flows are exercised deterministically in tests.
- **Visual style.** Neon aesthetic built entirely from engine primitives
  (sphere/box/cylinder + grid) and CSS in `src/style.css`; no external assets.

## Layout

```
src/
  config.ts        tuning constants (arena, player, enemies, waves, upgrades)
  entity.ts        ECS entity model
  main.ts          browser composition root (untested shim)
  style.css        neon styling
  audio/           sound specs + WebAudio adapter
  game/            per-step context + gameplay wiring
  sim/             rng, arena, spawning, upgrades, headless run harness
  state/           scene/run/progress reducers + store
  systems/         ECS systems
  ui/              title, HUD, upgrade, pause/victory/defeat overlays
```
