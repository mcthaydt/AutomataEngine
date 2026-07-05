import { describe, expect, it } from 'vitest'
import { createMemoryProjectStorage } from '../../../src/project/storage/memory'
import { fakeSnapshot } from '../../fixtures/fakeProject'

function withSpeed(speed: number) {
  const snapshot = fakeSnapshot()
  snapshot.resources.tuning = { ...snapshot.resources.tuning!, data: { ...(snapshot.resources.tuning!.data as object), speed } }
  return snapshot
}

describe('memory project storage', () => {
  it('opens, saves only dirty paths, and round-trips', async () => {
    const storage = createMemoryProjectStorage(fakeSnapshot())
    expect(await storage.open()).toEqual({ snapshot: fakeSnapshot(), fromVersion: 1 })

    const result = await storage.save(withSpeed(9), ['resources/tuning.resource.json'])
    expect(result).toEqual({ saved: ['resources/tuning.resource.json'], failed: [] })
    expect((await storage.open()).snapshot.resources.tuning!.data).toMatchObject({ speed: 9 })
  })

  it('reports failed paths without persisting them', async () => {
    const storage = createMemoryProjectStorage(fakeSnapshot(), { failPaths: new Set(['resources/tuning.resource.json']) })
    const result = await storage.save(withSpeed(9), ['resources/tuning.resource.json'])
    expect(result.saved).toEqual([])
    expect(result.failed).toEqual([{ path: 'resources/tuning.resource.json', message: expect.any(String) }])
    expect((await storage.open()).snapshot.resources.tuning!.data).toMatchObject({ speed: 4 })
  })
})
