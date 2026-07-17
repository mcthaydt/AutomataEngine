import { describe, expect, it } from 'vitest'
import { loadComposition } from '../src/composition'

const reader = (files: Record<string, string>) => ({
  readText: async (path: string) => {
    const text = files[path]
    if (text === undefined) throw new Error(`missing ${path}`)
    return text
  }
})

describe('loadComposition', () => {
  it('parses a valid composition.json through the contracts schema', async () => {
    const manifest = { formatVersion: 1, gameId: 'probe', source: null, packs: [], assets: [] }
    await expect(loadComposition(reader({ 'composition.json': JSON.stringify(manifest) }))).resolves.toEqual(manifest)
  })

  it('fails diagnosably when the file is missing or invalid', async () => {
    await expect(loadComposition(reader({}))).rejects.toThrow(/composition\.json/)
    await expect(loadComposition(reader({ 'composition.json': '{"formatVersion":9}' }))).rejects.toThrow()
  })
})
