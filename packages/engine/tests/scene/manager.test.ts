import { describe, expect, it } from 'vitest'
import { createStore, type Reducer } from '../../src/state/store'
import { createSceneManager } from '../../src/scene/manager'

interface State { scene: string }

type Action = { type: 'go'; to: string }

const reducer: Reducer<State, Action> = (state, action) =>
  action.type === 'go' ? { scene: action.to } : state

function log() {
  const events: string[] = []
  const scene = (name: string) => ({
    onEnter: () => events.push(`enter:${name}`),
    onExit: () => events.push(`exit:${name}`)
  })
  return { events, scene }
}

describe('createSceneManager', () => {
  it('enters the initial scene on start', () => {
    const store = createStore(reducer, { scene: 'boot' })
    const { events, scene } = log()

    createSceneManager(store, (state) => state.scene, { boot: scene('boot') }).start()

    expect(events).toEqual(['enter:boot'])
  })

  it('exits the old scene and enters the new one on transition', () => {
    const store = createStore(reducer, { scene: 'boot' })
    const { events, scene } = log()

    createSceneManager(store, (state) => state.scene, {
      boot: scene('boot'),
      menu: scene('menu')
    }).start()
    store.dispatch({ type: 'go', to: 'menu' })

    expect(events).toEqual(['enter:boot', 'exit:boot', 'enter:menu'])
  })

  it('ignores dispatches that do not change the scene', () => {
    const store = createStore(reducer, { scene: 'menu' })
    const { events, scene } = log()

    createSceneManager(store, (state) => state.scene, { menu: scene('menu') }).start()
    store.dispatch({ type: 'go', to: 'menu' })

    expect(events).toEqual(['enter:menu'])
  })

  it('tolerates scenes without hooks, and stop() exits the current scene', () => {
    const store = createStore(reducer, { scene: 'a' })
    const { events, scene } = log()

    const stop = createSceneManager(store, (state) => state.scene, {
      a: {},
      b: scene('b')
    }).start()
    store.dispatch({ type: 'go', to: 'b' })
    stop()

    expect(events).toEqual(['enter:b', 'exit:b'])
  })
})
