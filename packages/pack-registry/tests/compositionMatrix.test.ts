import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import {
  composePacks, createGameHost, validatePackSet, PackCompositionError,
  type GamePack, type PackEvalHook
} from '@automata/game-kit'
import { PACK_FIXTURES, STANDARD_PACKS, resolveEvalHooks } from '../src/index'

/**
 * The composition-matrix harness (Phase 4 umbrella §4): every declared-
 * compatible single and pair of standard packs must (a) compose, (b) boot
 * against a null renderer, and (c) complete headlessly via its eval hooks.
 * Declared conflicts must fail with PackCompositionError. Each pack cycle
 * adds its pack to the registry tables and this matrix widens automatically.
 */
const packs = Object.values(STANDARD_PACKS)
const ids = new Set(Object.keys(STANDARD_PACKS))

const satisfiable = (set: GamePack[]): boolean => {
  const setIds = new Set(set.map((pack) => pack.id))
  return set.every((pack) => pack.compatibility.requires.every((id) => setIds.has(id)))
}
const conflicting = (set: GamePack[]): boolean =>
  validatePackSet(set).some((issue) => issue.code === 'pack-conflict')

const singles = packs.filter((pack) => satisfiable([pack])).map((pack) => [pack] as GamePack[])
const pairs: GamePack[][] = []
const conflicts: GamePack[][] = []
for (let i = 0; i < packs.length; i += 1) {
  for (let j = i + 1; j < packs.length; j += 1) {
    const set = [packs[i]!, packs[j]!]
    if (conflicting(set)) conflicts.push(set)
    else if (satisfiable(set)) pairs.push(set)
  }
}

const fixtureComposition = (set: GamePack[]) => ({
  formatVersion: 1 as const,
  gameId: 'matrix-fixture',
  source: null,
  packs: set.map((pack) => ({ id: pack.id, version: pack.version, config: PACK_FIXTURES[pack.id]!() as Record<string, unknown> })),
  assets: []
})

/** Seek the first incomplete hook with a target; null means blocked and yields to another pack. */
function driveToCompletion(hooks: PackEvalHook[], maxSteps = 2000): boolean {
  const states = new Map(hooks.map((hook) => [hook.packId, hook.createState()]))
  const player = { x: -8, z: -8 }
  for (let step = 0; step < maxSteps; step += 1) {
    const slices: Record<string, unknown> = {}
    for (const hook of hooks) Object.assign(slices, hook.publishSlices?.(states.get(hook.packId)) ?? {})
    const incomplete = hooks.filter((hook) => !hook.complete(states.get(hook.packId)))
    if (incomplete.length === 0) return true
    for (const hook of incomplete) {
      const target = hook.nextTarget(states.get(hook.packId), player, slices)
      if (!target) continue
      const dx = target.x - player.x
      const dz = target.z - player.z
      const dist = Math.hypot(dx, dz)
      const stride = Math.min(0.5, dist)
      if (dist > 0) { player.x += (dx / dist) * stride; player.z += (dz / dist) * stride }
      break
    }
    for (const hook of hooks) states.set(hook.packId, hook.step(states.get(hook.packId), player, slices))
  }
  return hooks.every((hook) => hook.complete(states.get(hook.packId)))
}

/** Compose, boot, and headlessly complete one pack set. */
function runSet(set: GamePack[]): void {
  const label = set.map((pack) => pack.id).join('+')
  const composition = fixtureComposition(set)
  const configs = Object.fromEntries(composition.packs.map((entry) => [entry.id, entry.config]))
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()
  try {
    const runtime = composePacks(set, configs).boot({ host, render: render.port })
    expect(runtime.packIds, label).toEqual(set.map((pack) => pack.id))
    expect(driveToCompletion(resolveEvalHooks(composition)), label).toBe(true)
  } finally {
    host.dispose()
    app.remove()
  }
  expect(render.port.objectCount, label).toBe(0)
}

describe('composition matrix (standard packs)', () => {
  /** Named 3+-pack scenario suites: same compose/boot/headless machinery as pairs. */
  const SCENARIOS: ReadonlyArray<readonly string[]> = [
    ['interaction-inventory', 'dialogue-quests', 'schedules-relationships']
  ]

  it('every standard pack has a deterministic fixture', () => {
    expect(Object.keys(PACK_FIXTURES).sort()).toEqual([...ids].sort())
  })

  it('every requires-satisfiable single composes, boots, and completes headlessly', () => {
    expect(singles.length).toBeGreaterThan(0)
    for (const set of singles) runSet(set)
  })

  it('tears down each matrix boot after evaluation', () => {
    const initialChildCount = document.body.childElementCount
    for (const set of singles) runSet(set)
    expect(document.body.childElementCount).toBe(initialChildCount)
  })

  // Vacuous until a second pack lands; the loops ARE the harness — each pack
  // cycle only adds registry entries and this matrix widens automatically.
  it('every declared-compatible pair composes, boots, and completes headlessly', () => {
    for (const set of pairs) runSet(set)
  })

  it('every scenario composes, boots, and completes headlessly', () => {
    for (const scenario of SCENARIOS) {
      const set = scenario.map((id) => {
        const pack = STANDARD_PACKS[id]
        if (!pack) throw new Error(`Scenario references unknown pack "${id}"`)
        return pack
      })
      runSet(set)
    }
  })

  it('every declared conflict fails with PackCompositionError', () => {
    for (const set of conflicts) {
      expect(() => composePacks(set), set.map((pack) => pack.id).join('+')).toThrow(PackCompositionError)
    }
  })
})
