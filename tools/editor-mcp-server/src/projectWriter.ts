import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ProjectFileWriter } from '@automata/project'

/** Adapt one filesystem directory to the project writer, mirroring createProjectDirectoryReader's guard. */
export function createProjectDirectoryWriter(projectDir: string): ProjectFileWriter {
  const root = resolve(projectDir)
  return {
    async writeText(path, text): Promise<void> {
      const file = resolve(root, path)
      const fromRoot = relative(root, file)
      if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        throw new Error(`Project path "${path}" resolves outside project root "${root}"`)
      }
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, text, 'utf8')
    }
  }
}
