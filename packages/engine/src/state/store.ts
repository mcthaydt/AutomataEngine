export interface AnyAction { type: string }

export type Reducer<S, A extends AnyAction> = (state: S, action: A) => S

export interface StoreApi<S, A extends AnyAction> {
  getState(): S
  dispatch(action: A): void
}

export type Middleware<S, A extends AnyAction> =
  (api: StoreApi<S, A>) => (next: (action: A) => void) => (action: A) => void

export interface Store<S, A extends AnyAction> extends StoreApi<S, A> {
  subscribe(listener: (state: S, prev: S) => void): () => void
}

export function createStore<S, A extends AnyAction>(
  reducer: Reducer<S, A>,
  initial: S,
  middleware: Middleware<S, A>[] = []
): Store<S, A> {
  let state = initial
  const listeners = new Set<(state: S, prev: S) => void>()

  const base = (action: A): void => {
    const prev = state
    state = reducer(state, action)
    for (const listener of [...listeners]) listener(state, prev)
  }

  const api: StoreApi<S, A> = {
    getState: () => state,
    dispatch: (action) => chain(action)
  }
  const chain = middleware.reduceRight<(action: A) => void>(
    (next, mw) => mw(api)(next),
    base
  )

  return {
    getState: api.getState,
    dispatch: api.dispatch,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
  }
}
