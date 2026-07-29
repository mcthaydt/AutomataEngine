import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import {
  composePacks,
  createGameHost,
  createPackEventBus,
  type PackEvalHook
} from '@automata/game-kit'
import {
  PACK_FIXTURES,
  STANDARD_PACKS,
  resolveEvalHooks
} from '../src/index'

const SET = ['interaction-inventory', 'economy-progression'] as const

const composition = () => ({
  formatVersion: 1 as const,
  gameId: 'parity',
  source: null,
  packs: SET.map((id) => ({
    id,
    version: STANDARD_PACKS[id]!.version,
    config: PACK_FIXTURES[id]!() as Record<string, unknown>
  })),
  assets: []
})

interface ParityResult {
  collected: string[]
  totalEarned: number
}

/**
 * Drive the eval twin to completion and retain its player path so the browser
 * twin receives identical fixed-step positions.
 */
function runEval(): {
  result: ParityResult
  path: Array<{ x: number; z: number }>
} {
  const hooks = resolveEvalHooks(composition())
  const states = new Map(
    hooks.map((hook) => [hook.packId, hook.createState()])
  )
  const bus = createPackEventBus()
  for (const hook of hooks) {
    hook.connect?.(bus, {
      get: () => states.get(hook.packId),
      set: (state) => states.set(hook.packId, state)
    })
  }
  const emit = (name: string, payload: unknown): void =>
    bus.emit(name, payload)
  const player = { x: -8, z: -8 }
  const path: Array<{ x: number; z: number }> = []

  for (let tick = 0; tick < 4000; tick += 1) {
    const slices: Record<string, unknown> = {}
    for (const hook of hooks) {
      Object.assign(
        slices,
        hook.publishSlices?.(states.get(hook.packId)) ?? {}
      )
    }
    const incomplete = hooks.filter(
      (hook) => !hook.complete(states.get(hook.packId))
    )
    if (incomplete.length === 0) break

    for (const hook of incomplete) {
      const target = hook.nextTarget(
        states.get(hook.packId),
        player,
        slices
      )
      if (!target) continue
      const dx = target.x - player.x
      const dz = target.z - player.z
      const distance = Math.hypot(dx, dz)
      const stride = Math.min(0.5, distance)
      if (distance > 0) {
        player.x += (dx / distance) * stride
        player.z += (dz / distance) * stride
      }
      break
    }
    path.push({ ...player })
    for (const hook of hooks) {
      states.set(
        hook.packId,
        hook.step(states.get(hook.packId), player, slices, emit)
      )
    }
  }

  const inventory = states.get('interaction-inventory') as {
    collected: string[]
  }
  const economy = (
    hooks.find(
      (hook) => hook.packId === 'economy-progression'
    ) as PackEvalHook
  ).publishSlices!(states.get('economy-progression')) as {
    wallet: { totalEarned: number }
  }
  return {
    result: {
      collected: [...inventory.collected].sort(),
      totalEarned: economy.wallet.totalEarned
    },
    path
  }
}

/** Replay the eval path through the real runtime event bus and slice registry. */
function runRuntime(
  path: ReadonlyArray<{ x: number; z: number }>
): ParityResult {
  const manifest = composition()
  const configs = Object.fromEntries(
    manifest.packs.map((entry) => [entry.id, entry.config])
  )
  const app = document.createElement('div')
  document.body.append(app)
  const host = createGameHost(app)
  const render = createNullRenderer()

  try {
    const runtime = composePacks(
      SET.map((id) => STANDARD_PACKS[id]!),
      configs
    ).boot({ host, render: render.port })
    for (const playerPosition of path) {
      runtime.fixedUpdate(1 / 60, { playerPosition })
    }
    const state = runtime.saveState()
    const inventory = state['interaction-inventory'] as {
      collected: string[]
    }
    const economy = state['economy-progression'] as {
      wallet: { totalEarned: number }
    }
    return {
      collected: [...inventory.collected].sort(),
      totalEarned: economy.wallet.totalEarned
    }
  } finally {
    host.dispose()
    app.remove()
  }
}

describe('economy and inventory parity', () => {
  it('the eval twin grants purchased catalog IDs into inventory', () => {
    const { result } = runEval()
    const catalog = (PACK_FIXTURES['economy-progression']!() as {
      shops: Array<{ stock: Array<{ itemId: string }> }>
    }).shops.flatMap((shop) =>
      shop.stock.map((entry) => entry.itemId)
    )
    expect(catalog.length).toBeGreaterThan(0)
    for (const itemId of catalog) {
      expect(result.collected).toContain(itemId)
    }
  })

  it('runtime slice/event flow agrees with the eval event-bus path', () => {
    const { result, path } = runEval()
    expect(runRuntime(path)).toEqual(result)
  })
})
