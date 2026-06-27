import { World as MiniplexWorld, type Query as MiniplexQuery } from 'miniplex'

export interface QuerySignal<E extends object> {
  subscribe(listener: (entity: E) => void): () => void
}

export interface EntityQuery<E extends object> extends Iterable<E> {
  readonly first: E | undefined
  readonly onEntityAdded: QuerySignal<E>
  readonly onEntityRemoved: QuerySignal<E>
}

export type WithComponents<E extends object, K extends keyof E> = E & {
  [P in K]-?: NonNullable<E[P]>
}

/** Engine-owned subset of ECS operations used by runtime and editor code. */
export interface World<E extends object> {
  readonly entities: Iterable<E>
  add<T extends E>(entity: T): T
  remove(entity: E): void
  clear(): void
  has(entity: object): entity is E
  addComponent<K extends keyof E>(entity: E, key: K, value: E[K]): void
  removeComponent<K extends keyof E>(entity: E, key: K): void
  with<K extends keyof E>(...keys: K[]): EntityQuery<WithComponents<E, K>>
}

function adaptQuery<E extends object>(query: MiniplexQuery<E>): EntityQuery<E> {
  return {
    get first() { return query.first },
    onEntityAdded: {
      subscribe: (listener) => query.onEntityAdded.subscribe(listener)
    },
    onEntityRemoved: {
      subscribe: (listener) => query.onEntityRemoved.subscribe(listener)
    },
    [Symbol.iterator]: () => query[Symbol.iterator]()
  }
}

/** Instantiate Miniplex behind the stable, engine-owned ECS surface. */
export function createWorld<E extends object>(): World<E> {
  const world = new MiniplexWorld<E>()
  return {
    get entities() { return world.entities },
    add<T extends E>(entity: T): T {
      return world.add(entity) as T
    },
    remove(entity) { void world.remove(entity) },
    clear() { world.clear() },
    has(entity): entity is E { return world.has(entity) },
    addComponent(entity, key, value) { world.addComponent(entity, key, value) },
    removeComponent(entity, key) { world.removeComponent(entity, key) },
    with(...keys) {
      return adaptQuery(world.with(...keys)) as EntityQuery<WithComponents<E, typeof keys[number]>>
    }
  }
}
