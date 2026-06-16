import { archetypeLibraryKind, type ArchetypeLibrary, type DataLoader } from '@automata/engine'
import { physicsTuningKind, toPhysicsTuning, type PhysicsTuning } from '../data/config'
import { worldsManifestKind, type WorldsManifest } from '../data/level'

export interface BootData {
  tuning: PhysicsTuning
  lib: ArchetypeLibrary
  manifest: WorldsManifest
}

/** Loads everything the game needs before the menu. Rejects with DataLoadError. */
export async function loadBootData(loader: DataLoader): Promise<BootData> {
  const [tuningRaw, lib, manifest] = await Promise.all([
    loader.load(physicsTuningKind, '/data/config/physics.toml'),
    loader.load(archetypeLibraryKind, '/data/archetypes/standard.yaml'),
    loader.load(worldsManifestKind, '/data/levels/worlds.json')
  ])

  return { tuning: toPhysicsTuning(tuningRaw), lib, manifest }
}
