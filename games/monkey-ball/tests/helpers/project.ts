import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMonkeyBallProject } from '../../src/project/load'
import type { CompiledMonkeyBallProject } from '../../src/project/types'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/project')

let cached: Promise<CompiledMonkeyBallProject> | undefined

/** Load the shipped canonical project once — the replacement for legacy-fixture parsing. */
export function loadCanonicalProject(): Promise<CompiledMonkeyBallProject> {
  cached ??= loadMonkeyBallProject({ readText: (path) => readFile(resolve(projectRoot, path), 'utf8') })
  return cached
}
