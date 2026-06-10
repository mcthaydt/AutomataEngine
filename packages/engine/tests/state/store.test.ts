import { describe, expect, it, vi } from 'vitest'
import { createStore, type Middleware } from '../../src/state/store'

type CounterAction = { type: 'inc' } | { type: 'add'; amount: number }
const counter = (state: number, action: CounterAction): number => {
  switch (action.type) {
    case 'inc': return state + 1
    case 'add': return state + action.amount
    default: return state
  }
}

describe('createStore', () => {
  it('returns the initial state', () => {
    const store = createStore(counter, 5)
    expect(store.getState()).toBe(5)
  })

  it('reduces state on dispatch', () => {
    const store = createStore(counter, 0)
    store.dispatch({ type: 'inc' })
    store.dispatch({ type: 'add', amount: 4 })
    expect(store.getState()).toBe(5)
  })

  it('notifies subscribers with (state, prev) after each dispatch', () => {
    const store = createStore(counter, 0)
    const seen: Array<[number, number]> = []
    store.subscribe((state, prev) => seen.push([state, prev]))
    store.dispatch({ type: 'inc' })
    store.dispatch({ type: 'inc' })
    expect(seen).toEqual([[1, 0], [2, 1]])
  })

  it('stops notifying after unsubscribe', () => {
    const store = createStore(counter, 0)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.dispatch({ type: 'inc' })
    unsubscribe()
    store.dispatch({ type: 'inc' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('runs middleware in order around the reducer', () => {
    const calls: string[] = []
    const mw = (tag: string): Middleware<number, CounterAction> =>
      () => (next) => (action) => {
        calls.push(`${tag}:before`)
        next(action)
        calls.push(`${tag}:after`)
      }
    const store = createStore(counter, 0, [mw('a'), mw('b')])
    store.dispatch({ type: 'inc' })
    expect(calls).toEqual(['a:before', 'b:before', 'b:after', 'a:after'])
    expect(store.getState()).toBe(1)
  })

  it('middleware can read post-reduce state via getState', () => {
    let observed = -1
    const spy: Middleware<number, CounterAction> =
      (api) => (next) => (action) => {
        next(action)
        observed = api.getState()
      }
    const store = createStore(counter, 0, [spy])
    store.dispatch({ type: 'inc' })
    expect(observed).toBe(1)
  })
})
