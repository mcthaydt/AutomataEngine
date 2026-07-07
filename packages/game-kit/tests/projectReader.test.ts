import { describe, expect, it, vi } from 'vitest'
import { createProjectReader } from '../src/projectReader'

const okFetch = (body: string): typeof fetch =>
  vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch

describe('createProjectReader', () => {
  it('reads project files under project/ resolved against baseURI', async () => {
    const fetchImpl = okFetch('scene-json')
    const reader = createProjectReader({ fetchImpl, baseURI: 'https://host/sub/' })
    const text = await reader.readText('scenes/a.scene.json')
    expect(text).toBe('scene-json')
    expect(fetchImpl).toHaveBeenCalledWith('https://host/sub/project/scenes/a.scene.json')
  })

  it('fetchText resolves non-project asset paths against baseURI', async () => {
    const fetchImpl = okFetch('yaml')
    const reader = createProjectReader({ fetchImpl, baseURI: 'https://host/sub/' })
    await reader.fetchText('data/archetypes/standard.yaml')
    expect(fetchImpl).toHaveBeenCalledWith('https://host/sub/data/archetypes/standard.yaml')
  })

  it('throws when the response is not ok', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const reader = createProjectReader({ fetchImpl, baseURI: 'https://host/' })
    await expect(reader.readText('automata.project.json')).rejects.toThrow('HTTP 404')
  })
})
