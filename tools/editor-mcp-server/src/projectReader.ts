import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ProjectFileReader } from '@automata/project'

/** Adapt one filesystem directory to the project loader's narrow text reader. */
export function createProjectDirectoryReader(projectDir: string): ProjectFileReader {
  const root = resolve(projectDir)
  return {
    async readText(path): Promise<string> {
      const file = resolve(root, path)
      const fromRoot = relative(root, file)
      // Reject only genuine parent escapes ('..' or '../…'), not in-root names like '..icon.png'.
      if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        throw new Error(`Project path "${path}" resolves outside project root "${root}"`)
      }
      return readFile(file, 'utf8')
    }
  }
}
