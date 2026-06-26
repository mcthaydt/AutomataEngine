import { describe, expect, it } from 'vitest'
import { createHeadlessHost } from '../src/headlessHost'

describe('headless MCP host', () => {
  it('lists the registry tools and reads the seeded doc', async () => {
    const { host } = await createHeadlessHost()
    expect(host.listTools().map((d) => d.name)).toEqual(
      expect.arrayContaining(['addItem', 'getDoc', 'validate', 'testPlay'])
    )
    const doc = (await host.executeTool('getDoc', {})).content as { geometry: unknown[] }
    expect(Array.isArray(doc.geometry)).toBe(true)
  })

  it('applies an addItem to the in-memory doc and keeps it valid', async () => {
    const { host } = await createHeadlessHost()
    const before = ((await host.executeTool('listItems', {})).content as unknown[]).length
    const res = await host.executeTool('addItem', {
      item: {
        id: 'box:42',
        kind: 'box',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
        surface: { kind: 'color', value: '#ffffff' }
      }
    })
    expect(res.ok).toBe(true)
    const after = ((await host.executeTool('listItems', {})).content as unknown[]).length
    expect(after).toBe(before + 1)
    const validation = await host.executeTool('validate', {})
    expect(validation.ok).toBe(true)
    expect(validation.content).toEqual({ issues: [], exportable: true })
  })

  it('runs a deterministic headless test-play through the reused runHeadlessPlay', async () => {
    const { host } = await createHeadlessHost()
    const res = await host.executeTool('testPlay', { maxSteps: 30 })
    expect(res.ok).toBe(true)
    expect(res.content).toMatchObject({ outcome: expect.any(String), steps: expect.any(Number) })
  }, 20000)
})
