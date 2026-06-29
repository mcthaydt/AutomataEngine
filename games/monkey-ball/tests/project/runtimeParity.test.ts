// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadMonkeyBallProject } from '../../src/project/load'

const gameRoot = resolve(import.meta.dirname, '../..')
const projectRoot = resolve(gameRoot, 'public/project')

describe('project runtime parity', () => {
  it('loads all shipped levels from the compiled project in world order', async () => {
    const project = await loadMonkeyBallProject({
      readText: (path) => readFile(resolve(projectRoot, path), 'utf8')
    })
    expect(project.manifest.worlds.flatMap((world) => world.levels)).toEqual([
      'w1-l1', 'w1-l2', 'w1-l3', 'w2-l1', 'w2-l2', 'w2-l3'
    ])
    expect(Object.keys(project.levels)).toEqual([
      'w1-l1', 'w1-l2', 'w1-l3', 'w2-l1', 'w2-l2', 'w2-l3'
    ])
  })

  it('contains no production request path for legacy level or physics data', async () => {
    const sourceRoot = resolve(gameRoot, 'src')
    const files = await sourceFiles(sourceRoot)
    const source = (await Promise.all(files.map((path) => readFile(path, 'utf8')))).join('\n')
    expect(source).not.toContain('/data/levels/')
    expect(source).not.toContain('/data/config/physics.toml')
  })
})

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(root, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : []
  }))
  return nested.flat()
}
