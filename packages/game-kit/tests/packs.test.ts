import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameHost } from '../src/host'
import { composePacks, type GamePack, type PackBootContext, type PackRuntimeHandle } from '../src/packs'

function context(): PackBootContext {
  const app = document.createElement('div')
  document.body.append(app)
  return { host: createGameHost(app), render: createNullRenderer().port }
}

describe('composePacks (capability-pack interface v1)', () => {
  it('rejects duplicate pack ids at compose time', () => {
    const pack: GamePack = { id: 'a', version: '1.0.0', register: () => {} }
    expect(() => composePacks([pack, { ...pack }])).toThrow(/Duplicate pack id/)
  })

  it('boots in declaration order, parses configs, and returns an aggregated runtime', () => {
    const calls: string[] = []
    const make = (id: string, complete: boolean): GamePack<{ tag: string }> => ({
      id, version: '1.0.0',
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
    const runtime = composePacks([make('a', true), make('b', false)], { a: { tag: 'x' }, b: { tag: 'y' } }).boot(context())
    expect(runtime.packIds).toEqual(['a', 'b'])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 0, z: 0 } })
    runtime.render(0.5)
    expect(calls).toEqual([
      'parse:a', 'register:a:x', 'parse:b', 'register:b:y',
      'fixed:a:0.016', 'fixed:b:0.016', 'render:a:0.5', 'render:b:0.5'
    ])
    expect(runtime.objectivesComplete()).toBe(false)
  })

  it('treats packs without a gate as vacuously complete and defers dispose onto the host stack', () => {
    let disposed = 0
    const pack: GamePack = {
      id: 'a', version: '1.0.0',
      register: () => ({ dispose: () => { disposed += 1 } })
    }
    const ctx = context()
    const runtime = composePacks([pack]).boot(ctx)
    expect(runtime.objectivesComplete()).toBe(true)
    ctx.host.dispose()
    expect(disposed).toBe(1)
  })

  it('composing zero packs yields an inert, vacuously complete runtime', () => {
    const runtime = composePacks([]).boot(context())
    expect(runtime.packIds).toEqual([])
    runtime.fixedUpdate(0.016, { playerPosition: { x: 1, z: 2 } })
    runtime.render(0)
    expect(runtime.objectivesComplete()).toBe(true)
  })
})
