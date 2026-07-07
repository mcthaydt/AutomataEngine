# AutomataEngine Foundation (M0–M6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@automata/engine` package — store, data loaders, ECS conventions, loop/input, physics (Rapier), rendering (Three.js) — plus the monorepo scaffold and walking-skeleton apps, fully TDD.

**Architecture:** npm-workspaces monorepo (`packages/engine`, `games/monkey-ball`, `tools/level-editor`). Engine wraps all third-party libs behind ports/adapters; game and editor may only import `@automata/engine` (lint-enforced). Fixed-timestep loop, redux-style store, miniplex ECS, TOML/YAML/JSON data registry with zod validation.

**Tech Stack:** TypeScript (strict), Vite, Vitest (+ happy-dom, @vitest/coverage-v8), ESLint 9 flat config + typescript-eslint, miniplex, zod, smol-toml, yaml, @dimforge/rapier3d-compat, three.

**Spec:** `../../../../specs/archive/2026-06/week-24/2026-06-09-automata-engine-monkey-ball-design.md`. This plan covers milestones M0–M6 only. Plans 2 (game, M7–M10) and 3 (editor/content/polish, M11–M15) are written after this plan ships.

**Conventions used throughout:**
- All commands run from the repo root: `/Users/mcthaydt/Desktop/AutomataEngine`.
- Every test file lives in the package's `tests/` dir, mirroring `src/` (e.g. `packages/engine/tests/state/store.test.ts` tests `packages/engine/src/state/store.ts`).
- "Run: `npx vitest run <path>`" — with the root projects config, a path argument filters to that file.
- Engine public API is re-exported from `packages/engine/src/index.ts`; when a task says "add to barrel", append the shown `export` line to that file.
- Browser-only shims (`src/loop/browser.ts`, `src/render/browser.ts`, app `main.ts` files) are the **only** untested files; they are excluded from coverage and must stay trivially thin.
- API drift note: if an installed library's API differs from the code shown (these libs evolve), check its installed README/types and adapt the adapter internals — **never** the port interfaces.

---

## Milestone M0 — Monorepo scaffold

### Task 1: Root workspace + engine package + first test

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `README.md`, `vitest.config.ts`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/version.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/tests/version.test.ts`

- [x] **Step 1: Write root + engine config files**

`package.json`:
```json
{
  "name": "automata-engine-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "games/*", "tools/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "ci": "npm run lint && npm run typecheck && npm run test"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
coverage/
*.local
.DS_Store
```

`README.md`:
```markdown
# AutomataEngine

Web-first game engine (`packages/engine`) with its first game, a Monkey Ball
clone (`games/monkey-ball`), and a level editor (`tools/level-editor`).

- Spec: `../../../../specs/archive/2026-06/week-24/2026-06-09-automata-engine-monkey-ball-design.md`
- Dev: `npm install`, then `npm run ci` (lint + typecheck + tests)
```

`vitest.config.ts` (root):
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'games/*', 'tools/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**'],
      exclude: ['**/browser.ts', '**/index.ts', '**/version.ts'],
      thresholds: { lines: 90, branches: 90 }
    }
  }
})
```

`packages/engine/package.json`:
```json
{
  "name": "@automata/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" }
}
```

`packages/engine/tsconfig.json` (DOM lib needed: input sources and browser
shims reference `HTMLElement`/`document`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/engine/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'engine', environment: 'node', include: ['tests/**/*.test.ts'] }
})
```

- [x] **Step 2: Install dev dependencies**

Run: `npm install -D typescript vitest @vitest/coverage-v8 happy-dom eslint typescript-eslint vite`
Expected: lockfile created, no errors.

- [x] **Step 3: Write the failing test**

`packages/engine/tests/version.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../src/index'

describe('engine package', () => {
  it('exports a semver-ish version string', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
```

- [x] **Step 4: Run test to verify it fails**

Run: `npx vitest run packages/engine/tests/version.test.ts`
Expected: FAIL — cannot resolve `../src/index`.

- [x] **Step 5: Implement**

`packages/engine/src/version.ts`:
```ts
export const ENGINE_VERSION = '0.1.0'
```

`packages/engine/src/index.ts`:
```ts
export { ENGINE_VERSION } from './version'
```

- [x] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/engine/tests/version.test.ts`
Expected: PASS (1 test).

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: monorepo scaffold + engine package with version test"
```

### Task 2: ESLint flat config with dependency-boundary rules

**Files:**
- Create: `eslint.config.js`

- [x] **Step 1: Write the config**

`eslint.config.js`:
```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  {
    // Game + tools may only use third-party libs through @automata/engine.
    files: ['games/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['three', 'three/*', '@dimforge/*', 'miniplex', 'smol-toml', 'yaml', 'zod'],
          message: 'Import the engine-wrapped API from @automata/engine instead.'
        }]
      }]
    }
  },
  {
    // Engine must never depend on games or tools.
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['monkey-ball', 'monkey-ball/*', 'level-editor', 'level-editor/*'],
          message: 'Engine must not import games or tools.'
        }]
      }]
    }
  }
)
```

- [x] **Step 2: Verify the boundary rule actually fires**

Create a scratch violation `games/scratch.ts`:
```ts
import 'miniplex'
```
Run: `npx eslint games/scratch.ts`
Expected: 1 error mentioning `@automata/engine`.
Then delete the scratch file: `rm games/scratch.ts` (and `rmdir games` if now empty — it will be repopulated in Task 3).

- [x] **Step 3: Verify clean lint passes**

Run: `npm run lint`
Expected: exit 0, no errors.

- [x] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore: eslint flat config with engine/game/tool boundary rules"
```

### Task 3: Game app walking skeleton

**Files:**
- Create: `games/monkey-ball/package.json`, `games/monkey-ball/tsconfig.json`, `games/monkey-ball/vitest.config.ts`, `games/monkey-ball/index.html`
- Create: `games/monkey-ball/src/skeleton.ts`, `games/monkey-ball/src/main.ts`
- Test: `games/monkey-ball/tests/skeleton.test.ts`

- [x] **Step 1: Write package config**

`games/monkey-ball/package.json`:
```json
{
  "name": "monkey-ball",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "dependencies": { "@automata/engine": "*" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  }
}
```

`games/monkey-ball/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`games/monkey-ball/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'monkey-ball', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

`games/monkey-ball/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Monkey Ball</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [x] **Step 2: Run install so the workspace links @automata/engine**

Run: `npm install`
Expected: `node_modules/@automata/engine` is a symlink into `packages/engine`.

- [x] **Step 3: Write the failing test**

`games/monkey-ball/tests/skeleton.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { renderSkeleton } from '../src/skeleton'

describe('walking skeleton', () => {
  it('renders the engine version into the root element', () => {
    const root = document.createElement('div')
    renderSkeleton(root)
    expect(root.textContent).toContain('AutomataEngine 0.1.0')
  })
})
```

- [x] **Step 4: Run test to verify it fails**

Run: `npx vitest run games/monkey-ball/tests/skeleton.test.ts`
Expected: FAIL — cannot resolve `../src/skeleton`.

- [x] **Step 5: Implement**

`games/monkey-ball/src/skeleton.ts`:
```ts
import { ENGINE_VERSION } from '@automata/engine'

export function renderSkeleton(root: HTMLElement): void {
  root.textContent = `monkey-ball on AutomataEngine ${ENGINE_VERSION}`
}
```

`games/monkey-ball/src/main.ts` (browser shim — untested):
```ts
import { renderSkeleton } from './skeleton'

renderSkeleton(document.getElementById('app') as HTMLElement)
```

- [x] **Step 6: Run test to verify it passes**

Run: `npx vitest run games/monkey-ball/tests/skeleton.test.ts`
Expected: PASS — proves cross-package import works under Vitest.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(game): walking-skeleton app importing @automata/engine"
```

### Task 4: Editor app walking skeleton

**Files:**
- Create: `tools/level-editor/package.json`, `tools/level-editor/tsconfig.json`, `tools/level-editor/vitest.config.ts`, `tools/level-editor/index.html`
- Create: `tools/level-editor/src/skeleton.ts`, `tools/level-editor/src/main.ts`
- Test: `tools/level-editor/tests/skeleton.test.ts`

- [x] **Step 1: Write package config**

Same shape as Task 3 with these differences — `tools/level-editor/package.json`:
```json
{
  "name": "level-editor",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "dependencies": { "@automata/engine": "*", "monkey-ball": "*" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  }
}
```

`tools/level-editor/tsconfig.json`, `vitest.config.ts` (name: `'level-editor'`), and `index.html` (title `Level Editor`): copy Task 3's files with names swapped.

- [x] **Step 2: Write the failing test**

`tools/level-editor/tests/skeleton.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { renderSkeleton } from '../src/skeleton'

