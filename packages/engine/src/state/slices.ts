import type { AnyAction, Reducer, Store } from './store'

export function combineReducers<S extends object, A extends AnyAction>(
  slices: { [K in keyof S]: Reducer<S[K], A> }
): Reducer<S, A> {
  const keys = Object.keys(slices) as Array<keyof S>
  return (state, action) => {
    let changed = false
    const next = {} as S
    for (const key of keys) {
      const reduced = slices[key](state[key], action)
      next[key] = reduced
      if (!Object.is(reduced, state[key])) changed = true
    }
    return changed ? next : state
  }
}

export function subscribeSelector<S, A extends AnyAction, T>(
  store: Store<S, A>,
  selector: (state: S) => T,
  onChange: (value: T, prev: T) => void
): () => void {
  return store.subscribe((state, prevState) => {
    const value = selector(state)
    const prev = selector(prevState)
    if (!Object.is(value, prev)) onChange(value, prev)
  })
}
