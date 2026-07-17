/**
 * Typed pack event bus (pack contract v2): the only integration channel
 * between packs — direct pack→pack imports stay forbidden. Synchronous
 * fan-out in subscription order; event names and payload shapes are part of
 * each pack's public contract, listed in its compatibility declaration.
 */
export type PackEventHandler = (payload: unknown) => void

export interface PackEventBus {
  emit(name: string, payload: unknown): void
  /** Subscribe; returns an unsubscribe function. */
  on(name: string, handler: PackEventHandler): () => void
}

export function createPackEventBus(): PackEventBus {
  const handlers = new Map<string, Set<PackEventHandler>>()
  return {
    emit(name, payload) {
      const set = handlers.get(name)
      if (!set) return
      for (const handler of [...set]) handler(payload)
    },
    on(name, handler) {
      const set = handlers.get(name) ?? new Set<PackEventHandler>()
      handlers.set(name, set)
      set.add(handler)
      return () => { set.delete(handler) }
    }
  }
}
