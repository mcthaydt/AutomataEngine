import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import type { ProjectFileReader } from '@automata/project'

/** Adapt one filesystem directory to the project loader's narrow text reader. */
export function createProjectDirectoryReader(projectDir: string): ProjectFileReader {
  const root = resolve(projectDir)
  return {
    async readText(path): Promise<string> {
      const file = resolve(root, path)
      const fromRoot = relative(root, file)
      if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
        throw new Error(`Project path "${path}" resolves outside project root "${root}"`)
      }
      return readFile(file, 'utf8')
    }
  }
}
