import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '../../src/state/store'
import { memoryStorage } from '../../src/storage/adapters'
import { createPersistence } from '../../src/state/persistence'

type Action = { type: 'inc' } | { type: 'noop' }
interface State { count: number; transient: string }
const reducer = (state: State, action: Action): State =>
  action.type === 'inc' ? { ...state, count: state.count + 1 } : state

describe('createPersistence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const storage = memoryStorage()
    const persistence = createPersistence<State, Action>(storage, {
      key: 'save',
      version: 2,
      debounceMs: 100,
      pick: (s) => ({ count: s.count })
    })
    const store = createStore(reducer, { count: 0, transient: 'x' }, [persistence.middleware])
    return { storage, store, persistence }
  }

  it('writes the picked slice as a versioned envelope after the debounce', () => {
    const { storage, store } = setup()
    store.dispatch({ type: 'inc' })
    expect(storage.get('save')).toBeNull()
    vi.advanceTimersByTime(100)
    expect(JSON.parse(storage.get('save')!)).toEqual({ version: 2, data: { count: 1 } })
  })

  it('coalesces rapid dispatches into one write with the latest state', () => {
    const { storage, store } = setup()
    store.dispatch({ type: 'inc' })
    vi.advanceTimersByTime(50)
    store.dispatch({ type: 'inc' })
    vi.advanceTimersByTime(99)
    expect(storage.get('save')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(JSON.parse(storage.get('save')!).data).toEqual({ count: 2 })
  })

  it('skips scheduling when the picked value is unchanged', () => {
    const { storage, store } = setup()
    store.dispatch({ type: 'noop' })
    vi.advanceTimersByTime(1000)
    expect(storage.get('save')).toBeNull()
  })

  it('flush() writes immediately', () => {
    const { storage, store, persistence } = setup()
    store.dispatch({ type: 'inc' })
    persistence.flush()
    expect(JSON.parse(storage.get('save')!).data).toEqual({ count: 1 })
    vi.advanceTimersByTime(1000)
  })
})
