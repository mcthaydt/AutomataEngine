import * as fs from 'node:fs/promises'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeComposedFiles, type ComposedWriterFs } from '../src/composedWriter'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
async function root() { const value = await mkdtemp(join(tmpdir(), 'composed-writer-')); roots.push(value); return value }
async function exists(path: string) { try { await fs.access(path); return true } catch { return false } }

describe('composed writer', () => {
  it('rejects a symlinked target parent before writing outside the game root', async () => {
    const base = await root()
    const gameRoot = join(base, 'game')
    const outside = join(base, 'outside')
    await fs.mkdir(gameRoot)
    await fs.mkdir(outside)
    await fs.symlink(outside, join(gameRoot, 'public'))
    await expect(writeComposedFiles(gameRoot, [
      { path: 'public/escaped.txt', text: 'escaped' }
    ])).rejects.toThrow(/symbolic link/i)
    expect(await exists(join(outside, 'escaped.txt'))).toBe(false)
  })

  it('rejects an existing target symlink before staging', async () => {
    const base = await root()
    const gameRoot = join(base, 'game')
    await fs.mkdir(join(gameRoot, 'public'), { recursive: true })
    const outside = join(base, 'outside.txt')
    await writeFile(outside, 'outside-original')
    await fs.symlink(outside, join(gameRoot, 'public/item.txt'))
    await expect(writeComposedFiles(gameRoot, [
      { path: 'public/item.txt', text: 'replacement' }
    ])).rejects.toThrow(/symbolic link/i)
    await expect(readFile(outside, 'utf8')).resolves.toBe('outside-original')
  })

  it('rejects paths outside the game root and duplicate normalized targets', async () => {
    const gameRoot = await root()
    await expect(writeComposedFiles(gameRoot, [{ path: 'public/assets/../../../other.svg', text: 'bad' }])).rejects.toThrow(/outside game root/i)
    expect(await exists(join(gameRoot, '..', 'other.svg'))).toBe(false)
    await expect(writeComposedFiles(gameRoot, [
      { path: 'public/assets/item.svg', text: 'one' },
      { path: 'public/assets/../assets/item.svg', text: 'two' }
    ])).rejects.toThrow(/duplicate/i)
  })

  it('restores every original and removes staging debris after a mid-commit failure', async () => {
    const gameRoot = await root(); await fs.mkdir(join(gameRoot, 'public'), { recursive: true })
    const first = join(gameRoot, 'public/first.txt'); const second = join(gameRoot, 'public/second.txt')
    await writeFile(first, 'first-original'); await writeFile(second, 'second-original')
    let renames = 0
    const injected: ComposedWriterFs = {
      ...fs,
      async rename(from, to) { renames += 1; if (renames === 4) throw new Error('injected commit failure'); await fs.rename(from, to) }
    }
    await expect(writeComposedFiles(gameRoot, [
      { path: 'public/first.txt', text: 'first-new' },
      { path: 'public/second.txt', text: 'second-new' }
    ], injected)).rejects.toThrow('injected commit failure')
    await expect(readFile(first, 'utf8')).resolves.toBe('first-original')
    await expect(readFile(second, 'utf8')).resolves.toBe('second-original')
    expect((await readdir(join(gameRoot, 'public'))).filter((name) => name.includes('.tmp-') || name.includes('.bak-'))).toEqual([])
  })
})
