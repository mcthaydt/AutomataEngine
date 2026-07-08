import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorkspaceHost } from '../src/workspaceHost'

const roots: string[] = []

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'automata-workspace-'))
  roots.push(root)
  await mkdir(join(root, 'games'))
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('workspace MCP host', () => {
  it('advertises createGame and listGames and has no resources', async () => {
    const host = createWorkspaceHost({ repoRoot: await makeRepo() })
    expect(host.listTools().map((def) => def.name)).toEqual(['createGame', 'listGames'])
    await expect(host.readResource('editor://project')).rejects.toThrow(/no resources/i)
  })

  it('creates a discoverable game and reports directory, port, and next steps', async () => {
    const root = await makeRepo()
    const host = createWorkspaceHost({ repoRoot: root })

    expect(await host.executeTool('listGames', {})).toEqual({ ok: true, content: { games: [] } })

    const created = await host.executeTool('createGame', { name: 'beacon-run' })
    expect(created.ok).toBe(true)
    expect(created.content).toMatchObject({
      gameDir: 'games/beacon-run',
      devPort: 5178,
      nextSteps: expect.arrayContaining([
        expect.stringContaining('npm install'),
        expect.stringContaining('openProject'),
        expect.stringContaining('evaluate'),
        expect.stringContaining('npm run ci')
      ])
    })
    await expect(lstat(join(root, 'games/beacon-run/src/project/definition.ts'))).resolves.toBeDefined()

    expect(await host.executeTool('listGames', {})).toEqual({
      ok: true,
      content: { games: ['beacon-run'] }
    })
  })

  it('reports failures as tool errors instead of throwing', async () => {
    const root = await makeRepo()
    await writeFile(join(root, 'games/.keep'), '')
    const host = createWorkspaceHost({ repoRoot: root })

    const first = await host.executeTool('createGame', { name: 'dupe' })
    expect(first.ok).toBe(true)
    const second = await host.executeTool('createGame', { name: 'dupe' })
    expect(second).toMatchObject({ ok: false, isError: true })
    expect(String(second.content)).toMatch(/already exists/i)

    const invalid = await host.executeTool('createGame', { name: 'Bad Name' })
    expect(invalid).toMatchObject({ ok: false, isError: true })

    const unknown = await host.executeTool('nope', {})
    expect(unknown).toMatchObject({ ok: false, isError: true })
  })
})
