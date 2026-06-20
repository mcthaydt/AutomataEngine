import type { GameDefinition } from '../model/gameDefinition'

export type ImportResult<Doc> = { ok: true; doc: Doc } | { ok: false; issues: string[] }

export function importDoc<Doc>(definition: GameDefinition<Doc>, text: string): ImportResult<Doc> {
  try {
    return { ok: true, doc: definition.scene.parse(JSON.parse(text)) }
  } catch (error) {
    return { ok: false, issues: [error instanceof Error ? error.message : String(error)] }
  }
}
