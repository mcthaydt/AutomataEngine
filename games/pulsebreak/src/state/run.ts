import { PLAYER, UPGRADE_STEP } from '../config'
import type { UpgradeId } from '../sim/upgrades'
import type { Action } from './actions'

/** Run-scoped state: scoreboard, upgradable stats, and player integrity. */
export interface RunState {
  /** Monotonic id; a change rebuilds the gameplay world. */
  runId: number
  wave: number
  health: number
  maxHealth: number
  score: number
  damage: number
  fireRate: number
  moveSpeed: number
  /** The three upgrades currently offered (only set on the upgrade screen). */
  choices: UpgradeId[]
}

export const initialRun: RunState = {
  runId: 0,
  wave: 1,
  health: PLAYER.startHealth,
  maxHealth: PLAYER.startHealth,
  score: 0,
  damage: PLAYER.baseDamage,
  fireRate: PLAYER.baseFireRate,
  moveSpeed: PLAYER.baseMoveSpeed,
  choices: []
}

function freshRun(runId: number): RunState {
  return { ...initialRun, runId }
}

export function runReducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'runStarted':
    case 'retried':
      return freshRun(state.runId + 1)
    case 'playerDamaged':
      return { ...state, health: Math.max(0, state.health - action.amount) }
    case 'enemyKilled':
      return { ...state, score: state.score + action.value }
    case 'waveCleared':
      return { ...state, choices: action.choices }
    case 'upgradeChosen':
      return applyUpgrade(state, action.id)
    default:
      return state
  }
}

function applyUpgrade(state: RunState, id: UpgradeId): RunState {
  const advanced = { ...state, wave: state.wave + 1, choices: [] }
  switch (id) {
    case 'damage':
      return { ...advanced, damage: state.damage + UPGRADE_STEP.damage }
    case 'fireRate':
      return { ...advanced, fireRate: state.fireRate + UPGRADE_STEP.fireRate }
    case 'moveSpeed':
      return { ...advanced, moveSpeed: state.moveSpeed + UPGRADE_STEP.moveSpeed }
    case 'maxHealth':
      return {
        ...advanced,
        maxHealth: state.maxHealth + UPGRADE_STEP.maxHealth,
        health: state.health + UPGRADE_STEP.maxHealth
      }
  }
}
