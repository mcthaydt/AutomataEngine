import type { UpgradeId } from '../sim/upgrades'

export type SceneId =
  | 'title' | 'playing' | 'paused' | 'upgrade' | 'victory' | 'defeat'

export type Action =
  | { type: 'runStarted' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'quitToTitle' }
  | { type: 'retried' }
  | { type: 'waveCleared'; choices: UpgradeId[] }
  | { type: 'upgradeChosen'; id: UpgradeId }
  | { type: 'bossDefeated' }
  | { type: 'enemyKilled'; value: number }
  | { type: 'playerDamaged'; amount: number }
