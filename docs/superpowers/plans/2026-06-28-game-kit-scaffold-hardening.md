# Game Kit Scaffold Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run new-game` reject unsafe arguments, avoid partial game trees, and automatically wire the generated game into root dev/build/e2e configuration.

**Architecture:** Keep `planNewGame` pure and add argument validation there. Add pure root-config transformers in `rootWiring.ts`, then isolate filesystem orchestration and rollback in `write.ts`; `main.ts` remains a coverage-excluded CLI shim.

**Tech Stack:** TypeScript (strict ESM), Node filesystem promises, Vitest, npm workspaces, Playwright configuration.

---

### Task 1: Validate scaffold arguments

**Files:**
- Modify: `tools/scaffold/tests/plan.test.ts`
- Modify: `tools/scaffold/src/plan.ts`

- [x] **Step 1: Add failing tests** for path traversal, quote-bearing names, `NaN`, and out-of-range ports.
- [x] **Step 2: Run `npx vitest run --project scaffold plan`** and confirm the new assertions fail because invalid inputs are accepted.
- [x] **Step 3: Add strict validation**: names match `^[a-z0-9][a-z0-9-]*$`; ports are integers from 1 through 65535.
- [x] **Step 4: Re-run the focused test** and confirm it passes.

### Task 2: Plan automatic root wiring

**Files:**
- Create: `tools/scaffold/tests/rootWiring.test.ts`
- Create: `tools/scaffold/src/rootWiring.ts`
- Modify: `tools/scaffold/src/plan.ts`
- Modify: `tools/scaffold/tests/plan.test.ts`

- [x] **Step 1: Add failing tests** proving package wiring adds `dev:<name>` plus the root build command, Playwright wiring appends the new server, and malformed or duplicate configuration is rejected.
- [x] **Step 2: Run `npx vitest run --project scaffold rootWiring`** and confirm failure because the module does not exist.
- [x] **Step 3: Implement pure `wirePackageJson` and `wirePlaywrightConfig` transformers** and remove obsolete `rootSnippets` from `ScaffoldPlan`.
- [x] **Step 4: Re-run the scaffold tests** and confirm they pass.

### Task 3: Preflight and transactional filesystem writing

**Files:**
- Create: `tools/scaffold/tests/write.test.ts`
- Create: `tools/scaffold/src/write.ts`
- Modify: `tools/scaffold/src/main.ts`

- [x] **Step 1: Add failing integration tests** using a temporary repository. Cover successful game/root writes, refusal before any mutation when the target directory exists, and refusal before mutation when root configuration cannot be transformed.
- [x] **Step 2: Run `npx vitest run --project scaffold write`** and confirm failure because the writer does not exist.
- [x] **Step 3: Implement `writeNewGame(root, name, port?)`**: validate and plan first, verify containment, preflight the target and root transformations, create the game tree, update root files, and roll back created/modified files on failure.
- [x] **Step 4: Change `main.ts`** to delegate to the tested writer and report that root wiring completed.
- [x] **Step 5: Re-run the scaffold tests** and confirm they pass.

### Task 4: Documentation and full verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-27-game-kit.md`

- [x] **Step 1: Record the post-review hardening tasks** in the original implementation plan and mark each completed only after its focused gate passes.
- [x] **Step 2: Run `npm run ci`** and confirm lint, typecheck, and all tests pass.
- [x] **Step 3: Run `npm run coverage`** and confirm the 90% line/branch thresholds pass.
- [x] **Step 4: Run `npm run build && npm run e2e`** and confirm all app builds and browser smokes pass.
- [x] **Step 5: Run `git diff --check` and inspect `git status`** to confirm a clean patch with no smoke-test residue.
