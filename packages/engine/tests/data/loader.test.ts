import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineKind, DataLoadError } from '../../src/data/registry'
import { createLoader, fetchTextViaFetch } from '../../src/data/loader'

const levelKind = defineKind('level', 'json', z.object({ id: z.string() }))

describe('createLoader', () => {
  it('fetches, parses, and validates', async () => {
    const loader = createLoader(async (url) => {
      expect(url).toBe('/data/levels/w1-l1.json')
      return '{ "id": "w1-l1" }'
    })
    await expect(loader.load(levelKind, '/data/levels/w1-l1.json'))
      .resolves.toEqual({ id: 'w1-l1' })
  })

  it('wraps fetch failures in DataLoadError carrying the url', async () => {
    const loader = createLoader(async () => { throw new Error('404 Not Found') })
    const promise = loader.load(levelKind, '/missing.json')
    await expect(promise).rejects.toBeInstanceOf(DataLoadError)
    await expect(promise).rejects.toMatchObject({ file: '/missing.json', kind: 'level' })
  })

  it('wraps non-Error fetch failures as strings', async () => {
    const loader = createLoader(async () => { throw 'offline' })
    await expect(loader.load(levelKind, '/offline.json')).rejects.toMatchObject({
      issues: ['offline']
    })
  })

  it('propagates validation failures as DataLoadError', async () => {
    const loader = createLoader(async () => '{ "id": 42 }')
    await expect(loader.load(levelKind, '/bad.json')).rejects.toBeInstanceOf(DataLoadError)
  })

  it('fetchTextViaFetch returns body text and throws on HTTP errors', async () => {
    const ok = (async () => ({ ok: true, status: 200, text: async () => 'hello' })) as unknown as typeof fetch
    await expect(fetchTextViaFetch(ok)('/x')).resolves.toBe('hello')
    const notFound = (async () => ({ ok: false, status: 404, text: async () => '' })) as unknown as typeof fetch
    await expect(fetchTextViaFetch(notFound)('/x')).rejects.toThrow(/404/)
  })
})
