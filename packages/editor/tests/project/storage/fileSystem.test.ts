import { describe, expect, it } from 'vitest'
import { projectFileDocuments } from '@automata/project'
import { createFileSystemProjectStorage, type DirectoryHandleLike } from '../../../src/project/storage/fileSystem'
import { fakeSnapshot } from '../../fixtures/fakeProject'

/** Structural fake of the File System Access directory handle that logs ops. */
function fakeDir(initial: Record<string, string> = {}, failWrites = new Set<string>()) {
  const files = new Map<string, string>(Object.entries(initial))
  const ops: string[] = []
  const makeDir = (prefix: string): DirectoryHandleLike => ({
    async getDirectoryHandle(name) { return makeDir(`${prefix}${name}/`) },
    async getFileHandle(name) {
      const path = `${prefix}${name}`
      return {
        async createWritable() {
          return {
            async write(text: string) {
              if (failWrites.has(path)) throw new Error(`write failed for ${path}`)
              ops.push(`write ${path}`)
              files.set(path, text)
            },
            async close() {}
          }
        },
        async getFile() {
          return { async text() { const text = files.get(path); if (text === undefined) throw new Error(`missing ${path}`); return text } }
        }
      }
    },
    async removeEntry(name) { ops.push(`remove ${prefix}${name}`); files.delete(`${prefix}${name}`) },
    async *entries() {
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
          yield [key.slice(prefix.length), { kind: 'file', name: key.slice(prefix.length) }] as [string, { kind: 'file'; name: string }]
        }
      }
    }
  })
  return { dir: makeDir(''), ops, files }
}

describe('filesystem project storage', () => {
  it('writes referenced files before the manifest', async () => {
    const { dir, ops } = fakeDir()
    const result = await createFileSystemProjectStorage(dir).save(fakeSnapshot(), ['automata.project.json', 'scenes/main.scene.json', 'resources/tuning.resource.json'])
    expect(result.failed).toEqual([])
    expect(ops.filter((op) => op.startsWith('write'))).toEqual([
      'write scenes/main.scene.json',
      'write resources/tuning.resource.json',
      'write automata.project.json'
    ])
  })

  it('rejects path traversal without touching the handle', async () => {
    const { dir, ops } = fakeDir()
    const result = await createFileSystemProjectStorage(dir).save(fakeSnapshot(), ['../evil.json'])
    expect(result.failed[0]!.path).toBe('../evil.json')
    expect(ops.filter((op) => op.startsWith('write'))).toEqual([])
  })

  it('aborts before the manifest when a referenced write fails', async () => {
    const { dir, ops } = fakeDir({}, new Set(['scenes/main.scene.json']))
    const result = await createFileSystemProjectStorage(dir).save(fakeSnapshot(), ['automata.project.json', 'scenes/main.scene.json'])
    expect(result.failed.map((entry) => entry.path)).toEqual(['scenes/main.scene.json'])
    expect(ops).not.toContain('write automata.project.json')
  })

  it('deletes orphan files last', async () => {
    const snapshot = fakeSnapshot()
    const initial = Object.fromEntries(projectFileDocuments(snapshot).map((doc) => [doc.path, doc.text]))
    initial['scenes/old.scene.json'] = '{}'
    const { dir, ops } = fakeDir(initial)
    await createFileSystemProjectStorage(dir).save(snapshot, ['scenes/main.scene.json'])
    expect(ops).toContain('remove scenes/old.scene.json')
    expect(ops.indexOf('remove scenes/old.scene.json')).toBeGreaterThan(ops.indexOf('write scenes/main.scene.json'))
  })

  it('opens a folder back into a snapshot', async () => {
    const snapshot = fakeSnapshot()
    const { dir } = fakeDir(Object.fromEntries(projectFileDocuments(snapshot).map((doc) => [doc.path, doc.text])))
    expect(await createFileSystemProjectStorage(dir).open()).toEqual({ snapshot, fromVersion: 2 })
  })
})
