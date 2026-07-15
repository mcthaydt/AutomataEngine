import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProjectFileReader } from '@automata/project'
import { loadProject } from '../../src/project/load'

const root = resolve(import.meta.dirname, '../../public/project')
const reader: ProjectFileReader = { readText: (path) => readFile(resolve(root, path), 'utf8') }

const rewriting = (edit: (path: string, text: string) => string): ProjectFileReader => ({
  readText: async (path) => edit(path, await reader.readText(path))
})

describe('project content', () => {
  it('loads and compiles through the runtime loader', async () => {
    const compiled = await loadProject(reader)
    expect(compiled.projectId).toBe('first-light')
    expect(compiled.tuning.timeLimitS).toBeGreaterThan(0)
  })

  it('rejects a project belonging to another game', async () => {
    const wrongGame = rewriting((path, text) =>
      path === 'automata.project.json' ? text.replace('"gameId": "first-light"', '"gameId": "other"') : text)
    await expect(loadProject(wrongGame)).rejects.toThrow(/Expected a First Light project/)
  })

  it('rejects a project that fails schema or game validation', async () => {
    const negativeTime = rewriting((path, text) =>
      path.endsWith('tuning.resource.json') ? text.replace('"timeLimitS": 30', '"timeLimitS": -5') : text)
    await expect(loadProject(negativeTime)).rejects.toThrow(/Invalid First Light project/)

    const goalOutside = rewriting((path, text) =>
      path.endsWith('tuning.resource.json') ? text.replace(/"x": [-\d.]+,/, '"x": 99,') : text)
    await expect(loadProject(goalOutside)).rejects.toThrow(/first-light\.goal/)
  })
})
