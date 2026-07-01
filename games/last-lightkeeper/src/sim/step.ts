import type { InputVector } from '@automata/engine'
import { nightDefinition } from '../data/night'
import type { NightDefinition } from '../data/schema'
import type { NightState } from '../state/night'
import { applyCarryIntent, findFocusedInteraction } from './interactions'
import { moveKeeper } from './movement'

export interface NightIntents {
  movement: InputVector
  operate: boolean
  carryPressed: boolean
}

export interface NightStepServices {
  playing: boolean
  definition?: NightDefinition
}

export function stepNight(
  state: NightState,
  intents: NightIntents,
  dt: number,
  services: NightStepServices
): NightState {
  if (!services.playing || !Number.isFinite(dt) || dt <= 0) return state

  const definition = services.definition ?? nightDefinition
  const keeper = moveKeeper(
    state.keeper,
    { movement: intents.movement, operate: false },
    dt,
    { playing: true, definition }
  )
  let next: NightState = { ...state, keeper, focus: null }
  next = { ...next, focus: findFocusedInteraction(next, definition) }

  if (intents.carryPressed) {
    next = applyCarryIntent(next, definition)
    next = { ...next, focus: findFocusedInteraction(next, definition) }
  }

  if (intents.operate && next.focus?.kind === 'station' && next.keeper.mode !== 'climb') {
    next = { ...next, keeper: { ...next.keeper, mode: 'operate' } }
  }
  return next
}
