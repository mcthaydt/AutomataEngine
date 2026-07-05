import { describe, expect, it } from 'vitest'
import { isSafeProjectPath, loadProjectFiles, projectFileDocuments } from '../src'
import { sampleSnapshot } from './fixtures/sampleProject'

function readerFor(snapshot = sampleSnapshot()) {
  const files = new Map<string, string>([
    ['automata.project.json', JSON.stringify(snapshot.manifest)],
    ['scenes/main.scene.json', JSON.stringify(snapshot.scenes.main)],
    ['resources/tuning.resource.json', JSON.stringify(snapshot.resources.tuning)]
  ])
  return { files, reader: { readText: async (path: string) => files.get(path) ?? Promise.reject(new Error(`missing ${path}`)) } }
}

describe('project files', () => {
  it('loads a project folder back into a snapshot', async () => {
    const snapshot = sampleSnapshot()
    const { reader } = readerFor(snapshot)
    expect(await loadProjectFiles(reader)).toEqual({ snapshot, fromVersion: 2 })
  })

  it('emits documents manifest-first then scenes and resources in manifest order', () => {
    const docs = projectFileDocuments(sampleSnapshot())
    expect(docs.map((doc) => [doc.kind, doc.path])).toEqual([
      ['manifest', 'automata.project.json'],
      ['scene', 'scenes/main.scene.json'],
      ['resource', 'resources/tuning.resource.json']
    ])
    expect(docs[0]!.text.endsWith('\n')).toBe(true)
  })

  it('round-trips documents back through the loader', async () => {
    const snapshot = sampleSnapshot()
    const docs = projectFileDocuments(snapshot)
    const map = new Map(docs.map((doc) => [doc.path, doc.text]))
    const loaded = await loadProjectFiles({ readText: async (path) => map.get(path)! })
    expect(loaded.snapshot).toEqual(snapshot)
  })

  it('rejects path traversal before touching the reader', async () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.scenes[0]!.path = '../escape.json'
    const reader = { readText: async () => { throw new Error('reader should not be called') } }
    const files = new Map([['automata.project.json', JSON.stringify(snapshot.manifest)]])
    await expect(loadProjectFiles({ readText: async (path) => files.get(path) ?? reader.readText() })).rejects.toThrow(/path/i)
  })

  it('throws when a referenced document is missing or mismatched', async () => {
    const { files, reader } = readerFor()
    files.delete('resources/tuning.resource.json')
    await expect(loadProjectFiles(reader)).rejects.toThrow()

    const mismatched = readerFor()
    mismatched.files.set('scenes/main.scene.json', JSON.stringify({ ...sampleSnapshot().scenes.main, id: 'other' }))
    await expect(loadProjectFiles(mismatched.reader)).rejects.toThrow(/missing scene "main"/i)

    const resourceId = readerFor()
    resourceId.files.set('resources/tuning.resource.json', JSON.stringify({ ...sampleSnapshot().resources.tuning, id: 'other' }))
    await expect(loadProjectFiles(resourceId.reader)).rejects.toThrow(/missing resource "tuning"/i)

    const resourceType = readerFor()
    resourceType.files.set('resources/tuning.resource.json', JSON.stringify({ ...sampleSnapshot().resources.tuning, typeId: 'other' }))
    await expect(loadProjectFiles(resourceType.reader)).rejects.toThrow(/resource type mismatch/i)
  })

  it('classifies safe relative project paths', () => {
    expect(isSafeProjectPath('scenes/main.scene.json')).toBe(true)
    for (const path of ['', '/absolute', 'a\\b', 'a//b', './a', 'a/../b']) {
      expect(isSafeProjectPath(path)).toBe(false)
    }
  })

  it('rejects a manifest whose scene index is not an array', async () => {
    const files = new Map([['automata.project.json', JSON.stringify({ formatVersion: 1, scenes: 'nope' })]])
    await expect(loadProjectFiles({ readText: async (path) => files.get(path)! })).rejects.toThrow(/must be an array/i)
  })

  it('rejects unsafe resource paths and missing serialized documents', async () => {
    const unsafe = sampleSnapshot()
    unsafe.manifest.resources[0]!.path = '../resource.json'
    const unsafeFolder = readerFor(unsafe)
    await expect(loadProjectFiles(unsafeFolder.reader)).rejects.toThrow(/unsafe resource path/i)

    const missingScene = sampleSnapshot()
    delete missingScene.scenes.main
    expect(() => projectFileDocuments(missingScene)).toThrow(/missing scene/i)
    const missingResource = sampleSnapshot()
    delete missingResource.resources.tuning
    expect(() => projectFileDocuments(missingResource)).toThrow(/missing resource/i)
  })
})
