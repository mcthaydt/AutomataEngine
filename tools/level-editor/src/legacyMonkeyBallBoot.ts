import { type ArchetypeLibrary, archetypeLibraryKind, type DataLoader } from '@automata/engine'
import { physicsTuningKind, toPhysicsTuning, type PhysicsTuning } from 'monkey-ball'

export interface LegacyMonkeyBallBootData {
  lib: ArchetypeLibrary
  tuning: PhysicsTuning
}

/**
 * Load the two legacy inputs still consumed by createMonkeyBallDefinition.
 *
 * This bridge belongs to the old single-game host and must not be used by the
 * shipped Monkey Ball runtime. The generic project host replaces it in Task 14.
 */
export async function loadLegacyMonkeyBallBootData(
  loader: DataLoader
): Promise<LegacyMonkeyBallBootData> {
  const [rawTuning, lib] = await Promise.all([
    loader.load(physicsTuningKind, '/data/config/physics.toml'),
    loader.load(archetypeLibraryKind, '/data/archetypes/standard.yaml')
  ])

  return { tuning: toPhysicsTuning(rawTuning), lib }
}
