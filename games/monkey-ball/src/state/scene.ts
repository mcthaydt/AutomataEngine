import type { Action, SceneId } from './actions'

export function sceneReducer(state: SceneId, action: Action): SceneId {
  switch (action.type) {
    case 'bootCompleted':
    case 'openedMenu':
    case 'quitToMenu':
      return 'menu'
    case 'openedLevelSelect':
      return 'levelSelect'
    case 'levelStarted':
    case 'retried':
    case 'resumed':
      return 'playing'
    case 'paused':
      return state === 'playing' ? 'paused' : state
    case 'levelCompleted':
      return 'levelComplete'
    default:
      return state
  }
}
