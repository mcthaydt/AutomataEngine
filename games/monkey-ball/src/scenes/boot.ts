import { archetypeLibraryKind, type ArchetypeLibrary, type DataLoader } from '@automata/engine'
import type { ProjectFileReader } from '@automata/project'
import { loadMonkeyBallProject } from '../project/load'
import type { CompiledMonkeyBallProject } from '../project/types'

export interface BootData {
  project: CompiledMonkeyBallProject
  lib: ArchetypeLibrary
}

/** Load authored project data plus the remaining code-owned archetype registry. */
export async function loadBootData(loader: DataLoader, projectReader: ProjectFileReader): Promise<BootData> {
  const [project, lib] = await Promise.all([
    loadMonkeyBallProject(projectReader),
    loader.load(archetypeLibraryKind, 'data/archetypes/standard.yaml')
  ])

  return { project, lib }
}
