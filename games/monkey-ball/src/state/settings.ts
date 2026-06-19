import type { Action } from './actions'

export type JoystickSide = 'left' | 'right'

export interface SettingsState {
  volume: number
  joystickSide: JoystickSide
}

export const initialSettings: SettingsState = { volume: 0.7, joystickSide: 'left' }

export function settingsReducer(state: SettingsState, action: Action): SettingsState {
  switch (action.type) {
    case 'setVolume':
      return { ...state, volume: Math.min(1, Math.max(0, action.value)) }
    case 'setJoystickSide':
      return { ...state, joystickSide: action.side }
    default:
      return state
  }
}
