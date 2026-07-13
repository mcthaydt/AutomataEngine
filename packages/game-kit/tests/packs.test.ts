import { describe, expect, it } from 'vitest'
import { composePacks, type GamePack } from '../src/packs'
import type { GameHost } from '../src/host'

function fakeHost(): { host: GameHost; cleanups: Array<() => void> } {
  const cleanups: Array<() => void> = []
  return { host: { cleanup: { defer: (fn: () => void) => cleanups.push(fn) } } as unknown as GameHost, cleanups }
}
describe('pack composition seam', () => {
  it('zero packs is the status quo: boot is a no-op', () => {
    const { host, cleanups } = fakeHost(); const composed = composePacks([])
    expect(composed.packIds).toEqual([]); composed.boot(host); expect(cleanups).toEqual([])
  })
  it('registers packs in declaration order, validates config, and defers cleanup', () => {
    const { host, cleanups } = fakeHost(); const order: string[] = []
    const a: GamePack<{ speed: number }> = { id: 'a', version: '1', configSchema: { parse: (value) => ({ speed: (value as { speed: number }).speed }) }, register: (_host, config) => { order.push(`a:${config.speed}`); return () => order.push('a:disposed') } }
    const b: GamePack = { id: 'b', version: '1', register: () => { order.push('b') } }
    composePacks([a, b], { a: { speed: 5 } }).boot(host); expect(order).toEqual(['a:5', 'b']); cleanups[0]!(); expect(order).toEqual(['a:5', 'b', 'a:disposed'])
  })
  it('rejects duplicate ids and bad config', () => {
    const pack: GamePack = { id: 'dup', version: '1', register: () => {} }
    expect(() => composePacks([pack, { ...pack }])).toThrow(/duplicate pack id "dup"/i)
    const strict: GamePack = { id: 's', version: '1', configSchema: { parse: () => { throw new Error('bad config') } }, register: () => {} }
    expect(() => composePacks([strict]).boot(fakeHost().host)).toThrow(/bad config/)
  })
})
