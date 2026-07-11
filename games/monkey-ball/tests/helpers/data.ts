import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeDataRoot = resolve(gameRoot, 'public/data')

/** Read a shipped runtime data file (e.g. `archetypes/standard.yaml`). */
export function readDataFile(rel: string): string {
  return readFileSync(resolve(runtimeDataRoot, rel), 'utf8')
}

/** fetchText double for engine loaders, backed by the real shipped files. */
export async function fsFetchText(url: string): Promise<string> {
  return readDataFile(url.replace(/^\/data\//, ''))
}
