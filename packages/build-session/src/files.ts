import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { hashText } from './hash'

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage'])

/** label/relativePath → sha256 for every file under each labeled dir. */
export async function snapshotFiles(
  entries: ReadonlyArray<{ label: string; dir: string }>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const entry of entries) {
    await walk(entry.dir, entry.label, entry.dir)
  }
  return out

  async function walk(dir: string, label: string, base: string): Promise<void> {
    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name)
      if (item.isDirectory()) {
        if (!SKIPPED_DIRS.has(item.name)) await walk(path, label, base)
      } else if (item.isFile()) {
        const key = `${label}/${relative(base, path).split(sep).join('/')}`
        out[key] = hashText(await readFile(path, 'utf8'))
      }
    }
  }
}

export interface FileDiff {
  added: string[]
  removed: string[]
  changed: string[]
}

export function diffFiles(before: Record<string, string>, after: Record<string, string>): FileDiff {
  const added = Object.keys(after).filter((key) => !(key in before)).sort()
  const removed = Object.keys(before).filter((key) => !(key in after)).sort()
  const changed = Object.keys(after)
    .filter((key) => key in before && before[key] !== after[key])
    .sort()
  return { added, removed, changed }
}
