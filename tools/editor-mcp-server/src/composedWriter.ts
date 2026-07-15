import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface ComposedFile { path: string; text: string }
export interface ComposedWriterFs {
  access(path: string): Promise<void>
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
  rename(from: string, to: string): Promise<void>
  rm(path: string, options: { force: true }): Promise<void>
  writeFile(path: string, text: string): Promise<void>
}

const nodeFs: ComposedWriterFs = { access, mkdir, rename, rm, writeFile }
interface StagedFile { target: string; temporary: string; backup: string; backupCreated: boolean; installed: boolean }

async function pathExists(fs: ComposedWriterFs, path: string): Promise<boolean> {
  try { await fs.access(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
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
  } catch (error) {
    for (const entry of [...staged].reverse()) {
      if (entry.installed) await fs.rm(entry.target, { force: true }).catch(() => undefined)
      if (entry.backupCreated) await fs.rename(entry.backup, entry.target).catch(() => undefined)
      await fs.rm(entry.temporary, { force: true }).catch(() => undefined)
      await fs.rm(entry.backup, { force: true }).catch(() => undefined)
    }
    throw error
  }

  for (const entry of staged) if (entry.backupCreated) await fs.rm(entry.backup, { force: true })
}
