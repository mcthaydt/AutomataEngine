# Phase 4 Cycle 4 — Combat & Enemy AI Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@automata/pack-combat-ai` — proximity auto-combat, player health with second-wind recovery, idle/chase/return enemy AI — per the approved spec
`docs/superpowers/specs/active/2026-07/week-29/2026-07-17-phase-4-cycle-4-combat-ai-design.md`.

**Architecture:** One package with three pure cores (`healthCore`, `enemyAiCore`, `combatCore`) wired by a browser `GamePack` adapter and a headless `PackEvalHook`, exactly like `packages/pack-schedules-relationships`. The pack is standalone (`requires: []`) and exercises `integratesWith` for the first time: an optional weapon-boost read of the `inventory` slice that degrades to base damage when absent. Registration happens only in `pack-registry` tables and `game-compose`.

**Tech Stack:** TypeScript ESM workspaces, zod (via `@automata/project` re-export), vitest (happy-dom), seeded RNG from `@automata/engine`.

## Global Constraints

- Pack ids/slices/events are string literals per pack; **pack-to-pack imports are forbidden** — copy `'inventory'` as a local constant, never import from `pack-interaction-inventory`.
- Spec capability schema fields are optional with **no zod defaults** (Phase 2 hash rule); `COMBAT_DEFAULTS` is applied only in `composeSection`.
- No wall clock, no `Date`, no `Math.random` — time advances only via fixed dt; all generation uses the passed `SeededRng`.
- No render-port additions; markers use existing `sphere` primitives. Colors already taken: `#ffd23f` (items, r 0.35), `#7c5cff` (NPCs, r 0.5), `#3ddc84` (walkers, r 0.35). Combat uses `#ff5470` (r 0.45).
- `games/first-light` stays frozen: it must recompose bit-identically (combat is not in its composition).
- No game-specific editor or MCP changes (phase exit criterion).
- Run tests from the repo root with `npx vitest run <path>`; full gates are `npm run ci` and `npm run verify:new-game`.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- iCloud caveat: before each commit, check `git status` for duplicate `" 2"` files and delete them.

---

### Task 1: Real `combat-ai` capability config schema in contracts

**Files:**
- Modify: `packages/contracts/src/gameSpec.ts:94` (the `'combat-ai'` stub inside `capabilityConfigSchemas`)
- Test: `packages/contracts/tests/gameSpec.test.ts`

**Interfaces:**
- Produces: `capabilityConfigSchemas['combat-ai']` accepting `{ playerMaxHealth?: number }` (int, 1–20). Consumed by Task 10's `composeGame` cast.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('gameSpec schemas', ...)` block of `packages/contracts/tests/gameSpec.test.ts`, next to the `schedules-relationships` cases (~line 122):

```ts
  it('combat-ai config parses empty (hash rule: no defaults applied by the schema)', () => {
    expect(capabilityConfigSchemas['combat-ai'].parse({})).toEqual({})
  })

  it('combat-ai config accepts playerMaxHealth within bounds', () => {
    expect(capabilityConfigSchemas['combat-ai'].parse({ playerMaxHealth: 8 }))
      .toEqual({ playerMaxHealth: 8 })
  })

  it('combat-ai config rejects out-of-range and unknown fields', () => {
    expect(() => capabilityConfigSchemas['combat-ai'].parse({ playerMaxHealth: 0 })).toThrow()
    expect(() => capabilityConfigSchemas['combat-ai'].parse({ playerMaxHealth: 21 })).toThrow()
    expect(() => capabilityConfigSchemas['combat-ai'].parse({ playerMaxHealth: 5.5 })).toThrow()
    expect(() => capabilityConfigSchemas['combat-ai'].parse({ enemyCount: 3 })).toThrow()
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run packages/contracts/tests/gameSpec.test.ts`
Expected: FAIL — `parse({ playerMaxHealth: 8 })` throws because the stub is `z.strictObject({})`.

- [ ] **Step 3: Replace the stub**

In `packages/contracts/src/gameSpec.ts` change line 94 from:

```ts
  'combat-ai': z.strictObject({}),
```

to:

```ts
  'combat-ai': z.strictObject({
    playerMaxHealth: z.number().int().min(1).max(20).optional()
  }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/contracts/tests/gameSpec.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/gameSpec.ts packages/contracts/tests/gameSpec.test.ts
git commit -m "feat(contracts): real combat-ai capability config schema"
```

---

### Task 2: Package scaffold + `config.ts` (schema, constants, slice value)

**Files:**
- Create: `packages/pack-combat-ai/package.json`
- Create: `packages/pack-combat-ai/tsconfig.json`
- Create: `packages/pack-combat-ai/vitest.config.ts`
- Create: `packages/pack-combat-ai/src/config.ts`
- Create: `packages/pack-combat-ai/src/index.ts` (grows in later tasks)
- Test: `packages/pack-combat-ai/tests/config.test.ts`

**Interfaces:**
- Produces (used by every later task): constants `COMBAT_SLICE_ID = 'combat'`, `INVENTORY_SLICE_ID = 'inventory'`, `ENEMY_DEFEATED_EVENT = 'enemyDefeated'`, `PLAYER_DEFEATED_EVENT = 'playerDefeated'`; types `CombatPackConfig`, `EnemyDef`, `PlayerCombatConfig`, `CombatSliceValue`; schema `packConfigSchema`.

- [ ] **Step 1: Scaffold the package**

`packages/pack-combat-ai/package.json`:

```json
{
  "name": "@automata/pack-combat-ai",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@automata/contracts": "*",
    "@automata/engine": "*",
    "@automata/game-kit": "*",
    "@automata/project": "*"
  }
}
```

`packages/pack-combat-ai/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/pack-combat-ai/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-combat-ai', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
```

`packages/pack-combat-ai/src/index.ts` (for now):

```ts
export * from './config'
```

Then run `npm install` at the repo root so the workspace links.

- [ ] **Step 2: Write the failing tests**

`packages/pack-combat-ai/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { packConfigSchema } from '../src/config'

const validConfig = () => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [
    {
      id: 'enemy-1', name: 'Brute', post: { x: 4, z: 4 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    },
    {
      id: 'enemy-2', name: 'Stalker', post: { x: -4, z: 5 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    }
  ]
})

describe('combat pack config schema', () => {
  it('accepts a valid config, a null weapon, and an empty enemy list', () => {
    expect(packConfigSchema.parse(validConfig())).toEqual(validConfig())
    const unarmed = { ...validConfig(), weapon: { itemId: null, damageMultiplier: 2 } }
    expect(packConfigSchema.parse(unarmed).weapon.itemId).toBeNull()
    expect(packConfigSchema.parse({ ...validConfig(), enemies: [] }).enemies).toEqual([])
  })

  it('rejects duplicate enemy ids', () => {
    const config = validConfig()
    config.enemies[1]!.id = 'enemy-1'
    expect(() => packConfigSchema.parse(config)).toThrow(/duplicate enemy id "enemy-1"/)
  })

  it('rejects aggroRadius at or above leashRadius', () => {
    const config = validConfig()
    config.enemies[0]!.aggroRadius = 7
    expect(() => packConfigSchema.parse(config)).toThrow(/aggroRadius must be below leashRadius/)
  })

  it('rejects unknown keys and out-of-range values', () => {
    expect(() => packConfigSchema.parse({ ...validConfig(), extra: 1 })).toThrow()
    const config = validConfig()
    config.player.maxHealth = 0
    expect(() => packConfigSchema.parse(config)).toThrow()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/pack-combat-ai/tests/config.test.ts`
Expected: FAIL — `../src/config` does not exist.

- [ ] **Step 4: Implement `src/config.ts`**

```ts
import { z } from '@automata/project'

/**
 * Compiled pack config: proximity auto-combat over cast-derived enemies.
 * Contract names for the slice/events this pack owns and emits live here; the
 * inventory-pack slice id is a deliberate string copy — pack-to-pack imports
 * are forbidden and the read degrades gracefully when the slice is absent.
 */
export const COMBAT_SLICE_ID = 'combat'
export const INVENTORY_SLICE_ID = 'inventory'
export const ENEMY_DEFEATED_EVENT = 'enemyDefeated'
export const PLAYER_DEFEATED_EVENT = 'playerDefeated'

/** Runtime slice payload — also the eval hook's published shape. */
export interface CombatSliceValue {
  playerHp: number
  invulnSeconds: number
  enemies: Record<string, { hp: number; mode: 'idle' | 'chase' | 'return' }>
}

const idSchema = z.string().min(1).max(60)
const positionSchema = z.strictObject({ x: z.number(), z: z.number() })

const playerSchema = z.strictObject({
  maxHealth: z.number().int().min(1).max(20),
  attackDamage: z.number().min(1).max(10),
  attackRadius: z.number().min(0.5).max(5),
  attackCooldownSeconds: z.number().min(0.1).max(5),
  secondWindSeconds: z.number().min(0.5).max(10)
})
export type PlayerCombatConfig = z.infer<typeof playerSchema>

const weaponSchema = z.strictObject({
  itemId: idSchema.nullable(),
  damageMultiplier: z.number().min(1).max(5)
})

const enemySchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  post: positionSchema,
  maxHealth: z.number().int().min(1).max(30),
  attackDamage: z.number().min(1).max(10),
  attackRadius: z.number().min(0.5).max(5),
  attackCooldownSeconds: z.number().min(0.1).max(5),
  speed: z.number().min(0.5).max(8),
  aggroRadius: z.number().min(1).max(10),
  leashRadius: z.number().min(2).max(20)
})
export type EnemyDef = z.infer<typeof enemySchema>

const baseConfigSchema = z.strictObject({
  player: playerSchema,
  weapon: weaponSchema,
  enemies: z.array(enemySchema).max(12)
})
export type CombatPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

export const packConfigSchema: z.ZodType<CombatPackConfig> = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  for (const dup of duplicates(config.enemies.map((enemy) => enemy.id))) issue(`duplicate enemy id "${dup}"`)
  for (const enemy of config.enemies) {
    if (enemy.aggroRadius >= enemy.leashRadius) issue(`enemy "${enemy.id}" aggroRadius must be below leashRadius`)
  }
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/pack-combat-ai/tests/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pack-combat-ai package-lock.json
git commit -m "feat(pack-combat-ai): package scaffold and cross-validated config schema"
```

