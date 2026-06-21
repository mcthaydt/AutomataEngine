import { describe, expect, it } from 'vitest'
import { initialUi, uiReducer } from '../../src/state/ui'

describe('ui slice', () => {
  it('defaults to 0.5 snap, 2d primary, inset visible', () => {
    expect(initialUi).toEqual({ snap: 0.5, primaryView: '2d', insetVisible: true })
  })

  it('sets snap, primary view, and toggles the inset', () => {
    let s = uiReducer(initialUi, { type: 'setSnap', snap: 1 })
    expect(s.snap).toBe(1)
    s = uiReducer(s, { type: 'setPrimaryView', view: '3d' })
    expect(s.primaryView).toBe('3d')
    s = uiReducer(s, { type: 'toggleInset' })
    expect(s.insetVisible).toBe(false)
  })

  it('ignores unrelated actions', () => {
    expect(uiReducer(initialUi, { type: 'undo' })).toBe(initialUi)
  })
})
