import { describe, expect, it, vi } from 'vitest'
import { createStore } from '../../src/state/store'
import { combineReducers, subscribeSelector } from '../../src/state/slices'

type Action = { type: 'inc' } | { type: 'rename'; name: string }
const count = (state: number = 0, action: Action): number =>
  action.type === 'inc' ? state + 1 : state
const name = (state: string = 'anon', action: Action): string =>
  action.type === 'rename' ? action.name : state

describe('combineReducers', () => {
  it('reduces each slice independently', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const store = createStore(root, { count: 0, name: 'anon' })
    store.dispatch({ type: 'inc' })
    store.dispatch({ type: 'rename', name: 'aiai' })
    expect(store.getState()).toEqual({ count: 1, name: 'aiai' })
  })

  it('returns the same state object when nothing changed', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const before = { count: 3, name: 'x' }
    const after = root(before, { type: 'rename', name: 'x' } as Action)
    expect(after).toBe(before)
  })
})

describe('subscribeSelector', () => {
  it('fires only when the selected value changes (Object.is)', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const store = createStore(root, { count: 0, name: 'anon' })
    const onName = vi.fn()
    subscribeSelector(store, (s) => s.name, onName)
    store.dispatch({ type: 'inc' })
    store.dispatch({ type: 'rename', name: 'z' })
    expect(onName).toHaveBeenCalledTimes(1)
    expect(onName).toHaveBeenCalledWith('z', 'anon')
  })

  it('returns an unsubscribe function', () => {
    const root = combineReducers<{ count: number; name: string }, Action>({ count, name })
    const store = createStore(root, { count: 0, name: 'anon' })
    const onCount = vi.fn()
    const unsub = subscribeSelector(store, (s) => s.count, onCount)
    unsub()
    store.dispatch({ type: 'inc' })
    expect(onCount).not.toHaveBeenCalled()
  })
})