---

### Task 3: `healthCore.ts` — HP, damage, second wind

**Files:**
- Create: `packages/pack-combat-ai/src/healthCore.ts`
- Modify: `packages/pack-combat-ai/src/index.ts` (add `export * from './healthCore'`)
- Test: `packages/pack-combat-ai/tests/healthCore.test.ts`

**Interfaces:**
- Consumes: `PlayerCombatConfig` from Task 2.
- Produces: `HealthState { hp: number; invulnSeconds: number }`; `createHealth(player: PlayerCombatConfig): HealthState`; `applyPlayerDamage(state, amount, player): { state: HealthState; defeated: boolean }`; `tickInvuln(state, dt): HealthState`. Used by Task 5's `combatCore`.

- [ ] **Step 1: Write the failing tests**

`packages/pack-combat-ai/tests/healthCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyPlayerDamage, createHealth, tickInvuln } from '../src/healthCore'
import type { PlayerCombatConfig } from '../src/config'

const player: PlayerCombatConfig = {
  maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2
}

describe('healthCore', () => {
  it('starts at full health with no invulnerability', () => {
    expect(createHealth(player)).toEqual({ hp: 5, invulnSeconds: 0 })
  })

  it('subtracts damage without reaching zero', () => {
    const hit = applyPlayerDamage(createHealth(player), 2, player)
    expect(hit).toEqual({ state: { hp: 3, invulnSeconds: 0 }, defeated: false })
  })

  it('second wind: damage reaching zero refills to max and opens the invulnerability window', () => {
    const low = { hp: 1, invulnSeconds: 0 }
    const hit = applyPlayerDamage(low, 1, player)
    expect(hit).toEqual({ state: { hp: 5, invulnSeconds: 2 }, defeated: true })
  })

  it('overkill damage also triggers exactly one second wind', () => {
    const hit = applyPlayerDamage({ hp: 2, invulnSeconds: 0 }, 9, player)
    expect(hit).toEqual({ state: { hp: 5, invulnSeconds: 2 }, defeated: true })
  })

  it('ignores damage while invulnerable', () => {
    const shielded = { hp: 5, invulnSeconds: 1.5 }
    expect(applyPlayerDamage(shielded, 3, player)).toEqual({ state: shielded, defeated: false })
  })

  it('drains the invulnerability window with fixed dt and clamps at zero', () => {
    let state = { hp: 5, invulnSeconds: 0.05 }
    state = tickInvuln(state, 1 / 60)
    expect(state.invulnSeconds).toBeCloseTo(0.05 - 1 / 60, 10)
    for (let i = 0; i < 10; i += 1) state = tickInvuln(state, 1 / 60)
    expect(state.invulnSeconds).toBe(0)
    expect(tickInvuln(state, 1 / 60)).toBe(state)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/pack-combat-ai/tests/healthCore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/healthCore.ts`**

```ts
import type { PlayerCombatConfig } from './config'

/** Pure player HP with the second-wind recovery; no wall clock, fixed dt only. */
export interface HealthState { hp: number; invulnSeconds: number }

export function createHealth(player: PlayerCombatConfig): HealthState {
  return { hp: player.maxHealth, invulnSeconds: 0 }
}

/**
 * Damage while invulnerable is ignored. Damage that would reach zero triggers
 * the second wind instead: refill in place plus an invulnerability window.
 * The player never actually dies — packs cannot teleport the player (logged
 * capability gap), and enemies never heal, so progress stays monotonic.
 */
export function applyPlayerDamage(
  state: HealthState, amount: number, player: PlayerCombatConfig
): { state: HealthState; defeated: boolean } {
  if (state.invulnSeconds > 0) return { state, defeated: false }
  const hp = state.hp - amount
  if (hp <= 0) {
    return { state: { hp: player.maxHealth, invulnSeconds: player.secondWindSeconds }, defeated: true }
  }
  return { state: { hp, invulnSeconds: 0 }, defeated: false }
}

export function tickInvuln(state: HealthState, dt: number): HealthState {
  if (state.invulnSeconds <= 0) return state
  return { hp: state.hp, invulnSeconds: Math.max(0, state.invulnSeconds - dt) }
}
```

Add to `src/index.ts`: `export * from './healthCore'`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/pack-combat-ai/tests/healthCore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-combat-ai
git commit -m "feat(pack-combat-ai): healthCore with second-wind recovery"
```

---

### Task 4: `enemyAiCore.ts` — idle/chase/return state machine

**Files:**
- Create: `packages/pack-combat-ai/src/enemyAiCore.ts`
- Modify: `packages/pack-combat-ai/src/index.ts` (add `export * from './enemyAiCore'`)
- Test: `packages/pack-combat-ai/tests/enemyAiCore.test.ts`

**Interfaces:**
- Consumes: `EnemyDef` from Task 2.
- Produces: `EnemyMode = 'idle' | 'chase' | 'return'`; `EnemyAiState { position: { x, z }; mode: EnemyMode }`; `createEnemyAi(enemy: EnemyDef): EnemyAiState`; `stepEnemyAi(state, enemy, player, dt): EnemyAiState`; `stepToward(position, target, speed, dt)`. Used by Task 5. Callers must not step defeated enemies.

- [ ] **Step 1: Write the failing tests**

`packages/pack-combat-ai/tests/enemyAiCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createEnemyAi, stepEnemyAi, stepToward } from '../src/enemyAiCore'
import type { EnemyDef } from '../src/config'

const enemy: EnemyDef = {
  id: 'enemy-1', name: 'Brute', post: { x: 0, z: 0 }, maxHealth: 3, attackDamage: 1,
  attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
}
const DT = 1 / 60

