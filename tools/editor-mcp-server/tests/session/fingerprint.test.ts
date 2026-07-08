import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectFiles, hashFiles, hashStrings } from '../../src/session/fingerprint'

const dirs: string[] = []
async function tmp(): Promise<string> { const d = await mkdtemp(join(tmpdir(), 'automata-fp-')); dirs.push(d); return d }
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

describe('fingerprint', () => {
  it('hashStrings is order-sensitive and stable', () => {
    expect(hashStrings(['a', 'b'])).toBe(hashStrings(['a', 'b']))
    expect(hashStrings(['a', 'b'])).not.toBe(hashStrings(['b', 'a']))
  })

  it('collectFiles returns sorted absolute paths and [] for a missing root', async () => {
    const dir = await tmp()
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub/b.txt'), 'B')
    await writeFile(join(dir, 'a.txt'), 'A')
    expect(await collectFiles(dir)).toEqual([join(dir, 'a.txt'), join(dir, 'sub/b.txt')])
    expect(await collectFiles(join(dir, 'nope'))).toEqual([])
  })

  it('hashFiles changes when content changes and is stable otherwise', async () => {
    const dir = await tmp()
    await writeFile(join(dir, 'a.txt'), 'A')
    const first = await hashFiles([dir])
    expect(await hashFiles([dir])).toBe(first)
    await writeFile(join(dir, 'a.txt'), 'A2')
    expect(await hashFiles([dir])).not.toBe(first)
  })
})
