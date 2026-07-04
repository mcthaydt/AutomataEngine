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

## Registry Convention

A game participates in the editor chooser and MCP server iff it exposes the
loader entries above and its package/directory/game IDs match. The scaffold
generates all of this; never hand-wire a game into `tools/*` — there is no
catalog to edit. Root `package.json` and `playwright.config.ts` must not be
edited per game either; declare `automata.devPort` in the game's own
`package.json`. Run `npm run verify:new-game` after changing scaffold
templates or the engine/project APIs they use.

### Component/resource schemas (zod)

Component and resource data schemas are authored in zod v4 via
`@automata/project` (which re-exports `z` — games, tools, and editor code
must not import `zod` directly; lint enforces this). Rules:

- Roots and nested objects are `z.strictObject({...})`; unknown keys are
  rejected.
- Scalars are plain zod: `z.number().min(0).max(20).meta({ label: 'Speed',
  step: 0.5 })`, `z.string()`, `z.boolean()`, `z.enum([...])`. Call `.meta()`
  before `.optional()`. Exclusive bounds (`.gt`/`.lt`/`.positive`/`.negative`)
  are rejected — use `.min()`/`.max()`.
- Editor kinds use the helpers: `vec3({ label })`, `color({ label })`,
  `reference({ target: 'entity' | 'resource', typeIds?, label })`,
  `listOf(item, { minItems?, maxItems?, label })`, `tableOf(item, {...})`.
  Never call `.meta()` on a helper result — pass the label as an argument.
- Fields are required by default; add `.optional()` for optional ones.
- `defineGameProject` derives the editor UI descriptors and the per-type
  JSON schema (`spec.jsonSchema`) that project-mode MCP tools advertise;
  anything zod can express but the editor cannot render fails at
  registration time.

## Verification Commands

```bash
npm run ci
npm run coverage
npm run dev -w monkey-ball
npm run new-game <name>
npm run verify:new-game
```
