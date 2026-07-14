import { parseCompositionManifest, type CompositionManifest } from '@automata/contracts'
import type { ProjectReader } from './projectReader'

/** Read + validate `composition.json` through the project reader; boot-diagnosable on failure. */
export async function loadComposition(reader: ProjectReader): Promise<CompositionManifest> {
  let text: string
  try {
    text = await reader.readText('composition.json')
  } catch (error) {
    throw new Error(`Failed to read composition.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parseCompositionManifest(text)
}
