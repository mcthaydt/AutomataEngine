import { describe, expect, it } from 'vitest'
import { sceneReducer } from '../../src/state/scene'
import type { SceneId } from '../../src/state/actions'

describe('sceneReducer', () => {
  it('starts a run from the title', () => {
    expect(sceneReducer('title', { type: 'runStarted' })).toBe('playing')
  })

  it('pauses only while playing', () => {
    expect(sceneReducer('playing', { type: 'paused' })).toBe('paused')
    expect(sceneReducer('upgrade', { type: 'paused' })).toBe('upgrade')
  })

  it('resumes from pause', () => {
    expect(sceneReducer('paused', { type: 'resumed' })).toBe('playing')
  })

  it('opens the upgrade screen when a wave is cleared', () => {
    expect(sceneReducer('playing', { type: 'waveCleared', choices: ['damage', 'fireRate', 'moveSpeed'] }))
      .toBe('upgrade')
  })

  it('returns to play after choosing an upgrade', () => {
    expect(sceneReducer('upgrade', { type: 'upgradeChosen', id: 'damage' })).toBe('playing')
  })

  it('wins when the boss is defeated', () => {
    expect(sceneReducer('playing', { type: 'bossDefeated' })).toBe('victory')
  })

  it('retries from victory or defeat back into play', () => {
    expect(sceneReducer('victory', { type: 'retried' })).toBe('playing')
    expect(sceneReducer('defeat', { type: 'retried' })).toBe('playing')
  })

  it('quits to the title from end and pause screens', () => {
    for (const from of ['paused', 'victory', 'defeat'] as SceneId[]) {
      expect(sceneReducer(from, { type: 'quitToTitle' })).toBe('title')
    }
  })

  it('ignores unrelated actions', () => {
    expect(sceneReducer('playing', { type: 'enemyKilled', value: 100 })).toBe('playing')
  })
})
