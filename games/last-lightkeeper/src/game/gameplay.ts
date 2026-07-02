import {
  createNullAudio,
  subscribeSelector,
  type AudioPort,
  type InputSource,
  type SpriteRenderPort
} from '@automata/engine'

import { createWorldPresentation, type WorldPresentation } from '../render/world'
import { stepNight } from '../sim/step'
import type { GameStore } from '../state/root'
import {
  drainFeedback,
  type PresentationFeedbackPort
} from '../systems/feedback'

export interface GameplayInput {
  movement: InputSource
  read(): { operate: boolean }
  consume(): { carryPressed: boolean; pausePressed: boolean }
}

export interface GameplayDeps {
  store: GameStore
  manifest: unknown
  render: SpriteRenderPort
  input: GameplayInput
  audio?: AudioPort
  presentation?: PresentationFeedbackPort
}

export interface Gameplay {
  fixedUpdate(dt: number): void
  render(alpha: number): void
  entity(id: string): object
  dispose(): void
}

const silentPresentation: PresentationFeedbackPort = { trigger() {} }

export function createGameplay(deps: GameplayDeps): Gameplay {
  const audio = deps.audio ?? createNullAudio().port
  const presentationFeedback = deps.presentation ?? silentPresentation
  let world: WorldPresentation = createWorldPresentation(deps.render, deps.manifest)

  const rebuildWorld = (): void => {
    world.dispose()
    world = createWorldPresentation(deps.render, deps.manifest)
  }
  const unsubscribeRun = subscribeSelector(deps.store, (state) => state.night.runId, rebuildWorld)

  let disposed = false
  return {
    fixedUpdate(dt) {
      if (disposed) return
      const presses = deps.input.consume()
      const scene = deps.store.getState().scene
      if (presses.pausePressed) {
        if (scene === 'playing') deps.store.dispatch({ type: 'paused' })
        else if (scene === 'paused') deps.store.dispatch({ type: 'resumed' })
        return
      }
      if (scene !== 'playing') return

      const actions = deps.input.read()
      const next = stepNight(
        deps.store.getState().night,
        {
          movement: deps.input.movement.read(),
          operate: actions.operate,
          carryPressed: presses.carryPressed
        },
        dt,
        { playing: true }
      )
      const drained = drainFeedback(next, audio, presentationFeedback)
      deps.store.dispatch({ type: 'nightAdvanced', night: drained })
    },

    render(alpha) {
      if (disposed) return
      const state = deps.store.getState()
      world.update(state.night, state.scene === 'playing' ? alpha : 1)
    },

    entity(id) {
      return world.entity(id)
    },

    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeRun()
      world.dispose()
    }
  }
}
