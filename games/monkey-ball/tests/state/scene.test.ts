import { describe, expect, it } from 'vitest'
import { sceneReducer } from '../../src/state/scene'

describe('sceneReducer navigation', () => {
  it('boot -> menu -> levelSelect -> playing', () => {
    expect(sceneReducer('boot', { type: 'bootCompleted' })).toBe('menu')
    expect(sceneReducer('menu', { type: 'openedLevelSelect' })).toBe('levelSelect')
    expect(sceneReducer('levelSelect', { type: 'levelStarted', levelId: 'w1-l1' })).toBe('playing')
  })

  it('pauses only from playing and resumes back to playing', () => {
    expect(sceneReducer('playing', { type: 'paused' })).toBe('paused')
    expect(sceneReducer('menu', { type: 'paused' })).toBe('menu')
    expect(sceneReducer('paused', { type: 'resumed' })).toBe('playing')
  })

  it('quitToMenu returns to the menu, openedMenu from level complete too', () => {
    expect(sceneReducer('paused', { type: 'quitToMenu' })).toBe('menu')
    expect(sceneReducer('levelComplete', { type: 'openedMenu' })).toBe('menu')
  })

  it('still completes a level and ignores unrelated actions', () => {
    expect(sceneReducer('playing', {
      type: 'levelCompleted',
      levelId: 'x',
      timeMs: 1,
      bananas: 0
    })).toBe('levelComplete')
    expect(sceneReducer('menu', { type: 'tickedMs', ms: 16 })).toBe('menu')
  })
})
