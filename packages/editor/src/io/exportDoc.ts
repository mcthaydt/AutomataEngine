import type { GameDefinition } from '../model/gameDefinition'
import { validateDoc } from './validation'

export type ExportResult = { ok: true; json: string } | { ok: false; issues: string[] }

export function exportDoc<Doc>(definition: GameDefinition<Doc>, doc: Doc): ExportResult {
  const result = validateDoc(definition, doc)
  if (!result.exportable) return { ok: false, issues: result.issues }

  return { ok: true, json: JSON.stringify(doc, null, 2) }
}
