import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Order-sensitive SHA-256 over string parts, NUL-separated so joins are unambiguous. */
export function hashStrings(parts: readonly string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\0')
  return hash.digest('hex')
}

/** All files under `root`, absolute and sorted; a missing root yields []. */
export async function collectFiles(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(full)))
    else files.push(full)
  }
  return files.sort()
}

/** Fingerprint every file under the given roots by relative path + bytes. */
export async function hashFiles(roots: readonly string[]): Promise<string> {
  const hash = createHash('sha256')
  for (const root of roots) {
    for (const file of await collectFiles(root)) {
      hash.update(relative(root, file)).update('\0')
      hash.update(await readFile(file)).update('\0')
    }
    hash.update('\x01') // root boundary
  }
  return hash.digest('hex')
}
