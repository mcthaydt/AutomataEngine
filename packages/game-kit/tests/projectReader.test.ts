import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectReader } from '../src/projectReader'

afterEach(() => vi.restoreAllMocks())

describe('createProjectReader', () => {
  it('fetches project-relative paths and returns text', async () => {
    const fetchMock = vi.fn(async () => new Response('hello', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const reader = createProjectReader('http://host/game/')
    await expect(reader.readText('scenes/a.json')).resolves.toBe('hello')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://host/game/project/scenes/a.json')
  })

  it('throws with status and path on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const reader = createProjectReader('http://host/')
    await expect(reader.readText('missing.json')).rejects.toThrow(/404.*missing\.json/)
  })
})
