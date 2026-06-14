import type { Action, SceneId } from './actions'

export function sceneReducer(state: SceneId, action: Action): SceneId {
  switch (action.type) {
    case 'levelStarted':
    case 'retried':
      return 'playing'
    case 'levelCompleted':
      return 'levelComplete'
    default:
      return state
  }
}
