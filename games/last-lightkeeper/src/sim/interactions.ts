import type { NightDefinition } from '../data/schema'
import type { InteractionFocus, NightState } from '../state/night'

export const INTERACTION_DISTANCE = 10

export type FocusedInteraction = InteractionFocus

interface RankedInteraction {
  focus: FocusedInteraction
  priority: number
}

export function findFocusedInteraction(
  state: NightState,
  definition: NightDefinition
): FocusedInteraction | null {
  const candidates: RankedInteraction[] = []
  for (const station of definition.stations) {
    if (station.floor !== state.keeper.floor) continue
    const distance = Math.abs(station.x - state.keeper.x)
    if (distance <= INTERACTION_DISTANCE) {
      candidates.push({
        focus: { kind: 'station', id: station.id, prompt: `Operate ${station.label}`, distance },
        priority: 0
      })
    }
  }
  for (const item of definition.items) {
    if (item.floor !== state.keeper.floor || state.items[item.id] !== 'racked') continue
    const distance = Math.abs(item.x - state.keeper.x)
    if (distance <= INTERACTION_DISTANCE) {
      candidates.push({
        focus: { kind: 'item', id: item.id, prompt: `Take ${item.label}`, distance },
        priority: 1
      })
    }
  }

  candidates.sort((left, right) =>
    left.focus.distance - right.focus.distance ||
    left.priority - right.priority ||
    left.focus.id.localeCompare(right.focus.id)
  )
  return candidates[0]?.focus ?? null
}

function releaseCarriedItem(state: NightState, lifecycle: 'racked' | 'consumed'): NightState {
  const item = state.keeper.carriedItem
  if (item === null) return state
  return {
    ...state,
    keeper: { ...state.keeper, carriedItem: null, mode: 'idle' },
    items: { ...state.items, [item]: lifecycle }
  }
}

export function applyCarryIntent(state: NightState, definition: NightDefinition): NightState {
  if (state.keeper.carriedItem !== null) return releaseCarriedItem(state, 'racked')

  const focus = findFocusedInteraction(state, definition)
  if (focus?.kind !== 'item') return state
  return {
    ...state,
    keeper: { ...state.keeper, carriedItem: focus.id, mode: 'carry' },
    items: { ...state.items, [focus.id]: 'carried' }
  }
}

export function completeCarriedItemUse(state: NightState, definition: NightDefinition): NightState {
  const itemId = state.keeper.carriedItem
  if (itemId === null) return state
  const item = definition.items.find((candidate) => candidate.id === itemId)
  return releaseCarriedItem(state, item?.reusable === false ? 'consumed' : 'racked')
}
