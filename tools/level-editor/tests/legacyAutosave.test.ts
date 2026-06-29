import { describe, expect, it } from 'vitest'
import { loadLegacyMonkeyBallAutosave, LEGACY_MONKEY_BALL_AUTOSAVE_KEY } from '../src/legacyAutosave'

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) }
  }
}

const level = {
  id: 'recovered',
  name: 'Recovered Level',
  timeLimitS: 45,
  fallY: -8,
  spawn: [0, 1, 0],
  goal: { pos: [4, 0.5, 0] },
  geometry: [
    { shape: 'box', size: [8, 0.5, 8], pos: [0, 0, 0], color: '#7ec850', friction: 0.6 }
  ],
  entities: []
}

describe('legacy Monkey Ball autosave recovery', () => {
  it('imports the version-1 level and keeps the old key until persistence succeeds', () => {
    const storage = fakeStorage()
    storage.setItem(LEGACY_MONKEY_BALL_AUTOSAVE_KEY, JSON.stringify({ version: 1, doc: level }))

    const recovery = loadLegacyMonkeyBallAutosave(storage)

    expect(recovery?.snapshot.manifest.gameId).toBe('monkey-ball')
    expect(recovery?.snapshot.manifest.entrySceneId).toBe('recovered')
    expect(recovery?.snapshot.scenes.recovered?.name).toBe('Recovered Level')
    expect(storage.getItem(LEGACY_MONKEY_BALL_AUTOSAVE_KEY)).not.toBeNull()

    recovery?.markPersisted()
    expect(storage.getItem(LEGACY_MONKEY_BALL_AUTOSAVE_KEY)).toBeNull()
  })

  it('ignores malformed and unsupported autosaves without deleting them', () => {
    const storage = fakeStorage()
    storage.setItem(LEGACY_MONKEY_BALL_AUTOSAVE_KEY, JSON.stringify({ version: 2, doc: level }))

    expect(loadLegacyMonkeyBallAutosave(storage)).toBeNull()
    expect(storage.getItem(LEGACY_MONKEY_BALL_AUTOSAVE_KEY)).not.toBeNull()
  })
})
