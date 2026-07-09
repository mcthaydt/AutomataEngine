import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ProjectFileWriter } from '@automata/project'

/** A directory-backed project writer that can also prune files no longer in the snapshot. */
export interface ProjectDirectoryWriter extends ProjectFileWriter {
  /** Delete every `.json` file under the project root not named in keepPaths (relative). */
  removeStale(keepPaths: readonly string[]): Promise<void>
}

/** Absolute paths of every `.json` file under `root`, recursively; a missing root yields []. */
async function collectJsonFiles(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await collectJsonFiles(full)))
    else if (entry.name.endsWith('.json')) files.push(full)
  }
  return files
}

/** Adapt one filesystem directory to the project writer, mirroring createProjectDirectoryReader's guard. */
export function createProjectDirectoryWriter(projectDir: string): ProjectDirectoryWriter {
  const root = resolve(projectDir)
  const resolveInRoot = (path: string): string => {
    const file = resolve(root, path)
    const fromRoot = relative(root, file)
    if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error(`Project path "${path}" resolves outside project root "${root}"`)
    }
    return file
  }
  return {
    async writeText(path, text): Promise<void> {
      const file = resolveInRoot(path)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, text, 'utf8')
    },
    async removeStale(keepPaths): Promise<void> {
      const keep = new Set(keepPaths.map((path) => resolveInRoot(path)))
      for (const file of await collectJsonFiles(root)) {
        if (!keep.has(file)) await rm(file, { force: true })
      }
    }
  }
}
