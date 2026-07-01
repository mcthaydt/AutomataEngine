import type { NightState } from './night'

export type SceneId = 'title' | 'instructions' | 'playing' | 'paused' | 'victory' | 'defeat'

export type Action =
  | { type: 'instructionsOpened' }
  | { type: 'quitToTitle' }
  | { type: 'runStarted'; seed: number }
  | { type: 'retried'; seed: number }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'nightAdvanced'; night: NightState }
