import type { GameDefinition } from '../model/gameDefinition'
import { missingRequired } from '../tools/cardinality'

export function validateDoc<Doc>(
  definition: GameDefinition<Doc>,
  doc: Doc
): { issues: string[]; exportable: boolean } {
  const issues: string[] = []
  try {
    definition.scene.parse(doc)
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error))
  }
  for (const label of missingRequired(definition, definition.scene.listItems(doc))) {
    issues.push(`Missing required: ${label}`)
  }
  return { issues, exportable: issues.length === 0 }
}
