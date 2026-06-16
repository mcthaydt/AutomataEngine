# AutomataEngine Agent Guide

This repo is the AutomataEngine npm-workspaces monorepo. Work from the repo
root unless a task explicitly says otherwise.

## Ground Rules

- Keep the engine boundary intact: `games/*` and `tools/*` import engine APIs
  from `@automata/engine`; third-party engine dependencies stay wrapped behind
  `packages/engine` ports/adapters.
- Keep browser-only shims thin. The intended untested shim inventory is
  `packages/engine/src/loop/browser.ts`,
  `packages/engine/src/render/browser.ts`, and app `main.ts` files.
- Use TDD for feature and bugfix work. Add or update focused tests before
  implementation when behavior changes.
- When working from a checklist or implementation plan, mark each task or step
  off in that document as soon as it is completed.
- If a plan or doc step tells you to commit, make the commit after completing
  and verifying that step. Do not skip documented commit checkpoints.
- Run `npm run ci` before claiming a change is ready. Run `npm run coverage`
  when touching engine code or coverage-sensitive tests.
- The approved v1 spec is
  `docs/superpowers/specs/2026-06-09-automata-engine-monkey-ball-design.md`.
- The completed foundation plan is
  `docs/superpowers/plans/2026-06-09-engine-foundation.md`.

## Completed Foundation

- [x] M0: Monorepo scaffold, strict TypeScript, Vitest, ESLint boundaries, CI
  script, and walking-skeleton pages.
- [x] M1: Engine store, persistence middleware, and StoragePort adapters.
- [x] M2: TOML/YAML/JSON data registry, zod validation, and archetype spawner.
- [x] M3: Math helpers, ECS world conventions, scheduler, and event queue.
- [x] M4: Fixed-timestep loop plus keyboard and virtual joystick input.
- [x] M5: Physics port, Rapier adapter, and ECS-physics wiring.
- [x] M6: Render port, Three adapter, camera, groups, NullRenderer, and browser
  canvas shim.

## Task Board

- [x] Write Plan 2 for game milestones M7-M10 against the current engine APIs.
- [x] M7: Game first playable: load level, floor, ball, tilt, fall-off, goal,
  respawn, and HUD skeleton.
- [x] M8: Add bananas, timer, lives, bumpers, moving platforms, and camera
  polish.
- [x] M9: Add Engine SceneManager, game scenes, menus, level select, saves,
  unlocks, and pause.
- [ ] M10: Add AudioPort adapters, particle emitter simulation, game sounds,
  and particle effects.
- [ ] Write Plan 3 for editor, content, and polish milestones M11-M15.
- [ ] M11: Editor app shell, document and selection reducers, undo/redo,
  viewport, orbit camera, and grid.
- [ ] M12: Editor palette, place/move/delete tools, inspector, and validation
  panel.
- [ ] M13: Editor test-play, import/export, and autosave.
- [ ] M14: Author 2 worlds x 3 levels in the editor and complete a tuning pass.
- [ ] M15: Mobile polish, visibility-pause, pixel-ratio cap, Playwright smokes,
  and release build.

## Verification Commands

```bash
npm run ci
npm run coverage
npm run dev -w monkey-ball
```
