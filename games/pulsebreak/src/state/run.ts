import type { PulsebreakCompiledProject } from '../project/types'
import type { UpgradeId } from '../sim/upgrades'
import type { Action } from './actions'
import type { Reducer } from '@automata/engine'

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

/** Build a fresh run from authored player tuning. */
export function initialRun(config: PulsebreakCompiledProject): RunState {
  return {
    runId: 0,
    wave: 1,
    health: config.player.startHealth,
    maxHealth: config.player.startHealth,
    score: 0,
    damage: config.player.baseDamage,
    fireRate: config.player.baseFireRate,
    moveSpeed: config.player.baseMoveSpeed,
    choices: []
  }
}

/** Close the reducer over one compiled project so upgrades cannot drift. */
export function createRunReducer(config: PulsebreakCompiledProject): Reducer<RunState, Action> {
  const base = initialRun(config)
  const freshRun = (runId: number): RunState => ({ ...base, runId })
  return (state, action) => {
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
        return applyUpgrade(state, action.id, config)
      default:
        return state
    }
  }
}

function applyUpgrade(state: RunState, id: UpgradeId, config: PulsebreakCompiledProject): RunState {
  const advanced = { ...state, wave: state.wave + 1, choices: [] }
  switch (id) {
    case 'damage':
      return { ...advanced, damage: state.damage + config.upgradeStep.damage }
    case 'fireRate':
      return { ...advanced, fireRate: state.fireRate + config.upgradeStep.fireRate }
    case 'moveSpeed':
      return { ...advanced, moveSpeed: state.moveSpeed + config.upgradeStep.moveSpeed }
    case 'maxHealth':
      return {
        ...advanced,
        maxHealth: state.maxHealth + config.upgradeStep.maxHealth,
        health: state.health + config.upgradeStep.maxHealth
      }
  }
}
