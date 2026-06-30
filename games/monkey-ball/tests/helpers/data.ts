import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeDataRoot = resolve(gameRoot, 'public/data')
const legacyDataRoot = resolve(gameRoot, 'tests/fixtures/legacy')

/** Read the retained runtime archetypes or quarantined pre-project fixtures. */
export function readDataFile(rel: string): string {
  const root = rel.startsWith('archetypes/') ? runtimeDataRoot : legacyDataRoot
  return readFileSync(resolve(root, rel), 'utf8')
}

/** fetchText double for engine loaders, backed by the real shipped files. */
export async function fsFetchText(url: string): Promise<string> {
  return readDataFile(url.replace(/^\/data\//, ''))
}
