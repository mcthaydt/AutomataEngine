export interface CleanupStack {
  readonly disposed: boolean
  /** Register ownership immediately after acquisition. Late registrations run immediately. */
  defer(cleanup: () => void): void
  /** Drain all owned resources in reverse acquisition order. Safe to call repeatedly. */
  dispose(): void
}

/**
 * Creates a small deterministic lifecycle owner for browser composition roots.
 * Disposal never abandons later callbacks: the first failure is rethrown only
 * after the complete stack has drained.
 */
export function createCleanupStack(): CleanupStack {
  const callbacks: Array<() => void> = []
  let disposed = false

  return {
    get disposed() { return disposed },
    defer(cleanup) {
      if (disposed) {
        cleanup()
        return
      }
      callbacks.push(cleanup)
    },
    dispose() {
      if (disposed) return
      disposed = true
      let firstError: unknown
      while (callbacks.length > 0) {
        try {
          callbacks.pop()!()
        } catch (error) {
          firstError ??= error
        }
      }
      if (firstError !== undefined) throw firstError
    }
  }
}
