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

  it('does not throw when the global localStorage accessor is blocked', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('SecurityError') }
    })

    try {
      const storage = localStorageAdapter()
      expect(storage.get('k')).toBeNull()
      expect(() => storage.set('k', 'v')).not.toThrow()
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original)
    }
  })
})