describe('enemyAiCore', () => {
  it('starts idle at its post', () => {
    expect(createEnemyAi(enemy)).toEqual({ position: { x: 0, z: 0 }, mode: 'idle' })
  })

  it('stays idle while the player is outside the aggro radius', () => {
    const state = createEnemyAi(enemy)
    expect(stepEnemyAi(state, enemy, { x: 5, z: 0 }, DT)).toEqual(state)
  })

  it('aggros and steps straight toward a player inside the aggro radius', () => {
    const next = stepEnemyAi(createEnemyAi(enemy), enemy, { x: 3, z: 0 }, DT)
    expect(next.mode).toBe('chase')
    expect(next.position.x).toBeCloseTo(3 * DT, 10)
    expect(next.position.z).toBe(0)
  })

  it('leashes home when the player is beyond leashRadius from the post', () => {
    const chasing = { position: { x: 3, z: 0 }, mode: 'chase' as const }
    const next = stepEnemyAi(chasing, enemy, { x: 8, z: 0 }, DT)
    expect(next.mode).toBe('return')
    expect(next.position.x).toBeLessThan(3)
  })

  it('return-mode arrival clamps exactly onto the post and goes idle', () => {
    const nearHome = { position: { x: 0.01, z: 0 }, mode: 'return' as const }
    const next = stepEnemyAi(nearHome, enemy, { x: 20, z: 20 }, DT)
    expect(next).toEqual({ position: { x: 0, z: 0 }, mode: 'idle' })
  })

  it('re-aggros mid-return when the player re-enters the aggro radius', () => {
    const returning = { position: { x: 2, z: 0 }, mode: 'return' as const }
    const next = stepEnemyAi(returning, enemy, { x: 3, z: 0 }, DT)
    expect(next.mode).toBe('chase')
  })

  it('is deterministic across identical tick sequences', () => {
    const run = (): ReturnType<typeof stepEnemyAi> => {
      let state = createEnemyAi(enemy)
      for (let i = 0; i < 240; i += 1) state = stepEnemyAi(state, enemy, { x: 3.5, z: 1 }, DT)
      return state
    }
    expect(run()).toEqual(run())
  })

  it('stepToward clamps to exact arrival without overshoot', () => {
    expect(stepToward({ x: 0, z: 0 }, { x: 0.01, z: 0 }, 3, DT)).toEqual({ x: 0.01, z: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/pack-combat-ai/tests/enemyAiCore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/enemyAiCore.ts`**

```ts
import type { EnemyDef } from './config'

/** Pure idle/chase/return enemy movement; straight lines only, no pathfinding. */
export type EnemyMode = 'idle' | 'chase' | 'return'
export interface EnemyAiState { position: { x: number; z: number }; mode: EnemyMode }

export function createEnemyAi(enemy: EnemyDef): EnemyAiState {
  return { position: { ...enemy.post }, mode: 'idle' }
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

export function stepToward(
  position: { x: number; z: number }, target: { x: number; z: number }, speed: number, dt: number
): { x: number; z: number } {
  const dx = target.x - position.x
  const dz = target.z - position.z
  const dist = Math.hypot(dx, dz)
  const stride = speed * dt
  if (dist <= stride) return { x: target.x, z: target.z }
  return { x: position.x + (dx / dist) * stride, z: position.z + (dz / dist) * stride }
}

/**
 * Transition precedence: a chasing enemy leashes only on the player leaving
 * leashRadius-from-post; idle and returning enemies (re-)aggro on the player
 * entering aggroRadius-from-enemy. Callers must not step defeated enemies.
 */
export function stepEnemyAi(
  state: EnemyAiState, enemy: EnemyDef, player: { x: number; z: number }, dt: number
): EnemyAiState {
  let mode = state.mode
  if (mode === 'chase') {
    if (distance(player, enemy.post) > enemy.leashRadius) mode = 'return'
  } else if (distance(player, state.position) <= enemy.aggroRadius) {
    mode = 'chase'
  }
  if (mode === 'chase') {
    return { position: stepToward(state.position, player, enemy.speed, dt), mode }
  }
  if (mode === 'return') {
    const position = stepToward(state.position, enemy.post, enemy.speed, dt)
    const arrived = position.x === enemy.post.x && position.z === enemy.post.z
    return { position, mode: arrived ? 'idle' : 'return' }
  }
  return state
}
```

Add to `src/index.ts`: `export * from './enemyAiCore'`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/pack-combat-ai/tests/enemyAiCore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-combat-ai
git commit -m "feat(pack-combat-ai): enemyAiCore idle/chase/return state machine"
```

---

### Task 5: `combatCore.ts` — engagement resolution, gate, slice value, persistence

**Files:**
- Create: `packages/pack-combat-ai/src/combatCore.ts`
- Modify: `packages/pack-combat-ai/src/index.ts` (add `export * from './combatCore'`)
- Test: `packages/pack-combat-ai/tests/combatCore.test.ts`

**Interfaces:**
- Consumes: Task 2 config types; Task 3 `HealthState`/`createHealth`/`applyPlayerDamage`/`tickInvuln`; Task 4 `EnemyAiState`/`createEnemyAi`/`stepEnemyAi`.
- Produces (used by Tasks 7 and 8): `CombatState { player: HealthState; playerCooldown: number; enemies: Record<string, EnemyCombatState> }`; `EnemyCombatState { hp: number; cooldown: number; ai: EnemyAiState }`; `createCombatState(config)`; `stepCombat(state, player, config, dt, weaponHeld): { state; defeatedEnemyIds: readonly string[]; playerDefeated: boolean }`; `enemiesDefeated(state, config): boolean`; `isWeaponHeld(config, collected: readonly string[]): boolean`; `playerDamage(config, weaponHeld): number`; `combatSliceValue(state, config): CombatSliceValue`; `serializeCombatState(state): unknown`; `deserializeCombatState(raw, config): CombatState`.

- [ ] **Step 1: Write the failing tests**

`packages/pack-combat-ai/tests/combatCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  combatSliceValue, createCombatState, deserializeCombatState, enemiesDefeated,
  isWeaponHeld, playerDamage, serializeCombatState, stepCombat
} from '../src/combatCore'
import type { CombatPackConfig } from '../src/config'

const DT = 1 / 60

const config = (): CombatPackConfig => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [
    {
      id: 'enemy-1', name: 'Brute', post: { x: 1, z: 0 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    },
    {
      id: 'enemy-2', name: 'Stalker', post: { x: 9, z: 9 }, maxHealth: 3, attackDamage: 1,
      attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
    }
  ]
})

/** Drive ticks with the player parked at the origin, next to enemy-1's post. */
const drive = (ticks: number, weapon = false): ReturnType<typeof stepCombat> => {
  const cfg = config()
  let result: ReturnType<typeof stepCombat> = {
    state: createCombatState(cfg), defeatedEnemyIds: [], playerDefeated: false
  }
  for (let i = 0; i < ticks; i += 1) {
    result = stepCombat(result.state, { x: 0, z: 0 }, cfg, DT, weapon)
  }
  return result
}

describe('combatCore', () => {
  it('initial state: full health, ready cooldowns, enemies at their posts', () => {
    const state = createCombatState(config())
    expect(state.player).toEqual({ hp: 5, invulnSeconds: 0 })
    expect(state.playerCooldown).toBe(0)
    expect(state.enemies['enemy-1']).toEqual({
      hp: 3, cooldown: 0, ai: { position: { x: 1, z: 0 }, mode: 'idle' }
    })
  })

  it('auto-attacks the nearest alive enemy in radius and respects the cooldown', () => {
    const cfg = config()
    const first = stepCombat(createCombatState(cfg), { x: 0, z: 0 }, cfg, DT, false)
    expect(first.state.enemies['enemy-1']!.hp).toBe(2)
    expect(first.state.playerCooldown).toBeCloseTo(0.5, 10)
    const second = stepCombat(first.state, { x: 0, z: 0 }, cfg, DT, false)
    expect(second.state.enemies['enemy-1']!.hp).toBe(2)
  })

  it('defeats an engaged enemy over time and reports it exactly once', () => {
    const outcome = drive(120)
    expect(outcome.state.enemies['enemy-1']!.hp).toBe(0)
    const all: string[] = []
    const cfg = config()
    let result: ReturnType<typeof stepCombat> = {
      state: createCombatState(cfg), defeatedEnemyIds: [], playerDefeated: false
    }
    for (let i = 0; i < 120; i += 1) {
      result = stepCombat(result.state, { x: 0, z: 0 }, cfg, DT, false)
      all.push(...result.defeatedEnemyIds)
    }
    expect(all).toEqual(['enemy-1'])
  })

  it('weapon boost doubles player damage only when held', () => {
    const cfg = config()
    expect(playerDamage(cfg, false)).toBe(1)
    expect(playerDamage(cfg, true)).toBe(2)
    expect(isWeaponHeld(cfg, ['item-1'])).toBe(true)
    expect(isWeaponHeld(cfg, [])).toBe(false)
    expect(isWeaponHeld({ ...cfg, weapon: { itemId: null, damageMultiplier: 2 } }, ['item-1'])).toBe(false)
  })

  it('enemy attacks trigger the second wind and report playerDefeated', () => {
    // A 30-HP enemy survives long enough to land the five hits that would
    // reach zero (the default 3-HP enemy dies before the player does).
    const cfg = config()
    cfg.enemies = [{ ...cfg.enemies[0]!, maxHealth: 30 }]
    let result: ReturnType<typeof stepCombat> = {
      state: createCombatState(cfg), defeatedEnemyIds: [], playerDefeated: false
    }
    let defeated = false
    for (let i = 0; i < 60 * 10 && !defeated; i += 1) {
      result = stepCombat(result.state, { x: 0, z: 0 }, cfg, DT, false)
      defeated = result.playerDefeated
    }
    expect(defeated).toBe(true)
    expect(result.state.player.hp).toBe(5)
    expect(result.state.player.invulnSeconds).toBeGreaterThan(0)
  })

  it('completion gate: all enemies at zero, vacuously true with no enemies', () => {
    const cfg = config()
    expect(enemiesDefeated(createCombatState(cfg), cfg)).toBe(false)
    const empty = { ...cfg, enemies: [] }
    expect(enemiesDefeated(createCombatState(empty), empty)).toBe(true)
  })

  it('slice value exposes player hp, invulnerability, and per-enemy hp/mode', () => {
    const cfg = config()
    expect(combatSliceValue(createCombatState(cfg), cfg)).toEqual({
      playerHp: 5, invulnSeconds: 0,
      enemies: { 'enemy-1': { hp: 3, mode: 'idle' }, 'enemy-2': { hp: 3, mode: 'idle' } }
    })
  })

  it('persistence round-trips hp and rebuilds enemies at their posts', () => {
    const cfg = config()
    const fought = drive(120).state
    const restored = deserializeCombatState(serializeCombatState(fought), cfg)
    expect(restored.player.hp).toBe(fought.player.hp)
    expect(restored.player.invulnSeconds).toBe(0)
    expect(restored.enemies['enemy-1']!.hp).toBe(0)
    expect(restored.enemies['enemy-2']).toEqual({
      hp: 3, cooldown: 0, ai: { position: { x: 9, z: 9 }, mode: 'idle' }
    })
  })

  it('rejects malformed and mismatched saved state', () => {
    const cfg = config()
    expect(() => deserializeCombatState({ nope: true }, cfg)).toThrow()
    expect(() => deserializeCombatState(
      { player: { hp: 5 }, enemies: [{ id: 'ghost', hp: 1 }] }, cfg
    )).toThrow(/unknown enemy "ghost"/)
    expect(() => deserializeCombatState(
      { player: { hp: 5 }, enemies: [{ id: 'enemy-1', hp: 1 }] }, cfg
    )).toThrow(/missing enemy "enemy-2"/)
    expect(() => deserializeCombatState(
      { player: { hp: 20 }, enemies: [{ id: 'enemy-1', hp: 1 }, { id: 'enemy-2', hp: 3 }] }, cfg
    )).toThrow(/hp 20 above maxHealth/)
  })

  it('is deterministic across identical tick sequences', () => {
    expect(drive(300)).toEqual(drive(300))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/pack-combat-ai/tests/combatCore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/combatCore.ts`**

```ts
import { z } from '@automata/project'
import type { CombatPackConfig, CombatSliceValue } from './config'
import { applyPlayerDamage, createHealth, tickInvuln, type HealthState } from './healthCore'
import { createEnemyAi, stepEnemyAi, type EnemyAiState } from './enemyAiCore'

/** Pure per-tick engagement resolution over healthCore + enemyAiCore. */
export interface EnemyCombatState { hp: number; cooldown: number; ai: EnemyAiState }
export interface CombatState {
  player: HealthState
  playerCooldown: number
  enemies: Record<string, EnemyCombatState>
}

export interface CombatStepResult {
  state: CombatState
  /** Enemy ids newly defeated this tick (each id is reported exactly once). */
  defeatedEnemyIds: readonly string[]
  playerDefeated: boolean
}

export function createCombatState(config: CombatPackConfig): CombatState {
  return {
    player: createHealth(config.player),
    playerCooldown: 0,
    enemies: Object.fromEntries(config.enemies.map((enemy) => [
      enemy.id, { hp: enemy.maxHealth, cooldown: 0, ai: createEnemyAi(enemy) }
    ]))
  }
}

export function isWeaponHeld(config: CombatPackConfig, collected: readonly string[]): boolean {
  return config.weapon.itemId !== null && collected.includes(config.weapon.itemId)
}

export function playerDamage(config: CombatPackConfig, weaponHeld: boolean): number {
  return config.player.attackDamage * (weaponHeld ? config.weapon.damageMultiplier : 1)
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/**
 * Fixed step order (spec §3.4): enemy AI movement, player auto-attack, enemy
 * attacks, invulnerability drain. Nearest-target ties break by config order,
 * which is enemy id order as composed.
 */
export function stepCombat(
  state: CombatState, player: { x: number; z: number }, config: CombatPackConfig,
  dt: number, weaponHeld: boolean
): CombatStepResult {
  const enemies: Record<string, EnemyCombatState> = {}
  for (const enemy of config.enemies) {
    const entry = state.enemies[enemy.id]!
    enemies[enemy.id] = entry.hp <= 0
      ? entry
      : { ...entry, cooldown: Math.max(0, entry.cooldown - dt), ai: stepEnemyAi(entry.ai, enemy, player, dt) }
  }

  const defeatedEnemyIds: string[] = []
  let playerCooldown = Math.max(0, state.playerCooldown - dt)
  if (playerCooldown === 0) {
    let targetId: string | null = null
    let best = Infinity
    for (const enemy of config.enemies) {
      const entry = enemies[enemy.id]!
      if (entry.hp <= 0) continue
      const dist = distance(entry.ai.position, player)
      if (dist <= config.player.attackRadius && dist < best) { best = dist; targetId = enemy.id }
    }
    if (targetId) {
      const entry = enemies[targetId]!
      const hp = Math.max(0, entry.hp - playerDamage(config, weaponHeld))
      enemies[targetId] = { ...entry, hp }
      playerCooldown = config.player.attackCooldownSeconds
      if (hp === 0) defeatedEnemyIds.push(targetId)
    }
  }

  let health = state.player
  let playerDefeated = false
  for (const enemy of config.enemies) {
    const entry = enemies[enemy.id]!
    if (entry.hp <= 0 || entry.cooldown > 0) continue
    if (distance(entry.ai.position, player) > enemy.attackRadius) continue
    const hit = applyPlayerDamage(health, enemy.attackDamage, config.player)
    health = hit.state
    playerDefeated = playerDefeated || hit.defeated
    enemies[enemy.id] = { ...entry, cooldown: enemy.attackCooldownSeconds }
  }
  health = tickInvuln(health, dt)

  return { state: { player: health, playerCooldown, enemies }, defeatedEnemyIds, playerDefeated }
}

/** The pack's objectives-complete gate; vacuously true with no enemies. */
export function enemiesDefeated(state: CombatState, config: CombatPackConfig): boolean {
  return config.enemies.every((enemy) => state.enemies[enemy.id]!.hp <= 0)
}

/** Shared by the browser adapter and the eval hook — parity by construction. */
export function combatSliceValue(state: CombatState, config: CombatPackConfig): CombatSliceValue {
  return {
    playerHp: state.player.hp,
    invulnSeconds: state.player.invulnSeconds,
    enemies: Object.fromEntries(config.enemies.map((enemy) => {
      const entry = state.enemies[enemy.id]!
      return [enemy.id, { hp: entry.hp, mode: entry.ai.mode }]
    }))
  }
}

const savedStateSchema = z.strictObject({
  player: z.strictObject({ hp: z.number().int().min(1).max(20) }),
  enemies: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    hp: z.number().int().min(0).max(30)
  })).max(12)
})

export function serializeCombatState(state: CombatState): unknown {
  return {
    player: { hp: state.player.hp },
    enemies: Object.entries(state.enemies).map(([id, entry]) => ({ id, hp: entry.hp }))
  }
}

/**
 * Parse-or-throw; saved enemy ids must exactly match the config set. Positions,
 * modes, cooldowns, and the invulnerability window are recomputed: live enemies
 * snap to their post on load (documented simplification, walker precedent).
 */
export function deserializeCombatState(raw: unknown, config: CombatPackConfig): CombatState {
  const parsed = savedStateSchema.parse(raw)
  if (parsed.player.hp > config.player.maxHealth) {
    throw new Error(`Saved combat state player hp ${parsed.player.hp} above maxHealth`)
  }
  const byId = new Map(parsed.enemies.map((entry) => [entry.id, entry.hp]))
  const expected = new Map(config.enemies.map((enemy) => [enemy.id, enemy]))
  for (const entry of parsed.enemies) {
    if (!expected.has(entry.id)) throw new Error(`Saved combat state has unknown enemy "${entry.id}"`)
    if (entry.hp > expected.get(entry.id)!.maxHealth) {
      throw new Error(`Saved combat state enemy "${entry.id}" hp ${entry.hp} above maxHealth`)
    }
  }
  for (const enemy of config.enemies) {
    if (!byId.has(enemy.id)) throw new Error(`Saved combat state missing enemy "${enemy.id}"`)
  }
  return {
    player: { hp: parsed.player.hp, invulnSeconds: 0 },
    playerCooldown: 0,
    enemies: Object.fromEntries(config.enemies.map((enemy) => [
      enemy.id, { hp: byId.get(enemy.id)!, cooldown: 0, ai: createEnemyAi(enemy) }
    ]))
  }
}
```

Add to `src/index.ts`: `export * from './combatCore'`

Note: the player-hp bound check message must contain `hp 20 above maxHealth` — the test regexes match `/unknown enemy "ghost"/`, `/missing enemy "enemy-2"/`, `/hp 20 above maxHealth/`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/pack-combat-ai/tests/combatCore.test.ts`
Expected: PASS. If the "second wind" test is flaky in timing, the bug is real (cooldown or invuln arithmetic) — fix the core, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-combat-ai
git commit -m "feat(pack-combat-ai): combatCore engagement resolution, gate, persistence"
```

---

### Task 6: Seeded `composeSection.ts`

**Files:**
- Create: `packages/pack-combat-ai/src/composeSection.ts`
- Modify: `packages/pack-combat-ai/src/index.ts` (add `export * from './composeSection'`)
- Test: `packages/pack-combat-ai/tests/composeSection.test.ts`

**Interfaces:**
- Consumes: `packConfigSchema`, `CombatPackConfig`, `EnemyDef` (Task 2); `SeededRng` from `@automata/engine`.
- Produces (used by Tasks 9 and 10): `COMBAT_DEFAULTS`; `CombatComposeInput { specConfig: { playerMaxHealth?: number }; cast; arena: { half; spawn; goal }; inventory: { items } | null; occupied: ReadonlyArray<{x,z}> }`; `composeCombatSection(input, rng): CombatPackConfig`.

- [ ] **Step 1: Write the failing tests**

`packages/pack-combat-ai/tests/composeSection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { COMBAT_DEFAULTS, composeCombatSection, type CombatComposeInput } from '../src/composeSection'

const input = (): CombatComposeInput => ({
  specConfig: {},
  cast: [
    { id: 'c-hero', name: 'Hero', role: 'player' },
    { id: 'c-brute', name: 'Brute', role: 'antagonist' },
    { id: 'c-stalker', name: 'Stalker', role: 'antagonist' },
    { id: 'c-keeper', name: 'The Keeper', role: 'quest-giver' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: { items: [{ id: 'item-1', position: { x: -2, z: 3 } }, { id: 'item-2', position: { x: 4, z: -1 } }] },
  occupied: [{ x: 0, z: 0 }]
})

describe('composeCombatSection', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    expect(composeCombatSection(input(), createSeededRng(7)))
      .toEqual(composeCombatSection(input(), createSeededRng(7)))
    const a = composeCombatSection(input(), createSeededRng(7))
    const b = composeCombatSection(input(), createSeededRng(8))
    expect(a.enemies.map((enemy) => enemy.post)).not.toEqual(b.enemies.map((enemy) => enemy.post))
  })

  it('derives one enemy per antagonist cast member with default stats', () => {
    const config = composeCombatSection(input(), createSeededRng(7))
    expect(config.enemies.map((enemy) => ({ id: enemy.id, name: enemy.name })))
      .toEqual([{ id: 'enemy-1', name: 'Brute' }, { id: 'enemy-2', name: 'Stalker' }])
    for (const enemy of config.enemies) {
      expect(enemy.maxHealth).toBe(COMBAT_DEFAULTS.enemy.maxHealth)
      expect(enemy.aggroRadius).toBe(COMBAT_DEFAULTS.enemy.aggroRadius)
    }
  })

  it('applies playerMaxHealth from the spec config and defaults elsewhere', () => {
    const custom = { ...input(), specConfig: { playerMaxHealth: 9 } }
    expect(composeCombatSection(custom, createSeededRng(7)).player.maxHealth).toBe(9)
    expect(composeCombatSection(input(), createSeededRng(7)).player.maxHealth)
      .toBe(COMBAT_DEFAULTS.player.maxHealth)
  })

  it('keeps every post outside the spawn aggro keepout and away from occupied points', () => {
    const config = composeCombatSection(input(), createSeededRng(7))
    for (const enemy of config.enemies) {
      const spawnDist = Math.hypot(enemy.post.x - -8, enemy.post.z - -8)
      expect(spawnDist).toBeGreaterThanOrEqual(COMBAT_DEFAULTS.enemy.aggroRadius + 1)
      for (const point of [...input().occupied, ...input().inventory!.items.map((item) => item.position)]) {
        expect(Math.hypot(enemy.post.x - point.x, enemy.post.z - point.z)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('picks a seeded weapon item when inventory is present, null when standalone', () => {
    const armed = composeCombatSection(input(), createSeededRng(7))
    expect(['item-1', 'item-2']).toContain(armed.weapon.itemId)
    expect(armed.weapon.damageMultiplier).toBe(COMBAT_DEFAULTS.weaponDamageMultiplier)
    const standalone = composeCombatSection({ ...input(), inventory: null }, createSeededRng(7))
    expect(standalone.weapon.itemId).toBeNull()
  })

  it('composes an antagonist-free cast to zero enemies (gate vacuously true)', () => {
    const peaceful = { ...input(), cast: [{ id: 'c-hero', name: 'Hero', role: 'player' }] }
    expect(composeCombatSection(peaceful, createSeededRng(7)).enemies).toEqual([])
  })

  it('throws a typed exhaustion error when the placement budget runs out', () => {
    // half 4 -> extent 3: every candidate is within 4.25 of the spawn at the
    // origin, inside the spawn aggro keepout (radius 5) — no post can exist.
    const cramped = { ...input(), arena: { half: 4, spawn: { x: 0, z: 0 }, goal: { x: 1, z: 1 } } }
    expect(() => composeCombatSection(cramped, createSeededRng(7)))
      .toThrow(/Enemy post placement budget exhausted/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/pack-combat-ai/tests/composeSection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/composeSection.ts`**

```ts
import type { SeededRng } from '@automata/engine'
import { packConfigSchema, type CombatPackConfig, type EnemyDef } from './config'

export const COMBAT_DEFAULTS = {
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  enemy: { maxHealth: 3, attackDamage: 1, attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7 },
  weaponDamageMultiplier: 2
} as const

export interface CombatComposeInput {
  specConfig: { playerMaxHealth?: number }
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  /** Null when the pack is composed standalone — the weapon then stays null. */
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> } | null
  /** Soft-keepout points from other composed sections (dialogue NPCs, walker stations). */
  occupied: ReadonlyArray<{ x: number; z: number }>
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const SPAWN_AGGRO_MARGIN = 1
const DRAW_BUDGET = 200

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Seeded enemy posts + weapon pick; defaults deliberately live outside GameSpec. */
export function composeCombatSection(input: CombatComposeInput, rng: SeededRng): CombatPackConfig {
  const playerMaxHealth = input.specConfig.playerMaxHealth ?? COMBAT_DEFAULTS.player.maxHealth
  const antagonists = input.cast.filter((member) => member.role === 'antagonist')
  const extent = input.arena.half - WALL_MARGIN
  // The player must never be aggro-locked at spawn (spec §4.1).
  const spawnKeepout = COMBAT_DEFAULTS.enemy.aggroRadius + SPAWN_AGGRO_MARGIN
  const soft = [...(input.inventory?.items.map((item) => item.position) ?? []), ...input.occupied]
  const posts: Array<{ x: number; z: number }> = []

  const enemies: EnemyDef[] = antagonists.map((member, index) => {
    let post: { x: number; z: number } | null = null
    for (let draw = 0; draw < DRAW_BUDGET && !post; draw += 1) {
      const candidate = {
        x: round2((rng.next() * 2 - 1) * extent),
        z: round2((rng.next() * 2 - 1) * extent)
      }
      if (!far(candidate, input.arena.spawn, spawnKeepout)) continue
      if (!far(candidate, input.arena.goal, KEEPOUT)) continue
      if (!soft.every((point) => far(candidate, point, SEPARATION))) continue
      if (!posts.every((point) => far(candidate, point, SEPARATION))) continue
      post = candidate
    }
    if (!post) throw new Error(`Enemy post placement budget exhausted: enemy ${index + 1}`)
    posts.push(post)
    return { id: `enemy-${index + 1}`, name: member.name, post, ...COMBAT_DEFAULTS.enemy }
  })

  const items = input.inventory?.items ?? []
  const weaponItemId = items.length > 0 ? items[Math.floor(rng.next() * items.length)]!.id : null

  return packConfigSchema.parse({
    player: { ...COMBAT_DEFAULTS.player, maxHealth: playerMaxHealth },
    weapon: { itemId: weaponItemId, damageMultiplier: COMBAT_DEFAULTS.weaponDamageMultiplier },
    enemies
  })
}
```

Add to `src/index.ts`: `export * from './composeSection'`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/pack-combat-ai/tests/composeSection.test.ts`
Expected: PASS. The cramped-arena case is guaranteed to throw by geometry (extent 3 vs spawn keepout 5) — if it doesn't, the keepout logic is wrong; fix the core, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-combat-ai
git commit -m "feat(pack-combat-ai): seeded composeSection with spawn-aggro keepout"
```

---

### Task 7: Browser adapter `pack.ts` + `editorContribution.ts`

**Files:**
- Create: `packages/pack-combat-ai/src/pack.ts`
- Create: `packages/pack-combat-ai/src/editorContribution.ts`
- Modify: `packages/pack-combat-ai/src/index.ts` (add both exports)
- Test: `packages/pack-combat-ai/tests/pack.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5; `GamePack`, `PackRuntimeHandle`, `packCompatibility`, `PackEditorContribution` from `@automata/game-kit`.
- Produces: `combatAiPack: GamePack<CombatPackConfig>` (id `'combat-ai'`, version `'1.0.0'`) and `combatAiEditorContribution: PackEditorContribution`. Used by Task 9's registry.

- [ ] **Step 1: Write the failing tests**

`packages/pack-combat-ai/tests/pack.test.ts` — mirror the harness style of `packages/pack-schedules-relationships/tests/pack.test.ts` (read it first; reuse its host/render/boot helpers verbatim, adapting names). The cases to cover:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { composePacks, createGameHost, packCompatibility, type GamePack } from '@automata/game-kit'
import { combatAiPack } from '../src/pack'
import { combatAiEditorContribution } from '../src/editorContribution'
import type { CombatPackConfig } from '../src/config'

const DT = 1 / 60

const config = (): CombatPackConfig => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [{
    id: 'enemy-1', name: 'Brute', post: { x: 1, z: 0 }, maxHealth: 3, attackDamage: 1,
    attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
  }]
})

interface Booted {
  runtime: ReturnType<ReturnType<typeof composePacks>['boot']>
  render: ReturnType<typeof createNullRenderer>
  host: ReturnType<typeof createGameHost>
  app: HTMLDivElement
}

const boot = (cfg = config()): Booted => {
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  const runtime = composePacks([combatAiPack], { 'combat-ai': cfg }).boot({ host, render: render.port })
  return { runtime, render, host, app }
}

beforeEach(() => { document.body.innerHTML = '' })

describe('combatAiPack', () => {
  it('declares the v2 compatibility contract', () => {
    expect(combatAiPack.compatibility).toEqual({
      requires: [], conflictsWith: [], integratesWith: ['interaction-inventory'],
      stateSlices: { owns: ['combat'], reads: ['inventory'] },
      events: { emits: ['enemyDefeated', 'playerDefeated'], consumes: [] }
    })
  })

  it('boots with an enemy marker, HP hud, and registered combat slice', () => {
    const { render, app, host } = boot()
    expect(render.port.objectCount).toBe(1)
    expect(app.querySelector('.combat-hud')?.textContent).toContain('HP 5/5')
    host.dispose()
  })

  it('defeats an adjacent enemy, removes its marker, and emits enemyDefeated once', () => {
    const { runtime, render, host } = boot()
    // world.playerPosition at the origin is within attackRadius of the post at (1, 0)
    for (let i = 0; i < 120; i += 1) runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    expect(runtime.objectivesComplete()).toBe(true)
    expect(render.port.objectCount).toBe(0)
    host.dispose()
  })

  it('reads the inventory slice for the weapon boost when present', () => {
    // A stub pack owning the 'inventory' slice stands in for the inventory
    // pack — combat must never import it. Boosted damage 2 kills a 3-HP
    // enemy in 2 swings (dead by tick ~32); base damage needs 3 (~tick 62).
    const stubPack: GamePack = {
      id: 'slice-stub', version: '1.0.0',
      compatibility: packCompatibility({ stateSlices: { owns: ['inventory'], reads: [] } }),
      register(ctx) { ctx.state.register('inventory', 'slice-stub', { collected: ['item-1'] }) }
    }
    const app = document.createElement('div')
    document.body.append(app)
    const host = createGameHost(app)
    const render = createNullRenderer()
    const runtime = composePacks([stubPack, combatAiPack], { 'combat-ai': config() })
      .boot({ host, render: render.port })
    for (let i = 0; i < 45; i += 1) runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    expect(runtime.objectivesComplete()).toBe(true)

    const unboosted = boot()
    for (let i = 0; i < 45; i += 1) unboosted.runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    expect(unboosted.runtime.objectivesComplete()).toBe(false)
    host.dispose()
    unboosted.host.dispose()
  })

  it('second-winds in place when enemies win an exchange (HUD drops to 1 then refills)', () => {
    // A 30-HP enemy survives long enough to land the five hits that trigger
    // the second wind; the HUD is the observable for the internal event.
    const cfg = config()
    cfg.enemies = [{ ...cfg.enemies[0]!, maxHealth: 30 }]
    const { runtime, app, host } = boot(cfg)
    let sawDrop = false
    let sawRecovery = false
    for (let i = 0; i < 60 * 10 && !sawRecovery; i += 1) {
      runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
      const text = app.querySelector('.combat-hud')!.textContent ?? ''
      if (text.startsWith('HP 1/5')) sawDrop = true
      if (sawDrop && text.startsWith('HP 5/5')) sawRecovery = true
    }
    expect(sawDrop).toBe(true)
    expect(sawRecovery).toBe(true)
    host.dispose()
  })

  it('save/load round-trips and reconciles markers', () => {
    const { runtime, render, host } = boot()
    for (let i = 0; i < 120; i += 1) runtime.fixedUpdate(DT, { playerPosition: { x: 0, z: 0 } })
    const saved = runtime.saveState()
    const fresh = boot()
    fresh.runtime.loadState(saved)
    expect(fresh.render.port.objectCount).toBe(0)
    expect(fresh.runtime.objectivesComplete()).toBe(true)
    expect(() => fresh.runtime.loadState({ 'combat-ai': { garbage: true } })).toThrow()
    host.dispose(); fresh.host.dispose()
  })
})

describe('combatAiEditorContribution', () => {
  it('has no prefabs and previews posts plus radius markers, disposing cleanly', () => {
    expect(combatAiEditorContribution.prefabs).toEqual([])
    const render = createNullRenderer()
    const preview = combatAiEditorContribution.createPreview!(config(), render.port)
    // 1 post marker + 4 aggro dots + 4 leash dots per enemy
    expect(render.port.objectCount).toBe(9)
    preview.dispose()
    expect(render.port.objectCount).toBe(0)
  })
})
```

The schedules pack's `tests/pack.test.ts` may use different host/boot helper names — read it before writing this file and keep whichever setup idioms it uses (the cases above are complete as logic; only the boot plumbing may need aligning).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/pack-combat-ai/tests/pack.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/pack.ts`**

```ts
import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  COMBAT_SLICE_ID, ENEMY_DEFEATED_EVENT, INVENTORY_SLICE_ID, PLAYER_DEFEATED_EVENT,
  packConfigSchema, type CombatPackConfig, type EnemyDef
} from './config'
import {
  combatSliceValue, createCombatState, deserializeCombatState, enemiesDefeated,
  isWeaponHeld, serializeCombatState, stepCombat, type CombatState
} from './combatCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ENEMY_COLOR = '#ff5470'
const ENEMY_RADIUS = 0.45

/** The fourth standard pack: proximity auto-combat with idle/chase/return enemies. */
export const combatAiPack: GamePack<CombatPackConfig> = {
  id: 'combat-ai',
  version: '1.0.0',
  compatibility: packCompatibility({
    integratesWith: ['interaction-inventory'],
    stateSlices: { owns: [COMBAT_SLICE_ID], reads: [INVENTORY_SLICE_ID] },
    events: { emits: [ENEMY_DEFEATED_EVENT, PLAYER_DEFEATED_EVENT], consumes: [] }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let combat: CombatState = createCombatState(config)
    ctx.state.register(COMBAT_SLICE_ID, combatAiPack.id, combatSliceValue(combat, config))

    const entities = new Map<string, { id: string }>()
    const addEnemyRenderable = (enemy: EnemyDef): void => {
      const entity = { id: `combat-enemy-${enemy.id}` }
      entities.set(enemy.id, entity)
      ctx.render.add(entity, { primitive: 'sphere', radius: ENEMY_RADIUS, color: ENEMY_COLOR })
      ctx.render.setPose(entity, { x: enemy.post.x, y: ENEMY_RADIUS, z: enemy.post.z }, IDENTITY)
    }
    for (const enemy of config.enemies) addEnemyRenderable(enemy)

    const hud = document.createElement('div')
    hud.className = 'combat-hud'
    ctx.host.overlays.append(hud)
    const updateHud = (): void => {
      const downed = config.enemies.filter((enemy) => combat.enemies[enemy.id]!.hp <= 0).length
      hud.textContent = `HP ${combat.player.hp}/${config.player.maxHealth} · foes ${downed}/${config.enemies.length}`
    }
    updateHud()

    const renderEnemies = (): void => {
      for (const enemy of config.enemies) {
        const entity = entities.get(enemy.id)
        if (!entity) continue
        const position = combat.enemies[enemy.id]!.ai.position
        ctx.render.setPose(entity, { x: position.x, y: ENEMY_RADIUS, z: position.z }, IDENTITY)
      }
    }

    /** Reconcile markers to the state (defeat and load), publish, refresh HUD. */
    const applyState = (next: CombatState): void => {
      combat = next
      for (const enemy of config.enemies) {
        const alive = combat.enemies[enemy.id]!.hp > 0
        const entity = entities.get(enemy.id)
        if (!alive && entity) { ctx.render.remove(entity); entities.delete(enemy.id) }
        else if (alive && !entity) addEnemyRenderable(enemy)
      }
      ctx.state.set(COMBAT_SLICE_ID, combatAiPack.id, combatSliceValue(combat, config))
      renderEnemies()
      updateHud()
    }

    return {
      fixedUpdate(dt, world) {
        const collected = ctx.state.has(INVENTORY_SLICE_ID)
          ? ((ctx.state.get(INVENTORY_SLICE_ID) as { collected?: readonly string[] }).collected ?? [])
          : []
        const result = stepCombat(combat, world.playerPosition, config, dt, isWeaponHeld(config, collected))
        applyState(result.state)
        for (const enemyId of result.defeatedEnemyIds) {
          ctx.events.emit(ENEMY_DEFEATED_EVENT, { packId: combatAiPack.id, enemyId })
        }
        if (result.playerDefeated) {
          ctx.events.emit(PLAYER_DEFEATED_EVENT, { packId: combatAiPack.id })
        }
      },
      objectivesComplete: () => enemiesDefeated(combat, config),
      saveState: () => serializeCombatState(combat),
      loadState(raw) { applyState(deserializeCombatState(raw, config)) },
      dispose() {
        for (const entity of entities.values()) ctx.render.remove(entity)
        entities.clear()
        hud.remove()
      }
    }
  }
}
```

`src/editorContribution.ts`:

```ts
import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ENEMY_COLOR = '#ff5470'
const ENEMY_RADIUS = 0.45
const AGGRO_DOT = { radius: 0.12, color: '#ff5470' }
const LEASH_DOT = { radius: 0.08, color: '#ff9db0' }

/**
 * Thin editor preview: enemy posts plus four compass dots on each aggro and
 * leash circle. The empty prefab set is deliberate: enemies are
 * composition-owned, not scenes.
 */
export const combatAiEditorContribution: PackEditorContribution = {
  packId: 'combat-ai',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities: Array<{ id: string }> = []
    const dot = (id: string, x: number, z: number, spec: { radius: number; color: string }): void => {
      const entity = { id }
      entities.push(entity)
      render.add(entity, { primitive: 'sphere', radius: spec.radius, color: spec.color })
      render.setPose(entity, { x, y: spec.radius, z }, IDENTITY)
    }
    for (const enemy of parsed.enemies) {
      dot(`preview-combat-enemy-${enemy.id}`, enemy.post.x, enemy.post.z, { radius: ENEMY_RADIUS, color: ENEMY_COLOR })
      const compass = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
      compass.forEach(([dx, dz], index) => {
        dot(`preview-combat-aggro-${enemy.id}-${index}`,
          enemy.post.x + dx * enemy.aggroRadius, enemy.post.z + dz * enemy.aggroRadius, AGGRO_DOT)
        dot(`preview-combat-leash-${enemy.id}-${index}`,
          enemy.post.x + dx * enemy.leashRadius, enemy.post.z + dz * enemy.leashRadius, LEASH_DOT)
      })
    }
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
```

Add to `src/index.ts`:

```ts
export * from './pack'
export * from './editorContribution'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/pack-combat-ai/tests/pack.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-combat-ai
git commit -m "feat(pack-combat-ai): browser adapter with combat slice, HUD, editor preview"
```

---

### Task 8: `evalHook.ts` + weapon-boost parity test

**Files:**
- Create: `packages/pack-combat-ai/src/evalHook.ts`
- Modify: `packages/pack-combat-ai/src/index.ts` (add `export * from './evalHook'`)
- Test: `packages/pack-combat-ai/tests/evalHook.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 5; `PackEvalHook`, `EvalSliceView` from `@automata/game-kit`.
- Produces: `createCombatAiEvalHook(config: CombatPackConfig): PackEvalHook` and `EVAL_TICK_DT = 1 / 60`. Used by Task 9's `EVAL_HOOK_BUILDERS`.

- [ ] **Step 1: Write the failing tests**

`packages/pack-combat-ai/tests/evalHook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EVAL_TICK_DT, createCombatAiEvalHook } from '../src/evalHook'
import { createCombatState, isWeaponHeld, stepCombat } from '../src/combatCore'
import type { CombatPackConfig } from '../src/config'

const config = (): CombatPackConfig => ({
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  weapon: { itemId: 'item-1', damageMultiplier: 2 },
  enemies: [{
    id: 'enemy-1', name: 'Brute', post: { x: 6, z: 0 }, maxHealth: 3, attackDamage: 1,
    attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7
  }]
})

describe('combat-ai eval hook', () => {
  it('targets the nearest alive enemy at its current position, null when all are down', () => {
    const hook = createCombatAiEvalHook(config())
    let state = hook.createState()
    expect(hook.nextTarget(state, { x: 0, z: 0 })).toEqual({ x: 6, z: 0 })
    for (let i = 0; i < 240; i += 1) state = hook.step(state, { x: 6, z: 0 }, {})
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, { x: 0, z: 0 })).toBeNull()
  })

  it('completes headlessly by walking onto the enemy, without the inventory slice', () => {
    const hook = createCombatAiEvalHook(config())
    let state = hook.createState()
    for (let i = 0; i < 400 && !hook.complete(state); i += 1) {
      state = hook.step(state, { x: 6, z: 0 }, undefined)
    }
    expect(hook.complete(state)).toBe(true)
  })

  it('publishes the combat slice in the runtime shape', () => {
    const hook = createCombatAiEvalHook(config())
    expect(hook.publishSlices!(hook.createState())).toEqual({
      combat: { playerHp: 5, invulnSeconds: 0, enemies: { 'enemy-1': { hp: 3, mode: 'idle' } } }
    })
  })

  it('weapon-boost parity: eval slice view and runtime slice read produce identical combat state', () => {
    const cfg = config()
    const slices = { inventory: { collected: ['item-1'] } }
    // Eval path
    const hook = createCombatAiEvalHook(cfg)
    let evalState = hook.createState()
    for (let i = 0; i < 90; i += 1) evalState = hook.step(evalState, { x: 6, z: 0 }, slices)
    // Runtime path: same core, same weapon-held computation the adapter uses
    let runtimeState = createCombatState(cfg)
    const held = isWeaponHeld(cfg, slices.inventory.collected)
    for (let i = 0; i < 90; i += 1) {
      runtimeState = stepCombat(runtimeState, { x: 6, z: 0 }, cfg, EVAL_TICK_DT, held).state
    }
    expect((evalState as { combat: unknown }).combat).toEqual(runtimeState)
  })

  it('boosted headless run defeats the enemy in fewer ticks than unboosted', () => {
    const run = (slices?: Record<string, unknown>): number => {
      const hook = createCombatAiEvalHook(config())
      let state = hook.createState()
      for (let i = 1; i <= 400; i += 1) {
        state = hook.step(state, { x: 6, z: 0 }, slices)
        if (hook.complete(state)) return i
      }
      return Infinity
    }
    expect(run({ inventory: { collected: ['item-1'] } })).toBeLessThan(run(undefined))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/pack-combat-ai/tests/evalHook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/evalHook.ts`**

```ts
import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import { COMBAT_SLICE_ID, INVENTORY_SLICE_ID, type CombatPackConfig } from './config'
import {
  combatSliceValue, createCombatState, enemiesDefeated, isWeaponHeld, stepCombat,
  type CombatState
} from './combatCore'

/** One harness tick equals one fixed simulation step for the headless combat twin. */
export const EVAL_TICK_DT = 1 / 60

interface EvalState { combat: CombatState }

const collectedView = (slices?: EvalSliceView): readonly string[] =>
  ((slices?.[INVENTORY_SLICE_ID] as { collected?: readonly string[] } | undefined)?.collected) ?? []

/**
 * Headless twin. The weapon boost reads the inventory slice from the eval
 * slice view exactly as the runtime reads the slice registry — graceful when
 * absent. Chasing a chaser converges: both close distance monotonically.
 */
export function createCombatAiEvalHook(config: CombatPackConfig): PackEvalHook {
  return {
    packId: 'combat-ai',
    createState: (): EvalState => ({ combat: createCombatState(config) }),
    nextTarget(state, player) {
      const combat = (state as EvalState).combat
      let best: { x: number; z: number } | null = null
      let bestDist = Infinity
      for (const enemy of config.enemies) {
        const entry = combat.enemies[enemy.id]!
        if (entry.hp <= 0) continue
        const dist = Math.hypot(entry.ai.position.x - player.x, entry.ai.position.z - player.z)
        if (dist < bestDist) { bestDist = dist; best = entry.ai.position }
      }
      return best ? { ...best } : null
    },
    step(state, player, slices) {
      const combat = (state as EvalState).combat
      const held = isWeaponHeld(config, collectedView(slices))
      return { combat: stepCombat(combat, player, config, EVAL_TICK_DT, held).state } satisfies EvalState
    },
    complete: (state) => enemiesDefeated((state as EvalState).combat, config),
    publishSlices: (state) => ({ [COMBAT_SLICE_ID]: combatSliceValue((state as EvalState).combat, config) })
  }
}
```

Add to `src/index.ts`: `export * from './evalHook'`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/pack-combat-ai/tests/evalHook.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole package suite**

Run: `npx vitest run packages/pack-combat-ai`
Expected: PASS (config, healthCore, enemyAiCore, combatCore, composeSection, pack, evalHook).

- [ ] **Step 6: Commit**

```bash
git add packages/pack-combat-ai
git commit -m "feat(pack-combat-ai): headless eval hook with weapon-boost parity"
```

---

### Task 9: Registry registration + matrix pair and scenario rows

**Files:**
- Modify: `packages/pack-registry/src/index.ts`
- Modify: `packages/pack-registry/package.json` (add `"@automata/pack-combat-ai": "*"` to dependencies)
- Modify: `packages/pack-registry/tests/registry.test.ts`
- Modify: `packages/pack-registry/tests/compositionMatrix.test.ts`

**Interfaces:**
- Consumes: `combatAiPack`, `combatAiEditorContribution`, `composeCombatSection`, `createCombatAiEvalHook`, `packConfigSchema` from `@automata/pack-combat-ai`.
- Produces: `STANDARD_PACKS['combat-ai']`, `PACK_FIXTURES['combat-ai']`, eval-hook and editor-contribution entries; matrix now runs the `combat-ai` single, the `interaction-inventory+combat-ai` pair, and two new scenario rows.

- [ ] **Step 1: Write the failing tests**

In `packages/pack-registry/tests/registry.test.ts`, update the exact-set test and add a combat registration test:

```ts
  it('exposes exactly the packs that exist (four, as of Phase 4 cycle 4)', () => {
    expect(Object.keys(STANDARD_PACKS)).toEqual([
      'interaction-inventory', 'dialogue-quests', 'schedules-relationships', 'combat-ai'
    ])
  })

  it('registers combat-ai with a deterministic fixture whose weapon references the inventory fixture', () => {
    const fixture = PACK_FIXTURES['combat-ai']!() as { weapon: { itemId: string | null }; enemies: unknown[] }
    expect(PACK_FIXTURES['combat-ai']!()).toEqual(fixture)
    expect(fixture.enemies.length).toBeGreaterThan(0)
    const inventoryItems = (PACK_FIXTURES['interaction-inventory']!() as { items: Array<{ id: string }> })
      .items.map((item) => item.id)
    expect(inventoryItems).toContain(fixture.weapon.itemId)
    const probe = {
      formatVersion: 1 as const, gameId: 'registry-test', source: null,
      packs: [{ id: 'combat-ai', version: '1.0.0', config: fixture as unknown as Record<string, unknown> }],
      assets: []
    }
    expect(resolveEvalHooks(probe)).toHaveLength(1)
    expect(resolveEditorContributions(probe)).toHaveLength(1)
  })
```

In `packages/pack-registry/tests/compositionMatrix.test.ts`, extend `SCENARIOS`:

```ts
  const SCENARIOS: ReadonlyArray<readonly string[]> = [
    ['interaction-inventory', 'dialogue-quests', 'schedules-relationships'],
    // combat-ai standalone: proves graceful degradation (weapon never held)
    ['combat-ai'],
    // the full 4-pack set — the phase's largest composition to date
    ['interaction-inventory', 'dialogue-quests', 'schedules-relationships', 'combat-ai']
  ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/pack-registry`
Expected: FAIL — `combat-ai` missing from `STANDARD_PACKS` / fixtures.

- [ ] **Step 3: Register the pack**

In `packages/pack-registry/package.json` dependencies add:

```json
    "@automata/pack-combat-ai": "*",
```

then run `npm install`. In `packages/pack-registry/src/index.ts` add the import:

```ts
import {
  combatAiEditorContribution, combatAiPack, composeCombatSection,
  createCombatAiEvalHook, packConfigSchema as combatConfigSchema
} from '@automata/pack-combat-ai'
```

Add to `STANDARD_PACKS` (after schedules):

```ts
  [combatAiPack.id]: combatAiPack as GamePack
```

Add the fixture after the schedules fixture block:

```ts
PACK_FIXTURES[combatAiPack.id] = () => composeCombatSection({
  specConfig: {},
  cast: [
    { id: 'c-brute', name: 'Brute', role: 'antagonist' },
    { id: 'c-stalker', name: 'Stalker', role: 'antagonist' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: {
    items: (PACK_FIXTURES[interactionInventoryPack.id]!() as {
      items: Array<{ id: string; position: { x: number; z: number } }>
    }).items
  },
  occupied: []
}, createSeededRng(44))
```

Add to `EVAL_HOOK_BUILDERS`:

```ts
  [combatAiPack.id]: (config) => createCombatAiEvalHook(combatConfigSchema.parse(config))
```

Add to `EDITOR_CONTRIBUTIONS`:

```ts
  [combatAiEditorContribution.packId]: combatAiEditorContribution
```

- [ ] **Step 4: Run the registry suite**

Run: `npx vitest run packages/pack-registry`
Expected: PASS — including the automatic new rows: the `combat-ai` single (satisfiable, `requires: []`) and the `interaction-inventory+combat-ai` pair, plus both new scenarios. If `driveToCompletion` hits `maxSteps`, diagnose with the combat fixture distances (spawn `(-8,-8)`, stride 0.5/tick) before touching the harness — the walk policy must stay untouched (spec §4.2).

- [ ] **Step 5: Commit**

```bash
git add packages/pack-registry package-lock.json
git commit -m "feat(pack-registry): register combat-ai; matrix pair + solo and 4-pack scenarios"
```

---

### Task 10: `composeGame` integration, gates, ROADMAP

**Files:**
- Modify: `packages/game-compose/src/compose.ts`
- Modify: `packages/game-compose/package.json` (add `"@automata/pack-combat-ai": "*"`)
- Modify: `packages/game-compose/tests/compose.test.ts`
- Modify: `docs/ROADMAP.md` (Phase 4 cycle 4 status)

**Interfaces:**
- Consumes: `combatAiPack`, `composeCombatSection` from `@automata/pack-combat-ai`; existing `packConfig` (inventory section), `dialogueConfig`, and the schedules config inside `composeGame`.
- Produces: `composeGame` supports specs selecting `combat-ai` (ordered last, after schedules); unsupported-capability message now names cycle 4.

- [ ] **Step 1: Write the failing tests**

In `packages/game-compose/tests/compose.test.ts`:

1. The test `'still rejects capabilities without a composed pack'` currently uses `combat-ai` as its unsupported example — repoint it to `'economy-progression'` (same shape, new id).
2. Add after the schedules-section test:

```ts
  it('composes the combat section with cast-derived enemies and a weapon from the inventory section', async () => {
    const spec = specWithCapabilities([
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'combat-ai', config: {}, requirements: [] }
    ])
    // ensure at least one antagonist is in the cast for this spec fixture
    const withAntagonist = {
      ...spec,
      cast: [...spec.cast, { id: 'c-raider', name: 'Raider', role: 'antagonist' as const, description: 'A prowling raider.' }]
    }
    const result = await composeGame({ spec: withAntagonist as GameSpec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.composition.packs.map((entry) => entry.id)).toEqual(['interaction-inventory', 'combat-ai'])
    const combat = result.composition.packs[1]!.config as {
      weapon: { itemId: string | null }
      enemies: Array<{ id: string; name: string }>
    }
    const itemIds = (result.composition.packs[0]!.config as { items: Array<{ id: string }> }).items.map((item) => item.id)
    expect(itemIds).toContain(combat.weapon.itemId)
    expect(combat.enemies.map((enemy) => enemy.name)).toContain('Raider')
  })

  it('combat composes to zero enemies when the cast has no antagonists', async () => {
    const spec = specWithCapabilities([
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'combat-ai', config: {}, requirements: [] }
    ])
    const result = await composeGame({ spec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.composition.packs[1]!.config as { enemies: unknown[] }).enemies).toEqual([])
  })
```

(Adjust the `cast` construction to the actual `specWithCapabilities` helper shape in the file — read it first; character objects need every field its schema requires. If the fixture cast already contains an antagonist, filter antagonists out of the cast in the zero-enemies test instead of relying on the default.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-compose/tests/compose.test.ts`
Expected: FAIL — `combat-ai` is rejected as unsupported.

- [ ] **Step 3: Extend `composeGame`**

In `packages/game-compose/package.json` dependencies add `"@automata/pack-combat-ai": "*",` then `npm install`.

In `packages/game-compose/src/compose.ts`:

1. Import: `import { combatAiPack, composeCombatSection } from '@automata/pack-combat-ai'`
2. Add `combatAiPack.id` to the `supported` set and update the issue message to `Phase 4 cycle 4 composes only [...]`.
3. Add `const wantsCombat = spec.capabilities.some((entry) => entry.id === combatAiPack.id)` and extend the `selectedPacks` flatMap with `if (entry.id === combatAiPack.id) return [combatAiPack]`.
4. Hoist the schedules config so combat can see it: change the `wantsSchedules` block to assign `schedulesConfig` declared as `let schedulesConfig: ReturnType<typeof composeSchedulesSection> | undefined` before the block (mirror of `dialogueConfig`).
5. After the schedules block append:

```ts
  if (wantsCombat) {
    const combatSelection = spec.capabilities.find((entry) => entry.id === combatAiPack.id)!
    const combatConfig = composeCombatSection({
      specConfig: combatSelection.config as { playerMaxHealth?: number },
      cast: spec.cast,
      arena: { half: ARENA.half, spawn: ARENA.spawn, goal },
      inventory: { items: packConfig.items },
      occupied: [
        ...(dialogueConfig?.npcs.map((npc) => npc.position) ?? []),
        ...(schedulesConfig?.walkers.flatMap((walker) => walker.stations) ?? [])
      ]
    }, rng)
    packs.push({
      id: combatAiPack.id,
      version: combatAiPack.version,
      config: combatConfig as unknown as Record<string, unknown>
    })
  }
```

- [ ] **Step 4: Run the game-compose suite (snapshots prove first-light frozen)**

Run: `npx vitest run packages/game-compose`
Expected: PASS with **no snapshot changes** — specs that do not select combat must compose bit-identically (the combat block draws from `rng` only when `wantsCombat`).

- [ ] **Step 5: Full gates**

Run: `npm run ci`
Expected: lint, typecheck, and all workspace tests PASS.

Run: `npm run verify:new-game`
Expected: PASS (script completes without error).

Run: `git status --porcelain games/first-light`
Expected: empty output (first-light untouched).

- [ ] **Step 6: Update the roadmap**

In `docs/ROADMAP.md` Phase 4 cycles list, change cycle 4's line to `Shipped` with today's date and this plan's path, and set cycle 5 to `Next`:

```markdown
  - Cycle 4 — combat & enemy AI pack — `Shipped` (2026-07-17, plan:
    [`2026-07-17-phase-4-cycle-4-combat-ai.md`](superpowers/plans/active/2026-07/week-29/2026-07-17-phase-4-cycle-4-combat-ai.md)).
  - Cycle 5 — economy, shops & progression pack — `Next`.
```

(Match the exact link style of the cycle 2/3 lines above it; adjust the date if shipping lands on a later day.)

- [ ] **Step 7: Commit**

```bash
git add packages/game-compose package-lock.json docs/ROADMAP.md
git commit -m "feat(game-compose): compose combat-ai sections; cycle 4 shipped"
```

---

## Capability-gap log (spec §7)

While implementing, record in the escape-hatch/capability-gap log (wherever cycles 2–3 recorded theirs — search `docs/` for "capability gap"): **pack-initiated player teleport** — real respawn-at-spawn needs an additive world-effect seam in game-kit and the eval harness; second wind is the interim answer.

## Verification checklist (all must be true before calling the cycle done)

- [ ] `npx vitest run packages/pack-combat-ai` — all green
- [ ] `npx vitest run packages/pack-registry` — matrix runs the combat single, the inventory+combat pair, and the two new scenarios
- [ ] `npx vitest run packages/game-compose` — no snapshot diffs for non-combat specs
- [ ] `npm run ci` green; `npm run verify:new-game` green
- [ ] `git status --porcelain games/first-light` empty
- [ ] ROADMAP cycle 4 marked shipped; capability gap logged
