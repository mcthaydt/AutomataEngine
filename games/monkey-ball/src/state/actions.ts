export type SceneId =
  | 'boot' | 'menu' | 'levelSelect' | 'playing'
  | 'paused' | 'levelComplete' | 'gameOver'

export type Action =
  | { type: 'levelStarted'; levelId: string }
  | { type: 'retried' }
  | { type: 'tickedMs'; ms: number }
  | { type: 'bananaCollected'; value: number }
  | { type: 'ballFell' }
  | { type: 'timeExpired' }
  | { type: 'levelCompleted'; levelId: string; timeMs: number; bananas: number }
  | { type: 'setVolume'; value: number }
  | { type: 'setJoystickSide'; side: 'left' | 'right' }
