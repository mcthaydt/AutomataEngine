import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gameSpecSchema, type GameSpec } from '@automata/contracts'

/** The versioned spec lives with the game it governs and is checked into git. */
export function gameSpecPath(repoRoot: string, gameId: string): string {
  return join(repoRoot, 'games', gameId, 'gamespec.json')
}

export async function readGameSpec(repoRoot: string, gameId: string): Promise<GameSpec | null> {
  let text: string
  try { text = await readFile(gameSpecPath(repoRoot, gameId), 'utf8') } catch { return null }
  return gameSpecSchema.parse(JSON.parse(text))
}

/** Atomic write: create a sibling temporary file then rename it into place. */
export async function writeGameSpec(repoRoot: string, gameId: string, spec: GameSpec): Promise<void> {
  const path = gameSpecPath(repoRoot, gameId)
  const temporaryPath = `${path}.tmp-${process.pid}`
  await writeFile(temporaryPath, `${JSON.stringify(spec, null, 2)}\n`)
  await rename(temporaryPath, path)
}
