import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadProjectFiles,
  stringifyProjectBundle,
  toProjectBundle
} from '@automata/project'
import { describe, expect, it } from 'vitest'
import { createHeadlessHost } from '../src/headlessHost'
import { createProjectDirectoryReader } from '../src/projectReader'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const monkeyBallProject = resolve(repoRoot, 'games/monkey-ball/public/project')
const pulsebreakProject = resolve(repoRoot, 'games/pulsebreak/public/project')

describe('headless MCP host', () => {
  it.each([
    ['Monkey Ball project', 'monkey-ball', monkeyBallProject],
    ['Pulsebreak project', 'pulsebreak', pulsebreakProject]
  ])('loads the %s registration from manifest.gameId', async (_label, gameId, projectDir) => {
    const { host, registration, snapshot } = await createHeadlessHost({ projectDir })

    expect(snapshot.manifest.gameId).toBe(gameId)
    expect(registration.gameId).toBe(gameId)
    expect((await host.executeTool('getProject', {})).content).toEqual(snapshot)

    const changed = await host.executeTool('setProperty', {
      target: { kind: 'manifest' },
      pointer: '/name',
      value: `${snapshot.manifest.name} MCP`
    })
    expect(changed).toMatchObject({ ok: true, content: { changed: true } })
    expect(host.snapshot.manifest.name).toBe(`${snapshot.manifest.name} MCP`)

    const evaluation = await host.executeTool('evaluate', { maxSteps: 1 })
    expect(evaluation).toMatchObject({
      ok: true,
      content: { outcome: expect.any(String), score: expect.any(Number), steps: expect.any(Number) }
    })
  }, 20_000)

  it('loads a canonical bundle JSON source', async () => {
    const snapshot = await loadProjectFiles(createProjectDirectoryReader(pulsebreakProject))
    const bundleJson = stringifyProjectBundle(toProjectBundle(snapshot))

    const loaded = await createHeadlessHost({ bundleJson, baseline: { score: 10 } })

    expect(loaded.registration.gameId).toBe('pulsebreak')
    expect(await loaded.host.readResource('editor://baseline')).toEqual({ score: 10 })
  })

  it('reports available registrations for an unknown game ID', async () => {
    const snapshot = await loadProjectFiles(createProjectDirectoryReader(pulsebreakProject))
    snapshot.manifest.gameId = 'unknown-game'
    const bundleJson = stringifyProjectBundle(toProjectBundle(snapshot))

    await expect(createHeadlessHost({ bundleJson })).rejects.toThrow(
      'Unknown project gameId "unknown-game". Available: monkey-ball, pulsebreak'
    )
  })

  it('rejects multiple sources, traversal, and missing files', async () => {
    await expect(createHeadlessHost({ projectDir: pulsebreakProject, bundleJson: '{}' }))
      .rejects.toThrow('exactly one project source')

    const reader = createProjectDirectoryReader(pulsebreakProject)
    await expect(reader.readText('../automata.project.json')).rejects.toThrow('outside project root')
    await expect(reader.readText('missing.scene.json')).rejects.toThrow()
  })

  it('defaults to the shipped monkey-ball registration', async () => {
    const { snapshot } = await createHeadlessHost()
    expect(snapshot.manifest.gameId).toBe('monkey-ball')
  })
})
