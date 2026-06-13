import { z } from 'zod'
import { defineKind } from './registry'

export const archetypeLibrarySchema = z.record(z.string(), z.record(z.string(), z.unknown()))
export type ArchetypeLibrary = z.infer<typeof archetypeLibrarySchema>

/** Archetype libraries are authored as YAML per the spec's format conventions. */
export const archetypeLibraryKind = defineKind('archetypes', 'yaml', archetypeLibrarySchema)

export class UnknownArchetypeError extends Error {
  constructor(name: string, available: string[]) {
    super(`Unknown archetype "${name}". Available: ${available.join(', ')}`)
    this.name = 'UnknownArchetypeError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function spawnFromArchetype<E extends object>(
  world: { add(entity: E): E },
  lib: ArchetypeLibrary,
  name: string,
  overrides: Record<string, unknown> = {}
): E {
  const archetype = lib[name]
  if (!archetype) throw new UnknownArchetypeError(name, Object.keys(lib))

  const entity: Record<string, unknown> = {}
  for (const [component, value] of Object.entries(archetype)) {
    entity[component] = isPlainObject(value) ? structuredClone(value) : value
  }
  for (const [component, override] of Object.entries(overrides)) {
    const base = entity[component]
    entity[component] = isPlainObject(override) && isPlainObject(base)
      ? { ...base, ...override }
      : override
  }
  return world.add(entity as E)
}
