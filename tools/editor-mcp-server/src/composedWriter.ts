import { randomUUID } from 'node:crypto'
import { access, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface ComposedFile { path: string; text: string }
export interface ComposedWriterFs {
  access(path: string): Promise<void>
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
  rename(from: string, to: string): Promise<void>
  rm(path: string, options: { force: true }): Promise<void>
  writeFile(path: string, text: string): Promise<void>
}

const nodeFs: ComposedWriterFs = { access, lstat, mkdir, rename, rm, writeFile }
interface StagedFile { target: string; temporary: string; backup: string; backupCreated: boolean; installed: boolean }

async function pathExists(fs: ComposedWriterFs, path: string): Promise<boolean> {
  try { await fs.access(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function assertNoSymbolicLinks(fs: ComposedWriterFs, gameRoot: string, target: string): Promise<void> {
  const paths = [gameRoot]
  let current = gameRoot
  for (const segment of relative(gameRoot, target).split(sep)) {
    current = join(current, segment)
    paths.push(current)
  }
  for (const path of paths) {
    try {
      if ((await fs.lstat(path)).isSymbolicLink()) throw new Error(`Composed file path contains a symbolic link: ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}

export async function writeComposedFiles(root: string, files: readonly ComposedFile[], fs: ComposedWriterFs = nodeFs): Promise<void> {
  const gameRoot = resolve(root)
  const targets = new Set<string>()
  const staged: StagedFile[] = []

  for (const file of files) {
    const target = resolve(gameRoot, file.path)
    const fromRoot = relative(gameRoot, target)
    if (fromRoot === '' || isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
      throw new Error(`Composed file path resolves outside game root: ${file.path}`)
    }
    if (targets.has(target)) throw new Error(`Duplicate composed file target: ${file.path}`)
    targets.add(target)
    const suffix = randomUUID()
    staged.push({ target, temporary: `${target}.tmp-${suffix}`, backup: `${target}.bak-${suffix}`, backupCreated: false, installed: false })
  }

  for (const entry of staged) await assertNoSymbolicLinks(fs, gameRoot, entry.target)

  try {
    for (const [index, file] of files.entries()) {
      const entry = staged[index]!
      await fs.mkdir(dirname(entry.target), { recursive: true })
      await fs.writeFile(entry.temporary, file.text)
    }
    for (const entry of staged) {
      if (await pathExists(fs, entry.target)) {
        await fs.rename(entry.target, entry.backup)
        entry.backupCreated = true
      }
      await fs.rename(entry.temporary, entry.target)
      entry.installed = true
    }
  } catch (commitError) {
    const rollbackErrors: unknown[] = []
    const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
      try { await operation() } catch (error) { rollbackErrors.push(error) }
    }
    for (const entry of [...staged].reverse()) {
      if (entry.installed) await attempt(() => fs.rm(entry.target, { force: true }))
      if (entry.backupCreated) {
        try {
          await fs.rename(entry.backup, entry.target)
          entry.backupCreated = false
        } catch (error) {
          rollbackErrors.push(error)
        }
      }
      await attempt(() => fs.rm(entry.temporary, { force: true }))
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([commitError, ...rollbackErrors], 'Compose commit failed and rollback was incomplete')
    }
    throw commitError
  }

  for (const entry of staged) if (entry.backupCreated) await fs.rm(entry.backup, { force: true })
}
