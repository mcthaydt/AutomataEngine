import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data')

/** Reads a shipped data file relative to games/monkey-ball/public/data/. */
export function readDataFile(rel: string): string {
  return readFileSync(resolve(dataRoot, rel), 'utf8')
}

/** fetchText double for engine loaders, backed by the real shipped files. */
export async function fsFetchText(url: string): Promise<string> {
  return readDataFile(url.replace(/^\/data\//, ''))
}
