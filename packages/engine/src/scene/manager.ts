import type { AnyAction, Store } from '../state/store'

export interface SceneTransition<Id> {
  from: Id | null
  to: Id | null
}

export interface Scene<Id extends PropertyKey = string> {
  onEnter?(transition: SceneTransition<Id>): void
  onExit?(transition: SceneTransition<Id>): void
}

export interface SceneManager {
  /** Runs the current scene's onEnter and watches for changes; returns a stop fn. */
  start(): () => void
}

/**
 * Drives scene transitions from a store. On each change of the selected scene
 * id, runs the previous scene's onExit then the next scene's onEnter.
 */
export function createSceneManager<S, A extends AnyAction, Id extends PropertyKey>(
  store: Store<S, A>,
  selectScene: (state: S) => Id,
  scenes: Record<Id, Scene<Id>>,
  options: { onTransition?: (transition: SceneTransition<Id>) => void } = {}
): SceneManager {
  return {
    start() {
      let current = selectScene(store.getState())
      const initial = { from: null, to: current }
      options.onTransition?.(initial)
      scenes[current].onEnter?.(initial)

      const unsubscribe = store.subscribe((state) => {
        const next = selectScene(state)
        if (next === current) return

        const transition = { from: current, to: next }
        scenes[current].onExit?.(transition)
        options.onTransition?.(transition)
        current = next
        scenes[current].onEnter?.(transition)
      })

      return () => {
        unsubscribe()
        const transition = { from: current, to: null }
        scenes[current].onExit?.(transition)
        options.onTransition?.(transition)
      }
    }
  }
}
