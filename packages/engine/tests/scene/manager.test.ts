import { describe, expect, it } from 'vitest'
import { createStore, type AnyAction, type Reducer, type Store } from '../../src/state/store'
import { createSceneManager, type Scene } from '../../src/scene/manager'

type SceneId = 'boot' | 'menu' | 'a' | 'b'
interface State { scene: SceneId }

type Action = { type: 'go'; to: SceneId }

interface SceneTransition<Id> { from: Id | null; to: Id | null }
interface TypedScene<Id> {
  onEnter?(transition: SceneTransition<Id>): void
  onExit?(transition: SceneTransition<Id>): void
}
type TypedSceneManagerFactory = <S, A extends AnyAction, Id extends PropertyKey>(
  store: Store<S, A>,
  selectScene: (state: S) => Id,
  scenes: Record<Id, TypedScene<Id>>,
  options?: { onTransition?: (transition: SceneTransition<Id>) => void }
) => { start(): () => void }

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

const completeScenes = (
  overrides: Partial<Record<SceneId, Scene<SceneId>>>
): Record<SceneId, Scene<SceneId>> => ({
  boot: {},
  menu: {},
  a: {},
  b: {},
  ...overrides
})

describe('createSceneManager', () => {
  it('passes typed transitions to scene hooks and one manager callback', () => {
    const store = createStore<State, Action>(reducer, { scene: 'boot' })
    const hooks: Array<{ hook: string; transition: SceneTransition<SceneId> }> = []
    const transitions: Array<SceneTransition<SceneId>> = []
    const scene = (name: SceneId): TypedScene<SceneId> => ({
      onEnter: (transition) => hooks.push({ hook: `enter:${name}`, transition }),
      onExit: (transition) => hooks.push({ hook: `exit:${name}`, transition })
    })
    const factory = createSceneManager as unknown as TypedSceneManagerFactory
    const stop = factory(store, (state) => state.scene, {
      boot: scene('boot'),
      menu: scene('menu'),
      a: scene('a'),
      b: scene('b')
    }, { onTransition: (transition) => transitions.push(transition) }).start()

    store.dispatch({ type: 'go', to: 'menu' })
    stop()

    expect(transitions).toEqual([
      { from: null, to: 'boot' },
      { from: 'boot', to: 'menu' },
      { from: 'menu', to: null }
    ])
    expect(hooks).toEqual([
      { hook: 'enter:boot', transition: { from: null, to: 'boot' } },
      { hook: 'exit:boot', transition: { from: 'boot', to: 'menu' } },
      { hook: 'enter:menu', transition: { from: 'boot', to: 'menu' } },
      { hook: 'exit:menu', transition: { from: 'menu', to: null } }
    ])
  })

  it('enters the initial scene on start', () => {
    const store = createStore<State, Action>(reducer, { scene: 'boot' })
    const { events, scene } = log()

    createSceneManager(store, (state) => state.scene, completeScenes({ boot: scene('boot') })).start()

    expect(events).toEqual(['enter:boot'])
  })

  it('exits the old scene and enters the new one on transition', () => {
    const store = createStore<State, Action>(reducer, { scene: 'boot' })
    const { events, scene } = log()

    createSceneManager(store, (state) => state.scene, completeScenes({
      boot: scene('boot'),
      menu: scene('menu')
    })).start()
    store.dispatch({ type: 'go', to: 'menu' })

    expect(events).toEqual(['enter:boot', 'exit:boot', 'enter:menu'])
  })

  it('ignores dispatches that do not change the scene', () => {
    const store = createStore<State, Action>(reducer, { scene: 'menu' })
    const { events, scene } = log()

    createSceneManager(store, (state) => state.scene, completeScenes({ menu: scene('menu') })).start()
    store.dispatch({ type: 'go', to: 'menu' })

    expect(events).toEqual(['enter:menu'])
  })

  it('tolerates scenes without hooks, and stop() exits the current scene', () => {
    const store = createStore<State, Action>(reducer, { scene: 'a' })
    const { events, scene } = log()

    const stop = createSceneManager(store, (state) => state.scene, completeScenes({
      a: {},
      b: scene('b')
    })).start()
    store.dispatch({ type: 'go', to: 'b' })
    stop()

    expect(events).toEqual(['enter:b', 'exit:b'])
  })
})
