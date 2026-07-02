import type { AudioPort } from '@automata/engine'

import type { FeedbackEventType, NightState } from '../state/night'

export type PresentationTrigger =
  | 'beacon'
  | 'flare'
  | 'flash'
  | 'radio'
  | 'shake'
  | 'sparks'
  | 'spray'

export interface PresentationFeedbackPort {
  trigger(kind: PresentationTrigger): void
}

interface FeedbackSpec {
  sound: string
  triggers: readonly PresentationTrigger[]
}

export const FEEDBACK: Record<FeedbackEventType, FeedbackSpec> = {
  'generator-overheat': { sound: 'alarm', triggers: ['sparks', 'shake'] },
  'high-water': { sound: 'alarm', triggers: ['spray', 'shake'] },
  'darkness-warning': { sound: 'failure', triggers: ['flash'] },
  'call-incoming': { sound: 'radio', triggers: ['radio'] },
  'call-acknowledged': { sound: 'radio', triggers: ['radio'] },
  'bearing-known': { sound: 'beacon', triggers: ['beacon'] },
  'ship-rescued': { sound: 'rescue', triggers: ['flare', 'shake'] },
  'ship-lost': { sound: 'failure', triggers: ['flash', 'shake'] },
}

export function drainFeedback(
  state: NightState,
  audio: AudioPort,
  presentation: PresentationFeedbackPort,
): NightState {
  if (state.feedback.length === 0) return state

  for (const event of state.feedback) {
    const spec = FEEDBACK[event.type]
    if (!spec) continue

    audio.play(spec.sound)
    for (const trigger of spec.triggers) presentation.trigger(trigger)
  }

  return { ...state, feedback: [] }
}
