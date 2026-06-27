import { describe, expect, it } from 'vitest'
import type { WorldsManifest } from '../../src/data/level'
import { isLevelUnlocked, isWorldUnlocked } from '../../src/state/unlocks'

const manifest: WorldsManifest = {
  worlds: [{ id: 'w1', name: 'World 1', levels: ['w1-l1', 'w1-l2'] }]
}

describe('level unlock guards', () => {
  it('rejects unknown levels', () => {
    expect(isLevelUnlocked(manifest, {}, 'missing')).toBe(false)
  })

  it('rejects missing worlds and worlds with no levels', () => {
    expect(isWorldUnlocked(manifest, {}, 'missing')).toBe(false)
    const emptyWorld = {
      worlds: [{ id: 'empty', name: 'Empty', levels: [] }]
    } as unknown as WorldsManifest
    expect(isWorldUnlocked(emptyWorld, {}, 'empty')).toBe(false)
  })
})
