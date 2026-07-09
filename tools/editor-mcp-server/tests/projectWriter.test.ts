import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROJECT_FORMAT_VERSION, loadProjectFiles, writeProjectFiles, type ProjectSnapshot } from '@automata/project'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectDirectoryReader } from '../src/projectReader'
import { createProjectDirectoryWriter } from '../src/projectWriter'

// Built inline so the tool test owns no cross-package test fixture.
function minimalSnapshot(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: PROJECT_FORMAT_VERSION,
      id: 'p', name: 'p', gameId: 'p', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: []
    },
    scenes: { main: { id: 'main', name: 'main', entities: [] } },
    resources: {}
  }
}

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

describe('createProjectDirectoryWriter', () => {
  it('writes a snapshot to disk that loads back identically', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'automata-writer-'))
    dirs.push(dir)
    const snapshot = minimalSnapshot()
    await writeProjectFiles(createProjectDirectoryWriter(dir), snapshot)
    const loaded = await loadProjectFiles(createProjectDirectoryReader(dir))
    expect(loaded.snapshot).toEqual(snapshot)
  })

  it('rejects a path that escapes the project root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'automata-writer-'))
    dirs.push(dir)
    await expect(createProjectDirectoryWriter(dir).writeText('../escape.json', 'x')).rejects.toThrow(/outside project root/i)
  })

  it('removeStale deletes project files absent from the keep set, preserving the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'automata-writer-'))
    dirs.push(dir)
    const writer = createProjectDirectoryWriter(dir)
    await writer.writeText('automata.project.json', '{}')
    await writer.writeText('scenes/keep.scene.json', '{}')
    await writer.writeText('resources/stale.resource.json', '{}')
    await writer.removeStale(['automata.project.json', 'scenes/keep.scene.json'])
    await expect(readFile(join(dir, 'resources/stale.resource.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(dir, 'scenes/keep.scene.json'), 'utf8')).resolves.toBe('{}')
    await expect(readFile(join(dir, 'automata.project.json'), 'utf8')).resolves.toBe('{}')
  })
})
