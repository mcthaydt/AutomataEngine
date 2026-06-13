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
