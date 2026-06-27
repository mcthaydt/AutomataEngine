import type { Action, SceneId } from './actions'

export function sceneReducer(state: SceneId, action: Action): SceneId {
  switch (action.type) {
    case 'runStarted':
    case 'retried':
    case 'resumed':
    case 'upgradeChosen':
      return 'playing'
    case 'paused':
      return state === 'playing' ? 'paused' : state
    case 'waveCleared':
      return 'upgrade'
    case 'bossDefeated':
      return 'victory'
    case 'quitToTitle':
      return 'title'
    default:
      return state
  }
}
