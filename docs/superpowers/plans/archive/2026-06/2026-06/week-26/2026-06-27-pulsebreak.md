# PULSEBREAK — implementation checklist

Compact fixed-camera 3D arena roguelite in `games/pulsebreak`, built only on
public `@automata/engine` APIs. Architectural patterns reused from monkey-ball;
no game code imported. Movement/collision are deterministic kinematics (engine
`vec3` math + circle overlap) — a rigid-body sim is unnecessary for a top-down
arena, so Rapier is intentionally not used. TDD throughout; root coverage gate
(90% lines + branches) covers `games/pulsebreak/src/**`.

## Design summary

- Player hover-drone on the XZ plane: WASD/arrows + mobile virtual joystick,
  world-fixed controls, clamped to a square arena.
- Drone auto-targets and auto-fires at the nearest enemy.
- Five escalating waves; wave 5 is a distinct boss (high HP, radial bursts).
- Enemies: `rammer` (chases, contact damage) and `shooter` (kites, ranged).
- Between waves: pick 1 of 3 upgrades drawn from {damage, fireRate, moveSpeed,
  maxHealth}, deterministically chosen from the run seed.
- Health, contact + projectile damage, brief hit invulnerability, enemy deaths,
  scoring, deterministic seeded spawning.
- Scenes: title → playing → (upgrade) → … → victory | defeat → retry.
- Best score persisted to localStorage; visibility auto-pause; synthesized
  audio via AudioPort; particle feedback; neon style from primitives + CSS.

## Tasks

### Scaffold & integration
- [x] Create `games/pulsebreak` package (package.json, tsconfig, vite, vitest, index.html, vite-env)
- [x] `npm install` to wire the workspace
- [x] Root `vitest.config.ts`: add `games/pulsebreak/src/**` to coverage include
- [x] Root `package.json`: add `dev:pulsebreak` + include in `build`
- [ ] `playwright.config.ts`: add pulsebreak dev server + spec

### Deterministic core (TDD)
- [x] `sim/rng.ts` seeded PRNG + helpers
- [x] `config.ts` tuning constants
- [x] `entity.ts` ECS entity model
- [x] `state/scene.ts` scene reducer
- [x] `state/run.ts` run slice (stats, health, score, wave, choices)
- [x] `state/progress.ts` best-score slice
- [x] `state/root.ts` store, persistence, cross-slice defeat/victory + best score
- [x] `sim/upgrades.ts` upgrade table, deterministic choice, application
- [x] `sim/spawn.ts` player/enemy/projectile spawns + wave composition

### Systems (TDD)
- [x] `systems/playerControl.ts`
- [x] `systems/playerWeapon.ts` (auto-target + auto-fire)
- [x] `systems/enemyAI.ts` (rammer, shooter, boss)
- [x] `systems/enemyWeapon.ts` (shooter single shot, boss radial burst)
- [x] `systems/projectiles.ts` (motion + bounds/lifetime)
- [x] `systems/collision.ts` (projectile + contact damage, deaths, scoring)
- [x] `systems/invuln.ts` (hit i-frames)
- [x] `systems/director.ts` (seeded wave spawn + advance)
- [x] `systems/feedback.ts` (facts → sound + particles)

### Composition (TDD)
- [x] `game/context.ts`
- [x] `game/gameplay.ts` (scheduler wiring)
- [x] `sim/headlessRun.ts` deterministic harness
- [x] Deterministic title→victory flow test
- [x] Deterministic title→defeat→retry flow test

### UI / audio / style (TDD)
- [x] `ui/dom.ts`, `ui/view.ts`
- [x] `ui/hud.ts`
- [x] `ui/title.ts`
- [x] `ui/upgrade.ts`
- [x] `ui/overlays.ts` (pause, victory, defeat)
- [x] `audio/sounds.ts`
- [x] `audio/browserAudio.ts`
- [x] `style.css` neon style + responsive + z-layering test

### Browser shell & docs
- [x] `main.ts` thin composition root
- [x] `README.md` controls / architecture / how to run
- [x] e2e: boot, start run, HUD visible, pause/resume

### Verification gates
- [x] Focused pulsebreak tests pass (147)
- [x] `npm run ci` (763 tests, lint, typecheck)
- [x] `npm run coverage` — gate passes (branches 91.32%, lines 99.47%)
- [x] Full root `npm run build` (monkey-ball + level-editor + pulsebreak)
- [x] Serve production build, inspect desktop + mobile (real Chromium; title/HUD/play/upgrade verified)
- [x] No uncaught exceptions / unexpected console errors (production probe: none)
- [x] Deterministic title→victory and title→defeat→retry flows
- [x] Fixed mobile title overflow; reran build + suite
- [ ] Commit in logical commits; clean tree
