import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost } from '../src/host'
import {
  composePacks, packCompatibility, PackCompositionError, validatePackSet,
  type GamePack, type PackBootBase, type PackRuntimeHandle
} from '../src/packs'

function base(): PackBootBase {
  const app = document.createElement('div')
  document.body.append(app)
  return { host: createGameHost(app), render: createNullRenderer().port }
}

const makePack = (id: string, overrides: Partial<GamePack> = {}): GamePack => ({
  id, version: '1.0.0', compatibility: packCompatibility(), register: () => {}, ...overrides
})

describe('validatePackSet (pack contract v2)', () => {
  it('accepts a self-consistent set with no issues', () => {
    expect(validatePackSet([makePack('a'), makePack('b')])).toEqual([])
  })

  it('flags duplicate pack ids as errors', () => {
    const issues = validatePackSet([makePack('a'), makePack('a')])
    expect(issues).toEqual([expect.objectContaining({ severity: 'error', code: 'pack-duplicate-id', packId: 'a' })])
  })

  it('flags unmet requires and present conflicts as errors', () => {
    const needsB = makePack('a', { compatibility: packCompatibility({ requires: ['b'] }) })
    const hatesC = makePack('d', { compatibility: packCompatibility({ conflictsWith: ['c'] }) })
    expect(validatePackSet([needsB])).toEqual([
      expect.objectContaining({ severity: 'error', code: 'pack-missing-requirement', packId: 'a' })
    ])
    expect(validatePackSet([hatesC, makePack('c')])).toEqual([
      expect.objectContaining({ severity: 'error', code: 'pack-conflict', packId: 'd' })
    ])
  })

  it('flags duplicate slice ownership as an error', () => {
    const a = makePack('a', { compatibility: packCompatibility({ stateSlices: { owns: ['inventory'], reads: [] } }) })
    const b = makePack('b', { compatibility: packCompatibility({ stateSlices: { owns: ['inventory'], reads: [] } }) })
    expect(validatePackSet([a, b])).toEqual([
      expect.objectContaining({ severity: 'error', code: 'pack-duplicate-slice-owner', packId: 'b' })
    ])
  })

  it('flags consumed events nobody emits as warnings', () => {
    const consumer = makePack('a', { compatibility: packCompatibility({ events: { emits: [], consumes: ['itemAcquired'] } }) })
    expect(validatePackSet([consumer])).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'pack-event-unproduced', packId: 'a' })
    ])
    const emitter = makePack('b', { compatibility: packCompatibility({ events: { emits: ['itemAcquired'], consumes: [] } }) })
    expect(validatePackSet([consumer, emitter])).toEqual([])
  })
})

describe('composePacks (pack contract v2)', () => {
  it('throws PackCompositionError carrying error-severity issues', () => {
    const pack = makePack('a')
    try {
      composePacks([pack, { ...pack }])
      throw new Error('expected composePacks to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(PackCompositionError)
      expect((error as PackCompositionError).issues[0]!.code).toBe('pack-duplicate-id')
    }
  })

  it('composes despite warning-severity issues', () => {
    const consumer = makePack('a', { compatibility: packCompatibility({ events: { emits: [], consumes: ['x'] } }) })
    expect(() => composePacks([consumer])).not.toThrow()
  })

  it('boots in declaration order, parses configs, and returns an aggregated runtime', () => {
    const calls: string[] = []
    const make = (id: string, complete: boolean): GamePack<{ tag: string }> => ({
      id, version: '1.0.0', compatibility: packCompatibility(),
      configSchema: { parse: (input) => { calls.push(`parse:${id}`); return input as { tag: string } } },
      register(_ctx, config): PackRuntimeHandle {
        calls.push(`register:${id}:${config.tag}`)
        return {
          fixedUpdate: (dt) => calls.push(`fixed:${id}:${dt}`),
          render: (alpha) => calls.push(`render:${id}:${alpha}`),
          objectivesComplete: () => complete
        }
      }
    })
    const runtime = composePacks([make('a', true), make('b', false)], { a: { tag: 'x' }, b: { tag: 'y' } }).boot(base())
    expect(runtime.packIds).toEqual(['a', 'b'])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 0, z: 0 } })
    runtime.render(0.5)
    expect(calls).toEqual([
      'parse:a', 'register:a:x', 'parse:b', 'register:b:y',
      'fixed:a:0.016', 'fixed:b:0.016', 'render:a:0.5', 'render:b:0.5'
    ])
    expect(runtime.objectivesComplete()).toBe(false)
  })

  it('gives every pack the same event bus and state registry', () => {
    const seen: unknown[] = []
    const owner = makePack('a', {
      register: (ctx) => {
        ctx.state.register('inventory', 'a', { collected: ['item-1'] })
        ctx.events.on('ping', (payload) => seen.push(payload))
        return {}
      }
    })
    const reader = makePack('b', {
      register: (ctx) => {
        seen.push(ctx.state.get('inventory'))
        ctx.events.emit('ping', 'from-b')
        return {}
      }
    })
    composePacks([owner, reader]).boot(base())
    expect(seen).toEqual([{ collected: ['item-1'] }, 'from-b'])
  })

  it('aggregates saveState/loadState by pack id, skipping packs without the slot', () => {
    let loaded: unknown = null
    const saver = makePack('a', {
      register: () => ({ saveState: () => ({ collected: ['item-1'] }), loadState: (state) => { loaded = state } })
    })
    const plain = makePack('b', { register: () => ({}) })
    const runtime = composePacks([saver, plain]).boot(base())
    expect(runtime.saveState()).toEqual({ a: { collected: ['item-1'] } })
    runtime.loadState({ a: { collected: ['item-2'] }, ignored: true })
    expect(loaded).toEqual({ collected: ['item-2'] })
  })

  it('treats packs without a gate as vacuously complete and defers dispose onto the host stack', () => {
    let disposed = 0
    const pack = makePack('a', { register: () => ({ dispose: () => { disposed += 1 } }) })
    const ctx = base()
    const runtime = composePacks([pack]).boot(ctx)
    expect(runtime.objectivesComplete()).toBe(true)
    ctx.host.dispose()
    expect(disposed).toBe(1)
  })

  it('composing zero packs yields an inert, vacuously complete runtime', () => {
    const runtime = composePacks([]).boot(base())
    expect(runtime.packIds).toEqual([])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 1, z: 2 } })
    runtime.render(0)
    expect(runtime.objectivesComplete()).toBe(true)
    expect(runtime.saveState()).toEqual({})
  })
})
