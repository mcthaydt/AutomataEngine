import { describe, expect, it, vi } from 'vitest'
import type { EditorProjectToolHost } from '@automata/editor/headless'
import type { ProjectFileWriter } from '@automata/project'
import { createWriteThroughHost } from '../../src/session/writeThroughHost'

// A minimal but serializable snapshot: writeProjectFiles walks manifest.scenes
// and manifest.resources, so those must be present (empty is fine).
function fakeInner(overrides: Partial<EditorProjectToolHost> = {}): EditorProjectToolHost {
  return {
    snapshot: { manifest: { id: 'g', scenes: [], resources: [] }, scenes: {}, resources: {} } as never,
    commands: [],
    listTools: () => [{ name: 'addEntity', description: '', schema: {} }],
    executeTool: vi.fn(async () => ({ ok: true, content: { applied: 'addEntity', changed: true } })),
    readResource: vi.fn(async () => null),
    ...overrides
  } as EditorProjectToolHost
}

describe('createWriteThroughHost', () => {
  it('flushes to disk after a changing write', async () => {
    const writer: ProjectFileWriter = { writeText: vi.fn(async () => {}) }
    const host = createWriteThroughHost(fakeInner(), writer)
    await host.executeTool('addEntity', { sceneId: 's', name: 'e' })
    expect(writer.writeText).toHaveBeenCalled()
  })

  it('does not flush when nothing changed', async () => {
    const writer: ProjectFileWriter = { writeText: vi.fn(async () => {}) }
    const inner = fakeInner({ executeTool: vi.fn(async () => ({ ok: true, content: { applied: 'addEntity', changed: false } })) })
    const host = createWriteThroughHost(inner, writer)
    await host.executeTool('addEntity', {})
    expect(writer.writeText).not.toHaveBeenCalled()
  })

  it('does not flush on read tools', async () => {
    const writer: ProjectFileWriter = { writeText: vi.fn(async () => {}) }
    const inner = fakeInner({ executeTool: vi.fn(async () => ({ ok: true, content: { manifest: {} } })) })
    const host = createWriteThroughHost(inner, writer)
    await host.executeTool('getProject', {})
    expect(writer.writeText).not.toHaveBeenCalled()
  })
})
