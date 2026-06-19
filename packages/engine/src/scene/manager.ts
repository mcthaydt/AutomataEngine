import type { AnyAction, Store } from '../state/store'

export interface Scene {
  onEnter?(): void
  onExit?(): void
}

export interface SceneManager {
  /** Runs the current scene's onEnter and watches for changes; returns a stop fn. */
  start(): () => void
}

/**
 * Drives scene transitions from a store. On each change of the selected scene
 * id, runs the previous scene's onExit then the next scene's onEnter.
 */
export function createSceneManager<S, A extends AnyAction>(
  store: Store<S, A>,
  selectScene: (state: S) => string,
  scenes: Record<string, Scene>
): SceneManager {
  return {
    start() {
      let current = selectScene(store.getState())
      scenes[current]?.onEnter?.()

      const unsubscribe = store.subscribe((state) => {
        const next = selectScene(state)
        if (next === current) return

        scenes[current]?.onExit?.()
        current = next
        scenes[current]?.onEnter?.()
      })

      return () => {
        unsubscribe()
        scenes[current]?.onExit?.()
      }
    }
  }
}