describe('editor walking skeleton', () => {
  it('renders the engine version into the root element', () => {
    const root = document.createElement('div')
    renderSkeleton(root)
    expect(root.textContent).toContain('level-editor on AutomataEngine 0.1.0')
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `npm install && npx vitest run tools/level-editor/tests/skeleton.test.ts`
Expected: FAIL — cannot resolve `../src/skeleton`.

- [x] **Step 4: Implement**

`tools/level-editor/src/skeleton.ts`:
```ts
import { ENGINE_VERSION } from '@automata/engine'

export function renderSkeleton(root: HTMLElement): void {
  root.textContent = `level-editor on AutomataEngine ${ENGINE_VERSION}`
}
```

`tools/level-editor/src/main.ts` (browser shim — untested):
```ts
import { renderSkeleton } from './skeleton'

renderSkeleton(document.getElementById('app') as HTMLElement)
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tools/level-editor/tests/skeleton.test.ts`
Expected: PASS.

- [x] **Step 6: Full CI gate**

Run: `npm run ci`
Expected: lint clean, all typechecks pass, 3 test files pass (engine version, game skeleton, editor skeleton).

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(editor): walking-skeleton app; M0 scaffold complete"
```

---

## Milestone M1 — Store + persistence + storage adapters

### Task 5: createStore (dispatch / getState / subscribe / middleware)

**Files:**
- Create: `packages/engine/src/state/store.ts`
- Test: `packages/engine/tests/state/store.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/state/store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createStore, type Middleware } from '../../src/state/store'

type CounterAction = { type: 'inc' } | { type: 'add'; amount: number }
const counter = (state: number, action: CounterAction): number => {
  switch (action.type) {
    case 'inc': return state + 1
    case 'add': return state + action.amount
    default: return state
  }
}

describe('createStore', () => {
  it('returns the initial state', () => {
    const store = createStore(counter, 5)
    expect(store.getState()).toBe(5)
  })

  it('reduces state on dispatch', () => {
    const store = createStore(counter, 0)
    store.dispatch({ type: 'inc' })
    store.dispatch({ type: 'add', amount: 4 })
    expect(store.getState()).toBe(5)
  })

  it('notifies subscribers with (state, prev) after each dispatch', () => {
    const store = createStore(counter, 0)
    const seen: Array<[number, number]> = []
    store.subscribe((state, prev) => seen.push([state, prev]))
    store.dispatch({ type: 'inc' })
    store.dispatch({ type: 'inc' })
    expect(seen).toEqual([[1, 0], [2, 1]])
  })

  it('stops notifying after unsubscribe', () => {
    const store = createStore(counter, 0)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.dispatch({ type: 'inc' })
    unsubscribe()
    store.dispatch({ type: 'inc' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('runs middleware in order around the reducer', () => {
    const calls: string[] = []
    const mw = (tag: string): Middleware<number, CounterAction> =>
      () => (next) => (action) => {
        calls.push(`${tag}:before`)
        next(action)
        calls.push(`${tag}:after`)
      }
    const store = createStore(counter, 0, [mw('a'), mw('b')])
    store.dispatch({ type: 'inc' })
    expect(calls).toEqual(['a:before', 'b:before', 'b:after', 'a:after'])
    expect(store.getState()).toBe(1)
  })

  it('middleware can read post-reduce state via getState', () => {
    let observed = -1
    const spy: Middleware<number, CounterAction> =
      (api) => (next) => (action) => {
        next(action)
        observed = api.getState()
      }
    const store = createStore(counter, 0, [spy])
    store.dispatch({ type: 'inc' })
    expect(observed).toBe(1)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/state/store.test.ts`
Expected: FAIL — cannot resolve `../../src/state/store`.

- [x] **Step 3: Implement**

`packages/engine/src/state/store.ts`:
```ts
export interface AnyAction { type: string }

export type Reducer<S, A extends AnyAction> = (state: S, action: A) => S

export interface StoreApi<S, A extends AnyAction> {
  getState(): S
  dispatch(action: A): void
}

export type Middleware<S, A extends AnyAction> =
  (api: StoreApi<S, A>) => (next: (action: A) => void) => (action: A) => void

export interface Store<S, A extends AnyAction> extends StoreApi<S, A> {
  subscribe(listener: (state: S, prev: S) => void): () => void
}

export function createStore<S, A extends AnyAction>(
  reducer: Reducer<S, A>,
  initial: S,
  middleware: Middleware<S, A>[] = []
): Store<S, A> {
  let state = initial
  const listeners = new Set<(state: S, prev: S) => void>()

  const base = (action: A): void => {
    const prev = state
    state = reducer(state, action)
    for (const listener of [...listeners]) listener(state, prev)
  }

  const api: StoreApi<S, A> = {
    getState: () => state,
    dispatch: (action) => chain(action)
  }
  const chain = middleware.reduceRight<(action: A) => void>(
    (next, mw) => mw(api)(next),
    base
  )

  return {
    getState: api.getState,
    dispatch: api.dispatch,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
```

Add to barrel (`packages/engine/src/index.ts`):
```ts
export * from './state/store'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/state/store.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): redux-style store with middleware chain"
```

### Task 6: combineReducers + subscribeSelector

**Files:**
- Create: `packages/engine/src/state/slices.ts`
- Test: `packages/engine/tests/state/slices.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/state/slices.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createStore } from '../../src/state/store'
import { combineReducers, subscribeSelector } from '../../src/state/slices'

type Action = { type: 'inc' } | { type: 'rename'; name: string }
const count = (state: number = 0, action: Action): number =>
  action.type === 'inc' ? state + 1 : state
const name = (state: string = 'anon', action: Action): string =>
  action.type === 'rename' ? action.name : state

describe('combineReducers', () => {
  it('reduces each slice independently', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const store = createStore(root, { count: 0, name: 'anon' })
    store.dispatch({ type: 'inc' })
    store.dispatch({ type: 'rename', name: 'aiai' })
    expect(store.getState()).toEqual({ count: 1, name: 'aiai' })
  })

  it('returns the same state object when nothing changed', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const before = { count: 3, name: 'x' }
    const after = root(before, { type: 'rename', name: 'x' } as Action)
    expect(after).toBe(before)
  })
})

describe('subscribeSelector', () => {
  it('fires only when the selected value changes (Object.is)', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const store = createStore(root, { count: 0, name: 'anon' })
    const onName = vi.fn()
    subscribeSelector(store, (s) => s.name, onName)
    store.dispatch({ type: 'inc' })            // name unchanged
    store.dispatch({ type: 'rename', name: 'z' })
    expect(onName).toHaveBeenCalledTimes(1)
    expect(onName).toHaveBeenCalledWith('z', 'anon')
  })

  it('returns an unsubscribe function', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const store = createStore(root, { count: 0, name: 'anon' })
    const onCount = vi.fn()
    const unsub = subscribeSelector(store, (s) => s.count, onCount)
    unsub()
    store.dispatch({ type: 'inc' })
    expect(onCount).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/state/slices.test.ts`
Expected: FAIL — cannot resolve `../../src/state/slices`.

- [x] **Step 3: Implement**

`packages/engine/src/state/slices.ts`:
```ts
import type { AnyAction, Reducer, Store } from './store'

export function combineReducers<S extends object, A extends AnyAction>(
  slices: { [K in keyof S]: Reducer<S[K], A> }
): Reducer<S, A> {
  const keys = Object.keys(slices) as Array<keyof S>
  return (state, action) => {
    let changed = false
    const next = {} as S
    for (const key of keys) {
      const reduced = slices[key](state[key], action)
      next[key] = reduced
      if (!Object.is(reduced, state[key])) changed = true
    }
    return changed ? next : state
  }
}

export function subscribeSelector<S, A extends AnyAction, T>(
  store: Store<S, A>,
  selector: (state: S) => T,
  onChange: (value: T, prev: T) => void
): () => void {
  return store.subscribe((state, prevState) => {
    const value = selector(state)
    const prev = selector(prevState)
    if (!Object.is(value, prev)) onChange(value, prev)
  })
}
```

Add to barrel:
```ts
export * from './state/slices'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/state/slices.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): combineReducers and per-slice subscriptions"
```

### Task 7: StoragePort + adapters (memory, localStorage)

**Files:**
- Create: `packages/engine/src/storage/port.ts`, `packages/engine/src/storage/adapters.ts`
- Test: `packages/engine/tests/storage/adapters.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/storage/adapters.test.ts`:
```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { memoryStorage, localStorageAdapter } from '../../src/storage/adapters'

describe('memoryStorage', () => {
  it('round-trips values and returns null for misses', () => {
    const storage = memoryStorage()
    expect(storage.get('nope')).toBeNull()
    storage.set('k', 'v')
    expect(storage.get('k')).toBe('v')
  })
})

describe('localStorageAdapter', () => {
  it('round-trips through window.localStorage', () => {
    const storage = localStorageAdapter()
    storage.set('automata-test', 'hello')
    expect(storage.get('automata-test')).toBe('hello')
    expect(window.localStorage.getItem('automata-test')).toBe('hello')
  })

  it('swallows write errors (quota) instead of throwing', () => {
    const broken = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') }
    } as unknown as Storage
    const storage = localStorageAdapter(broken)
    expect(() => storage.set('k', 'v')).not.toThrow()
    expect(storage.get('k')).toBeNull()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/storage/adapters.test.ts`
Expected: FAIL — cannot resolve `../../src/storage/adapters`.

- [x] **Step 3: Implement**

`packages/engine/src/storage/port.ts`:
```ts
export interface StoragePort {
  get(key: string): string | null
  set(key: string, value: string): void
}
```

`packages/engine/src/storage/adapters.ts`:
```ts
import type { StoragePort } from './port'

export function memoryStorage(): StoragePort {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => { map.set(key, value) }
  }
}

export function localStorageAdapter(backing: Storage = globalThis.localStorage): StoragePort {
  return {
    get(key) {
      try { return backing.getItem(key) } catch { return null }
    },
    set(key, value) {
      try { backing.setItem(key, value) } catch { /* quota/private mode: drop write */ }
    }
  }
}
```

Add to barrel:
```ts
export * from './storage/port'
export * from './storage/adapters'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/storage/adapters.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): StoragePort with memory and localStorage adapters"
```

### Task 8: loadPersisted (versioned envelope + migration)

**Files:**
- Create: `packages/engine/src/state/persistence.ts`
- Test: `packages/engine/tests/state/persistence-load.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/state/persistence-load.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../../src/storage/adapters'
import { loadPersisted } from '../../src/state/persistence'

describe('loadPersisted', () => {
  it('returns null when nothing is stored', () => {
    expect(loadPersisted(memoryStorage(), 'save', 1)).toBeNull()
  })

  it('returns the data for a matching version', () => {
    const storage = memoryStorage()
    storage.set('save', JSON.stringify({ version: 1, data: { lives: 3 } }))
    expect(loadPersisted(storage, 'save', 1)).toEqual({ lives: 3 })
  })

  it('returns null for corrupt JSON', () => {
    const storage = memoryStorage()
    storage.set('save', '{not json')
    expect(loadPersisted(storage, 'save', 1)).toBeNull()
  })

  it('returns null for a malformed envelope', () => {
    const storage = memoryStorage()
    storage.set('save', JSON.stringify({ lives: 3 }))
    expect(loadPersisted(storage, 'save', 1)).toBeNull()
  })

  it('migrates older versions when a migrator is provided', () => {
    const storage = memoryStorage()
    storage.set('save', JSON.stringify({ version: 1, data: { lives: 3 } }))
    const migrated = loadPersisted(storage, 'save', 2, (data, from) =>
      from === 1 ? { ...(data as object), bananas: 0 } : null
    )
    expect(migrated).toEqual({ lives: 3, bananas: 0 })
  })

  it('returns null when versions mismatch and no migrator handles it', () => {
    const storage = memoryStorage()
    storage.set('save', JSON.stringify({ version: 1, data: {} }))
    expect(loadPersisted(storage, 'save', 2)).toBeNull()
    expect(loadPersisted(storage, 'save', 2, () => null)).toBeNull()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/state/persistence-load.test.ts`
Expected: FAIL — cannot resolve `../../src/state/persistence`.

- [x] **Step 3: Implement**

`packages/engine/src/state/persistence.ts`:
```ts
import type { StoragePort } from '../storage/port'

interface Envelope { version: number; data: unknown }

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null &&
    typeof (value as Envelope).version === 'number' && 'data' in value
}

export function loadPersisted(
  storage: StoragePort,
  key: string,
  version: number,
  migrate?: (data: unknown, fromVersion: number) => unknown | null
): unknown | null {
  const raw = storage.get(key)
  if (raw === null) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!isEnvelope(parsed)) return null
  if (parsed.version === version) return parsed.data
  if (!migrate) return null
  return migrate(parsed.data, parsed.version)
}
```

Add to barrel:
```ts
export * from './state/persistence'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/state/persistence-load.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): versioned persisted-state loading with migration"
```

### Task 9: Persistence middleware (debounced writes + flush)

**Files:**
- Modify: `packages/engine/src/state/persistence.ts`
- Test: `packages/engine/tests/state/persistence-write.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/state/persistence-write.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '../../src/state/store'
import { memoryStorage } from '../../src/storage/adapters'
import { createPersistence } from '../../src/state/persistence'

type Action = { type: 'inc' } | { type: 'noop' }
interface State { count: number; transient: string }
const reducer = (state: State, action: Action): State =>
  action.type === 'inc' ? { ...state, count: state.count + 1 } : state

describe('createPersistence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const storage = memoryStorage()
    const persistence = createPersistence<State, Action>(storage, {
      key: 'save',
      version: 2,
      debounceMs: 100,
      pick: (s) => ({ count: s.count })
    })
    const store = createStore(reducer, { count: 0, transient: 'x' }, [persistence.middleware])
    return { storage, store, persistence }
  }

  it('writes the picked slice as a versioned envelope after the debounce', () => {
    const { storage, store } = setup()
    store.dispatch({ type: 'inc' })
    expect(storage.get('save')).toBeNull()
    vi.advanceTimersByTime(100)
    expect(JSON.parse(storage.get('save')!)).toEqual({ version: 2, data: { count: 1 } })
  })

  it('coalesces rapid dispatches into one write with the latest state', () => {
    const { storage, store } = setup()
    store.dispatch({ type: 'inc' })
    vi.advanceTimersByTime(50)
    store.dispatch({ type: 'inc' })
    vi.advanceTimersByTime(99)
    expect(storage.get('save')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(JSON.parse(storage.get('save')!).data).toEqual({ count: 2 })
  })

  it('skips scheduling when the picked value is unchanged', () => {
    const { storage, store } = setup()
    store.dispatch({ type: 'noop' })
    vi.advanceTimersByTime(1000)
    expect(storage.get('save')).toBeNull()
  })

  it('flush() writes immediately', () => {
    const { storage, store, persistence } = setup()
    store.dispatch({ type: 'inc' })
    persistence.flush()
    expect(JSON.parse(storage.get('save')!).data).toEqual({ count: 1 })
    vi.advanceTimersByTime(1000) // no double-write crash
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/state/persistence-write.test.ts`
Expected: FAIL — `createPersistence` is not exported.

- [x] **Step 3: Implement (append to `persistence.ts`; the `import` lines join the existing imports at the top of the file)**

```ts
import type { AnyAction, Middleware } from './store'

export interface PersistenceOptions<S> {
  key: string
  version: number
  debounceMs: number
  pick: (state: S) => unknown
}

export interface Persistence<S, A extends AnyAction> {
  middleware: Middleware<S, A>
  flush(): void
}

export function createPersistence<S, A extends AnyAction>(
  storage: StoragePort,
  options: PersistenceOptions<S>
): Persistence<S, A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: unknown = undefined
  let lastWritten: unknown = undefined

  const write = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (pending === undefined) return
    storage.set(options.key, JSON.stringify({ version: options.version, data: pending }))
    lastWritten = pending
    pending = undefined
  }

  return {
    middleware: (api) => {
      // Baseline: the initial state counts as already persisted — only
      // changes from here on schedule writes.
      lastWritten = options.pick(api.getState())
      return (next) => (action) => {
        next(action)
        const picked = options.pick(api.getState())
        const reference = pending === undefined ? lastWritten : pending
        if (deepEqual(picked, reference)) return
        pending = picked
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(write, options.debounceMs)
      }
    },
    flush: write
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/state/persistence-write.test.ts`
Expected: PASS (4 tests). Also run the whole package: `npx vitest run packages/engine` — all green.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): debounced persistence middleware with flush; M1 complete"
```

---

## Milestone M2 — Data registry (TOML/YAML/JSON + zod) + archetypes

### Task 10: Format parsers

**Files:**
- Create: `packages/engine/src/data/parsers.ts`
- Test: `packages/engine/tests/data/parsers.test.ts`

- [x] **Step 1: Install data dependencies (engine workspace)**

Run: `npm install smol-toml yaml zod -w @automata/engine`
Expected: added to `packages/engine/package.json` dependencies.

- [x] **Step 2: Write the failing tests**

`packages/engine/tests/data/parsers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseByFormat, ParseError } from '../../src/data/parsers'

describe('parseByFormat', () => {
  it('parses TOML', () => {
    expect(parseByFormat('toml', 'max-tilt-deg = 12.0\n[ball]\nradius = 0.5'))
      .toEqual({ 'max-tilt-deg': 12, ball: { radius: 0.5 } })
  })

  it('parses YAML', () => {
    expect(parseByFormat('yaml', 'banana:\n  collectible: { value: 1 }'))
      .toEqual({ banana: { collectible: { value: 1 } } })
  })

  it('parses JSON', () => {
    expect(parseByFormat('json', '{ "id": "w1-l1" }')).toEqual({ id: 'w1-l1' })
  })

  it('throws ParseError with the format and underlying message on bad input', () => {
    for (const format of ['toml', 'yaml', 'json'] as const) {
      let caught: unknown
      try { parseByFormat(format, '{{{{not valid in any format::::') } catch (e) { caught = e }
      expect(caught).toBeInstanceOf(ParseError)
      expect((caught as ParseError).format).toBe(format)
      expect((caught as ParseError).message.length).toBeGreaterThan(0)
    }
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/data/parsers.test.ts`
Expected: FAIL — cannot resolve `../../src/data/parsers`.

- [x] **Step 4: Implement**

`packages/engine/src/data/parsers.ts`:
```ts
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'

export type DataFormat = 'toml' | 'yaml' | 'json'

export class ParseError extends Error {
  constructor(readonly format: DataFormat, cause: unknown) {
    super(`Invalid ${format}: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ParseError'
  }
}

export function parseByFormat(format: DataFormat, text: string): unknown {
  try {
    switch (format) {
      case 'toml': return parseToml(text)
      case 'yaml': {
        const result = parseYaml(text)
        if (result === null || typeof result !== 'object') throw new Error('not a YAML mapping')
        return result
      }
      case 'json': return JSON.parse(text)
    }
  } catch (cause) {
    throw new ParseError(format, cause)
  }
}
```

Note: the YAML branch rejects scalar-only documents because every engine data
kind is an object at the top level; `'{{{{not valid…'` parses as a YAML scalar
string, so without that guard the error test would not throw for yaml.

Add to barrel:
```ts
export * from './data/parsers'
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/data/parsers.test.ts`
Expected: PASS (4 tests).

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): toml/yaml/json parsers with uniform ParseError"
```

### Task 11: DataKind + parseData (schema validation, DataLoadError)

**Files:**
- Create: `packages/engine/src/data/registry.ts`
- Modify: `packages/engine/src/index.ts` (also re-export zod)
- Test: `packages/engine/tests/data/registry.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/data/registry.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineKind, parseData, DataLoadError } from '../../src/data/registry'

const tuningKind = defineKind('tuning', 'toml', z.object({
  gravity: z.number(),
  ball: z.object({ radius: z.number().positive() })
}))

describe('parseData', () => {
  it('parses and validates into a typed value', () => {
    const result = parseData(tuningKind, 'gravity = 9.81\n[ball]\nradius = 0.5', 'physics.toml')
    expect(result).toEqual({ gravity: 9.81, ball: { radius: 0.5 } })
  })

  it('wraps syntax errors in DataLoadError with file and kind', () => {
    let caught: unknown
    try { parseData(tuningKind, '= broken =', 'physics.toml') } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(DataLoadError)
    const err = caught as DataLoadError
    expect(err.file).toBe('physics.toml')
    expect(err.kind).toBe('tuning')
    expect(err.issues.length).toBeGreaterThan(0)
  })

  it('reports schema violations with dotted paths', () => {
    let caught: unknown
    try {
      parseData(tuningKind, 'gravity = 9.81\n[ball]\nradius = -1', 'physics.toml')
    } catch (e) { caught = e }
    const err = caught as DataLoadError
    expect(err).toBeInstanceOf(DataLoadError)
    expect(err.issues.some((issue) => issue.startsWith('ball.radius:'))).toBe(true)
    expect(err.message).toContain('physics.toml')
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/data/registry.test.ts`
Expected: FAIL — cannot resolve `../../src/data/registry`.

- [x] **Step 3: Implement**

`packages/engine/src/data/registry.ts`:
```ts
import type { ZodType } from 'zod'
import { parseByFormat, type DataFormat } from './parsers'

export class DataLoadError extends Error {
  constructor(readonly file: string, readonly kind: string, readonly issues: string[]) {
    super(`Failed to load ${kind} from ${file}:\n  ${issues.join('\n  ')}`)
    this.name = 'DataLoadError'
  }
}

export interface DataKind<T> {
  name: string
  format: DataFormat
  schema: ZodType<T>
}

export function defineKind<T>(name: string, format: DataFormat, schema: ZodType<T>): DataKind<T> {
  return { name, format, schema }
}

export function parseData<T>(kind: DataKind<T>, text: string, file: string): T {
  let raw: unknown
  try {
    raw = parseByFormat(kind.format, text)
  } catch (cause) {
    throw new DataLoadError(file, kind.name, [cause instanceof Error ? cause.message : String(cause)])
  }
  const result = kind.schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`
    )
    throw new DataLoadError(file, kind.name, issues)
  }
  return result.data
}
```

Add to barrel (zod is re-exported so game/editor never import it directly — the
lint boundary rule from Task 2 forbids them importing `zod`):
```ts
export * from './data/registry'
export { z } from 'zod'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/data/registry.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): typed data kinds with zod validation and rich load errors"
```

### Task 12: Async loader over fetchText

**Files:**
- Create: `packages/engine/src/data/loader.ts`
- Test: `packages/engine/tests/data/loader.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/data/loader.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineKind, DataLoadError } from '../../src/data/registry'
import { createLoader, fetchTextViaFetch } from '../../src/data/loader'

const levelKind = defineKind('level', 'json', z.object({ id: z.string() }))

describe('createLoader', () => {
  it('fetches, parses, and validates', async () => {
    const loader = createLoader(async (url) => {
      expect(url).toBe('/data/levels/w1-l1.json')
      return '{ "id": "w1-l1" }'
    })
    await expect(loader.load(levelKind, '/data/levels/w1-l1.json'))
      .resolves.toEqual({ id: 'w1-l1' })
  })

  it('wraps fetch failures in DataLoadError carrying the url', async () => {
    const loader = createLoader(async () => { throw new Error('404 Not Found') })
    const promise = loader.load(levelKind, '/missing.json')
    await expect(promise).rejects.toBeInstanceOf(DataLoadError)
    await expect(promise).rejects.toMatchObject({ file: '/missing.json', kind: 'level' })
  })

  it('propagates validation failures as DataLoadError', async () => {
    const loader = createLoader(async () => '{ "id": 42 }')
    await expect(loader.load(levelKind, '/bad.json')).rejects.toBeInstanceOf(DataLoadError)
  })

  it('fetchTextViaFetch returns body text and throws on HTTP errors', async () => {
    const ok = (async () => ({ ok: true, status: 200, text: async () => 'hello' })) as unknown as typeof fetch
    await expect(fetchTextViaFetch(ok)('/x')).resolves.toBe('hello')
    const notFound = (async () => ({ ok: false, status: 404, text: async () => '' })) as unknown as typeof fetch
    await expect(fetchTextViaFetch(notFound)('/x')).rejects.toThrow(/404/)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/data/loader.test.ts`
Expected: FAIL — cannot resolve `../../src/data/loader`.

- [x] **Step 3: Implement**

`packages/engine/src/data/loader.ts`:
```ts
import { DataLoadError, parseData, type DataKind } from './registry'

export interface DataLoader {
  load<T>(kind: DataKind<T>, url: string): Promise<T>
}

export function createLoader(fetchText: (url: string) => Promise<string>): DataLoader {
  return {
    async load(kind, url) {
      let text: string
      try {
        text = await fetchText(url)
      } catch (cause) {
        throw new DataLoadError(url, kind.name,
          [cause instanceof Error ? cause.message : String(cause)])
      }
      return parseData(kind, text, url)
    }
  }
}

/** Browser default: fetch a same-origin asset as text (used by apps). */
export function fetchTextViaFetch(fetchImpl: typeof fetch = fetch): (url: string) => Promise<string> {
  return async (url) => {
    const response = await fetchImpl(url)
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
    return response.text()
  }
}
```

Add to barrel:
```ts
export * from './data/loader'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/data/loader.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): async data loader over injectable fetchText"
```

### Task 13: Archetype library + spawnFromArchetype

**Files:**
- Create: `packages/engine/src/data/archetypes.ts`
- Test: `packages/engine/tests/data/archetypes.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/data/archetypes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind, spawnFromArchetype, UnknownArchetypeError
} from '../../src/data/archetypes'
import { parseData } from '../../src/data/registry'

const lib = parseData(archetypeLibraryKind, [
  'banana:',
  '  collectible: { value: 1 }',
  '  renderable: { primitive: sphere, radius: 0.25, color: "#ffd23f" }',
  'bumper:',
  '  bumper: { impulseStrength: 8 }'
].join('\n'), 'standard.yaml')

function fakeWorld() {
  const added: object[] = []
  return { added, add: <E extends object>(entity: E): E => { added.push(entity); return entity } }
}

describe('spawnFromArchetype', () => {
  it('adds an entity with the archetype components (copied, not shared)', () => {
    const world = fakeWorld()
    const entity = spawnFromArchetype(world, lib, 'banana') as Record<string, unknown>
    expect(entity).toEqual({
      collectible: { value: 1 },
      renderable: { primitive: 'sphere', radius: 0.25, color: '#ffd23f' }
    })
    expect(world.added).toHaveLength(1)
    expect(entity.collectible).not.toBe(lib.banana!.collectible) // defensive copy
  })

  it('shallow-merges overrides per component', () => {
    const world = fakeWorld()
    const entity = spawnFromArchetype(world, lib, 'banana', {
      collectible: { value: 5 },
      transform: { position: { x: 1, y: 2, z: 3 } }
    }) as Record<string, unknown>
    expect(entity.collectible).toEqual({ value: 5 })
    expect(entity.transform).toEqual({ position: { x: 1, y: 2, z: 3 } })
    expect(entity.renderable).toEqual({ primitive: 'sphere', radius: 0.25, color: '#ffd23f' })
  })

  it('throws UnknownArchetypeError listing available names', () => {
    let caught: unknown
    try { spawnFromArchetype(fakeWorld(), lib, 'durian') } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(UnknownArchetypeError)
    expect((caught as Error).message).toContain('durian')
    expect((caught as Error).message).toContain('banana')
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/data/archetypes.test.ts`
Expected: FAIL — cannot resolve `../../src/data/archetypes`.

- [x] **Step 3: Implement**

`packages/engine/src/data/archetypes.ts`:
```ts
import { z } from 'zod'
import { defineKind } from './registry'

export const archetypeLibrarySchema = z.record(z.string(), z.record(z.string(), z.unknown()))
export type ArchetypeLibrary = z.infer<typeof archetypeLibrarySchema>

/** Archetype libraries are authored as YAML per the spec's format conventions. */
export const archetypeLibraryKind = defineKind('archetypes', 'yaml', archetypeLibrarySchema)

export class UnknownArchetypeError extends Error {
  constructor(name: string, available: string[]) {
    super(`Unknown archetype "${name}". Available: ${available.join(', ')}`)
    this.name = 'UnknownArchetypeError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function spawnFromArchetype<E extends object>(
  world: { add(entity: E): E },
  lib: ArchetypeLibrary,
  name: string,
  overrides: Record<string, unknown> = {}
): E {
  const archetype = lib[name]
  if (!archetype) throw new UnknownArchetypeError(name, Object.keys(lib))

  const entity: Record<string, unknown> = {}
  for (const [component, value] of Object.entries(archetype)) {
    entity[component] = isPlainObject(value) ? structuredClone(value) : value
  }
  for (const [component, override] of Object.entries(overrides)) {
    const base = entity[component]
    entity[component] = isPlainObject(override) && isPlainObject(base)
      ? { ...base, ...override }
      : override
  }
  return world.add(entity as E)
}
```

Add to barrel:
```ts
export * from './data/archetypes'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/data/archetypes.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): YAML archetype libraries with override-merging spawner; M2 complete"
```

---

## Milestone M3 — Math + ECS conventions (world, events, scheduler)

### Task 14: vec3 math

**Files:**
- Create: `packages/engine/src/math/vec3.ts`
- Test: `packages/engine/tests/math/vec3.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/math/vec3.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { vec3 } from '../../src/math/vec3'

describe('vec3', () => {
  it('creates and clones without aliasing', () => {
    const v = vec3.create(1, 2, 3)
    const c = vec3.clone(v)
    expect(c).toEqual({ x: 1, y: 2, z: 3 })
    expect(c).not.toBe(v)
  })

  it('adds, subtracts, scales', () => {
    expect(vec3.add({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 })
    expect(vec3.sub({ x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 0, y: 1, z: 2 })
    expect(vec3.scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 })
  })

  it('computes length and normalizes (zero-safe)', () => {
    expect(vec3.length({ x: 3, y: 4, z: 0 })).toBe(5)
    expect(vec3.normalize({ x: 3, y: 4, z: 0 })).toEqual({ x: 0.6, y: 0.8, z: 0 })
    expect(vec3.normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('lerps componentwise', () => {
    expect(vec3.lerp({ x: 0, y: 0, z: 0 }, { x: 10, y: -10, z: 4 }, 0.5))
      .toEqual({ x: 5, y: -5, z: 2 })
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/math/vec3.test.ts`
Expected: FAIL — cannot resolve `../../src/math/vec3`.

- [x] **Step 3: Implement**

`packages/engine/src/math/vec3.ts`:
```ts
export interface Vec3 { x: number; y: number; z: number }

export const vec3 = {
  create: (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z }),
  clone: (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z }),
  add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s }),
  length: (v: Vec3): number => Math.hypot(v.x, v.y, v.z),
  normalize(v: Vec3): Vec3 {
    const len = vec3.length(v)
    return len === 0 ? { x: 0, y: 0, z: 0 } : vec3.scale(v, 1 / len)
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  })
}
```

Add to barrel:
```ts
export * from './math/vec3'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/math/vec3.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): vec3 math module"
```

### Task 15: quat math

**Files:**
- Create: `packages/engine/src/math/quat.ts`
- Test: `packages/engine/tests/math/quat.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/math/quat.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { quat } from '../../src/math/quat'

const HALF_PI = Math.PI / 2

describe('quat', () => {
  it('identity leaves vectors unchanged', () => {
    const v = quat.apply(quat.identity(), { x: 1, y: 2, z: 3 })
    expect(v.x).toBeCloseTo(1); expect(v.y).toBeCloseTo(2); expect(v.z).toBeCloseTo(3)
  })

  it('fromEuler(+90° about X) maps Y to Z', () => {
    const q = quat.fromEuler(HALF_PI, 0, 0)
    const v = quat.apply(q, { x: 0, y: 1, z: 0 })
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(0); expect(v.z).toBeCloseTo(1)
  })

  it('fromEuler(+90° about Z) maps X to Y', () => {
    const q = quat.fromEuler(0, 0, HALF_PI)
    const v = quat.apply(q, { x: 1, y: 0, z: 0 })
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(1); expect(v.z).toBeCloseTo(0)
  })

  it('multiply composes rotations (apply b then a... as a⊗b)', () => {
    const rotX = quat.fromEuler(HALF_PI, 0, 0)  // Y→Z
    const rotZ = quat.fromEuler(0, 0, HALF_PI)  // X→Y
    const composed = quat.multiply(rotX, rotZ)  // apply rotZ first, then rotX
    const v = quat.apply(composed, { x: 1, y: 0, z: 0 }) // X →(rotZ) Y →(rotX) Z
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(0); expect(v.z).toBeCloseTo(1)
  })

  it('nlerp(a, b, 0.5) is the normalized halfway rotation', () => {
    const a = quat.identity()
    const b = quat.fromEuler(HALF_PI, 0, 0)
    const half = quat.nlerp(a, b, 0.5)
    const v = quat.apply(half, { x: 0, y: 1, z: 0 })  // 45° about X
    expect(v.y).toBeCloseTo(Math.SQRT1_2)
    expect(v.z).toBeCloseTo(Math.SQRT1_2)
    expect(Math.hypot(half.x, half.y, half.z, half.w)).toBeCloseTo(1)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/math/quat.test.ts`
Expected: FAIL — cannot resolve `../../src/math/quat`.

- [x] **Step 3: Implement**

`packages/engine/src/math/quat.ts`:
```ts
import type { Vec3 } from './vec3'

export interface Quat { x: number; y: number; z: number; w: number }

export const quat = {
  identity: (): Quat => ({ x: 0, y: 0, z: 0, w: 1 }),

  /** Intrinsic XYZ euler order, radians. */
  fromEuler(x: number, y: number, z: number): Quat {
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2)
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2)
    const cz = Math.cos(z / 2), sz = Math.sin(z / 2)
    return {
      x: sx * cy * cz + cx * sy * sz,
      y: cx * sy * cz - sx * cy * sz,
      z: cx * cy * sz + sx * sy * cz,
      w: cx * cy * cz - sx * sy * sz
    }
  },

  multiply(a: Quat, b: Quat): Quat {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
    }
  },

  apply(q: Quat, v: Vec3): Vec3 {
    // v' = v + 2w(q×v) + 2(q×(q×v))
    const tx = 2 * (q.y * v.z - q.z * v.y)
    const ty = 2 * (q.z * v.x - q.x * v.z)
    const tz = 2 * (q.x * v.y - q.y * v.x)
    return {
      x: v.x + q.w * tx + (q.y * tz - q.z * ty),
      y: v.y + q.w * ty + (q.z * tx - q.x * tz),
      z: v.z + q.w * tz + (q.x * ty - q.y * tx)
    }
  },

  normalize(q: Quat): Quat {
    const len = Math.hypot(q.x, q.y, q.z, q.w)
    if (len === 0) return quat.identity()
    return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
  },

  /** Normalized lerp — fine for small per-frame interpolation steps. */
  nlerp(a: Quat, b: Quat, t: number): Quat {
    // take the short path
    const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
    const sign = dot < 0 ? -1 : 1
    return quat.normalize({
      x: a.x + (sign * b.x - a.x) * t,
      y: a.y + (sign * b.y - a.y) * t,
      z: a.z + (sign * b.z - a.z) * t,
      w: a.w + (sign * b.w - a.w) * t
    })
  }
}
```

Add to barrel:
```ts
export * from './math/quat'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/math/quat.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): quat math (fromEuler, multiply, apply, nlerp)"
```

### Task 16: World factory + engine components + Transform

**Files:**
- Create: `packages/engine/src/ecs/world.ts`, `packages/engine/src/ecs/components.ts`
- Test: `packages/engine/tests/ecs/world.test.ts`

- [x] **Step 1: Install miniplex (engine workspace)**

Run: `npm install miniplex -w @automata/engine`
Expected: added to engine dependencies.

- [x] **Step 2: Write the failing tests**

`packages/engine/tests/ecs/world.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createWorld } from '../../src/ecs/world'
import { createTransform, type EngineEntity } from '../../src/ecs/components'

// Games extend the engine entity exactly like this:
interface TestEntity extends EngineEntity {
  collectible?: { value: number }
}

describe('createWorld', () => {
  it('adds, queries, and removes entities', () => {
    const world = createWorld<TestEntity>()
    const banana = world.add({ transform: createTransform(), collectible: { value: 1 } })
    world.add({ transform: createTransform() })

    const collectibles = world.with('collectible')
    expect([...collectibles].length).toBe(1)

    world.remove(banana)
    expect([...collectibles].length).toBe(0)
  })

  it('query archetypes update when components are added/removed at runtime', () => {
    const world = createWorld<TestEntity>()
    const entity = world.add({ transform: createTransform() })
    const collectibles = world.with('collectible')
    expect([...collectibles].length).toBe(0)
    world.addComponent(entity, 'collectible', { value: 2 })
    expect([...collectibles].length).toBe(1)
    world.removeComponent(entity, 'collectible')
    expect([...collectibles].length).toBe(0)
  })
})

describe('createTransform', () => {
  it('defaults to origin/identity with prev matching current', () => {
    const t = createTransform()
    expect(t.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(t.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    expect(t.prevPosition).toEqual(t.position)
    expect(t.prevPosition).not.toBe(t.position) // independent objects
    expect(t.prevRotation).toEqual(t.rotation)
  })

  it('accepts initial position and rotation', () => {
    const t = createTransform({ x: 1, y: 2, z: 3 })
    expect(t.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(t.prevPosition).toEqual({ x: 1, y: 2, z: 3 })
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/ecs/world.test.ts`
Expected: FAIL — cannot resolve `../../src/ecs/world`.

- [x] **Step 4: Implement**

`packages/engine/src/ecs/world.ts`:
```ts
import { World } from 'miniplex'

/** Engine-wrapped world factory; games never import miniplex directly. */
export function createWorld<E extends object>(): World<E> {
  return new World<E>()
}

export type { World }
```

`packages/engine/src/ecs/components.ts`:
```ts
import { vec3, type Vec3 } from '../math/vec3'
import { quat, type Quat } from '../math/quat'
import type { RigidBodyDef } from '../physics/types'
import type { RenderableDef } from '../render/types'

export interface Transform {
  position: Vec3
  rotation: Quat
  prevPosition: Vec3
  prevRotation: Quat
}

export function createTransform(
  position: Vec3 = vec3.create(),
  rotation: Quat = quat.identity()
): Transform {
  return {
    position: vec3.clone(position),
    rotation: { ...rotation },
    prevPosition: vec3.clone(position),
    prevRotation: { ...rotation }
  }
}

/** Base entity: engine mechanism components. Games extend with meaning. */
export interface EngineEntity {
  transform?: Transform
  rigidBody?: RigidBodyDef
  renderable?: RenderableDef
  lifetime?: { remainingS: number }
}
```

`packages/engine/src/physics/types.ts` (types only for now; the adapter comes in M5):
```ts
import type { Vec3 } from '../math/vec3'
import type { Quat } from '../math/quat'

export type BodyKind = 'dynamic' | 'kinematic' | 'fixed'

export type ShapeDef =
  | { type: 'sphere'; radius: number }
  | { type: 'box'; halfExtents: Vec3 }
  | { type: 'cylinder'; halfHeight: number; radius: number }

export interface RigidBodyDef {
  kind: BodyKind
  shape: ShapeDef
  friction?: number
  restitution?: number
  sensor?: boolean
}

export interface Pose { position: Vec3; rotation: Quat }
```

`packages/engine/src/render/types.ts` (types only for now; the adapter comes in M6):
```ts
import type { Vec3 } from '../math/vec3'

export type RenderableDef =
  | { primitive: 'box'; size: Vec3; color: string }
  | { primitive: 'sphere'; radius: number; color: string }
  | { primitive: 'cylinder'; radius: number; height: number; color: string }
```

Add to barrel:
```ts
export * from './ecs/world'
export * from './ecs/components'
export * from './physics/types'
export * from './render/types'
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/ecs/world.test.ts`
Expected: PASS (4 tests).

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): miniplex-wrapped world, Transform, engine entity type"
```

### Task 17: EventQueue

**Files:**
- Create: `packages/engine/src/ecs/events.ts`
- Test: `packages/engine/tests/ecs/events.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/ecs/events.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EventQueue } from '../../src/ecs/events'

describe('EventQueue', () => {
  it('returns emitted events filtered by type', () => {
    const queue = new EventQueue()
    const a = { id: 'a' }, b = { id: 'b' }
    queue.emit({ type: 'sensorEnter', a, b })
    queue.emit({ type: 'contactStart', a, b })
    queue.emit({ type: 'sensorEnter', a: b, b: a })

    const sensors = queue.read('sensorEnter')
    expect(sensors).toHaveLength(2)
    expect(sensors[0]).toMatchObject({ a, b })
  })

  it('returns [] when no events of that type exist', () => {
    expect(new EventQueue().read('contactStart')).toEqual([])
  })

  it('clear() empties the queue (called at frame end)', () => {
    const queue = new EventQueue()
    queue.emit({ type: 'custom' })
    queue.clear()
    expect(queue.read('custom')).toEqual([])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/ecs/events.test.ts`
Expected: FAIL — cannot resolve `../../src/ecs/events`.

- [x] **Step 3: Implement**

`packages/engine/src/ecs/events.ts`:
```ts
export interface EngineEvent { type: string; [key: string]: unknown }

export class EventQueue {
  private events: EngineEvent[] = []

  emit(event: EngineEvent): void {
    this.events.push(event)
  }

  read<T extends EngineEvent = EngineEvent>(type: string): T[] {
    return this.events.filter((event) => event.type === type) as T[]
  }

  clear(): void {
    this.events.length = 0
  }
}
```

Add to barrel:
```ts
export * from './ecs/events'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/ecs/events.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): per-frame event queue"
```

### Task 18: System scheduler with stages

**Files:**
- Create: `packages/engine/src/ecs/scheduler.ts`
- Test: `packages/engine/tests/ecs/scheduler.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/ecs/scheduler.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Scheduler, FIXED_STAGES, type System } from '../../src/ecs/scheduler'

type Ctx = { log: string[] }
const system = (name: string, stage: System<Ctx>['stage']): System<Ctx> =>
  ({ name, stage, run: (ctx) => ctx.log.push(name) })

describe('Scheduler', () => {
  it('runFixed runs input → update → physics → postPhysics, insertion order within a stage', () => {
    const scheduler = new Scheduler<Ctx>()
    scheduler.add(system('sync', 'postPhysics'))
    scheduler.add(system('tilt', 'update'))
    scheduler.add(system('step', 'physics'))
    scheduler.add(system('poll', 'input'))
    scheduler.add(system('platforms', 'update'))

    const ctx = { log: [] as string[] }
    scheduler.runFixed(ctx)
    expect(ctx.log).toEqual(['poll', 'tilt', 'platforms', 'step', 'sync'])
  })

  it('render stage only runs via runStage("render")', () => {
    const scheduler = new Scheduler<Ctx>()
    scheduler.add(system('draw', 'render'))
    scheduler.add(system('tilt', 'update'))

    const ctx = { log: [] as string[] }
    scheduler.runFixed(ctx)
    expect(ctx.log).toEqual(['tilt'])
    scheduler.runStage('render', ctx)
    expect(ctx.log).toEqual(['tilt', 'draw'])
  })

  it('rejects duplicate system names', () => {
    const scheduler = new Scheduler<Ctx>()
    scheduler.add(system('tilt', 'update'))
    expect(() => scheduler.add(system('tilt', 'input'))).toThrow(/tilt/)
  })

  it('exposes the fixed stage list for reference', () => {
    expect(FIXED_STAGES).toEqual(['input', 'update', 'physics', 'postPhysics'])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/ecs/scheduler.test.ts`
Expected: FAIL — cannot resolve `../../src/ecs/scheduler`.

- [x] **Step 3: Implement**

`packages/engine/src/ecs/scheduler.ts`:
```ts
export const FIXED_STAGES = ['input', 'update', 'physics', 'postPhysics'] as const
export const ALL_STAGES = [...FIXED_STAGES, 'render'] as const
export type Stage = (typeof ALL_STAGES)[number]

export interface System<Ctx> {
  name: string
  stage: Stage
  run(ctx: Ctx): void
}

export class Scheduler<Ctx> {
  private stages = new Map<Stage, System<Ctx>[]>(ALL_STAGES.map((stage) => [stage, []]))
  private names = new Set<string>()

  add(system: System<Ctx>): void {
    if (this.names.has(system.name)) {
      throw new Error(`Duplicate system name "${system.name}"`)
    }
    this.names.add(system.name)
    this.stages.get(system.stage)!.push(system)
  }

  runStage(stage: Stage, ctx: Ctx): void {
    for (const system of this.stages.get(stage)!) system.run(ctx)
  }

  /** Runs all non-render stages in order — call once per fixed update. */
  runFixed(ctx: Ctx): void {
    for (const stage of FIXED_STAGES) this.runStage(stage, ctx)
  }
}
```

Add to barrel:
```ts
export * from './ecs/scheduler'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/ecs/scheduler.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): staged system scheduler; M3 complete"
```

---

## Milestone M4 — Game loop + input

### Task 19: GameLoop (fixed timestep + accumulator)

**Files:**
- Create: `packages/engine/src/loop/gameLoop.ts`
- Test: `packages/engine/tests/loop/gameLoop.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/loop/gameLoop.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { GameLoop } from '../../src/loop/gameLoop'

describe('GameLoop', () => {
  it('first tick establishes the baseline without fixed updates', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render })
    loop.tick(1000)
    expect(fixedUpdate).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalledWith(0)
  })

  it('runs fixedUpdate once per fixedDt of elapsed time', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 1 / 60 })
    loop.tick(1000)
    loop.tick(1000 + (1000 / 60) * 3)   // exactly 3 fixed steps later
    expect(fixedUpdate).toHaveBeenCalledTimes(3)
    expect(fixedUpdate).toHaveBeenCalledWith(1 / 60)
  })

  it('passes the interpolation alpha (accumulator remainder) to render', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01 })
    loop.tick(0)
    loop.tick(15) // 0.015s → 1 step + 0.005 remainder → alpha 0.5
    expect(fixedUpdate).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenLastCalledWith(expect.closeTo(0.5)) // float-safe
  })

  it('clamps huge frame gaps to maxSubSteps (no spiral of death)', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01, maxSubSteps: 5 })
    loop.tick(0)
    loop.tick(10_000) // ten seconds late (tab was hidden)
    expect(fixedUpdate).toHaveBeenCalledTimes(5)
  })

  it('accumulates fractional steps across ticks', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01 })
    loop.tick(0)
    loop.tick(6)  // 0.006 < dt → no step
    expect(fixedUpdate).toHaveBeenCalledTimes(0)
    loop.tick(12) // total 0.012 → one step
    expect(fixedUpdate).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/loop/gameLoop.test.ts`
Expected: FAIL — cannot resolve `../../src/loop/gameLoop`.

- [x] **Step 3: Implement**

`packages/engine/src/loop/gameLoop.ts`:
```ts
export interface LoopHooks {
  fixedUpdate(dt: number): void
  render(alpha: number): void
}

export interface LoopOptions {
  fixedDt?: number      // seconds, default 1/60
  maxSubSteps?: number  // default 5
}

export class GameLoop {
  private readonly fixedDt: number
  private readonly maxSubSteps: number
  private lastMs: number | null = null
  private accumulator = 0

  constructor(private hooks: LoopHooks, options: LoopOptions = {}) {
    this.fixedDt = options.fixedDt ?? 1 / 60
    this.maxSubSteps = options.maxSubSteps ?? 5
  }

  tick(nowMs: number): void {
    if (this.lastMs !== null) {
      const elapsed = Math.max(0, (nowMs - this.lastMs) / 1000)
      this.accumulator = Math.min(
        this.accumulator + elapsed,
        this.fixedDt * this.maxSubSteps
      )
      while (this.accumulator >= this.fixedDt - 1e-9) {
        this.hooks.fixedUpdate(this.fixedDt)
        this.accumulator = Math.max(0, this.accumulator - this.fixedDt)
      }
    }
    this.lastMs = nowMs
    this.hooks.render(this.accumulator / this.fixedDt)
  }
}
```

(The `1e-9` epsilon absorbs float error so "exactly 3 steps of 1000/60 ms"
runs 3 updates, not 2.)

Add to barrel:
```ts
export * from './loop/gameLoop'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/loop/gameLoop.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): fixed-timestep game loop with interpolation alpha"
```

### Task 20: Input merging

**Files:**
- Create: `packages/engine/src/input/types.ts`, `packages/engine/src/input/merge.ts`
- Test: `packages/engine/tests/input/merge.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/input/merge.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mergeInputs } from '../../src/input/merge'
import type { InputSource } from '../../src/input/types'

const source = (x: number, y: number): InputSource =>
  ({ read: () => ({ x, y }), dispose: () => {} })

describe('mergeInputs', () => {
  it('returns zero vector for no sources', () => {
    expect(mergeInputs([])).toEqual({ x: 0, y: 0 })
  })

  it('sums sources', () => {
    expect(mergeInputs([source(0.5, 0), source(0, -0.25)])).toEqual({ x: 0.5, y: -0.25 })
  })

  it('clamps the merged magnitude to 1', () => {
    const merged = mergeInputs([source(1, 0), source(1, 0)])
    expect(merged.x).toBeCloseTo(1)
    expect(merged.y).toBeCloseTo(0)
    const diagonal = mergeInputs([source(1, 1)])
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/input/merge.test.ts`
Expected: FAIL — cannot resolve modules.

- [x] **Step 3: Implement**

`packages/engine/src/input/types.ts`:
```ts
/** A 2D control vector; |v| ≤ 1. x = right, y = forward. */
export interface InputVector { x: number; y: number }

export interface InputSource {
  read(): InputVector
  dispose(): void
}
```

`packages/engine/src/input/merge.ts`:
```ts
import type { InputSource, InputVector } from './types'

export function mergeInputs(sources: InputSource[]): InputVector {
  let x = 0, y = 0
  for (const source of sources) {
    const v = source.read()
    x += v.x
    y += v.y
  }
  const len = Math.hypot(x, y)
  if (len > 1) { x /= len; y /= len }
  return { x, y }
}
```

Add to barrel:
```ts
export * from './input/types'
export * from './input/merge'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/input/merge.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): input source contract and clamped merging"
```

### Task 21: Keyboard input source

**Files:**
- Create: `packages/engine/src/input/keyboard.ts`
- Test: `packages/engine/tests/input/keyboard.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/input/keyboard.test.ts`:
```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createKeyboardInput } from '../../src/input/keyboard'

const press = (code: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
const release = (code: string) =>
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))

describe('createKeyboardInput', () => {
  it('reads zero with nothing pressed', () => {
    const input = createKeyboardInput(window)
    expect(input.read()).toEqual({ x: 0, y: 0 })
    input.dispose()
  })

  it('maps WASD and arrows to axes (y forward = W/Up)', () => {
    const input = createKeyboardInput(window)
    press('KeyW')
    expect(input.read()).toEqual({ x: 0, y: 1 })
    release('KeyW')
    press('ArrowDown'); press('KeyD')
    const v = input.read()
    expect(v.x).toBeCloseTo(Math.SQRT1_2)  // diagonal normalized
    expect(v.y).toBeCloseTo(-Math.SQRT1_2)
    input.dispose()
  })

  it('opposing keys cancel out', () => {
    const input = createKeyboardInput(window)
    press('KeyA'); press('KeyD')
    expect(input.read()).toEqual({ x: 0, y: 0 })
    input.dispose()
  })

  it('dispose removes listeners', () => {
    const input = createKeyboardInput(window)
    input.dispose()
    press('KeyW')
    expect(input.read()).toEqual({ x: 0, y: 0 })
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/input/keyboard.test.ts`
Expected: FAIL — cannot resolve `../../src/input/keyboard`.

- [x] **Step 3: Implement**

`packages/engine/src/input/keyboard.ts`:
```ts
import type { InputSource, InputVector } from './types'

const AXES: Record<string, InputVector> = {
  KeyW: { x: 0, y: 1 }, ArrowUp: { x: 0, y: 1 },
  KeyS: { x: 0, y: -1 }, ArrowDown: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 }
}

export function createKeyboardInput(target: EventTarget): InputSource {
  const pressed = new Set<string>()
  const onDown = (event: Event): void => {
    const code = (event as KeyboardEvent).code
    if (code in AXES) pressed.add(code)
  }
  const onUp = (event: Event): void => {
    pressed.delete((event as KeyboardEvent).code)
  }
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)

  return {
    read() {
      let x = 0, y = 0
      for (const code of pressed) {
        const axis = AXES[code]!
        x += axis.x
        y += axis.y
      }
      const len = Math.hypot(x, y)
      return len > 1 ? { x: x / len, y: y / len } : { x, y }
    },
    dispose() {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      pressed.clear()
    }
  }
}
```

Add to barrel:
```ts
export * from './input/keyboard'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/input/keyboard.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): keyboard input source (WASD + arrows)"
```

### Task 22: Virtual joystick input source

**Files:**
- Create: `packages/engine/src/input/joystick.ts`
- Test: `packages/engine/tests/input/joystick.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/input/joystick.test.ts`:
```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createVirtualJoystick } from '../../src/input/joystick'

// happy-dom has no layout: give the 100×100 base a known rect, center (50,50).
function makeBase(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return el
}

const pointer = (el: HTMLElement, type: string, clientX: number, clientY: number) =>
  el.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }))

describe('createVirtualJoystick', () => {
  let base: HTMLElement
  beforeEach(() => { document.body.innerHTML = ''; base = makeBase() })

  it('reads zero before any touch', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50 })
    expect(joystick.read()).toEqual({ x: 0, y: 0 })
    joystick.dispose()
  })

  it('maps drag offset to a vector (up = +y), scaled by radius', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 75, 25)  // +25 right, 25 up
    const v = joystick.read()
    expect(v.x).toBeCloseTo(0.5)
    expect(v.y).toBeCloseTo(0.5)
    joystick.dispose()
  })

  it('clamps to the radius', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 250, 50)
    expect(joystick.read()).toEqual({ x: 1, y: -0 })
    joystick.dispose()
  })

  it('applies the dead zone', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0.3 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 55, 50)  // 10% deflection < 30%
    expect(joystick.read()).toEqual({ x: 0, y: 0 })
    joystick.dispose()
  })

  it('resets to zero on pointerup and positions the nub', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 75, 50)
    expect(joystick.nub.style.transform).toBe('translate(25px, 0px)')
    pointer(base, 'pointerup', 75, 50)
    expect(joystick.read()).toEqual({ x: 0, y: 0 })
    expect(joystick.nub.style.transform).toBe('translate(0px, 0px)')
    joystick.dispose()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/input/joystick.test.ts`
Expected: FAIL — cannot resolve `../../src/input/joystick`.

- [x] **Step 3: Implement**

`packages/engine/src/input/joystick.ts`:
```ts
import type { InputSource, InputVector } from './types'

export interface JoystickOptions {
  radiusPx?: number   // default 50
  deadZone?: number   // 0..1 fraction of radius, default 0.15
}

export interface VirtualJoystick extends InputSource {
  nub: HTMLElement
}

export function createVirtualJoystick(
  base: HTMLElement,
  options: JoystickOptions = {}
): VirtualJoystick {
  const radius = options.radiusPx ?? 50
  const deadZone = options.deadZone ?? 0.15

  const nub = document.createElement('div')
  nub.className = 'joystick-nub'
  nub.style.transform = 'translate(0px, 0px)'
  base.appendChild(nub)

  let active = false
  let value: InputVector = { x: 0, y: 0 }

  const center = (): { x: number; y: number } => {
    const rect = base.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const update = (clientX: number, clientY: number): void => {
    const c = center()
    let dx = (clientX - c.x) / radius
    let dy = (clientY - c.y) / radius
    const len = Math.hypot(dx, dy)
    if (len > 1) { dx /= len; dy /= len }
    nub.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`
    // screen-down is positive clientY; forward is up → negate y
    value = len < deadZone ? { x: 0, y: 0 } : { x: dx, y: -dy }
  }

  const reset = (): void => {
    active = false
    value = { x: 0, y: 0 }
    nub.style.transform = 'translate(0px, 0px)'
  }

  const onDown = (event: Event): void => {
    active = true
    const e = event as PointerEvent
    update(e.clientX, e.clientY)
  }
  const onMove = (event: Event): void => {
    if (!active) return
    const e = event as PointerEvent
    update(e.clientX, e.clientY)
  }
  const onUp = (): void => reset()

  base.addEventListener('pointerdown', onDown)
  base.addEventListener('pointermove', onMove)
  base.addEventListener('pointerup', onUp)
  base.addEventListener('pointercancel', onUp)

  return {
    nub,
    read: () => value,
    dispose() {
      base.removeEventListener('pointerdown', onDown)
      base.removeEventListener('pointermove', onMove)
      base.removeEventListener('pointerup', onUp)
      base.removeEventListener('pointercancel', onUp)
      nub.remove()
    }
  }
}
```

Add to barrel:
```ts
export * from './input/joystick'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/input/joystick.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): virtual joystick input source"
```

### Task 23: Browser loop driver (shim) 

**Files:**
- Create: `packages/engine/src/loop/browser.ts`

This is a declared **untested shim** (excluded from coverage via the root
config's `**/browser.ts` exclude). Keep it under ~30 lines; any logic beyond
glue belongs in `GameLoop` where it is tested.

- [x] **Step 1: Implement**

`packages/engine/src/loop/browser.ts`:
```ts
import type { GameLoop } from './gameLoop'

export interface LoopDriver { stop(): void }

/** rAF glue + auto-pause hook. Untested shim — keep trivially thin. */
export function startLoopDriver(
  loop: GameLoop,
  onHidden?: () => void
): LoopDriver {
  let running = true
  const frame = (now: number): void => {
    if (!running) return
    loop.tick(now)
    requestAnimationFrame(frame)
  }
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') onHidden?.()
  }
  document.addEventListener('visibilitychange', onVisibility)
  requestAnimationFrame(frame)
  return {
    stop() {
      running = false
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}
```

Add to barrel:
```ts
export * from './loop/browser'
```

- [x] **Step 2: Verify lint, typecheck, and full suite**

Run: `npm run ci`
Expected: all green (shim has no tests by design — it is on the exclusion list
in the plan header and root coverage config).

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(engine): browser rAF loop driver shim; M4 complete"
```

---

## Milestone M5 — Physics port + Rapier adapter

Rapier note: `@dimforge/rapier3d-compat` embeds its WASM and initializes via
`await RAPIER.init()` — this works in Node, so **all physics tests below are
real integration tests** run by Vitest. Create the shared test helper first.

### Task 24: PhysicsPort + Rapier adapter (bodies, poses, lifecycle)

**Files:**
- Create: `packages/engine/src/physics/port.ts`, `packages/engine/src/physics/rapier.ts`
- Test: `packages/engine/tests/physics/rapier-bodies.test.ts`

- [x] **Step 1: Install rapier (engine workspace)**

Run: `npm install @dimforge/rapier3d-compat -w @automata/engine`
Expected: added to engine dependencies.

- [x] **Step 2: Define the port (interface-first)**

`packages/engine/src/physics/port.ts`:
```ts
import type { Vec3 } from '../math/vec3'
import type { Pose, RigidBodyDef } from './types'

export interface PhysicsEvent {
  kind: 'contact' | 'sensor'
  started: boolean
  a: object
  b: object
}

export interface PhysicsPort {
  addBody(entity: object, def: RigidBodyDef, pose: Pose): void
  removeBody(entity: object): void
  setGravity(gravity: Vec3): void
  step(dt: number): PhysicsEvent[]
  readPose(entity: object): Pose | null
  readLinearVelocity(entity: object): Vec3
  applyImpulse(entity: object, impulse: Vec3): void
  setKinematicTarget(entity: object, position: Vec3): void
  readonly bodyCount: number
  dispose(): void
}
```

Add to barrel:
```ts
export * from './physics/port'
```

- [x] **Step 3: Write the failing tests**

`packages/engine/tests/physics/rapier-bodies.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import { quat } from '../../src/math/quat'

const STEPS_PER_SECOND = 60
const DT = 1 / STEPS_PER_SECOND
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

describe('createRapierPhysics', () => {
  it('tracks bodies and disposes cleanly', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 5, 0))
    expect(physics.bodyCount).toBe(1)
    physics.removeBody(ball)
    expect(physics.bodyCount).toBe(0)
    expect(physics.readPose(ball)).toBeNull()
    physics.dispose()
  })

  it('a dynamic ball free-falls under default gravity', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 10, 0))
    for (let i = 0; i < STEPS_PER_SECOND; i++) physics.step(DT)
    const pose = physics.readPose(ball)!
    // ~½gt² ≈ 4.9m fallen after 1s (integration tolerance is generous)
    expect(pose.position.y).toBeLessThan(10 - 3)
    expect(pose.position.y).toBeGreaterThan(10 - 7)
    physics.dispose()
  })

  it('a fixed box floor stops the falling ball', async () => {
    const physics = await createRapierPhysics()
    const floor = { name: 'floor' }, ball = { name: 'ball' }
    physics.addBody(floor, {
      kind: 'fixed',
      shape: { type: 'box', halfExtents: { x: 10, y: 0.25, z: 10 } }
    }, at(0, -0.25, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 3, 0))
    for (let i = 0; i < STEPS_PER_SECOND * 2; i++) physics.step(DT)
    const pose = physics.readPose(ball)!
    expect(pose.position.y).toBeCloseTo(0.5, 1) // resting on the floor surface
    physics.dispose()
  })

  it('readLinearVelocity reports a falling ball moving down', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 10, 0))
    for (let i = 0; i < 10; i++) physics.step(DT)
    expect(physics.readLinearVelocity(ball).y).toBeLessThan(-0.5)
    physics.dispose()
  })
})
```

- [x] **Step 4: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/physics/rapier-bodies.test.ts`
Expected: FAIL — cannot resolve `../../src/physics/rapier`.

- [x] **Step 5: Implement the adapter**

`packages/engine/src/physics/rapier.ts`:
```ts
import RAPIER from '@dimforge/rapier3d-compat'
import type { Vec3 } from '../math/vec3'
import type { Pose, RigidBodyDef, ShapeDef } from './types'
import type { PhysicsEvent, PhysicsPort } from './port'

let rapierReady: Promise<void> | null = null
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init() as unknown as Promise<void>
  return rapierReady
}

function colliderDescFor(shape: ShapeDef): RAPIER.ColliderDesc {
  switch (shape.type) {
    case 'sphere': return RAPIER.ColliderDesc.ball(shape.radius)
    case 'box': return RAPIER.ColliderDesc.cuboid(
      shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
    case 'cylinder': return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius)
  }
}

function bodyDescFor(def: RigidBodyDef): RAPIER.RigidBodyDesc {
  switch (def.kind) {
    case 'dynamic': return RAPIER.RigidBodyDesc.dynamic()
    case 'kinematic': return RAPIER.RigidBodyDesc.kinematicPositionBased()
    case 'fixed': return RAPIER.RigidBodyDesc.fixed()
  }
}

export async function createRapierPhysics(
  gravity: Vec3 = { x: 0, y: -9.81, z: 0 }
): Promise<PhysicsPort> {
  await initRapier()
  const world = new RAPIER.World(gravity)
  const eventQueue = new RAPIER.EventQueue(true)
  const bodies = new Map<object, RAPIER.RigidBody>()
  const entityByColliderHandle = new Map<number, object>()

  return {
    get bodyCount() { return bodies.size },

    addBody(entity, def, pose) {
      if (bodies.has(entity)) return // idempotent guard (see registerPhysicsBodies)
      const body = world.createRigidBody(
        bodyDescFor(def)
          .setTranslation(pose.position.x, pose.position.y, pose.position.z)
          .setRotation(pose.rotation)
      )
      const colliderDesc = colliderDescFor(def.shape)
        .setSensor(def.sensor ?? false)
        .setFriction(def.friction ?? 0.5)
        .setRestitution(def.restitution ?? 0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      const collider = world.createCollider(colliderDesc, body)
      bodies.set(entity, body)
      entityByColliderHandle.set(collider.handle, entity)
    },

    removeBody(entity) {
      const body = bodies.get(entity)
      if (!body) return
      for (let i = 0; i < body.numColliders(); i++) {
        entityByColliderHandle.delete(body.collider(i).handle)
      }
      world.removeRigidBody(body)
      bodies.delete(entity)
    },

    setGravity(g) {
      world.gravity.x = g.x; world.gravity.y = g.y; world.gravity.z = g.z
    },

    step(dt): PhysicsEvent[] {
      world.timestep = dt
      world.step(eventQueue)
      const events: PhysicsEvent[] = []
      eventQueue.drainCollisionEvents((handleA, handleB, started) => {
        const a = entityByColliderHandle.get(handleA)
        const b = entityByColliderHandle.get(handleB)
        if (!a || !b) return
        const colliderA = world.getCollider(handleA)
        const colliderB = world.getCollider(handleB)
        const sensor = (colliderA?.isSensor() ?? false) || (colliderB?.isSensor() ?? false)
        events.push({ kind: sensor ? 'sensor' : 'contact', started, a, b })
      })
      return events
    },

    readPose(entity): Pose | null {
      const body = bodies.get(entity)
      if (!body) return null
      const t = body.translation(), r = body.rotation()
      return { position: { x: t.x, y: t.y, z: t.z }, rotation: { x: r.x, y: r.y, z: r.z, w: r.w } }
    },

    readLinearVelocity(entity) {
      const body = bodies.get(entity)
      if (!body) return { x: 0, y: 0, z: 0 }
      const v = body.linvel()
      return { x: v.x, y: v.y, z: v.z }
    },

    applyImpulse(entity, impulse) {
      bodies.get(entity)?.applyImpulse(impulse, true)
    },

    setKinematicTarget(entity, position) {
      bodies.get(entity)?.setNextKinematicTranslation(position)
    },

    dispose() {
      bodies.clear()
      entityByColliderHandle.clear()
      world.free()
      eventQueue.free()
    }
  }
}
```

Note: the spec sketch said "adapter stores its handle on the entity"; the
adapter instead keys bodies by entity reference in internal Maps — functionally
identical, keeps components JSON-serializable, and nothing leaks into entities.

Add to barrel:
```ts
export * from './physics/rapier'
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/physics/rapier-bodies.test.ts`
Expected: PASS (4 tests; first run pays ~1s WASM init).

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): PhysicsPort with real Rapier adapter (bodies, poses)"
```

### Task 25: Gravity rotation + impulses (the Monkey Ball mechanic)

**Files:**
- Test: `packages/engine/tests/physics/rapier-forces.test.ts`

The adapter already implements `setGravity`/`applyImpulse`; these integration
tests pin down the *behavior the whole game depends on*. Expect them to pass
immediately — they are characterization tests guarding the core mechanic. If
any fails, the adapter (not the test) is wrong.

- [x] **Step 1: Write the tests**

`packages/engine/tests/physics/rapier-forces.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import { quat } from '../../src/math/quat'

const DT = 1 / 60
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

async function ballOnFloor() {
  const physics = await createRapierPhysics()
  const floor = { name: 'floor' }, ball = { name: 'ball' }
  physics.addBody(floor, {
    kind: 'fixed', shape: { type: 'box', halfExtents: { x: 50, y: 0.25, z: 50 } }, friction: 0.6
  }, at(0, -0.25, 0))
  physics.addBody(ball, {
    kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 }, friction: 0.6
  }, at(0, 0.5, 0))
  for (let i = 0; i < 30; i++) physics.step(DT) // settle
  return { physics, ball }
}

describe('the tilt mechanic: rotated gravity', () => {
  it('ball at rest stays at rest under straight-down gravity', async () => {
    const { physics, ball } = await ballOnFloor()
    const before = physics.readPose(ball)!.position
    for (let i = 0; i < 60; i++) physics.step(DT)
    const after = physics.readPose(ball)!.position
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.01)
    expect(Math.abs(after.z - before.z)).toBeLessThan(0.01)
    physics.dispose()
  })

  it('tilting gravity makes the ball roll toward the tilt', async () => {
    const { physics, ball } = await ballOnFloor()
    // 12° tilt toward +x: rotate the down vector about the z axis
    const tilt = quat.fromEuler(0, 0, -12 * Math.PI / 180)
    physics.setGravity(quat.apply(tilt, { x: 0, y: -9.81, z: 0 }))
    for (let i = 0; i < 60; i++) physics.step(DT)
    const pose = physics.readPose(ball)!
    expect(pose.position.x).toBeGreaterThan(0.2)      // rolled toward +x
    expect(physics.readLinearVelocity(ball).x).toBeGreaterThan(0.1)
    physics.dispose()
  })

  it('applyImpulse kicks the ball laterally', async () => {
    const { physics, ball } = await ballOnFloor()
    physics.applyImpulse(ball, { x: 0, y: 0, z: -2 })
    for (let i = 0; i < 10; i++) physics.step(DT)
    expect(physics.readPose(ball)!.position.z).toBeLessThan(-0.05)
    physics.dispose()
  })

  it('ball rolls off the edge of a floor and keeps falling', async () => {
    const physics = await createRapierPhysics()
    const floor = { name: 'floor' }, ball = { name: 'ball' }
    physics.addBody(floor, {
      kind: 'fixed', shape: { type: 'box', halfExtents: { x: 2, y: 0.25, z: 2 } }
    }, at(0, -0.25, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(1.2, 0.5, 0))
    const tilt = quat.fromEuler(0, 0, -15 * Math.PI / 180)
    physics.setGravity(quat.apply(tilt, { x: 0, y: -9.81, z: 0 }))
    let fellBelow = false
    for (let i = 0; i < 60 * 4 && !fellBelow; i++) {
      physics.step(DT)
      if (physics.readPose(ball)!.position.y < -2) fellBelow = true
    }
    expect(fellBelow).toBe(true) // fall-off detection in the game keys off y
    physics.dispose()
  })
})
```

- [x] **Step 2: Run the tests**

Run: `npx vitest run packages/engine/tests/physics/rapier-forces.test.ts`
Expected: PASS (4 tests). If a threshold is flaky across runs, widen the
assertion bound — never loosen the *direction* of the assertion.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "test(engine): characterize rotated-gravity tilt mechanic and impulses"
```

### Task 26: Collision + sensor events map to entities

**Files:**
- Test: `packages/engine/tests/physics/rapier-events.test.ts`

- [x] **Step 1: Write the tests**

`packages/engine/tests/physics/rapier-events.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import type { PhysicsEvent } from '../../src/physics/port'
import { quat } from '../../src/math/quat'

const DT = 1 / 60
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

function runUntil(
  physics: { step(dt: number): PhysicsEvent[] },
  predicate: (event: PhysicsEvent) => boolean,
  maxSteps = 240
): PhysicsEvent | null {
  for (let i = 0; i < maxSteps; i++) {
    const hit = physics.step(DT).find(predicate)
    if (hit) return hit
  }
  return null
}

describe('physics events', () => {
  it('emits a started contact with the entity references when a ball lands', async () => {
    const physics = await createRapierPhysics()
    const floor = { name: 'floor' }, ball = { name: 'ball' }
    physics.addBody(floor, {
      kind: 'fixed', shape: { type: 'box', halfExtents: { x: 5, y: 0.25, z: 5 } }
    }, at(0, -0.25, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 2, 0))

    const contact = runUntil(physics, (e) => e.kind === 'contact' && e.started)
    expect(contact).not.toBeNull()
    expect([contact!.a, contact!.b]).toContain(ball)
    expect([contact!.a, contact!.b]).toContain(floor)
    physics.dispose()
  })

  it('emits sensor events when a ball passes through a sensor (banana/goal pattern)', async () => {
    const physics = await createRapierPhysics()
    const sensor = { name: 'banana' }, ball = { name: 'ball' }
    physics.addBody(sensor, {
      kind: 'fixed', shape: { type: 'sphere', radius: 0.6 }, sensor: true
    }, at(0, 0.5, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 4, 0))

    const enter = runUntil(physics, (e) => e.kind === 'sensor' && e.started)
    expect(enter).not.toBeNull()
    expect([enter!.a, enter!.b]).toContain(sensor)
    expect([enter!.a, enter!.b]).toContain(ball)
    physics.dispose()
  })
})
```

- [x] **Step 2: Run the tests**

Run: `npx vitest run packages/engine/tests/physics/rapier-events.test.ts`
Expected: PASS (2 tests). These exercise the event-mapping code written in
Task 24; if they fail, debug the adapter's `drainCollisionEvents` mapping.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "test(engine): physics contact/sensor events map to entity refs"
```

### Task 27: Kinematic platforms carry the ball

**Files:**
- Test: `packages/engine/tests/physics/rapier-kinematic.test.ts`

- [x] **Step 1: Write the tests**

`packages/engine/tests/physics/rapier-kinematic.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import { quat } from '../../src/math/quat'

const DT = 1 / 60
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

describe('kinematic platform', () => {
  it('moves to its kinematic target', async () => {
    const physics = await createRapierPhysics()
    const platform = { name: 'platform' }
    physics.addBody(platform, {
      kind: 'kinematic', shape: { type: 'box', halfExtents: { x: 2, y: 0.25, z: 2 } }
    }, at(0, 0, 0))
    physics.setKinematicTarget(platform, { x: 1, y: 0, z: 0 })
    physics.step(DT)
    expect(physics.readPose(platform)!.position.x).toBeCloseTo(1, 3)
    physics.dispose()
  })

  it('carries a resting ball along (friction)', async () => {
    const physics = await createRapierPhysics()
    const platform = { name: 'platform' }, ball = { name: 'ball' }
    physics.addBody(platform, {
      kind: 'kinematic', shape: { type: 'box', halfExtents: { x: 3, y: 0.25, z: 3 } }, friction: 1.0
    }, at(0, 0, 0))
    physics.addBody(ball, {
      kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 }, friction: 1.0
    }, at(0, 0.75, 0))
    for (let i = 0; i < 30; i++) physics.step(DT) // settle on platform

    // glide platform +x at 0.6 m/s for 2 seconds
    let px = 0
    for (let i = 0; i < 120; i++) {
      px += 0.6 * DT
      physics.setKinematicTarget(platform, { x: px, y: 0, z: 0 })
      physics.step(DT)
    }
    const ballX = physics.readPose(ball)!.position.x
    // Ball should be dragged along meaningfully (rolling resistance means
    // it will lag the platform; direction is what matters).
    expect(ballX).toBeGreaterThan(0.15)
    physics.dispose()
  })
})
```

- [x] **Step 2: Run the tests**

Run: `npx vitest run packages/engine/tests/physics/rapier-kinematic.test.ts`
Expected: PASS (2 tests). This is the spec's named risk "kinematic platform
friction quirks" — if the carry test shows the ball not moving at all, check
that the platform body is `kinematicPositionBased` and targets are set *before*
each step (order matters).

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "test(engine): kinematic platforms move and carry the ball"
```

### Task 28: ECS↔physics wiring (auto-register, step system, sync system)

**Files:**
- Create: `packages/engine/src/physics/systems.ts`
- Test: `packages/engine/tests/physics/systems.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/physics/systems.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createWorld } from '../../src/ecs/world'
import { createTransform, type EngineEntity } from '../../src/ecs/components'
import { EventQueue } from '../../src/ecs/events'
import {
  registerPhysicsBodies, physicsStepSystem, physicsSyncSystem
} from '../../src/physics/systems'
import type { PhysicsEvent, PhysicsPort } from '../../src/physics/port'

function fakePort(overrides: Partial<PhysicsPort> = {}): PhysicsPort {
  return {
    addBody: vi.fn(), removeBody: vi.fn(), setGravity: vi.fn(),
    step: vi.fn(() => [] as PhysicsEvent[]),
    readPose: vi.fn(() => null), readLinearVelocity: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    applyImpulse: vi.fn(), setKinematicTarget: vi.fn(),
    bodyCount: 0, dispose: vi.fn(),
    ...overrides
  }
}

const ballDef = { kind: 'dynamic' as const, shape: { type: 'sphere' as const, radius: 0.5 } }

describe('registerPhysicsBodies', () => {
  it('adds bodies for existing and future entities with rigidBody+transform', () => {
    const world = createWorld<EngineEntity>()
    const port = fakePort()
    const existing = world.add({ transform: createTransform({ x: 1, y: 2, z: 3 }), rigidBody: ballDef })
    registerPhysicsBodies(world, port)
    expect(port.addBody).toHaveBeenCalledWith(existing, ballDef,
      expect.objectContaining({ position: { x: 1, y: 2, z: 3 } }))

    const later = world.add({ transform: createTransform(), rigidBody: ballDef })
    expect(port.addBody).toHaveBeenCalledTimes(2)
    expect(port.addBody).toHaveBeenLastCalledWith(later, ballDef, expect.anything())
  })

  it('removes bodies when entities are removed', () => {
    const world = createWorld<EngineEntity>()
    const port = fakePort()
    registerPhysicsBodies(world, port)
    const entity = world.add({ transform: createTransform(), rigidBody: ballDef })
    world.remove(entity)
    expect(port.removeBody).toHaveBeenCalledWith(entity)
  })
})

describe('physicsStepSystem', () => {
  it('steps the port with ctx.dt and emits engine events', () => {
    const a = {}, b = {}
    const port = fakePort({
      step: vi.fn(() => [
        { kind: 'contact', started: true, a, b },
        { kind: 'sensor', started: true, a, b },
        { kind: 'sensor', started: false, a, b }
      ] as PhysicsEvent[])
    })
    const events = new EventQueue()
    const system = physicsStepSystem(port, events)
    expect(system.stage).toBe('physics')
    system.run({ dt: 1 / 60 })
    expect(port.step).toHaveBeenCalledWith(1 / 60)
    expect(events.read('contactStart')).toHaveLength(1)
    expect(events.read('sensorEnter')).toHaveLength(1)
    expect(events.read('sensorExit')).toHaveLength(1)
  })
})

describe('physicsSyncSystem', () => {
  it('copies current→prev then writes the new pose from the port', () => {
    const world = createWorld<EngineEntity>()
    const entity = world.add({ transform: createTransform({ x: 0, y: 5, z: 0 }), rigidBody: ballDef })
    const port = fakePort({
      readPose: vi.fn(() => ({
        position: { x: 0, y: 4.9, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }))
    })
    const system = physicsSyncSystem(port)
    expect(system.stage).toBe('postPhysics')
    system.run({ world })
    expect(entity.transform!.prevPosition).toEqual({ x: 0, y: 5, z: 0 })
    expect(entity.transform!.position).toEqual({ x: 0, y: 4.9, z: 0 })
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/physics/systems.test.ts`
Expected: FAIL — cannot resolve `../../src/physics/systems`.

- [x] **Step 3: Implement**

`packages/engine/src/physics/systems.ts`:
```ts
import type { World } from 'miniplex'
import type { EngineEntity } from '../ecs/components'
import type { EventQueue } from '../ecs/events'
import type { System } from '../ecs/scheduler'
import type { PhysicsPort } from './port'

/**
 * Subscribes the physics port to the world: every entity with
 * transform+rigidBody gets a body now and in the future; removal mirrors.
 * Returns an unsubscribe function (call on scene teardown before port.dispose).
 */
export function registerPhysicsBodies<E extends EngineEntity>(
  world: World<E>,
  port: PhysicsPort
): () => void {
  const query = world.with('rigidBody', 'transform')
  const add = (entity: E & { rigidBody: NonNullable<E['rigidBody']>; transform: NonNullable<E['transform']> }): void => {
    port.addBody(entity, entity.rigidBody, {
      position: entity.transform.position,
      rotation: entity.transform.rotation
    })
  }
  for (const entity of query) add(entity)
  const offAdd = query.onEntityAdded.subscribe(add)
  const offRemove = query.onEntityRemoved.subscribe((entity) => port.removeBody(entity))
  return () => { offAdd(); offRemove() }
}

/** Steps physics and forwards events into the engine EventQueue. */
export function physicsStepSystem<Ctx extends { dt: number }>(
  port: PhysicsPort,
  events: EventQueue
): System<Ctx> {
  return {
    name: 'physicsStep',
    stage: 'physics',
    run(ctx) {
      for (const event of port.step(ctx.dt)) {
        const type = event.kind === 'sensor'
          ? (event.started ? 'sensorEnter' : 'sensorExit')
          : (event.started ? 'contactStart' : 'contactEnd')
        events.emit({ type, a: event.a, b: event.b })
      }
    }
  }
}

/** Copies body poses into Transform components (prev ← current first). */
export function physicsSyncSystem<Ctx extends { world: World<EngineEntity> }>(
  port: PhysicsPort
): System<Ctx> {
  return {
    name: 'physicsSync',
    stage: 'postPhysics',
    run(ctx) {
      for (const entity of ctx.world.with('transform', 'rigidBody')) {
        const pose = port.readPose(entity)
        if (!pose) continue
        const t = entity.transform
        t.prevPosition = t.position
        t.prevRotation = t.rotation
        t.position = pose.position
        t.rotation = pose.rotation
      }
    }
  }
}
```

miniplex API note: `query.onEntityAdded.subscribe(fn)` returns an unsubscribe
function in miniplex 2.x. If the installed version instead fires added-events
for pre-existing entities on subscribe, the adapter's idempotent `addBody`
guard (Task 24) makes the manual pre-iteration harmless either way.

Add to barrel:
```ts
export * from './physics/systems'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/physics/systems.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Run the full engine suite + CI**

Run: `npm run ci`
Expected: all green.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): ECS-physics wiring (auto-register, step, sync); M5 complete"
```

---

## Milestone M6 — Render port + Three.js adapter

Three.js note: scene-graph objects (`Scene`, `Mesh`, `Group`, cameras,
materials) construct and compute fine in Node without WebGL — only
`WebGLRenderer` needs a real browser. So the adapter is unit-tested in Node;
the `WebGLRenderer` lives in a thin browser shim (Task 34).

### Task 29: RenderPort + Three adapter (meshes, poses, lifecycle)

**Files:**
- Create: `packages/engine/src/render/port.ts`, `packages/engine/src/render/three.ts`
- Test: `packages/engine/tests/render/three-meshes.test.ts`

- [x] **Step 1: Install three (engine workspace)**

Run: `npm install three -w @automata/engine && npm install -D @types/three -w @automata/engine`
Expected: added to engine deps.

- [x] **Step 2: Define the port**

`packages/engine/src/render/port.ts`:
```ts
import type { Vec3 } from '../math/vec3'
import type { Quat } from '../math/quat'
import type { RenderableDef } from './types'

export type GroupId = number

export interface RenderPort {
  /** Creates a scene-graph group; parentless groups attach to the root. */
  createGroup(parent?: GroupId): GroupId
  setGroupRotation(group: GroupId, eulerRad: Vec3): void
  add(entity: object, def: RenderableDef, group?: GroupId): void
  setPose(entity: object, position: Vec3, rotation: Quat): void
  remove(entity: object): void
  setCamera(position: Vec3, lookAt: Vec3): void
  readonly objectCount: number
  dispose(): void
}
```

Add to barrel:
```ts
export * from './render/port'
```

- [x] **Step 3: Write the failing tests**

`packages/engine/tests/render/three-meshes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Mesh, MeshStandardMaterial, SphereGeometry } from 'three'
import { createThreeRenderer } from '../../src/render/three'
import { quat } from '../../src/math/quat'

describe('createThreeRenderer: meshes', () => {
  it('adds primitive meshes to the scene with the requested color', () => {
    const { port, scene } = createThreeRenderer()
    const before = scene.children.length // lights etc.
    port.add({ id: 'ball' }, { primitive: 'sphere', radius: 0.5, color: '#ff5964' })
    port.add({ id: 'floor' }, { primitive: 'box', size: { x: 8, y: 0.5, z: 16 }, color: '#7ec850' })
    port.add({ id: 'bumper' }, { primitive: 'cylinder', radius: 0.6, height: 0.5, color: '#ffd23f' })
    expect(scene.children.length).toBe(before + 3)
    expect(port.objectCount).toBe(3)

    const sphere = scene.children[before] as Mesh
    expect(sphere.geometry).toBeInstanceOf(SphereGeometry)
    expect((sphere.material as MeshStandardMaterial).color.getHexString()).toBe('ff5964')
  })

  it('setPose moves and rotates the mesh', () => {
    const { port, scene } = createThreeRenderer()
    const entity = { id: 'ball' }
    port.add(entity, { primitive: 'sphere', radius: 0.5, color: '#ffffff' })
    const mesh = scene.children[scene.children.length - 1] as Mesh
    port.setPose(entity, { x: 1, y: 2, z: 3 }, quat.fromEuler(Math.PI / 2, 0, 0))
    expect(mesh.position.x).toBeCloseTo(1)
    expect(mesh.position.y).toBeCloseTo(2)
    expect(mesh.position.z).toBeCloseTo(3)
    expect(mesh.quaternion.x).toBeCloseTo(Math.SQRT1_2)
    expect(mesh.quaternion.w).toBeCloseTo(Math.SQRT1_2)
  })

  it('remove disposes geometry and material and detaches the mesh', () => {
    const { port, scene } = createThreeRenderer()
    const entity = { id: 'ball' }
    port.add(entity, { primitive: 'sphere', radius: 0.5, color: '#ffffff' })
    const mesh = scene.children[scene.children.length - 1] as Mesh
    let geometryDisposed = false
    mesh.geometry.addEventListener('dispose', () => { geometryDisposed = true })
    port.remove(entity)
    expect(port.objectCount).toBe(0)
    expect(mesh.parent).toBeNull()
    expect(geometryDisposed).toBe(true)
  })

  it('setPose and remove for unknown entities are safe no-ops', () => {
    const { port } = createThreeRenderer()
    expect(() => {
      port.setPose({}, { x: 0, y: 0, z: 0 }, quat.identity())
      port.remove({})
    }).not.toThrow()
  })
})
```

- [x] **Step 4: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/render/three-meshes.test.ts`
Expected: FAIL — cannot resolve `../../src/render/three`.

- [x] **Step 5: Implement**

`packages/engine/src/render/three.ts`:
```ts
import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, CylinderGeometry,
  DirectionalLight, Group, Material, Mesh, MeshStandardMaterial, Object3D,
  PerspectiveCamera, Scene, SphereGeometry
} from 'three'
import type { RenderableDef } from './types'
import type { GroupId, RenderPort } from './port'

export interface ThreeRenderer {
  port: RenderPort
  scene: Scene
  camera: PerspectiveCamera
}

function geometryFor(def: RenderableDef): BufferGeometry {
  switch (def.primitive) {
    case 'sphere': return new SphereGeometry(def.radius, 24, 16)
    case 'box': return new BoxGeometry(def.size.x, def.size.y, def.size.z)
    case 'cylinder': return new CylinderGeometry(def.radius, def.radius, def.height, 24)
  }
}

export function createThreeRenderer(): ThreeRenderer {
  const scene = new Scene()
  scene.background = new Color('#0e1320')
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 200)
  camera.position.set(0, 6, 10)

  scene.add(new AmbientLight('#ffffff', 0.6))
  const sun = new DirectionalLight('#ffffff', 1.4)
  sun.position.set(6, 12, 4)
  scene.add(sun)

  const meshes = new Map<object, Mesh>()
  const groups = new Map<GroupId, Group>()
  let nextGroupId: GroupId = 1

  const parentOf = (group?: GroupId): Object3D => {
    if (group === undefined) return scene
    const found = groups.get(group)
    if (!found) throw new Error(`Unknown render group ${group}`)
    return found
  }

  const port: RenderPort = {
    get objectCount() { return meshes.size },

    createGroup(parent) {
      const group = new Group()
      parentOf(parent).add(group)
      const id = nextGroupId++
      groups.set(id, group)
      return id
    },

    setGroupRotation(groupId, eulerRad) {
      const group = groups.get(groupId)
      if (!group) throw new Error(`Unknown render group ${groupId}`)
      group.rotation.set(eulerRad.x, eulerRad.y, eulerRad.z)
    },

    add(entity, def, group) {
      if (meshes.has(entity)) return // idempotent (mirrors physics adapter)
      const mesh = new Mesh(geometryFor(def), new MeshStandardMaterial({ color: def.color }))
      parentOf(group).add(mesh)
      meshes.set(entity, mesh)
    },

    setPose(entity, position, rotation) {
      const mesh = meshes.get(entity)
      if (!mesh) return
      mesh.position.set(position.x, position.y, position.z)
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    },

    remove(entity) {
      const mesh = meshes.get(entity)
      if (!mesh) return
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as Material).dispose()
      meshes.delete(entity)
    },

    setCamera(position, lookAt) {
      camera.position.set(position.x, position.y, position.z)
      camera.lookAt(lookAt.x, lookAt.y, lookAt.z)
    },

    dispose() {
      for (const entity of [...meshes.keys()]) port.remove(entity)
      groups.clear()
    }
  }

  return { port, scene, camera }
}
```

Add to barrel:
```ts
export * from './render/three'
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/render/three-meshes.test.ts`
Expected: PASS (4 tests).

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): RenderPort with Node-testable Three.js adapter"
```

### Task 30: Scene-graph groups (the cosmetic-tilt mechanism)

**Files:**
- Test: `packages/engine/tests/render/three-groups.test.ts`

- [x] **Step 1: Write the tests**

`packages/engine/tests/render/three-groups.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createThreeRenderer } from '../../src/render/three'

describe('render groups', () => {
  it('meshes added to a group live under it, not the scene root', () => {
    const { port, scene } = createThreeRenderer()
    const rootCount = scene.children.length
    const stage = port.createGroup()
    port.add({ id: 'floor' }, { primitive: 'box', size: { x: 8, y: 0.5, z: 16 }, color: '#7ec850' }, stage)
    expect(scene.children.length).toBe(rootCount + 1) // just the group
  })

  it('rotating a group rotates its children in world space (cosmetic stage tilt)', () => {
    const { port, scene } = createThreeRenderer()
    const stage = port.createGroup()
    const entity = { id: 'floor' }
    port.add(entity, { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color: '#ffffff' }, stage)
    port.setPose(entity, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 })

    port.setGroupRotation(stage, { x: 0, y: 0, z: Math.PI / 2 })
    scene.updateMatrixWorld(true)

    const group = scene.children[scene.children.length - 1]
    const mesh = group.children[0]!
    const world = new Vector3()
    mesh.getWorldPosition(world)
    // (2,0,0) rotated +90° about Z → (0,2,0)
    expect(world.x).toBeCloseTo(0)
    expect(world.y).toBeCloseTo(2)
  })

  it('groups nest', () => {
    const { port } = createThreeRenderer()
    const outer = port.createGroup()
    const inner = port.createGroup(outer)
    expect(() => port.setGroupRotation(inner, { x: 0.1, y: 0, z: 0 })).not.toThrow()
  })

  it('unknown group ids throw a descriptive error', () => {
    const { port } = createThreeRenderer()
    expect(() => port.setGroupRotation(999, { x: 0, y: 0, z: 0 })).toThrow(/999/)
  })
})
```

- [x] **Step 2: Run the tests**

Run: `npx vitest run packages/engine/tests/render/three-groups.test.ts`
Expected: PASS (4 tests) — groups were implemented in Task 29; this pins the
world-space behavior the game's cosmetic tilt depends on. If the world-position
assertion fails, check `updateMatrixWorld` is called before reading.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "test(engine): scene-graph group rotation semantics for stage tilt"
```

### Task 31: Camera control

**Files:**
- Test: `packages/engine/tests/render/three-camera.test.ts`

- [x] **Step 1: Write the tests**

`packages/engine/tests/render/three-camera.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createThreeRenderer } from '../../src/render/three'

describe('setCamera', () => {
  it('places the camera and aims it at the target', () => {
    const { port, camera } = createThreeRenderer()
    port.setCamera({ x: 0, y: 6, z: 10 }, { x: 0, y: 0, z: 0 })
    expect(camera.position.y).toBeCloseTo(6)

    const direction = new Vector3()
    camera.getWorldDirection(direction)
    const expected = new Vector3(0, -6, -10).normalize()
    expect(direction.x).toBeCloseTo(expected.x)
    expect(direction.y).toBeCloseTo(expected.y)
    expect(direction.z).toBeCloseTo(expected.z)
  })

  it('scene has lights by default (objects are visible)', () => {
    const { scene } = createThreeRenderer()
    const lightTypes = scene.children.map((child) => child.type)
    expect(lightTypes).toContain('AmbientLight')
    expect(lightTypes).toContain('DirectionalLight')
  })
})
```

- [x] **Step 2: Run the tests**

Run: `npx vitest run packages/engine/tests/render/three-camera.test.ts`
Expected: PASS (2 tests).

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "test(engine): camera placement/aim and default lighting"
```

### Task 32: NullRenderer test double

**Files:**
- Create: `packages/engine/src/render/null.ts`
- Test: `packages/engine/tests/render/null.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/render/null.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '../../src/render/null'
import { quat } from '../../src/math/quat'

describe('createNullRenderer', () => {
  it('implements RenderPort and records every call', () => {
    const renderer = createNullRenderer()
    const entity = { id: 'ball' }
    const stage = renderer.port.createGroup()
    renderer.port.add(entity, { primitive: 'sphere', radius: 0.5, color: '#fff' }, stage)
    renderer.port.setPose(entity, { x: 1, y: 2, z: 3 }, quat.identity())
    renderer.port.setGroupRotation(stage, { x: 0.1, y: 0, z: 0 })
    renderer.port.setCamera({ x: 0, y: 5, z: 5 }, { x: 0, y: 0, z: 0 })
    renderer.port.remove(entity)

    expect(renderer.calls.map((call) => call.op)).toEqual(
      ['createGroup', 'add', 'setPose', 'setGroupRotation', 'setCamera', 'remove'])
    expect(renderer.calls[2]).toMatchObject({ op: 'setPose', position: { x: 1, y: 2, z: 3 } })
    expect(renderer.port.objectCount).toBe(0)
  })

  it('tracks objectCount across add/remove/dispose', () => {
    const renderer = createNullRenderer()
    renderer.port.add({ a: 1 }, { primitive: 'sphere', radius: 1, color: '#fff' })
    renderer.port.add({ a: 2 }, { primitive: 'sphere', radius: 1, color: '#fff' })
    expect(renderer.port.objectCount).toBe(2)
    renderer.port.dispose()
    expect(renderer.port.objectCount).toBe(0)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/render/null.test.ts`
Expected: FAIL — cannot resolve `../../src/render/null`.

- [x] **Step 3: Implement**

`packages/engine/src/render/null.ts`:
```ts
import type { Quat } from '../math/quat'
import type { Vec3 } from '../math/vec3'
import type { RenderableDef } from './types'
import type { GroupId, RenderPort } from './port'

export interface RenderCall {
  op: 'createGroup' | 'setGroupRotation' | 'add' | 'setPose' | 'remove' | 'setCamera' | 'dispose'
  entity?: object
  def?: RenderableDef
  group?: GroupId
  position?: Vec3
  rotation?: Quat
  eulerRad?: Vec3
  lookAt?: Vec3
}

export interface NullRenderer {
  port: RenderPort
  calls: RenderCall[]
}

/** Recording RenderPort double for system tests — no Three.js involved. */
export function createNullRenderer(): NullRenderer {
  const calls: RenderCall[] = []
  const objects = new Set<object>()
  let nextGroupId: GroupId = 1

  const port: RenderPort = {
    get objectCount() { return objects.size },
    createGroup(group) {
      calls.push({ op: 'createGroup', group })
      return nextGroupId++
    },
    setGroupRotation(group, eulerRad) {
      calls.push({ op: 'setGroupRotation', group, eulerRad })
    },
    add(entity, def, group) {
      objects.add(entity)
      calls.push({ op: 'add', entity, def, group })
    },
    setPose(entity, position, rotation) {
      calls.push({ op: 'setPose', entity, position, rotation })
    },
    remove(entity) {
      objects.delete(entity)
      calls.push({ op: 'remove', entity })
    },
    setCamera(position, lookAt) {
      calls.push({ op: 'setCamera', position, lookAt })
    },
    dispose() {
      objects.clear()
      calls.push({ op: 'dispose' })
    }
  }

  return { port, calls }
}
```

Add to barrel:
```ts
export * from './render/null'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/render/null.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): NullRenderer recording double"
```

### Task 33: Renderable registration + interpolated render system

**Files:**
- Create: `packages/engine/src/render/systems.ts`
- Test: `packages/engine/tests/render/systems.test.ts`

- [x] **Step 1: Write the failing tests**

`packages/engine/tests/render/systems.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createWorld } from '../../src/ecs/world'
import { createTransform, type EngineEntity } from '../../src/ecs/components'
import { createNullRenderer } from '../../src/render/null'
import { registerRenderables, renderSystem } from '../../src/render/systems'

const ball = { primitive: 'sphere' as const, radius: 0.5, color: '#fff' }

describe('registerRenderables', () => {
  it('adds existing and future renderable entities to the port and removes on despawn', () => {
    const world = createWorld<EngineEntity>()
    const renderer = createNullRenderer()
    const existing = world.add({ transform: createTransform(), renderable: ball })
    registerRenderables(world, renderer.port)
    const later = world.add({ transform: createTransform(), renderable: ball })
    world.remove(existing)

    const ops = renderer.calls.map((call) => call.op)
    expect(ops).toEqual(['add', 'add', 'remove'])
    expect(renderer.calls[1]!.entity).toBe(later)
  })

  it('optionally parents all renderables to a group (stage tilt group)', () => {
    const world = createWorld<EngineEntity>()
    const renderer = createNullRenderer()
    const stage = renderer.port.createGroup()
    registerRenderables(world, renderer.port, stage)
    world.add({ transform: createTransform(), renderable: ball })
    expect(renderer.calls.at(-1)).toMatchObject({ op: 'add', group: stage })
  })
})

describe('renderSystem', () => {
  it('writes poses interpolated between prev and current at alpha', () => {
    const world = createWorld<EngineEntity>()
    const renderer = createNullRenderer()
    registerRenderables(world, renderer.port)
    const entity = world.add({ transform: createTransform({ x: 0, y: 0, z: 0 }), renderable: ball })
    entity.transform!.prevPosition = { x: 0, y: 0, z: 0 }
    entity.transform!.position = { x: 10, y: 0, z: 0 }

    const system = renderSystem(renderer.port)
    expect(system.stage).toBe('render')
    system.run({ world, alpha: 0.25 })

    const pose = renderer.calls.at(-1)!
    expect(pose.op).toBe('setPose')
    expect(pose.position).toEqual({ x: 2.5, y: 0, z: 0 })
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/tests/render/systems.test.ts`
Expected: FAIL — cannot resolve `../../src/render/systems`.

- [x] **Step 3: Implement**

`packages/engine/src/render/systems.ts`:
```ts
import type { World } from 'miniplex'
import type { EngineEntity } from '../ecs/components'
import type { System } from '../ecs/scheduler'
import { vec3 } from '../math/vec3'
import { quat } from '../math/quat'
import type { GroupId, RenderPort } from './port'

/**
 * Mirrors renderable entities into the render port (now and in the future).
 * Returns an unsubscribe function for scene teardown.
 */
export function registerRenderables<E extends EngineEntity>(
  world: World<E>,
  port: RenderPort,
  group?: GroupId
): () => void {
  const query = world.with('renderable', 'transform')
  const add = (entity: E & { renderable: NonNullable<E['renderable']> }): void => {
    port.add(entity, entity.renderable, group)
  }
  for (const entity of query) add(entity)
  const offAdd = query.onEntityAdded.subscribe(add)
  const offRemove = query.onEntityRemoved.subscribe((entity) => port.remove(entity))
  return () => { offAdd(); offRemove() }
}

/** Pushes interpolated transforms to the render port each rAF. */
export function renderSystem<Ctx extends { world: World<EngineEntity>; alpha: number }>(
  port: RenderPort
): System<Ctx> {
  return {
    name: 'render',
    stage: 'render',
    run(ctx) {
      for (const entity of ctx.world.with('transform', 'renderable')) {
        const t = entity.transform
        port.setPose(
          entity,
          vec3.lerp(t.prevPosition, t.position, ctx.alpha),
          quat.nlerp(t.prevRotation, t.rotation, ctx.alpha)
        )
      }
    }
  }
}
```

Add to barrel:
```ts
export * from './render/systems'
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/tests/render/systems.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): renderable registration and interpolated render system"
```

### Task 34: Browser canvas shim + walking skeleton v2 (spinning stage demo)

**Files:**
- Create: `packages/engine/src/render/browser.ts`
- Modify: `games/monkey-ball/src/main.ts`
- Modify: `games/monkey-ball/src/skeleton.ts` (delete — superseded) and `games/monkey-ball/tests/skeleton.test.ts` (delete)
- Create: `games/monkey-ball/src/demoScene.ts`
- Test: `games/monkey-ball/tests/demoScene.test.ts`

The demo proves the whole engine stack end-to-end in a browser: world +
scheduler + loop + render adapter, with a tilting stage group — before any
game logic exists. `demoScene.ts` is tested headlessly with the NullRenderer;
`main.ts` (shim) wires the same function to the real canvas.

- [x] **Step 1: Implement the render browser shim**

`packages/engine/src/render/browser.ts`:
```ts
import { WebGLRenderer } from 'three'
import type { ThreeRenderer } from './three'

export interface CanvasRenderer {
  renderFrame(): void
  dispose(): void
}

/** WebGL glue. Untested shim — keep trivially thin. */
export function attachCanvasRenderer(
  renderer: ThreeRenderer,
  canvas: HTMLCanvasElement
): CanvasRenderer {
  const gl = new WebGLRenderer({ canvas, antialias: true })
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const resize = (): void => {
    gl.setSize(window.innerWidth, window.innerHeight)
    renderer.camera.aspect = window.innerWidth / window.innerHeight
    renderer.camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()
  return {
    renderFrame: () => gl.render(renderer.scene, renderer.camera),
    dispose() {
      window.removeEventListener('resize', resize)
      gl.dispose()
    }
  }
}
```

Add to barrel:
```ts
export * from './render/browser'
```

- [x] **Step 2: Write the failing test for the demo scene**

`games/monkey-ball/tests/demoScene.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createDemoScene } from '../src/demoScene'

describe('createDemoScene', () => {
  it('builds a stage group with floor + ball and ticks without physics', () => {
    const renderer = createNullRenderer()
    const demo = createDemoScene(renderer.port)

    expect(renderer.calls.filter((call) => call.op === 'add')).toHaveLength(2)
    expect(renderer.calls[0]!.op).toBe('createGroup')

    demo.loop.tick(0)
    demo.loop.tick(1000 / 60 + 1)
    const tilts = renderer.calls.filter((call) => call.op === 'setGroupRotation')
    expect(tilts.length).toBeGreaterThan(0) // stage wobbles over time

    const poses = renderer.calls.filter((call) => call.op === 'setPose')
    expect(poses.length).toBeGreaterThan(0) // ball pose pushed each render
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run games/monkey-ball/tests/demoScene.test.ts`
Expected: FAIL — cannot resolve `../src/demoScene`.

- [x] **Step 4: Implement the demo scene + main.ts**

`games/monkey-ball/src/demoScene.ts`:
```ts
import {
  GameLoop, Scheduler, createTransform, createWorld, registerRenderables,
  renderSystem, type EngineEntity, type RenderPort
} from '@automata/engine'

export interface DemoScene { loop: GameLoop }

/** Pre-gameplay demo: a floor + ball under a gently wobbling stage group. */
export function createDemoScene(port: RenderPort, onRender?: () => void): DemoScene {
  const world = createWorld<EngineEntity>()
  const stage = port.createGroup()
  registerRenderables(world, port, stage)

  world.add({
    transform: createTransform({ x: 0, y: -0.25, z: 0 }),
    renderable: { primitive: 'box', size: { x: 8, y: 0.5, z: 16 }, color: '#7ec850' }
  })
  world.add({
    transform: createTransform({ x: 0, y: 0.5, z: 0 }),
    renderable: { primitive: 'sphere', radius: 0.5, color: '#ff5964' }
  })
  port.setCamera({ x: 0, y: 6, z: 12 }, { x: 0, y: 0, z: 0 })

  type Ctx = { world: typeof world; dt: number; alpha: number }
  const scheduler = new Scheduler<Ctx>()
  let elapsed = 0
  scheduler.add({
    name: 'wobble',
    stage: 'update',
    run(ctx) {
      elapsed += ctx.dt
      port.setGroupRotation(stage, { x: Math.sin(elapsed) * 0.08, y: 0, z: Math.cos(elapsed) * 0.08 })
    }
  })

  const loop = new GameLoop({
    fixedUpdate: (dt) => scheduler.runFixed({ world, dt, alpha: 0 }),
    render: (alpha) => {
      scheduler.runStage('render', { world, dt: 0, alpha })
      onRender?.() // lets the browser shim paint after each render pass
    }
  })
  scheduler.add(renderSystem(port))
  return { loop }
}
```

`games/monkey-ball/src/main.ts` (browser shim — untested):
```ts
import { attachCanvasRenderer, createThreeRenderer, startLoopDriver } from '@automata/engine'
import { createDemoScene } from './demoScene'

const canvas = document.createElement('canvas')
document.getElementById('app')!.appendChild(canvas)

const renderer = createThreeRenderer()
const canvasRenderer = attachCanvasRenderer(renderer, canvas)
const demo = createDemoScene(renderer.port, () => canvasRenderer.renderFrame())
startLoopDriver(demo.loop)
```

Delete the old skeleton files (superseded by the demo):
```bash
rm games/monkey-ball/src/skeleton.ts games/monkey-ball/tests/skeleton.test.ts
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run games/monkey-ball`
Expected: PASS (demo scene test; skeleton test removed).

- [x] **Step 6: Verify in a real browser**

Run: `npm run dev -w monkey-ball` and open the printed URL (desktop, and
ideally a phone on the same network via `--host`).
Expected: green floor + red ball on a gently wobbling stage, ~60fps. This is
the one manual checkpoint in this plan — it validates every browser shim at
once. Stop the dev server afterward.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: walking skeleton v2 — engine demo scene on real canvas"
```

### Task 35: Coverage gate + M0–M6 closeout

**Files:**
- Modify: `README.md`

- [x] **Step 1: Run the full gate**

Run: `npm run ci && npm run coverage`
Expected: lint + typecheck + all tests green; engine coverage ≥ 90% lines and
branches (browser shims and barrels excluded by the root config). If coverage
is short, the uncovered lines listed by the report are the to-do list — cover
them or, if they are genuinely shim glue, move them into a `browser.ts` file
where the exclusion applies (and keep them trivial).

- [x] **Step 2: Update README dev docs**

Append to `README.md`:
```markdown
## Workspace

| Path | Package | What |
|---|---|---|
| `packages/engine` | `@automata/engine` | The engine: ECS, store, data, loop, input, physics (Rapier), render (Three) |
| `games/monkey-ball` | `monkey-ball` | The game app (Vite) |
| `tools/level-editor` | `level-editor` | Level editor app (Vite) |

## Commands

- `npm run ci` — lint + typecheck + all tests (run before every commit claim)
- `npm run coverage` — tests with the 90% engine coverage gate
- `npm run dev -w monkey-ball` — run the game locally
```

- [x] **Step 3: Final commit**

```bash
git add -A
git commit -m "docs: workspace + commands; engine foundation (M0–M6) complete"
```

---

## Done — definition for this plan

- `npm run ci` green: lint (with boundary rules), typecheck, every test.
- `npm run coverage` ≥ 90% lines/branches on engine non-shim code.
- Walking skeleton v2 renders the wobbling demo stage in a real browser.
- Untested-shim inventory is exactly: `src/loop/browser.ts`,
  `src/render/browser.ts`, app `main.ts` files. Nothing else lacks tests.
- Next: Plan 2 (Game, M7–M10) gets written against the engine APIs as built.
