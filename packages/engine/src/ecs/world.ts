import { World } from 'miniplex'

/** Engine-wrapped world factory; games never import miniplex directly. */
export function createWorld<E extends object>(): World<E> {
  return new World<E>()
}

export type { World }
