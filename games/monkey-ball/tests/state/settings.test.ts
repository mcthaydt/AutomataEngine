import { describe, expect, it } from 'vitest'
import { initialSettings, settingsReducer } from '../../src/state/settings'

describe('settings reducer', () => {
  it('clamps volume into [0,1]', () => {
    expect(settingsReducer(initialSettings, { type: 'setVolume', value: 1.5 }).volume).toBe(1)
    expect(settingsReducer(initialSettings, { type: 'setVolume', value: -0.2 }).volume).toBe(0)
  })

  it('sets the joystick side', () => {
    expect(settingsReducer(initialSettings, {
      type: 'setJoystickSide',
      side: 'right'
    }).joystickSide).toBe('right')
  })

  it('ignores unrelated actions', () => {
    expect(settingsReducer(initialSettings, { type: 'ballFell' })).toBe(initialSettings)
  })
})
