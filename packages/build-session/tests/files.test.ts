import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diffFiles, snapshotFiles } from '../src/files'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bs-files-'))
  roots.push(root)
  await mkdir(join(root, 'src/nested'), { recursive: true })
  await mkdir(join(root, 'src/node_modules'), { recursive: true })
  await writeFile(join(root, 'src/a.ts'), 'a')
  await writeFile(join(root, 'src/nested/b.ts'), 'b')
  await writeFile(join(root, 'src/node_modules/skip.js'), 'skip')
  return root
}

describe('file snapshots', () => {
  it('hashes files under labeled dirs, skipping node_modules, tolerating missing dirs', async () => {
    const root = await makeTree()
    const snap = await snapshotFiles([
      { label: 'src', dir: join(root, 'src') },
      { label: 'project', dir: join(root, 'no-such-dir') }
    ])
    expect(Object.keys(snap).sort()).toEqual(['src/a.ts', 'src/nested/b.ts'])
  })

  it('diffs added/removed/changed', async () => {
    const root = await makeTree()
    const before = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
    await writeFile(join(root, 'src/a.ts'), 'changed')
    await writeFile(join(root, 'src/c.ts'), 'new')
    await rm(join(root, 'src/nested/b.ts'))
    const after = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
    expect(diffFiles(before, after)).toEqual({
      added: ['src/c.ts'], removed: ['src/nested/b.ts'], changed: ['src/a.ts']
    })
  })

  it('hashes distinct invalid UTF-8 byte sequences differently', async () => {
    const root = await makeTree()
    await writeFile(join(root, 'src/first.bin'), Buffer.from([0xff]))
    await writeFile(join(root, 'src/second.bin'), Buffer.from([0xfe]))
    const snapshot = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
    expect(snapshot['src/first.bin']).not.toBe(snapshot['src/second.bin'])
  })

  it('reports a binary-only byte mutation as changed', async () => {
    const root = await makeTree()
    const asset = join(root, 'src/asset.bin')
    await writeFile(asset, Buffer.from([0xff]))
    const before = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
    await writeFile(asset, Buffer.from([0xfe]))
    const after = await snapshotFiles([{ label: 'src', dir: join(root, 'src') }])
    expect(diffFiles(before, after).changed).toContain('src/asset.bin')
  })
})
